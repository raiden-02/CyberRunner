import { describe, expect, it } from "vitest";
import { getGameplayMap } from "../../shared/world/map-registry.js";
import { evaluateArena, evaluateGameplayMap } from "../src/arena-forge/evaluator.js";
import { importGameplayMap } from "../src/arena-forge/import-map.js";
import type { ArenaMap, ArenaSolid } from "../src/arena-forge/types.js";

function arena(partial: Partial<ArenaMap> = {}): ArenaMap {
  return {
    boundsHalfSize: 10,
    wallHeight: 4,
    wallThickness: 0.5,
    groundThickness: 0.1,
    solids: [],
    spawns: [
      { id: "ghost-spawn-0", role: "ghost", x: 0, y: 1, z: -8 },
      { id: "sentinel-spawn-0", role: "sentinel", x: 0, y: 1, z: 8 },
    ],
    objectives: [
      { id: "A", x: -4, y: 0, z: -4, radius: 2 },
      { id: "B", x: 4, y: 0, z: -4, radius: 2 },
    ],
    spawnProtectionZones: [],
    spikeSpawnLocation: { id: "spike-spawn", x: 0, y: 1, z: -6 },
    ...partial,
  };
}

function box(id: string, kind: ArenaSolid["kind"], extra: Omit<ArenaSolid, "id" | "kind">): ArenaSolid {
  return { id, kind, ...extra };
}

describe("ArenaForge importer", () => {
  it("assigns deterministic IDs from array order", () => {
    const working = importGameplayMap(getGameplayMap("map-contract-smoke"));
    expect(working.sourceMapId).toBe("map-contract-smoke");
    expect(working.solids.map((s) => s.id)).toEqual([
      "obstacle-0",
      "obstacle-1",
      "occluder-0",
      "breakable-0",
    ]);
    expect(working.spawns.filter((s) => s.role === "ghost").map((s) => s.id)).toEqual([
      "ghost-spawn-0",
      "ghost-spawn-1",
      "ghost-spawn-2",
    ]);
    expect(working.objectives.map((o) => o.id)).toEqual(["A", "B"]);
    expect(working.spikeSpawnLocation?.id).toBe("spike-spawn");

    const again = importGameplayMap(getGameplayMap("map-contract-smoke"));
    expect(again.solids.map((s) => s.id)).toEqual(working.solids.map((s) => s.id));
  });
});

