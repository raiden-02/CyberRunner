import { MOVE } from "@shared/physics/constants.js";
import { cloneArenaMap } from "./actions.js";
import { hypot2, roundMeters, segmentHitsAabb } from "./geometry.js";
import { NavGrid, type NavCell } from "./navigation.js";
import { EYE_HEIGHT, GRID_CELL_METERS, type ArenaMap, type ArenaSpawn, type SpawnRole } from "./types.js";

export const PLAYTEST_SEED = 20260831;
export const PLAYTEST_ROLLOUTS = 64;

/** Ordinary standing walk. No sprint, crouch, slide, or jump. */
export const PLAYTEST_SPEED_METERS_PER_SECOND = MOVE.WalkMaxSpeed;

/**
 * Added to route utility as `penalty * exposureFraction`.
 * 12 m is a modest detour versus a fully exposed path.
 */
export const EXPOSURE_PENALTY_METERS = 12;

/** Uniform [0, jitter] noise so close utilities mix. Seeded. */
export const EXPLORATION_JITTER_METERS = 2.5;

const CONTACT_DT = 0.05;
const HOTSPOT_BIN_METERS = 2;

export type ArenaPlaytestRoleStats = {
  siteChoice: { A: number; B: number };
  medianArrivalSeconds: { A?: number; B?: number };
  meanRouteExposureFraction: number;
  /**
   * Max fraction of this role's successful rollouts that visited
   * the same non-spawn nav cell.
   */
  routeConcentration: number;
};

export type ArenaPlaytestReport = {
  seed: number;
  rollouts: number;
  speedMetersPerSecond: number;
  ghost: ArenaPlaytestRoleStats;
  sentinel: ArenaPlaytestRoleStats;
  firstContact: {
    occurrenceFraction: number;
    medianSeconds?: number;
    hotspot?: { x: number; z: number; sampleCount: number };
  };
  limitations: string[];
};

export type PlaytestOptions = {
  seed?: number;
  rollouts?: number;
};

const LIMITATIONS = [
  "Scripted seeded proxy. Not human play, combat AI, or a balance oracle.",
  "Standing ground nav only. No jump, crouch, slide, shoot, or damage.",
  "Site choice is travel distance + spawn-anchor exposure + seeded jitter.",
  "Exposure is the fraction of route cells with clear LOS from one or more opposing spawn anchors.",
  "Route concentration is the max fraction of successful rollouts visiting one non-spawn cell.",
  "First contact is the first clear eye-height LOS between the two runners. No firing.",
  "Same seed and rollout count replay the same spawn/jitter sequence.",
];

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

function finiteMedian(values: number[]): number | undefined {
  const clean = values.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (clean.length === 0) return undefined;
  const mid = Math.floor(clean.length / 2);
  const raw = clean.length % 2 === 1 ? clean[mid]! : (clean[mid - 1]! + clean[mid]!) / 2;
  return Number.isFinite(raw) ? roundMeters(raw) : undefined;
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
  return (path.length - 1) * GRID_CELL;
}

const GRID_CELL = GRID_CELL_METERS;

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

function emptyRole(): ArenaPlaytestRoleStats {
  return {
    siteChoice: { A: 0, B: 0 },
    medianArrivalSeconds: {},
    meanRouteExposureFraction: 0,
    routeConcentration: 0,
  };
}

