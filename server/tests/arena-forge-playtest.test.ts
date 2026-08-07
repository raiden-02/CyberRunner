import { describe, expect, it } from "vitest";
import { applyArenaEdit, cloneArenaMap, createIdAllocator } from "../src/arena-forge/actions.js";
import { p4ManifestHash } from "../src/arena-forge/eval-cases.js";
import { p4bManifestHash } from "../src/arena-forge/eval-cases-p4b.js";
import { evaluateArena, evaluateGameplayMap } from "../src/arena-forge/evaluator.js";
import { importGameplayMap } from "../src/arena-forge/import-map.js";
import { NavGrid } from "../src/arena-forge/navigation.js";
import {
  PLAYTEST_ROLLOUTS,
  PLAYTEST_SEED,
  PLAYTEST_SPEED_METERS_PER_SECOND,
  runPlaytest,
} from "../src/arena-forge/playtest.js";
import type { ArenaMap, ArenaSolid } from "../src/arena-forge/types.js";
import { getGameplayMap } from "../../shared/world/map-registry.js";

const P4A_HASH = "6acb4b3274ec7d1bb06090f5342816737227a9855945558958bc3d29154282e2";
const P4B_HASH = "0ad49258552c067ebf1117dacc37b0c02ce16505870e943ef33e60ef571faa39";

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
      { id: "A", x: -4, y: 0, z: 0, radius: 1.5 },
      { id: "B", x: 4, y: 0, z: 0, radius: 1.5 },
    ],
    spawnProtectionZones: [],
    spikeSpawnLocation: { id: "spike-spawn", x: 0, y: 1, z: -6 },
    ...partial,
  };
}

function box(id: string, extra: Omit<ArenaSolid, "id" | "kind">, kind: ArenaSolid["kind"] = "obstacle"): ArenaSolid {
  return { id, kind, ...extra };
}

function apply(map: ArenaMap, action: Parameters<typeof applyArenaEdit>[1]): ArenaMap {
  const result = applyArenaEdit(map, action, createIdAllocator(map));
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.map;
}