describe("ArenaForge evaluator fixtures", () => {
  it("accepts a connected open arena", () => {
    const ev = evaluateArena(arena());
    expect(ev.summary.hardFailureCount).toBe(0);
    expect(ev.spawns.results.every((s) => s.valid)).toBe(true);
    expect(ev.objectives.results.every((o) => o.valid)).toBe(true);
    expect(ev.navigation.paths.every((p) => p.reachable)).toBe(true);
    expect(ev.navigation.paths.find((p) => p.from === "ghost-spawn-0" && p.to === "objective-A")?.distanceMeters)
      .toBeGreaterThan(0);
    expect(ev.navigation.components.count).toBe(1);
  });

  it("flags a spawn whose capsule intersects a solid", () => {
    const ev = evaluateArena(arena({
      solids: [box("obstacle-0", "obstacle", { x: 0, y: 1, z: -8, hx: 1, hy: 1, hz: 1 })],
    }));
    const ghost = ev.spawns.results.find((s) => s.id === "ghost-spawn-0");
    expect(ghost?.valid).toBe(false);
    expect(ghost?.blockedBy).toBe("obstacle-0");
    expect(ev.summary.hardFailures.some((i) => i.code === "spawn-blocked" && i.id === "ghost-spawn-0")).toBe(true);
    expect(ev.spawns.results.find((s) => s.id === "sentinel-spawn-0")?.valid).toBe(true);
  });

  it("flags a solid that extends past the arena edge", () => {
    const ev = evaluateArena(arena({
      solids: [box("obstacle-0", "obstacle", { x: 11, y: 1, z: 0, hx: 2, hy: 1, hz: 1 })],
    }));
    const issue = ev.geometry.issues.find((i) => i.code === "solid-out-of-bounds" && i.id === "obstacle-0");
    expect(issue).toBeDefined();
    expect(issue?.side).toBe("x+");
    expect(issue?.overhangMeters).toBeGreaterThan(0);
  });

  it("detects a wall that cuts sentinels off from both objectives", () => {
    const ev = evaluateArena(arena({
      solids: [box("obstacle-0", "obstacle", { x: 0, y: 2, z: 0, hx: 10, hy: 2, hz: 0.4 })],
    }));
    const ghostA = ev.navigation.paths.find((p) => p.from === "ghost-spawn-0" && p.to === "objective-A");
    const sentA = ev.navigation.paths.find((p) => p.from === "sentinel-spawn-0" && p.to === "objective-A");
    const sentB = ev.navigation.paths.find((p) => p.from === "sentinel-spawn-0" && p.to === "objective-B");
    expect(ghostA?.reachable).toBe(true);
    expect(sentA?.reachable).toBe(false);
    expect(sentB?.reachable).toBe(false);
    expect(ev.summary.hardFailures.some((i) => i.code === "unreachable-pair" && i.from === "sentinel-spawn-0")).toBe(true);

    const sentComp = ev.navigation.anchors.find((a) => a.id === "sentinel-spawn-0")?.componentId;
    const objA = ev.navigation.anchors.find((a) => a.id === "objective-A")?.componentId;
    expect(sentComp).not.toBeNull();
    expect(objA).not.toBeNull();
    expect(sentComp).not.toBe(objA);
  });

  it("detects an objective whose radius has no navigable cell", () => {
    const ev = evaluateArena(arena({
      objectives: [
        { id: "A", x: -4, y: 0, z: -4, radius: 2 },
        { id: "B", x: 6, y: 0, z: 6, radius: 1.2 },
      ],
      solids: [box("obstacle-0", "obstacle", { x: 6, y: 1, z: 6, hx: 1.5, hy: 1, hz: 1.5 })],
    }));
    const b = ev.objectives.results.find((o) => o.letter === "B");
    expect(b?.valid).toBe(false);
    expect(b?.navigableCellCount).toBe(0);
    expect(ev.summary.hardFailures.some((i) => i.code === "objective-no-navigable-cell" && i.id === "objective-B")).toBe(true);
  });

  it("reports clear then blocked enemy-spawn LOS when a tall occluder is added", () => {
    const open = evaluateArena(arena());
    const openPair = open.lineOfSight.pairs.find(
      (p) => p.from === "ghost-spawn-0" && p.to === "sentinel-spawn-0",
    );
    expect(openPair?.clear).toBe(true);
    expect(openPair?.distanceMeters).toBeGreaterThan(10);

    const blocked = evaluateArena(arena({
      solids: [box("occluder-0", "occluder", { x: 0, y: 2, z: 0, hx: 2, hy: 2, hz: 0.4 })],
    }));
    const blockedPair = blocked.lineOfSight.pairs.find(
      (p) => p.from === "ghost-spawn-0" && p.to === "sentinel-spawn-0",
    );
    expect(blockedPair?.clear).toBe(false);
    expect(blockedPair?.blockedBy).toBe("occluder-0");
  });

  it("does not let a low box block an eye-height ray", () => {
    const ev = evaluateArena(arena({
      solids: [box("obstacle-0", "obstacle", { x: 0, y: 0.4, z: 0, hx: 0.5, hy: 0.4, hz: 0.5 })],
    }));
    const pair = ev.lineOfSight.pairs.find(
      (p) => p.from === "ghost-spawn-0" && p.to === "sentinel-spawn-0",
    );
    expect(pair?.clear).toBe(true);
  });

  it("lets a tall box block the same eye-height ray", () => {
    const ev = evaluateArena(arena({
      solids: [box("obstacle-0", "obstacle", { x: 0, y: 2, z: 0, hx: 0.5, hy: 2, hz: 0.5 })],
    }));
    const pair = ev.lineOfSight.pairs.find(
      (p) => p.from === "ghost-spawn-0" && p.to === "sentinel-spawn-0",
    );
    expect(pair?.clear).toBe(false);
    expect(pair?.blockedBy).toBe("obstacle-0");
  });
});