function finishRole(
  choices: { A: number; B: number },
  arrivalsA: number[],
  arrivalsB: number[],
  exposures: number[],
  visitCounts: Map<number, number>,
  successful: number,
): ArenaPlaytestRoleStats {
  let concentration = 0;
  if (successful > 0) {
    let maxVisits = 0;
    for (const n of visitCounts.values()) {
      if (n > maxVisits) maxVisits = n;
    }
    concentration = roundMeters(maxVisits / successful);
  }
  const meanExp =
    exposures.length === 0
      ? 0
      : roundMeters(exposures.reduce((s, n) => s + n, 0) / exposures.length);
  return {
    siteChoice: choices,
    medianArrivalSeconds: {
      ...(finiteMedian(arrivalsA) !== undefined ? { A: finiteMedian(arrivalsA) } : {}),
      ...(finiteMedian(arrivalsB) !== undefined ? { B: finiteMedian(arrivalsB) } : {}),
    },
    meanRouteExposureFraction: meanExp,
    routeConcentration: concentration,
  };
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
): { site: "A" | "B"; path: NavCell[]; exposure: number; meters: number } | undefined {
  const from = grid.spawnCell(spawn);
  if (from === null) return undefined;
  const candidates: Array<{ site: "A" | "B"; path: NavCell[]; exposure: number; meters: number; utility: number }> =
    [];
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
    candidates.push({ site, path, exposure, meters, utility });
  }
  if (candidates.length === 0) return undefined;
  candidates.sort((a, b) => a.utility - b.utility || a.site.localeCompare(b.site));
  const best = candidates[0]!;
  return { site: best.site, path: best.path, exposure: best.exposure, meters: best.meters };
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

  for (let t = 0; t <= end + 1e-9; t += CONTACT_DT) {
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

function recordVisits(path: NavCell[], spawnIdx: number, counts: Map<number, number>): void {
  const seen = new Set<number>();
  for (const cell of path) {
    if (cell.index === spawnIdx) continue;
    if (seen.has(cell.index)) continue;
    seen.add(cell.index);
    counts.set(cell.index, (counts.get(cell.index) ?? 0) + 1);
  }
}

function hotspotOf(points: Array<{ x: number; z: number }>): { x: number; z: number; sampleCount: number } | undefined {
  if (points.length === 0) return undefined;
  const bins = new Map<string, { x: number; z: number; n: number }>();
  for (const p of points) {
    const i = Math.round(p.x / HOTSPOT_BIN_METERS);
    const j = Math.round(p.z / HOTSPOT_BIN_METERS);
    const key = `${i},${j}`;
    const cur = bins.get(key);
    if (cur) {
      cur.x += p.x;
      cur.z += p.z;
      cur.n += 1;
    } else {
      bins.set(key, { x: p.x, z: p.z, n: 1 });
    }
  }
  let best: { x: number; z: number; n: number } | undefined;
  for (const bin of bins.values()) {
    if (!best || bin.n > best.n) best = bin;
  }
  if (!best) return undefined;
  return {
    x: roundMeters(best.x / best.n),
    z: roundMeters(best.z / best.n),
    sampleCount: best.n,
  };
}

/**
 * Seeded scripted playtest. Clones the map. Does not mutate `map`.
 * Same map + seed + rollout count is byte-stable after JSON.stringify.
 */
export function runPlaytest(map: ArenaMap, opts: PlaytestOptions = {}): ArenaPlaytestReport {
  const snapshot = cloneArenaMap(map);
  const seed = opts.seed ?? PLAYTEST_SEED;
  const rollouts = opts.rollouts ?? PLAYTEST_ROLLOUTS;
  const rng = new SeededRng(seed);
  const grid = new NavGrid(snapshot);

  const ghosts = validRoleSpawns(snapshot, grid, "ghost");
  const sentinels = validRoleSpawns(snapshot, grid, "sentinel");
  const ghostAnchors = ghosts.map((s) => ({ x: s.x, z: s.z }));
  const sentinelAnchors = sentinels.map((s) => ({ x: s.x, z: s.z }));

  const gChoice = { A: 0, B: 0 };
  const sChoice = { A: 0, B: 0 };
  const gArrA: number[] = [];
  const gArrB: number[] = [];
  const sArrA: number[] = [];
  const sArrB: number[] = [];
  const gExp: number[] = [];
  const sExp: number[] = [];
  const gVisits = new Map<number, number>();
  const sVisits = new Map<number, number>();
  let gSuccess = 0;
  let sSuccess = 0;
  const contacts: Array<{ seconds: number; x: number; z: number }> = [];

  const n = Math.max(0, Math.floor(rollouts));
  for (let i = 0; i < n; i++) {
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

    if (ghost && ghostSpawn) {
      gSuccess += 1;
      gChoice[ghost.site] += 1;
      const seconds = ghost.meters / PLAYTEST_SPEED_METERS_PER_SECOND;
      if (ghost.site === "A") gArrA.push(seconds);
      else gArrB.push(seconds);
      gExp.push(ghost.exposure);
      recordVisits(ghost.path, grid.spawnCell(ghostSpawn)!, gVisits);
    }
    if (sentinel && sentinelSpawn) {
      sSuccess += 1;
      sChoice[sentinel.site] += 1;
      const seconds = sentinel.meters / PLAYTEST_SPEED_METERS_PER_SECOND;
      if (sentinel.site === "A") sArrA.push(seconds);
      else sArrB.push(seconds);
      sExp.push(sentinel.exposure);
      recordVisits(sentinel.path, grid.spawnCell(sentinelSpawn)!, sVisits);
    }
    if (ghost && sentinel) {
      const hit = firstContact(snapshot, ghost.path, sentinel.path);
      if (hit) contacts.push(hit);
    }
  }

  const report: ArenaPlaytestReport = {
    seed,
    rollouts: n,
    speedMetersPerSecond: PLAYTEST_SPEED_METERS_PER_SECOND,
    ghost: finishRole(gChoice, gArrA, gArrB, gExp, gVisits, gSuccess),
    sentinel: finishRole(sChoice, sArrA, sArrB, sExp, sVisits, sSuccess),
    firstContact: {
      occurrenceFraction: n === 0 ? 0 : roundMeters(contacts.length / n),
      ...(finiteMedian(contacts.map((c) => c.seconds)) !== undefined
        ? { medianSeconds: finiteMedian(contacts.map((c) => c.seconds)) }
        : {}),
      ...(hotspotOf(contacts) ? { hotspot: hotspotOf(contacts) } : {}),
    },
    limitations: [...LIMITATIONS],
  };
  return JSON.parse(JSON.stringify(report)) as ArenaPlaytestReport;
}

export function formatPlaytestReport(report: ArenaPlaytestReport): string {
  const pct = (n: number, d: number) => (d === 0 ? "n/a" : `${Math.round((n / d) * 100)}%`);
  const gN = report.ghost.siteChoice.A + report.ghost.siteChoice.B;
  const sN = report.sentinel.siteChoice.A + report.sentinel.siteChoice.B;
  const lines = [
    `Seed: ${report.seed}`,
    `Rollouts: ${report.rollouts}`,
    `Speed: ${report.speedMetersPerSecond} m/s (MOVE.WalkMaxSpeed)`,
    "",
    "Ghost site choice:",
    `A ${pct(report.ghost.siteChoice.A, gN)}`,
    `B ${pct(report.ghost.siteChoice.B, gN)}`,
    "",
    "Sentinel site choice:",
    `A ${pct(report.sentinel.siteChoice.A, sN)}`,
    `B ${pct(report.sentinel.siteChoice.B, sN)}`,
    "",
    "Median arrival (s):",
    `Ghost A ${report.ghost.medianArrivalSeconds.A ?? "-"}  B ${report.ghost.medianArrivalSeconds.B ?? "-"}`,
    `Sentinel A ${report.sentinel.medianArrivalSeconds.A ?? "-"}  B ${report.sentinel.medianArrivalSeconds.B ?? "-"}`,
    "",
    "Mean route exposure:",
    `Ghost ${report.ghost.meanRouteExposureFraction}`,
    `Sentinel ${report.sentinel.meanRouteExposureFraction}`,
    "",
    "Route concentration:",
    `Ghost ${report.ghost.routeConcentration}`,
    `Sentinel ${report.sentinel.routeConcentration}`,
    "",
    "First contact:",
    `occurred in ${Math.round(report.firstContact.occurrenceFraction * 100)}% of rollouts`,
    `median ${report.firstContact.medianSeconds ?? "-"} s`,
  ];
  if (report.firstContact.hotspot) {
    const h = report.firstContact.hotspot;
    lines.push(`hotspot x=${h.x} z=${h.z} n=${h.sampleCount}`);
  } else {
    lines.push("hotspot none");
  }
  return lines.join("\n");
}
