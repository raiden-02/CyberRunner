import * as THREE from "three";
import type { MapId } from "@shared/world/map-registry.js";
import type { GameplayMapDefinition } from "@shared/world/map-types.js";
import { getGameplayMap } from "@shared/world/map-registry.js";
import { ShootHouseNeonLevel } from "./levels/ShootHouseNeonLevel.js";
import { CoreLevel } from "./levels/CoreLevel.js";

export { resolveLevelRenderer } from "./maps/map-registry.js";

export interface LevelInstance {
  update(): void;
  destroyBreakable(id: number): void;
  dispose(): void;
}

export function createLevelFromMap(scene: THREE.Scene, map: GameplayMapDefinition): LevelInstance {
  if (map.id === "shoot-house-neon") {
    return new ShootHouseNeonLevel(scene, map);
  }
  return new CoreLevel(scene, map);
}

export function createLevel(scene: THREE.Scene, mapId: MapId): LevelInstance {
  return createLevelFromMap(scene, getGameplayMap(mapId));
}