describe("ArenaForge evaluator correctness", () => {
  it("returns structured hard failures for invalid bounds without throwing", () => {
    for (const bounds of [NaN, Infinity, 0, -8]) {
      expect(() => evaluateArena(arena({ boundsHalfSize: bounds }))).not.toThrow();
      const ev = evaluateArena(arena({ boundsHalfSize: bounds }));
      expect(ev.summary.hardFailures.some((i) => i.code === "invalid-bounds")).toBe(true);
      expect(ev.navigation.totalCells).toBe(0);
      expect(ev.navigation.paths).toEqual([]);
    }
  });

  it("uses the spawn translation as capsule center for vertical overlap", () => {
    const miss = evaluateArena(arena({
      solids: [box("obstacle-0", "obstacle", { x: 0, y: 8, z: -8, hx: 1, hy: 0.4, hz: 1 })],
    }));
    expect(miss.spawns.results.find((s) => s.id === "ghost-spawn-0")?.valid).toBe(true);

    const hit = evaluateArena(arena({
      solids: [box("obstacle-0", "obstacle", { x: 0, y: 1, z: -8, hx: 1, hy: 0.4, hz: 1 })],
    }));
    expect(hit.spawns.results.find((s) => s.id === "ghost-spawn-0")?.valid).toBe(false);
    expect(hit.spawns.results.find((s) => s.id === "ghost-spawn-0")?.blockedBy).toBe("obstacle-0");
  });

  it("requires S&D anchors in search_destroy mode", () => {
    const ev = evaluateArena({
      boundsHalfSize: 10,
      wallHeight: 4,
      wallThickness: 0.5,
      groundThickness: 0.1,
      solids: [],
      spawns: [{ id: "spawn-0", role: "general", x: 0, y: 1, z: 0 }],
      objectives: [],
      spawnProtectionZones: [],
    }, "search_destroy");
    const codes = ev.summary.hardFailures.map((i) => i.code);
    expect(codes).toEqual(expect.arrayContaining([
      "missing-objective-A",
      "missing-objective-B",
      "missing-ghost-spawn",
      "missing-sentinel-spawn",
      "missing-spike-spawn",
    ]));
  });

  it("rejects duplicate S&D objectives", () => {
    const ev = evaluateArena(arena({
      objectives: [
        { id: "A", x: -4, y: 0, z: -4, radius: 2 },
        { id: "A", x: 4, y: 0, z: -4, radius: 2 },
        { id: "B", x: 0, y: 0, z: 0, radius: 2 },
      ],
    }));
    expect(ev.summary.hardFailures.some((i) => i.code === "duplicate-objective-A")).toBe(true);
  });

  it("requires a general spawn in deathmatch and ignores missing S&D anchors", () => {
    const empty = evaluateArena({
      boundsHalfSize: 10,
      wallHeight: 4,
      wallThickness: 0.5,
      groundThickness: 0.1,
      solids: [],
      spawns: [],
      objectives: [],
      spawnProtectionZones: [],
    }, "deathmatch");
    expect(empty.summary.hardFailures.some((i) => i.code === "missing-spawn")).toBe(true);

    const ok = evaluateArena({
      boundsHalfSize: 10,
      wallHeight: 4,
      wallThickness: 0.5,
      groundThickness: 0.1,
      solids: [],
      spawns: [{ id: "spawn-0", role: "general", x: 0, y: 1, z: 0 }],
      objectives: [],
      spawnProtectionZones: [],
    }, "deathmatch");
    expect(ok.summary.hardFailures.some((i) => i.code.startsWith("missing-"))).toBe(false);
    expect(ok.navigation.paths).toEqual([]);
  });

  it("omits LOS pairs for a non-finite spawn and does not throw", () => {
    const ev = evaluateArena(arena({
      spawns: [
        { id: "ghost-spawn-0", role: "ghost", x: Number.NaN, y: 1, z: -8 },
        { id: "sentinel-spawn-0", role: "sentinel", x: 0, y: 1, z: 8 },
      ],
    }));
    expect(ev.summary.hardFailures.some((i) => i.code === "non-finite-spawn" && i.id === "ghost-spawn-0")).toBe(true);
    expect(ev.lineOfSight.pairs.some((p) => p.from === "ghost-spawn-0" || p.to === "ghost-spawn-0")).toBe(false);
    expect(ev.lineOfSight.pairs.some((p) => p.from === "sentinel-spawn-0" && p.to === "objective-A")).toBe(true);
  });
});

describe("ArenaForge on registered maps", () => {
  it("evaluates Shoot House and smoke without special cases", () => {
    const house = evaluateGameplayMap(getGameplayMap("shoot-house-neon"));
    const smoke = evaluateGameplayMap(getGameplayMap("map-contract-smoke"));
    expect(house.sourceMapId).toBe("shoot-house-neon");
    expect(smoke.sourceMapId).toBe("map-contract-smoke");
    expect(house.navigation.cellMeters).toBe(0.5);
    expect(smoke.navigation.cellMeters).toBe(0.5);
    expect(house.lineOfSight.eyeHeight).toBe(1.6);
    expect(house.spawns.results.some((s) => s.id === "ghost-spawn-0")).toBe(true);
    expect(smoke.objectives.results.map((o) => o.id)).toEqual(["objective-A", "objective-B"]);
  });
});
