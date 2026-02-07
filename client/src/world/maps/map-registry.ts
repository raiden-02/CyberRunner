/**
 * MAP REGISTRY
 * Central registry for all available maps.
 */
import { SHOOT_HOUSE_NEON } from "./shoot-house-neon.js";
import type { MapDefinition, ShootHouseMapDefinition } from "./map-types.js";

export type MapId = "shoot-house-neon";

export interface MapRegistryEntry {
  id: MapId;
  displayName: string;
  description: string;
  playerCount: string;
  isDefault: boolean;
  definition: MapDefinition | ShootHouseMapDefinition;
  skyboxPath: string;
}

export const MAP_REGISTRY: Record<MapId, MapRegistryEntry> = {
  "shoot-house-neon": {
    id: "shoot-house-neon",
    displayName: "Shoot House Neon",
    description: "Compact three-lane arena inspired by Shoot House with cyberpunk pub district aesthetic",
    playerCount: "4-8",
    isDefault: true,
    definition: SHOOT_HOUSE_NEON,
    skyboxPath: "/skybox/cyberpunk",
  },
};

/**
 * Get the default map ID
 */
export function getDefaultMapId(): MapId {
  const defaultEntry = Object.values(MAP_REGISTRY).find(entry => entry.isDefault);
  return defaultEntry?.id ?? "shoot-house-neon";
}

/**
 * Get a map registry entry by ID
 */
export function getMapEntry(mapId: MapId): MapRegistryEntry | undefined {
  return MAP_REGISTRY[mapId];
}

/**
 * Get map definition by ID
 */
export function getMapDefinition(mapId: MapId): MapDefinition | undefined {
  return MAP_REGISTRY[mapId]?.definition;
}

/**
 * Get all available map IDs
 */
export function getAllMapIds(): MapId[] {
  return Object.keys(MAP_REGISTRY) as MapId[];
}

/**
 * Check if a map ID is the Shoot House Neon map
 */
export function isShootHouseNeonMap(mapId: MapId): boolean {
  return mapId === "shoot-house-neon";
}
