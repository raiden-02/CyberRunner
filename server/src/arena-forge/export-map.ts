import type { GameplayMapDefinition } from "@shared/world/map-types.js";
import { DEFAULT_BREAKABLE_HP } from "./actions.js";
import type { ArenaMap } from "./types.js";

/**
 * ArenaMap → GameplayMapDefinition. ArenaForge IDs are dropped.
 * Order of each kind list is the current solids/spawns order.
 */
export function exportGameplayMap(
  map: ArenaMap,
  runtime: { id: string; name: string },
): GameplayMapDefinition {
  const obstacles = map.solids
    .filter((s) => s.kind === "obstacle")
    .map(({ x, y, z, hx, hy, hz }) => ({ x, y, z, hx, hy, hz }));
  const occluders = map.solids
    .filter((s) => s.kind === "occluder")
    .map(({ x, y, z, hx, hy, hz }) => ({ x, y, z, hx, hy, hz }));
  const breakables = map.solids
    .filter((s) => s.kind === "breakable")
    .map(({ x, y, z, hx, hy, hz, hp }) => ({
      x, y, z, hx, hy, hz,
      hp: hp ?? DEFAULT_BREAKABLE_HP,
    }));

  return {
    id: runtime.id,
    name: runtime.name,
    boundsHalfSize: map.boundsHalfSize,
    wallHeight: map.wallHeight,
    wallThickness: map.wallThickness,
    groundThickness: map.groundThickness,
    obstacles,
    occluders,
    breakables,
    spawnProtectionZones: map.spawnProtectionZones.map(({ x, y, z, hx, hy, hz }) => ({
      x, y, z, hx, hy, hz,
    })),
    spawnPoints: map.spawns
      .filter((s) => s.role === "general")
      .map(({ x, y, z }) => ({ x, y, z })),
    ghostSpawnPoints: map.spawns
      .filter((s) => s.role === "ghost")
      .map(({ x, y, z }) => ({ x, y, z })),
    sentinelSpawnPoints: map.spawns
      .filter((s) => s.role === "sentinel")
      .map(({ x, y, z }) => ({ x, y, z })),
    uploadTerminals: map.objectives.map((o) => ({
      id: o.id,
      x: o.x,
      y: o.y,
      z: o.z,
      radius: o.radius,
    })),
    spikeSpawnLocation: map.spikeSpawnLocation
      ? {
          x: map.spikeSpawnLocation.x,
          y: map.spikeSpawnLocation.y,
          z: map.spikeSpawnLocation.z,
        }
      : undefined,
  };
}
