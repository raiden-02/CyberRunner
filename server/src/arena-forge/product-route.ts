import { NavGrid, type NavCell } from "./navigation.js";
import { isFiniteNumber, roundMeters } from "./geometry.js";
import type { ArenaMap, ArenaObjective, ArenaSpawn } from "./types.js";

export const MAX_PRODUCT_ROUTE_QUERIES = 8;
export const MAX_ROUTE_WAYPOINTS = 24;
const COLLINEAR_EPS = 1e-4;

export type RouteWaypoint = { x: number; z: number };

export type TraceRouteResult = {
  reachable: boolean;
  distanceMeters?: number;
  waypoints: RouteWaypoint[];
  fromId: string;
  toId: string;
};

export type RouteAnchor =
  | { kind: "spawn"; spawn: ArenaSpawn }
  | { kind: "objective"; objective: ArenaObjective };

function generalSpawns(map: ArenaMap): ArenaSpawn[] {
  return map.spawns.filter((s) => s.role === "general");
}

/** Accept exact IDs plus 1-based spawn-N aliases for Deathmatch. */
export function resolveRouteAnchor(map: ArenaMap, id: string): RouteAnchor | undefined {
  if (id === "A" || id === "B") {
    const objective = map.objectives.find((o) => o.id === id);
    return objective ? { kind: "objective", objective } : undefined;
  }
  const exact = map.spawns.find((s) => s.id === id);
  if (exact) return { kind: "spawn", spawn: exact };

  const oneBased = /^spawn-(\d+)$/.exec(id);
  if (oneBased) {
    const n = Number(oneBased[1]);
    const generals = generalSpawns(map);
    if (n >= 1 && n <= generals.length) {
      return { kind: "spawn", spawn: generals[n - 1]! };
    }
  }
  return undefined;
}

export function simplifyCollinearWaypoints(cells: NavCell[], maxPoints = MAX_ROUTE_WAYPOINTS): RouteWaypoint[] {
  if (cells.length === 0) return [];
  if (cells.length === 1) return [{ x: roundMeters(cells[0]!.x), z: roundMeters(cells[0]!.z) }];

  const kept: NavCell[] = [cells[0]!];
  for (let i = 1; i < cells.length - 1; i++) {
    const prev = kept[kept.length - 1]!;
    const cur = cells[i]!;
    const next = cells[i + 1]!;
    const d1x = cur.x - prev.x;
    const d1z = cur.z - prev.z;
    const d2x = next.x - cur.x;
    const d2z = next.z - cur.z;
    const cross = d1x * d2z - d1z * d2x;
    if (Math.abs(cross) > COLLINEAR_EPS) kept.push(cur);
  }
  kept.push(cells[cells.length - 1]!);

  if (kept.length <= maxPoints) {
    return kept.map((c) => ({ x: roundMeters(c.x), z: roundMeters(c.z) }));
  }
  const out: RouteWaypoint[] = [{ x: roundMeters(kept[0]!.x), z: roundMeters(kept[0]!.z) }];
  const step = (kept.length - 1) / (maxPoints - 1);
  for (let i = 1; i < maxPoints - 1; i++) {
    const cell = kept[Math.round(i * step)]!;
    out.push({ x: roundMeters(cell.x), z: roundMeters(cell.z) });
  }
  const last = kept[kept.length - 1]!;
  out.push({ x: roundMeters(last.x), z: roundMeters(last.z) });
  return out;
}

function goalIndexes(grid: NavGrid, anchor: RouteAnchor): number[] {
  if (anchor.kind === "spawn") {
    const idx = grid.spawnCell(anchor.spawn);
    return idx === null ? [] : [idx];
  }
  return grid.objectiveCells(anchor.objective);
}

export function traceRoute(map: ArenaMap, fromId: string, toId: string): TraceRouteResult | { error: { code: string; target?: string } } {
  if (!fromId || !toId) return { error: { code: "invalid-anchor" } };
  const from = resolveRouteAnchor(map, fromId);
  const to = resolveRouteAnchor(map, toId);
  if (!from) return { error: { code: "unknown-anchor", target: fromId } };
  if (!to) return { error: { code: "unknown-anchor", target: toId } };

  const grid = new NavGrid(map);
  const startIdxs = goalIndexes(grid, from);
  const endIdxs = goalIndexes(grid, to);
  if (startIdxs.length === 0 || endIdxs.length === 0) {
    return { reachable: false, waypoints: [], fromId, toId };
  }
  const path = grid.shortestPath(startIdxs[0]!, endIdxs);
  if (!path) {
    return { reachable: false, waypoints: [], fromId, toId };
  }
  const meters = grid.pathMeters(startIdxs[0]!, endIdxs);
  return {
    reachable: true,
    distanceMeters: meters === null ? undefined : roundMeters(meters),
    waypoints: simplifyCollinearWaypoints(path),
    fromId,
    toId,
  };
}

export function parseTraceRouteArgs(args: unknown): { fromId: string; toId: string } | string {
  if (typeof args !== "object" || args === null) return "trace_route requires fromId and toId";
  const rec = args as Record<string, unknown>;
  if (typeof rec.fromId !== "string" || !rec.fromId.trim()) return "trace_route requires fromId";
  if (typeof rec.toId !== "string" || !rec.toId.trim()) return "trace_route requires toId";
  if (rec.fromId.length > 40 || rec.toId.length > 40) return "trace_route ids are too long";
  return { fromId: rec.fromId.trim(), toId: rec.toId.trim() };
}

export function isFiniteCoordPair(x: unknown, z: unknown): boolean {
  return typeof x === "number" && typeof z === "number" && isFiniteNumber(x) && isFiniteNumber(z);
}
