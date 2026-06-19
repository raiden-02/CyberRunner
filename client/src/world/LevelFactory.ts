import * as THREE from "three";
import type { MapId } from "@shared/world/map-registry.js";
import { getGameplayMap } from "@shared/world/map-registry.js";
import { ShootHouseNeonLevel } from "./levels/ShootHouseNeonLevel.js";
import { CoreLevel } from "./levels/CoreLevel.js";

export { resolveLevelRenderer } from "./maps/map-registry.js";

export interface LevelInstance {
  update(): void;
  destroyBreakable(id: number): void;
  dispose(): void;
}

export function createLevel(scene: THREE.Scene, mapId: MapId): LevelInstance {
  const map = getGameplayMap(mapId);
  if (mapId === "shoot-house-neon") {
    return new ShootHouseNeonLevel(scene, map);
  }
  return new CoreLevel(scene, map);
}
