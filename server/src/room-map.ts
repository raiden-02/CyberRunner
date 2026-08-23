import { ARENA_FORGE_PREVIEW_MAP_ID } from "@shared/world/arena-forge-preview.js";
import {
  assertDeathmatchMap,
  assertSearchDestroyMap,
  getGameplayMap,
  resolveRoomMapId,
} from "@shared/world/map-registry.js";
import type { GameplayMapDefinition } from "@shared/world/map-types.js";
import type { GameModeId } from "./game-modes/game-mode-config.js";
import { catalogIdFromMapId, isArenaForgePreviewMapId, loadForgeMap } from "./arena-forge/preview.js";

export type RoomCreateOptions = {
  gameMode?: string;
  mapId?: string;
  forgeMapId?: string;
};

export type ResolvedRoomMap = {
  map: GameplayMapDefinition;
  stateMapId: string;
  allowSoloStart: boolean;
};

export function shouldAllowForgeSoloStart(options: RoomCreateOptions, envMapId?: string): boolean {
  const requestedMap = options.mapId || envMapId || "";
  return Boolean(options.forgeMapId || isArenaForgePreviewMapId(requestedMap));
}

export function isForgeRoomRequest(options: RoomCreateOptions, envMapId?: string): boolean {
  return shouldAllowForgeSoloStart(options, envMapId);
}

/** Authoritative mode after map resolve. Forge rooms require Search & Destroy. */
export function assertCreatedRoomMode(
  options: RoomCreateOptions,
  map: GameplayMapDefinition,
  envMapId?: string,
): GameModeId {
  const forge = isForgeRoomRequest(options, envMapId);
  if (forge) {
    if (options.gameMode !== "search_destroy") {
      throw new Error("ArenaForge maps can only run Search & Destroy");
    }
    assertSearchDestroyMap(map);
    return "search_destroy";
  }

  const gameMode = options.gameMode || "deathmatch";
  if (gameMode === "search_destroy") {
    assertSearchDestroyMap(map);
    return "search_destroy";
  }
  if (gameMode !== "deathmatch") {
    throw new Error(`Unsupported game mode "${gameMode}"`);
  }
  assertDeathmatchMap(map);
  return "deathmatch";
}

/** Authoritative map for a new room. Same rules GameRoom.onCreate uses. */
export function resolveCreatedRoomMap(
  options: RoomCreateOptions,
  envMapId?: string,
): ResolvedRoomMap {
  const requestedMap = options.mapId || envMapId || "";
  if (options.forgeMapId || isArenaForgePreviewMapId(requestedMap)) {
    const catalogId = options.forgeMapId || catalogIdFromMapId(requestedMap);
    const map = loadForgeMap(catalogId);
    return {
      map,
      stateMapId: catalogId
        ? `${ARENA_FORGE_PREVIEW_MAP_ID}::${catalogId}`
        : ARENA_FORGE_PREVIEW_MAP_ID,
      allowSoloStart: true,
    };
  }

  const mapId = resolveRoomMapId(options.mapId, envMapId);
  const map = getGameplayMap(mapId);
  return { map, stateMapId: map.id, allowSoloStart: false };
}

export function assertRoomMode(map: GameplayMapDefinition, gameMode?: string): void {
  if (gameMode === "search_destroy") {
    assertSearchDestroyMap(map);
  } else {
    assertDeathmatchMap(map);
  }
}
