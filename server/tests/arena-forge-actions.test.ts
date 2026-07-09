import { beforeAll, describe, expect, it } from "vitest";
import RAPIER from "@dimforge/rapier3d-compat";
import { getGameplayMap } from "../../shared/world/map-registry.js";
import { buildMapColliders } from "../../shared/world/map-physics.js";
import {
  applyArenaEdit,
  cloneArenaMap,
  createIdAllocator,
} from "../src/arena-forge/actions.js";
import { inspectArena } from "../src/arena-forge/inspect.js";
import { ArenaWorkspace, applyArenaAction } from "../src/arena-forge/workspace.js";
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

describe("ArenaForge inspection", () => {
  it("exposes bounds, solids, spawns, and objectives without source edits", () => {
    const map = arena({
      solids: [box("obstacle-0", "obstacle", { x: 1, y: 1, z: 1, hx: 1, hy: 1, hz: 1 })],
    });
    const snap = inspectArena(map);
    expect(snap.boundsHalfSize).toBe(10);
    expect(snap.solids).toEqual([{
      id: "obstacle-0",
      kind: "obstacle",
      x: 1, y: 1, z: 1, hx: 1, hy: 1, hz: 1, hp: undefined,
    }]);
    expect(snap.spawns.map((s) => s.id)).toEqual(["ghost-spawn-0", "sentinel-spawn-0"]);
    expect(snap.objectives.map((o) => o.id)).toEqual(["A", "B"]);
    expect(snap.evaluation).toBeUndefined();
  });

  it("exposes already-computed navigation components, anchors, and aggregates", () => {
    const ws = new ArenaWorkspace(arena());
    const snap = ws.inspect();
    expect(snap.evaluation?.navigation.components).toEqual(ws.evaluation.navigation.components);
    expect(snap.evaluation?.navigation.anchors).toEqual(ws.evaluation.navigation.anchors);
    expect(snap.evaluation?.navigation.paths).toEqual(ws.evaluation.navigation.paths);
    expect(snap.evaluation?.navigation.aggregates).toEqual(ws.evaluation.navigation.aggregates);
    expect(snap.evaluation?.navigation.anchors.some((a) => a.id === "sentinel-spawn-0")).toBe(true);
    expect(snap.evaluation?.navigation.aggregates.some((a) => a.fromRole === "sentinel" && a.to === "objective-A")).toBe(true);
  });

  it("returns a detached snapshot that cannot mutate workspace state", () => {
    const ws = new ArenaWorkspace(arena({
      solids: [box("obstacle-0", "obstacle", { x: 0, y: 1, z: 0, hx: 1, hy: 1, hz: 1 })],
    }));
    const beforeMap = ws.currentMap();
    const beforeEval = structuredClone(ws.evaluation);
    const snap = ws.inspect();

    snap.solids[0].x = 99;
    snap.spikeSpawnLocation!.x = 99;
    snap.evaluation!.hardFailures.push({ code: "mutated" });
    snap.evaluation!.spawns[0].id = "mutated-spawn";
    snap.evaluation!.objectives[0].id = "Z";
    snap.evaluation!.navigation.paths[0].from = "mutated-path";
    snap.evaluation!.navigation.anchors[0].id = "mutated-anchor";
    snap.evaluation!.navigation.aggregates[0].medianMeters = 0;
    snap.evaluation!.navigation.components.count = 99;
    snap.evaluation!.lineOfSight[0].from = "mutated-los";

    const again = ws.inspect();
    expect(ws.currentMap()).toEqual(beforeMap);
    expect(ws.evaluation).toEqual(beforeEval);
    expect(again.solids[0].x).toBe(0);
    expect(again.spikeSpawnLocation?.x).toBe(0);
    expect(again.evaluation?.hardFailures).toEqual(beforeEval.summary.hardFailures);
    expect(again.evaluation?.spawns[0].id).toBe("ghost-spawn-0");
    expect(again.evaluation?.objectives[0].id).toBe("objective-A");
    expect(again.evaluation?.navigation.paths[0].from).not.toBe("mutated-path");
    expect(again.evaluation?.navigation.anchors[0].id).not.toBe("mutated-anchor");
    expect(again.evaluation?.navigation.components.count).toBe(beforeEval.navigation.components.count);
    expect(again.evaluation?.lineOfSight[0].from).not.toBe("mutated-los");
  });
});

