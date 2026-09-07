import { describe, expect, it } from "vitest";
import { parseArenaDesignSpec } from "../../shared/world/arena-design-spec.js";
import { applyArenaEdit, createIdAllocator } from "../src/arena-forge/actions.js";
import { buildBlankArena } from "../src/arena-forge/blank-map.js";
import { NavGrid } from "../src/arena-forge/navigation.js";
import { resolveRouteAnchor, simplifyCollinearWaypoints, traceRoute } from "../src/arena-forge/product-route.js";
import type { ArenaMap } from "../src/arena-forge/types.js";

const spec = parseArenaDesignSpec({
  version: 1,
  mode: "search_destroy",
  envelope: { centerX: 0, centerZ: 0, halfWidth: 20, halfDepth: 16 },
  spawnSetup: {
    kind: "search_destroy",
    ghostAnchor: { x: -12, z: 0 },
    sentinelAnchor: { x: 12, z: 0 },
  },
  brief: "Routes.",
});
if (!spec.ok) throw new Error("spec");

function withSites(map: ArenaMap): ArenaMap {
  let next = map;
  for (const obj of [
    { type: "place_objective" as const, objectiveId: "A" as const, x: -4, y: 0, z: 6, radius: 2 },
    { type: "place_objective" as const, objectiveId: "B" as const, x: 4, y: 0, z: -6, radius: 2 },
  ]) {
    const applied = applyArenaEdit(next, obj, createIdAllocator(next));
    if (!applied.ok) throw new Error(applied.error.code);
    next = applied.map;
  }
  return next;
}

function wallAcross(map: ArenaMap): ArenaMap {
  const applied = applyArenaEdit(
    map,
    { type: "add_solid", kind: "obstacle", x: 0, y: 1.5, z: 0, hx: 2, hy: 1.5, hz: 16 },
    createIdAllocator(map),
  );
  if (!applied.ok) throw new Error(applied.error.code);
  return applied.map;
}

describe("trace_route", () => {
  it("returns a reachable simplified path matching NavGrid distance", () => {
    const map = withSites(buildBlankArena(spec.spec));
    const result = traceRoute(map, "ghost-spawn-0", "A");
    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.reachable).toBe(true);
    expect(result.waypoints.length).toBeGreaterThanOrEqual(2);
    const grid = new NavGrid(map);
    const from = grid.spawnCell(map.spawns.find((s) => s.id === "ghost-spawn-0")!);
    const goals = grid.objectiveCells(map.objectives.find((o) => o.id === "A")!);
    expect(from).not.toBeNull();
    expect(result.distanceMeters).toBe(grid.pathMeters(from!, goals));
    const xs = new Set(result.waypoints.map((p) => p.x));
    const zs = new Set(result.waypoints.map((p) => p.z));
    expect(xs.size + zs.size).toBeGreaterThan(2);
  });

  it("reports unreachable paths and does not mutate", () => {
    const map = wallAcross(withSites(buildBlankArena(spec.spec)));
    const before = JSON.stringify(map.solids);
    const result = traceRoute(map, "ghost-spawn-0", "sentinel-spawn-0");
    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.reachable).toBe(false);
    expect(result.waypoints).toEqual([]);
    expect(JSON.stringify(map.solids)).toBe(before);
  });

  it("validates ids and simplifies collinear cells", () => {
    expect(resolveRouteAnchor(buildBlankArena(spec.spec), "missing")).toBeUndefined();
    const cells = [
      { index: 0, i: 0, j: 0, x: 0, z: 0 },
      { index: 1, i: 1, j: 0, x: 1, z: 0 },
      { index: 2, i: 2, j: 0, x: 2, z: 0 },
      { index: 3, i: 2, j: 1, x: 2, z: 1 },
    ];
    expect(simplifyCollinearWaypoints(cells)).toEqual([
      { x: 0, z: 0 },
      { x: 2, z: 0 },
      { x: 2, z: 1 },
    ]);
  });
});
