import {
  circleInsideBounds,
  circleOverlapsAabb,
  isFiniteNumber,
  pointInsideBounds,
  roundMeters,
  solidBoundOverhangs,
} from "./geometry.js";
import { importGameplayMap } from "./import-map.js";
import { losPair } from "./los.js";
import { NavGrid } from "./navigation.js";
import { CAPSULE } from "@shared/physics/constants.js";
import type { GameplayMapDefinition } from "@shared/world/map-types.js";
import {
  EYE_HEIGHT,
  GRID_CELL_METERS,
  PLAYER_RADIUS,
  objectiveId,
  type AnchorComponent,
  type ArenaEvaluation,
  type ArenaEvaluationMode,
  type ArenaMap,
  type ArenaObjective,
  type ArenaSpawn,
  type DistanceAggregate,
  type HardIssue,
  type ObjectiveCheck,
  type PathPair,
  type SpawnCheck,
  type SpawnRole,
} from "./types.js";

const SPAWN_CAPSULE_HALF = CAPSULE.HalfHeight + CAPSULE.Radius;

const NAV_LIMITATION =
  "Standing ground traversal only. No jump, crouch-only routes, slide, or breakable destruction.";

function median(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  if (s.length % 2 === 1) return s[mid];
  return roundMeters((s[mid - 1] + s[mid]) / 2);
}

function finitePoint(x: number, y: number, z: number): boolean {
  return isFiniteNumber(x) && isFiniteNumber(y) && isFiniteNumber(z);
}

function boundsAreUsable(boundsHalfSize: number): boolean {
  return isFiniteNumber(boundsHalfSize) && boundsHalfSize > 0;
}

function checkGeometry(map: ArenaMap): HardIssue[] {
  const issues: HardIssue[] = [];
  const usableBounds = boundsAreUsable(map.boundsHalfSize);
  if (!usableBounds) {
    const reason = Number.isNaN(map.boundsHalfSize)
      ? "nan"
      : !Number.isFinite(map.boundsHalfSize)
        ? "infinite"
        : "non-positive";
    issues.push({
      code: "invalid-bounds",
      reason,
      boundsHalfSize: Number.isFinite(map.boundsHalfSize) ? map.boundsHalfSize : undefined,
    });
  }

  for (const solid of map.solids) {
    if (!finitePoint(solid.x, solid.y, solid.z) ||
      !isFiniteNumber(solid.hx) || !isFiniteNumber(solid.hy) || !isFiniteNumber(solid.hz)) {
      issues.push({ code: "non-finite-solid", id: solid.id });
      continue;
    }
    if (solid.hx <= 0 || solid.hy <= 0 || solid.hz <= 0) {
      issues.push({
        code: "non-positive-extent",
        id: solid.id,
        hx: solid.hx,
        hy: solid.hy,
        hz: solid.hz,
      });
    }
    if (usableBounds) {
      for (const o of solidBoundOverhangs(solid, map.boundsHalfSize)) {
        issues.push({
          code: "solid-out-of-bounds",
          id: solid.id,
          side: o.side,
          overhangMeters: o.overhangMeters,
        });
      }
    }
  }
  return issues;
}

function checkMode(map: ArenaMap, mode: ArenaEvaluationMode): HardIssue[] {
  const issues: HardIssue[] = [];
  if (mode === "deathmatch") {
    if (!map.spawns.some((s) => s.role === "general")) {
      issues.push({ code: "missing-spawn" });
    }
    return issues;
  }

  const a = map.objectives.filter((o) => o.id === "A").length;
  const b = map.objectives.filter((o) => o.id === "B").length;
  if (a === 0) issues.push({ code: "missing-objective-A" });
  if (a > 1) issues.push({ code: "duplicate-objective-A" });
  if (b === 0) issues.push({ code: "missing-objective-B" });
  if (b > 1) issues.push({ code: "duplicate-objective-B" });
  if (!map.spawns.some((s) => s.role === "ghost")) issues.push({ code: "missing-ghost-spawn" });
  if (!map.spawns.some((s) => s.role === "sentinel")) issues.push({ code: "missing-sentinel-spawn" });
  if (!map.spikeSpawnLocation) issues.push({ code: "missing-spike-spawn" });
  return issues;
}

