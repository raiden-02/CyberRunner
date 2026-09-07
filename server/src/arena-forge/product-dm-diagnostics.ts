import { NavGrid } from "./navigation.js";
import { roundMeters } from "./geometry.js";
import type { ArenaMap } from "./types.js";

export type DeathmatchPairDiagnostics = {
  reachablePairs: number;
  unreachablePairs: number;
  totalPairs: number;
  minDistance?: number;
  medianDistance?: number;
  maxDistance?: number;
};

function median(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return roundMeters(sorted[mid]!);
  return roundMeters((sorted[mid - 1]! + sorted[mid]!) / 2);
}

/** Unique general-spawn pairs. Product-only. Does not change the frozen P4 evaluator. */
export function deathmatchAllPairs(map: ArenaMap): DeathmatchPairDiagnostics {
  const generals = map.spawns.filter((s) => s.role === "general");
  const totalPairs = (generals.length * (generals.length - 1)) / 2;
  if (generals.length < 2) {
    return { reachablePairs: 0, unreachablePairs: 0, totalPairs };
  }

  const grid = new NavGrid(map);
  const distances: number[] = [];
  let unreachable = 0;

  for (let i = 0; i < generals.length; i++) {
    for (let j = i + 1; j < generals.length; j++) {
      const a = grid.spawnCell(generals[i]!);
      const b = grid.spawnCell(generals[j]!);
      if (a === null || b === null) {
        unreachable += 1;
        continue;
      }
      const meters = grid.pathMeters(a, [b]);
      if (meters === null) unreachable += 1;
      else distances.push(meters);
    }
  }

  return {
    reachablePairs: distances.length,
    unreachablePairs: unreachable,
    totalPairs,
    minDistance: distances.length ? roundMeters(Math.min(...distances)) : undefined,
    medianDistance: median(distances),
    maxDistance: distances.length ? roundMeters(Math.max(...distances)) : undefined,
  };
}
