/**
 * SERVER-SIDE MAP REGISTRY
 * Central registry for map physics configurations.
 */
import { SHOOT_HOUSE_NEON } from "./shoot-house-neon.js";
import {
  isPointInsideBox,
  calculateSpawnFacing,
  type ServerMapDefinition,
  type BoxObstacle,
  type SpawnPoint,
  type BreakableCover,
  type VolumeBox,
} from "./map-types.js";

export type MapId = "shoot-house-neon";

// Re-export types and utilities
export type { ServerMapDefinition, BoxObstacle, SpawnPoint, BreakableCover, VolumeBox };
export { isPointInsideBox, calculateSpawnFacing };

export const MAP_REGISTRY: Record<MapId, ServerMapDefinition> = {
  "shoot-house-neon": SHOOT_HOUSE_NEON,
};

// Currently active map
let currentMapId: MapId = "shoot-house-neon";

export function setCurrentMap(mapId: MapId): void {
  if (MAP_REGISTRY[mapId]) {
    currentMapId = mapId;
  }
}

export function getCurrentMapId(): MapId {
  return currentMapId;
}

export function getCurrentMap(): ServerMapDefinition {
  return MAP_REGISTRY[currentMapId];
}

export function getMapDefinition(mapId: MapId): ServerMapDefinition | undefined {
  return MAP_REGISTRY[mapId];
}