function checkSpawn(map: ArenaMap, spawn: ArenaSpawn, usableBounds: boolean): SpawnCheck {
  const issues: HardIssue[] = [];
  if (!finitePoint(spawn.x, spawn.y, spawn.z)) {
    issues.push({ code: "non-finite-spawn", id: spawn.id });
    return { id: spawn.id, role: spawn.role, valid: false, issues };
  }
  if (usableBounds && !circleInsideBounds(spawn.x, spawn.z, PLAYER_RADIUS, map.boundsHalfSize)) {
    issues.push({
      code: "spawn-out-of-bounds",
      id: spawn.id,
      x: spawn.x,
      z: spawn.z,
      radius: PLAYER_RADIUS,
    });
  }
  const capBottom = spawn.y - SPAWN_CAPSULE_HALF;
  const capTop = spawn.y + SPAWN_CAPSULE_HALF;
  let blockedBy: string | undefined;
  for (const solid of map.solids) {
    if (!circleOverlapsAabb(spawn.x, spawn.z, PLAYER_RADIUS, solid)) continue;
    const top = solid.y + solid.hy;
    const bottom = solid.y - solid.hy;
    if (top > capBottom && bottom < capTop) {
      issues.push({ code: "spawn-blocked", id: spawn.id, blockedBy: solid.id });
      blockedBy = solid.id;
      break;
    }
  }
  return {
    id: spawn.id,
    role: spawn.role,
    valid: issues.length === 0,
    issues,
    blockedBy,
  };
}

function checkObjective(map: ArenaMap, obj: ArenaObjective, grid: NavGrid | null, usableBounds: boolean): ObjectiveCheck {
  const id = objectiveId(obj.id);
  const issues: HardIssue[] = [];
  if (!finitePoint(obj.x, obj.y, obj.z) || !isFiniteNumber(obj.radius)) {
    issues.push({ code: "non-finite-objective", id });
    return { id, letter: obj.id, valid: false, issues, navigableCellCount: 0 };
  }
  if (obj.radius <= 0) {
    issues.push({ code: "non-positive-radius", id, radius: obj.radius });
  }
  if (usableBounds && !pointInsideBounds(obj.x, obj.z, map.boundsHalfSize)) {
    issues.push({ code: "objective-center-out-of-bounds", id, x: obj.x, z: obj.z });
  }
  const cells = grid ? grid.objectiveCells(obj) : [];
  if (grid && cells.length === 0) {
    issues.push({ code: "objective-no-navigable-cell", id, radius: obj.radius });
  }
  return {
    id,
    letter: obj.id,
    valid: issues.length === 0,
    issues,
    navigableCellCount: cells.length,
  };
}

function pathPairs(map: ArenaMap, grid: NavGrid, spawnChecks: SpawnCheck[]): PathPair[] {
  const ghosts = map.spawns.filter((s) => s.role === "ghost");
  const sentinels = map.spawns.filter((s) => s.role === "sentinel");
  if (ghosts.length === 0 || sentinels.length === 0 || map.objectives.length === 0) {
    return [];
  }

  const valid = new Set(spawnChecks.filter((s) => s.valid).map((s) => s.id));
  const pairs: PathPair[] = [];

  for (const spawn of [...ghosts, ...sentinels]) {
    for (const obj of map.objectives) {
      const to = objectiveId(obj.id);
      if (!valid.has(spawn.id)) {
        pairs.push({ from: spawn.id, to, reachable: false });
        continue;
      }
      const fromIdx = grid.spawnCell(spawn);
      const goals = grid.objectiveCells(obj);
      if (fromIdx === null || goals.length === 0) {
        pairs.push({ from: spawn.id, to, reachable: false });
        continue;
      }
      const meters = grid.pathMeters(fromIdx, goals);
      if (meters === null) {
        pairs.push({ from: spawn.id, to, reachable: false });
      } else {
        pairs.push({ from: spawn.id, to, reachable: true, distanceMeters: roundMeters(meters) });
      }
    }
  }
  return pairs;
}

function aggregates(pairs: PathPair[], map: ArenaMap): DistanceAggregate[] {
  const roles: SpawnRole[] = ["ghost", "sentinel"];
  const out: DistanceAggregate[] = [];
  for (const role of roles) {
    for (const obj of map.objectives) {
      const to = objectiveId(obj.id);
      const prefix = role === "ghost" ? "ghost-spawn-" : "sentinel-spawn-";
      const dists = pairs
        .filter((p) => p.from.startsWith(prefix) && p.to === to && p.reachable && p.distanceMeters !== undefined)
        .map((p) => p.distanceMeters!);
      out.push({
        fromRole: role,
        to,
        sampleCount: dists.length,
        minMeters: dists.length ? roundMeters(Math.min(...dists)) : undefined,
        medianMeters: median(dists),
      });
    }
  }
  return out;
}

function emptyNavigation(limitation: string): ArenaEvaluation["navigation"] {
  return {
    cellMeters: GRID_CELL_METERS,
    neighbors: "4",
    limitation,
    walkableCells: 0,
    totalCells: 0,
    components: { count: 0, largestCells: 0, largestFraction: 0 },
    anchors: [],
    paths: [],
    aggregates: [],
  };
}