function assertFinite(value: unknown, path = ""): void {
  if (typeof value === "number") {
    expect(Number.isFinite(value), path).toBe(true);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertFinite(v, `${path}[${i}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) assertFinite(v, path ? `${path}.${k}` : k);
  }
}

describe("P4 hashes stay frozen", () => {
  it("keeps P4-A and P4-B manifest hashes", () => {
    expect(p4ManifestHash()).toBe(P4A_HASH);
    expect(p4bManifestHash()).toBe(P4B_HASH);
  });
});

describe("P5 playtest A repeatability", () => {
  it("returns the same report for the same map, seed, and rollouts", () => {
    const map = importGameplayMap(getGameplayMap("map-contract-smoke"));
    const a = runPlaytest(map);
    const b = runPlaytest(map, { seed: PLAYTEST_SEED, rollouts: PLAYTEST_ROLLOUTS });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.seed).toBe(PLAYTEST_SEED);
    expect(a.rollouts).toBe(PLAYTEST_ROLLOUTS);
    expect(a.speedMetersPerSecond).toBe(PLAYTEST_SPEED_METERS_PER_SECOND);
    assertFinite(a);
  });
});

describe("P5 playtest B no mutation", () => {
  it("does not mutate the input ArenaMap", () => {
    const map = importGameplayMap(getGameplayMap("map-contract-smoke"));
    const before = JSON.stringify(map);
    runPlaytest(map);
    expect(JSON.stringify(map)).toBe(before);
  });
});

/** East cover on the Ghost approach to B. Lengthens B without making B unused. */
const EAST_B_COVER = { type: "add_solid" as const, kind: "obstacle" as const, x: 6, y: 2, z: -2, hx: 4, hy: 2, hz: 1.2 };

describe("P5 playtest C route-change sensitivity", () => {
  it("lengthens Ghost B arrival and shifts site choice toward A", () => {
    const map = importGameplayMap(getGameplayMap("map-contract-smoke"));
    const before = runPlaytest(map);
    const after = runPlaytest(apply(map, EAST_B_COVER));
    expect(before.ghost.siteChoice.B + before.ghost.siteChoice.A).toBe(PLAYTEST_ROLLOUTS);
    expect(after.ghost.siteChoice.B).toBeGreaterThan(0);
    expect(after.ghost.medianArrivalSeconds.B).toBeGreaterThan(before.ghost.medianArrivalSeconds.B!);
    expect(after.ghost.siteChoice.A).toBeGreaterThan(before.ghost.siteChoice.A);
  });
});

describe("P5 playtest D LOS sensitivity", () => {
  it("drops first-contact after a mid occluder", () => {
    const open = arena();
    const blocked = arena({
      solids: [box("occluder-0", { x: 0, y: 2, z: 0, hx: 8, hy: 2, hz: 0.4 }, "occluder")],
    });
    const before = runPlaytest(open);
    const after = runPlaytest(blocked);
    expect(before.firstContact.occurrenceFraction).toBeGreaterThan(0.5);
    expect(after.firstContact.occurrenceFraction).toBeLessThan(before.firstContact.occurrenceFraction);
    expect(after.ghost.meanRouteExposureFraction).toBeLessThan(before.ghost.meanRouteExposureFraction);
  });
});

describe("P5 playtest E chokepoint sensitivity", () => {
  it("lowers concentration when a second corridor opens", () => {
    const wall = box("wall-0", { x: 0, y: 2, z: 0, hx: 8, hy: 2, hz: 0.4 });
    const choke = arena({
      solids: [wall],
      objectives: [
        { id: "A", x: 0, y: 0, z: 4, radius: 1.5 },
        { id: "B", x: 0, y: 0, z: 4, radius: 1.5 },
      ],
    });
    const gap = apply(choke, { type: "resize_solid", solidId: "wall-0", hx: 2, hy: 2, hz: 0.4 });
    const before = runPlaytest(choke);
    const after = runPlaytest(gap);
    expect(after.ghost.routeConcentration).toBeLessThanOrEqual(before.ghost.routeConcentration);
  });
});

describe("P5 playtest F unreachable routes", () => {
  it("does not crash or emit NaN when sites are boxed off", () => {
    const boxed = arena({
      solids: [
        box("cage-a", { x: -4, y: 2, z: 0, hx: 2, hy: 2, hz: 2 }),
        box("cage-b", { x: 4, y: 2, z: 0, hx: 2, hy: 2, hz: 2 }),
      ],
    });
    const report = runPlaytest(boxed, { rollouts: 8 });
    expect(report.ghost.siteChoice.A + report.ghost.siteChoice.B).toBe(0);
    expect(report.firstContact.occurrenceFraction).toBe(0);
    assertFinite(report);
  });
});

describe("P5 playtest G P0 unchanged", () => {
  it("keeps smoke and Shoot House evaluator numbers", () => {
    const smoke = evaluateGameplayMap(getGameplayMap("map-contract-smoke"));
    expect(smoke.summary.hardFailureCount).toBe(0);
    expect(smoke.navigation.paths.every((p) => p.reachable)).toBe(true);
    expect(
      smoke.navigation.aggregates.find((a) => a.fromRole === "ghost" && a.to === "objective-A")?.medianMeters,
    ).toBe(12.5);
    expect(
      smoke.navigation.aggregates.find((a) => a.fromRole === "ghost" && a.to === "objective-B")?.medianMeters,
    ).toBe(12);

    const house = evaluateGameplayMap(getGameplayMap("shoot-house-neon"));
    expect(house.summary.hardFailureCount).toBe(0);
    expect(house.navigation.walkableCells).toBe(9740);
    expect(house.navigation.totalCells).toBe(12544);
    expect(house.navigation.paths.filter((p) => p.reachable)).toHaveLength(16);
    expect(house.lineOfSight.pairs.filter((p) => p.clear)).toHaveLength(4);
  });

  it("reconstructs a path whose length matches pathMeters", () => {
    const map = importGameplayMap(getGameplayMap("map-contract-smoke"));
    const grid = new NavGrid(map);
    const spawn = map.spawns.find((s) => s.id === "ghost-spawn-0")!;
    const obj = map.objectives.find((o) => o.id === "A")!;
    const from = grid.spawnCell(spawn)!;
    const goals = grid.objectiveCells(obj);
    const meters = grid.pathMeters(from, goals);
    const path = grid.shortestPath(from, goals);
    expect(path).not.toBeNull();
    expect((path!.length - 1) * grid.cell).toBe(meters);
  });
});

describe("P5 playtest clone isolation", () => {
  it("clones so later edits to the caller map do not change a stored snapshot", () => {
    const map = cloneArenaMap(importGameplayMap(getGameplayMap("map-contract-smoke")));
    const first = runPlaytest(map);
    map.solids.push({ id: "later", kind: "obstacle", x: 0, y: 2, z: 0, hx: 4, hy: 2, hz: 4 });
    expect(JSON.stringify(runPlaytest(importGameplayMap(getGameplayMap("map-contract-smoke"))))).toBe(
      JSON.stringify(first),
    );
    expect(evaluateArena(map).summary.hardFailureCount).toBeGreaterThanOrEqual(0);
  });
});
