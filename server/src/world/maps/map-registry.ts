export type { MapId } from "@shared/world/map-registry.js";
export {
  getDefaultMapId,
  getGameplayMap,
  isRegisteredMapId,
  getRegisteredMapIds,
  getPublicMaps,
  getPublicMapIds,
  isPublicMapId,
  getPublicMap,
  assertDeathmatchMap,
  assertSearchDestroyMap,
  resolveRoomMapId,
} from "@shared/world/map-registry.js";
export type { PublicMapInfo, PublicGameMode } from "@shared/world/map-registry.js";

export type {
  BoxObstacle,
  SpawnPoint,
  BreakableCover,
  VolumeBox,
  UploadTerminal,
  GameplayMapDefinition,
} from "@shared/world/map-types.js";

export { isPointInsideBox, calculateSpawnFacing } from "@shared/world/map-types.js";