function anchors(map: ArenaMap, grid: NavGrid, spawnChecks: SpawnCheck[]): AnchorComponent[] {
  const list: AnchorComponent[] = [];
  for (const spawn of map.spawns) {
    const check = spawnChecks.find((s) => s.id === spawn.id);
    if (check && !check.valid) {
      list.push({ id: spawn.id, componentId: null });
      continue;
    }
    list.push({ id: spawn.id, componentId: grid.componentAt(spawn.x, spawn.z) });
  }
  for (const obj of map.objectives) {
    const cells = grid.objectiveCells(obj);
    if (cells.length === 0) {
      list.push({ id: objectiveId(obj.id), componentId: null });
      continue;
    }
    list.push({ id: objectiveId(obj.id), componentId: grid.component[cells[0]] });
  }
  if (map.spikeSpawnLocation) {
    list.push({
      id: map.spikeSpawnLocation.id,
      componentId: grid.componentAt(map.spikeSpawnLocation.x, map.spikeSpawnLocation.z),
    });
  }
  return list;
}

function losPairs(
  map: ArenaMap,
  spawnChecks: SpawnCheck[],
  objectiveChecks: ObjectiveCheck[],
): ReturnType<typeof losPair>[] {
  const validSpawn = new Set(spawnChecks.filter((s) => s.valid).map((s) => s.id));
  const validObj = new Set(objectiveChecks.filter((o) => o.valid).map((o) => o.id));
  const ghosts = map.spawns.filter((s) => s.role === "ghost" && validSpawn.has(s.id));
  const sentinels = map.spawns.filter((s) => s.role === "sentinel" && validSpawn.has(s.id));
  const pairs: ReturnType<typeof losPair>[] = [];

  for (const g of ghosts) {
    for (const s of sentinels) {
      pairs.push(losPair(map, g.id, g, s.id, s));
    }
  }
  for (const spawn of [...ghosts, ...sentinels]) {
    for (const obj of map.objectives) {
      const to = objectiveId(obj.id);
      if (!validObj.has(to)) continue;
      pairs.push(losPair(map, spawn.id, spawn, to, obj));
    }
  }
  return pairs;
}

function unreachableHardFailures(
  pairs: PathPair[],
  spawnChecks: SpawnCheck[],
  objectiveChecks: ObjectiveCheck[],
): HardIssue[] {
  const validSpawn = new Set(spawnChecks.filter((s) => s.valid).map((s) => s.id));
  const validObj = new Set(objectiveChecks.filter((o) => o.valid).map((o) => o.id));
  const issues: HardIssue[] = [];
  for (const p of pairs) {
    if (p.reachable) continue;
    if (!validSpawn.has(p.from) || !validObj.has(p.to)) continue;
    issues.push({ code: "unreachable-pair", from: p.from, to: p.to });
  }
  return issues;
}

export function evaluateArena(
  map: ArenaMap,
  mode: ArenaEvaluationMode = "search_destroy",
): ArenaEvaluation {
  const geometryIssues = checkGeometry(map);
  const modeIssues = checkMode(map, mode);
  const usableBounds = boundsAreUsable(map.boundsHalfSize);
  const spawnResults = map.spawns.map((s) => checkSpawn(map, s, usableBounds));

  const grid = usableBounds ? new NavGrid(map) : null;
  const objectiveResults = map.objectives.map((o) => checkObjective(map, o, grid, usableBounds));
  const paths = grid ? pathPairs(map, grid, spawnResults) : [];

  const navigation = grid
    ? (() => {
      const largest = grid.largestComponent();
      const largestFraction = grid.walkableCount === 0
        ? 0
        : roundMeters(largest.cells / grid.walkableCount);
      return {
        cellMeters: GRID_CELL_METERS,
        neighbors: "4" as const,
        limitation: NAV_LIMITATION,
        walkableCells: grid.walkableCount,
        totalCells: grid.totalCells,
        components: {
          count: grid.componentCount,
          largestCells: largest.cells,
          largestFraction,
        },
        anchors: anchors(map, grid, spawnResults),
        paths,
        aggregates: aggregates(paths, map),
      };
    })()
    : emptyNavigation("Navigation skipped: arena boundsHalfSize is not a finite positive size.");

  const hardFailures: HardIssue[] = [
    ...geometryIssues,
    ...modeIssues,
    ...spawnResults.flatMap((s) => s.issues),
    ...objectiveResults.flatMap((o) => o.issues),
    ...unreachableHardFailures(paths, spawnResults, objectiveResults),
  ];

  return {
    sourceMapId: map.sourceMapId,
    mode,
    geometry: { issues: geometryIssues },
    spawns: { results: spawnResults },
    objectives: { results: objectiveResults },
    navigation,
    lineOfSight: {
      eyeHeight: EYE_HEIGHT,
      pairs: losPairs(map, spawnResults, objectiveResults),
    },
    summary: {
      hardFailureCount: hardFailures.length,
      hardFailures,
    },
  };
}

export function evaluateGameplayMap(
  def: GameplayMapDefinition,
  mode: ArenaEvaluationMode = "search_destroy",
): ArenaEvaluation {
  return evaluateArena(importGameplayMap(def), mode);
}