describe("ArenaForge actions", () => {
  it("unblocks a spawn by moving the intersecting solid", () => {
    const map = arena({
      solids: [box("obstacle-0", "obstacle", { x: 0, y: 1, z: -8, hx: 1, hy: 1, hz: 1 })],
    });
    const ws = new ArenaWorkspace(map);
    const blocked = ws.evaluation.spawns.results.find((s) => s.id === "ghost-spawn-0");
    expect(blocked?.valid).toBe(false);
    expect(blocked?.blockedBy).toBe("obstacle-0");

    const result = ws.apply({
      type: "move_solid",
      solidId: "obstacle-0",
      x: 6,
      y: 1,
      z: 0,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changedIds).toEqual(["obstacle-0"]);
    expect(result.map.solids.find((s) => s.id === "obstacle-0")).toMatchObject({ x: 6, z: 0 });
    expect(result.map.spawns.find((s) => s.id === "ghost-spawn-0")).toBeDefined();
    const ghost = result.evaluation.spawns.results.find((s) => s.id === "ghost-spawn-0");
    expect(ghost?.valid).toBe(true);
    expect(ghost?.blockedBy).toBeUndefined();
    expect(result.evaluation.summary.hardFailures.some(
      (i) => i.code === "spawn-blocked" && i.id === "ghost-spawn-0",
    )).toBe(false);
  });

  it("adds a stable occluder that blocks a previously clear Ghost ↔ Sentinel LOS", () => {
    const ws = new ArenaWorkspace(arena());
    const before = ws.evaluation.lineOfSight.pairs.find(
      (p) => p.from === "ghost-spawn-0" && p.to === "sentinel-spawn-0",
    );
    expect(before?.clear).toBe(true);

    const result = ws.apply({
      type: "add_solid",
      kind: "occluder",
      x: 0,
      y: 2,
      z: 0,
      hx: 2,
      hy: 2,
      hz: 0.4,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changedIds).toEqual(["occluder-0"]);
    expect(result.map.solids.find((s) => s.id === "occluder-0")?.kind).toBe("occluder");

    const after = result.evaluation.lineOfSight.pairs.find(
      (p) => p.from === "ghost-spawn-0" && p.to === "sentinel-spawn-0",
    );
    expect(after?.clear).toBe(false);
    expect(after?.blockedBy).toBe("occluder-0");
  });

  it("makes an unreachable S&D path reachable by removing the divider", () => {
    const ws = new ArenaWorkspace(arena({
      solids: [box("obstacle-0", "obstacle", { x: 0, y: 2, z: 0, hx: 10, hy: 2, hz: 0.4 })],
    }));
    const before = ws.evaluation.navigation.paths.find(
      (p) => p.from === "sentinel-spawn-0" && p.to === "objective-A",
    );
    expect(before?.reachable).toBe(false);

    const result = ws.apply({ type: "remove_solid", solidId: "obstacle-0" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changedIds).toEqual(["obstacle-0"]);
    expect(result.map.solids).toEqual([]);

    const after = result.evaluation.navigation.paths.find(
      (p) => p.from === "sentinel-spawn-0" && p.to === "objective-A",
    );
    expect(after?.reachable).toBe(true);
    expect(result.evaluation.summary.hardFailures.some(
      (i) => i.code === "unreachable-pair" && i.from === "sentinel-spawn-0",
    )).toBe(false);
  });

  it("returns a structured error for an unknown solid", () => {
    const result = applyArenaAction(arena(), {
      type: "move_solid",
      solidId: "obstacle-999",
      x: 0,
      y: 1,
      z: 0,
    });
    expect(result).toEqual({
      ok: false,
      error: { code: "unknown-solid", target: "obstacle-999" },
    });
  });

  it("rejects zero or negative resize at the action layer", () => {
    const map = arena({
      solids: [box("obstacle-0", "obstacle", { x: 0, y: 1, z: 0, hx: 1, hy: 1, hz: 1 })],
    });
    const ids = createIdAllocator(map);
    const snapshot = cloneArenaMap(map);

    for (const extents of [
      { hx: 0, hy: 1, hz: 1 },
      { hx: 1, hy: -2, hz: 1 },
    ]) {
      const result = applyArenaEdit(map, { type: "resize_solid", solidId: "obstacle-0", ...extents }, ids);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe("non-positive-extent");
      expect(result.error.target).toBe("obstacle-0");
    }

    expect(map).toEqual(snapshot);
    expect(map.solids[0]).toMatchObject({ hx: 1, hy: 1, hz: 1 });
  });

  it("lets a solid move out of bounds and reports solid-out-of-bounds from the evaluator", () => {
    const map = arena({
      solids: [box("obstacle-0", "obstacle", { x: 0, y: 1, z: 0, hx: 1, hy: 1, hz: 1 })],
    });
    const result = applyArenaAction(map, {
      type: "move_solid",
      solidId: "obstacle-0",
      x: 11,
      y: 1,
      z: 0,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.map.solids[0]).toMatchObject({ id: "obstacle-0", x: 11 });
    expect(result.evaluation.geometry.issues.some(
      (i) => i.code === "solid-out-of-bounds" && i.id === "obstacle-0",
    )).toBe(true);
    expect(result.evaluation.summary.hardFailures.some(
      (i) => i.code === "solid-out-of-bounds" && i.id === "obstacle-0",
    )).toBe(true);
  });

  it("does not mutate the original map on a successful edit", () => {
    const map = arena({
      solids: [box("obstacle-0", "obstacle", { x: 0, y: 1, z: 0, hx: 1, hy: 1, hz: 1 })],
    });
    const original = map.solids[0];
    const result = applyArenaEdit(map, {
      type: "move_solid",
      solidId: "obstacle-0",
      x: 4,
      y: 1,
      z: 3,
    }, createIdAllocator(map));
    expect(result.ok).toBe(true);
    expect(original).toMatchObject({ x: 0, y: 1, z: 0 });
    expect(map.solids[0]).toBe(original);
    if (!result.ok) return;
    expect(result.map.solids[0]).toMatchObject({ x: 4, z: 3 });
    expect(result.map.solids[0]).not.toBe(original);
  });

  it("keeps surviving IDs and does not reuse a removed ID in the same session", () => {
    const ws = new ArenaWorkspace(arena({
      solids: [
        box("obstacle-0", "obstacle", { x: -3, y: 1, z: 0, hx: 1, hy: 1, hz: 1 }),
        box("obstacle-1", "obstacle", { x: 3, y: 1, z: 0, hx: 1, hy: 1, hz: 1 }),
      ],
    }));

    const added = ws.apply({
      type: "add_solid",
      kind: "obstacle",
      x: 0, y: 1, z: 4,
      hx: 1, hy: 1, hz: 1,
    });
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(added.changedIds).toEqual(["obstacle-2"]);
    expect(ws.currentMap().solids.map((s) => s.id)).toEqual(["obstacle-0", "obstacle-1", "obstacle-2"]);

    const removed = ws.apply({ type: "remove_solid", solidId: "obstacle-0" });
    expect(removed.ok).toBe(true);
    if (!removed.ok) return;
    expect(ws.currentMap().solids.map((s) => s.id)).toEqual(["obstacle-1", "obstacle-2"]);

    const addedAgain = ws.apply({
      type: "add_solid",
      kind: "obstacle",
      x: -3, y: 1, z: 0,
      hx: 1, hy: 1, hz: 1,
    });
    expect(addedAgain.ok).toBe(true);
    if (!addedAgain.ok) return;
    expect(addedAgain.changedIds).toEqual(["obstacle-3"]);
    expect(ws.currentMap().solids.map((s) => s.id)).toEqual(["obstacle-1", "obstacle-2", "obstacle-3"]);
  });

  it("assigns different IDs for two sequential additions on a workspace", () => {
    const ws = new ArenaWorkspace(arena());
    const first = ws.apply({
      type: "add_solid",
      kind: "occluder",
      x: -2, y: 2, z: 0,
      hx: 1, hy: 2, hz: 0.4,
    });
    const second = ws.apply({
      type: "add_solid",
      kind: "occluder",
      x: 2, y: 2, z: 0,
      hx: 1, hy: 2, hz: 0.4,
    });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.changedIds).toEqual(["occluder-0"]);
    expect(second.changedIds).toEqual(["occluder-1"]);
    expect(first.changedIds[0]).not.toBe(second.changedIds[0]);
    expect(ws.currentMap().solids.map((s) => s.id)).toEqual(["occluder-0", "occluder-1"]);
  });

  it("classifies add_solid non-finite coordinates and extents separately", () => {
    const map = arena();
    const badCoord = applyArenaAction(map, {
      type: "add_solid",
      kind: "obstacle",
      x: Number.NaN, y: 1, z: 0,
      hx: 1, hy: 1, hz: 1,
    });
    expect(badCoord).toEqual({
      ok: false,
      error: { code: "non-finite-coordinates" },
    });

    const badExtent = applyArenaAction(map, {
      type: "add_solid",
      kind: "obstacle",
      x: 0, y: 1, z: 0,
      hx: 1, hy: Number.POSITIVE_INFINITY, hz: 1,
    });
    expect(badExtent).toEqual({
      ok: false,
      error: { code: "non-finite-extents" },
    });

    expect(map.solids).toEqual([]);
  });
});

describe("ArenaForge export", () => {
  beforeAll(async () => {
    await RAPIER.init();
  });

  it("round-trips a canonical map through edit and buildMapColliders", () => {
    const source = getGameplayMap("map-contract-smoke");
    const ws = ArenaWorkspace.fromGameplay(source);
    const snap = inspectArena(ws.currentMap(), ws.evaluation);
    expect(snap.solids.map((s) => s.id)).toEqual([
      "obstacle-0",
      "obstacle-1",
      "occluder-0",
      "breakable-0",
    ]);

    const moved = ws.apply({
      type: "move_solid",
      solidId: "obstacle-1",
      x: 4,
      y: 1,
      z: -2,
    });
    expect(moved.ok).toBe(true);

    const exported = ws.exportToGameplay(source.id, source.name);
    expect(exported.id).toBe("map-contract-smoke");
    expect(exported.name).toBe("map-contract-smoke");
    expect(exported.boundsHalfSize).toBe(source.boundsHalfSize);
    expect(exported.wallHeight).toBe(source.wallHeight);
    expect(exported.wallThickness).toBe(source.wallThickness);
    expect(exported.groundThickness).toBe(source.groundThickness);
    expect(exported.obstacles).toEqual([
      source.obstacles[0],
      { x: 4, y: 1, z: -2, hx: 1, hy: 1, hz: 1 },
    ]);
    expect(exported.occluders).toEqual(source.occluders);
    expect(exported.breakables).toEqual(source.breakables);
    expect(exported.spawnPoints).toEqual(source.spawnPoints);
    expect(exported.ghostSpawnPoints).toEqual(source.ghostSpawnPoints);
    expect(exported.sentinelSpawnPoints).toEqual(source.sentinelSpawnPoints);
    expect(exported.uploadTerminals).toEqual(source.uploadTerminals);
    expect(exported.spawnProtectionZones).toEqual(source.spawnProtectionZones);
    expect(exported.spikeSpawnLocation).toEqual(source.spikeSpawnLocation);

    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    const { breakableColliders } = buildMapColliders(RAPIER, world, exported);
    expect(breakableColliders.length).toBe(exported.breakables.length);
    const expected =
      1 + 4 + exported.obstacles.length + exported.occluders.length + exported.breakables.length;
    expect(world.colliders.len()).toBe(expected);
    world.free();
  });
});
