import { resolveMapBounds } from "./map-bounds.js";
import type { GameplayMapDefinition, SpawnPoint } from "./map-types.js";

function isFiniteBox(box: {
  x: number;
  y: number;
  z: number;
  hx: number;
  hy: number;
  hz: number;
}): boolean {
  return [box.x, box.y, box.z, box.hx, box.hy, box.hz].every((n) => Number.isFinite(n) && n === n)
    && box.hx > 0
    && box.hy > 0
    && box.hz > 0;
}

function firstSpawn(points: readonly SpawnPoint[] | undefined): SpawnPoint | undefined {
  return points && points.length > 0 ? points[0] : undefined;
}

/**
 * Explore spawn: first Ghost start, else first general spawn, else any remaining spawn.
 * Deterministic. Does not ask the designer.
 */
export function pickExploreSpawn(map: GameplayMapDefinition): SpawnPoint {
  const ghost = firstSpawn(map.ghostSpawnPoints);
  if (ghost) return ghost;
  const general = firstSpawn(map.spawnPoints);
  if (general) return general;
  const sentinel = firstSpawn(map.sentinelSpawnPoints);
  if (sentinel) return sentinel;
  throw new Error(`Map "${map.id}" has no usable spawn for Explore`);
}

/** Traversal-only. Does not require S&D sites or a finished match contract. */
export function assertExploreMap(map: GameplayMapDefinition): void {
  const bounds = resolveMapBounds(map);
  if (!Number.isFinite(bounds.halfWidth) || !Number.isFinite(bounds.halfDepth)) {
    throw new Error(`Map "${map.id}" has invalid bounds`);
  }
  if (bounds.halfWidth < 0.5 || bounds.halfDepth < 0.5) {
    throw new Error(`Map "${map.id}" envelope is too small to explore`);
  }
  pickExploreSpawn(map);
  const solids = [...map.obstacles, ...map.occluders, ...map.breakables];
  for (const solid of solids) {
    if (!isFiniteBox(solid)) {
      throw new Error(`Map "${map.id}" has invalid solid geometry`);
    }
  }
}

export function runtimeMapId(id: string): string {
  return `runtime-map:${id}`;
}

export function parseRuntimeMapId(id: string): string | undefined {
  if (!id.startsWith("runtime-map:")) return undefined;
  return id.slice("runtime-map:".length);
}

export function isDynamicRuntimeMapId(id: string): boolean {
  return id.startsWith("user-map:") || id.startsWith("runtime-map:");
}
