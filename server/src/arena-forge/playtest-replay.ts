import { cloneArenaMap } from "./actions.js";
import { hypot2, roundMeters, segmentHitsAabb } from "./geometry.js";
import { NavGrid, type NavCell } from "./navigation.js";
import {
  EXPLORATION_JITTER_METERS,
  EXPOSURE_PENALTY_METERS,
  PLAYTEST_SEED,
  PLAYTEST_SPEED_METERS_PER_SECOND,
} from "./playtest.js";
import { EYE_HEIGHT, GRID_CELL_METERS, type ArenaMap, type ArenaSpawn, type SpawnRole } from "./types.js";

/**
 * One Ghost/Sentinel pair from the same seed as `runPlaytest`.
 * First rollout only. Offline nav proxy. Never sent to the LLM.
 */
export type PlaytestReplayPoint = { x: number; z: number };

export type PlaytestReplayRole = {
  site: "A" | "B";
  spawn: PlaytestReplayPoint;
  path: PlaytestReplayPoint[];
};

export type PlaytestReplay = {
  seed: number;
  ghost?: PlaytestReplayRole;
  sentinel?: PlaytestReplayRole;
  firstContact?: { seconds: number; x: number; z: number };
};

class SeededRng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    this.state = (Math.imul(this.state, 1664525) + 1013904223) >>> 0;
    return this.state / 4294967296;
  }

  uniform(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  pick<T>(items: T[]): T {
    return items[Math.floor(this.next() * items.length)]!;
  }
}

function losClear(map: ArenaMap, ax: number, az: number, bx: number, bz: number): boolean {
  for (const solid of map.solids) {
    if (segmentHitsAabb(ax, EYE_HEIGHT, az, bx, EYE_HEIGHT, bz, solid) !== null) {
      return false;
    }
  }
  return true;
}

function pathLengthMeters(path: NavCell[]): number {
  if (path.length <= 1) return 0;
  return (path.length - 1) * GRID_CELL_METERS;
}

function pointAt(path: NavCell[], distance: number): { x: number; z: number } {
  if (path.length === 0) return { x: 0, z: 0 };
  if (path.length === 1 || distance <= 0) return { x: path[0]!.x, z: path[0]!.z };
  let remain = distance;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i]!;
    const b = path[i + 1]!;
    const seg = hypot2(b.x - a.x, b.z - a.z);
    if (remain <= seg) {
      const t = seg === 0 ? 0 : remain / seg;
      return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
    }
    remain -= seg;
  }
  const last = path[path.length - 1]!;
  return { x: last.x, z: last.z };
}

function routeExposure(
  map: ArenaMap,
  path: NavCell[],
  opposing: Array<{ x: number; z: number }>,
): number {
  if (path.length === 0 || opposing.length === 0) return 0;
  let exposed = 0;
  for (const cell of path) {
    if (opposing.some((s) => losClear(map, cell.x, cell.z, s.x, s.z))) exposed += 1;
  }
  return exposed / path.length;
}

function validRoleSpawns(map: ArenaMap, grid: NavGrid, role: SpawnRole): ArenaSpawn[] {
  return map.spawns.filter((s) => s.role === role && grid.spawnCell(s) !== null);
}

function chooseRoute(
  map: ArenaMap,
  grid: NavGrid,
  spawn: ArenaSpawn,
  opposing: Array<{ x: number; z: number }>,
  rng: SeededRng,
): { site: "A" | "B"; path: NavCell[] } | undefined {
  const from = grid.spawnCell(spawn);
  if (from === null) return undefined;
  const candidates: Array<{ site: "A" | "B"; path: NavCell[]; utility: number }> = [];
  for (const site of ["A", "B"] as const) {
    const obj = map.objectives.find((o) => o.id === site);
    if (!obj) continue;
    const goals = grid.objectiveCells(obj);
    const path = grid.shortestPath(from, goals);
    if (!path) continue;
    const meters = pathLengthMeters(path);
    const exposure = routeExposure(map, path, opposing);
    const utility =
      meters + EXPOSURE_PENALTY_METERS * exposure + rng.uniform(0, EXPLORATION_JITTER_METERS);
    candidates.push({ site, path, utility });
  }
  if (candidates.length === 0) return undefined;
  candidates.sort((a, b) => a.utility - b.utility || a.site.localeCompare(b.site));
  const best = candidates[0]!;
  return { site: best.site, path: best.path };
}

function firstContact(
  map: ArenaMap,
  ghostPath: NavCell[],
  sentinelPath: NavCell[],
): { seconds: number; x: number; z: number } | undefined {
  const gLen = pathLengthMeters(ghostPath);
  const sLen = pathLengthMeters(sentinelPath);
  const gT = gLen / PLAYTEST_SPEED_METERS_PER_SECOND;
  const sT = sLen / PLAYTEST_SPEED_METERS_PER_SECOND;
  const end = Math.min(gT, sT);
  if (!Number.isFinite(end) || end <= 0) return undefined;

  for (let t = 0; t <= end + 1e-9; t += 0.05) {
    const clamped = Math.min(t, end);
    const g = pointAt(ghostPath, PLAYTEST_SPEED_METERS_PER_SECOND * clamped);
    const s = pointAt(sentinelPath, PLAYTEST_SPEED_METERS_PER_SECOND * clamped);
    if (losClear(map, g.x, g.z, s.x, s.z)) {
      return {
        seconds: roundMeters(clamped),
        x: roundMeters((g.x + s.x) / 2),
        z: roundMeters((g.z + s.z) / 2),
      };
    }
  }
  return undefined;
}

function roleReplay(
  spawn: ArenaSpawn,
  route: { site: "A" | "B"; path: NavCell[] },
): PlaytestReplayRole {
  return {
    site: route.site,
    spawn: { x: spawn.x, z: spawn.z },
    path: route.path.map((c) => ({ x: c.x, z: c.z })),
  };
}

/**
 * First Ghost/Sentinel pair of `runPlaytest` for this map and seed.
 * Does not call `runPlaytest`. Does not mutate `map`.
 */
export function representativeReplay(map: ArenaMap, seed = PLAYTEST_SEED): PlaytestReplay {
  const snapshot = cloneArenaMap(map);
  const rng = new SeededRng(seed);
  const grid = new NavGrid(snapshot);
  const ghosts = validRoleSpawns(snapshot, grid, "ghost");
  const sentinels = validRoleSpawns(snapshot, grid, "sentinel");
  const ghostAnchors = ghosts.map((s) => ({ x: s.x, z: s.z }));
  const sentinelAnchors = sentinels.map((s) => ({ x: s.x, z: s.z }));

  const ghostSpawn = ghosts.length ? rng.pick(ghosts) : undefined;
  const sentinelSpawn = sentinels.length ? rng.pick(sentinels) : undefined;
  const ghost =
    ghostSpawn !== undefined
      ? chooseRoute(snapshot, grid, ghostSpawn, sentinelAnchors, rng)
      : undefined;
  const sentinel =
    sentinelSpawn !== undefined
      ? chooseRoute(snapshot, grid, sentinelSpawn, ghostAnchors, rng)
      : undefined;
  const contact =
    ghost && sentinel ? firstContact(snapshot, ghost.path, sentinel.path) : undefined;

  const replay: PlaytestReplay = { seed };
  if (ghost && ghostSpawn) replay.ghost = roleReplay(ghostSpawn, ghost);
  if (sentinel && sentinelSpawn) replay.sentinel = roleReplay(sentinelSpawn, sentinel);
  if (contact) replay.firstContact = contact;
  return JSON.parse(JSON.stringify(replay)) as PlaytestReplay;
}
