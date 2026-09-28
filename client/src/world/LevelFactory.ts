import * as THREE from "three";
import type { GameplayMapDefinition } from "@shared/world/map-types.js";
import { ShootHouseNeonLevel } from "./levels/ShootHouseNeonLevel.js";
import { CoreLevel } from "./levels/CoreLevel.js";
import { isShootHouseNeonMap } from "./maps/map-registry.js";

export interface LevelInstance {
  update(): void;
  destroyBreakable(id: number): void;
  dispose(): void;
}

export function createLevelFromMap(scene: THREE.Scene, map: GameplayMapDefinition): LevelInstance {
  if (isShootHouseNeonMap(map.id)) {
    return new ShootHouseNeonLevel(scene, map);
  }
  return new CoreLevel(scene, map);
}
