/**
 * LEVEL FACTORY
 * Creates the appropriate Level class based on map ID.
 */
import * as THREE from "three";
import type { MapId } from "./maps/map-registry.js";
import { isShootHouseNeonMap } from "./maps/map-registry.js";
import { ShootHouseNeonLevel } from "./levels/ShootHouseNeonLevel.js";

/**
 * Level instance interface.
 * All levels implement these methods.
 */
export interface LevelInstance {
  update(): void;
  destroyBreakable(id: number): void;
  dispose(): void;
}

/**
 * Create a level instance for the specified map.
 */
export function createLevel(scene: THREE.Scene, mapId: MapId): LevelInstance {
  if (isShootHouseNeonMap(mapId)) {
    return new ShootHouseNeonLevel(scene);
  }

  // Default to Shoot House Neon (only map available)
  return new ShootHouseNeonLevel(scene);
}
