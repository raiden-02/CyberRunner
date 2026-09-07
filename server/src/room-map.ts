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
import { getDesignJob } from "./arena-forge/design-jobs.js";
import { parseJobCatalogId } from "./arena-forge/design-view.js";
import { consumeSavedMapLaunch } from "./arena-forge/saved-map-launches.js";
import { registerSavedRuntimeMap } from "./arena-forge/saved-runtime-maps.js";
import { savedRuntimeMapId } from "./arena-forge/saved-maps.js";

export type RoomCreateOptions = {
  gameMode?: string;
  mapId?: string;
  forgeMapId?: string;
  savedMapLaunchId?: string;
};

export type ResolvedRoomMap = {
  map: GameplayMapDefinition;
  stateMapId: string;
  allowSoloStart: boolean;
  savedMode?: GameModeId;
};

function namedSources(options: RoomCreateOptions): string[] {
  const out: string[] = [];
  if (options.savedMapLaunchId) out.push("savedMapLaunchId");
  if (options.forgeMapId) out.push("forgeMapId");
  if (options.mapId && !isArenaForgePreviewMapId(options.mapId) && !options.forgeMapId && !options.savedMapLaunchId) {
    out.push("mapId");
  } else if (options.mapId && options.forgeMapId) {
    out.push("mapId");
  } else if (options.mapId && options.savedMapLaunchId) {
    out.push("mapId");
  } else if (options.mapId && isArenaForgePreviewMapId(options.mapId) && !options.forgeMapId) {
    out.push("forgePreview");
  }
  return out;
}

export function countRoomMapSources(options: RoomCreateOptions): number {
  let n = 0;
  if (options.savedMapLaunchId) n += 1;
  if (options.forgeMapId) n += 1;
  if (options.mapId) n += 1;
  return n;
}

export function shouldAllowForgeSoloStart(options: RoomCreateOptions, envMapId?: string): boolean {
  if (options.savedMapLaunchId) return false;
  const requestedMap = options.mapId || envMapId || "";
  return Boolean(options.forgeMapId || isArenaForgePreviewMapId(requestedMap));
}

export function isForgeRoomRequest(options: RoomCreateOptions, envMapId?: string): boolean {
  return shouldAllowForgeSoloStart(options, envMapId);
}

/** Authoritative mode after map resolve. Historical Forge rooms require Search & Destroy. */
export function assertCreatedRoomMode(
  options: RoomCreateOptions,
  map: GameplayMapDefinition,
  envMapId?: string,
  resolved?: ResolvedRoomMap,
): GameModeId {
  if (options.savedMapLaunchId) {
    const savedMode = resolved?.savedMode;
    if (!savedMode) throw new Error("Saved map launch is missing its mode.");
    if (options.gameMode && options.gameMode !== savedMode) {
      throw new Error("Saved map mode does not match the selected game mode");
    }
    if (savedMode === "search_destroy") assertSearchDestroyMap(map);
    else assertDeathmatchMap(map);
    return savedMode;
  }

  const forge = isForgeRoomRequest(options, envMapId);
  if (forge) {
    const catalogId = options.forgeMapId || catalogIdFromMapId(options.mapId || envMapId || "");
    const jobRef = catalogId ? parseJobCatalogId(catalogId) : undefined;
    const job = jobRef ? getDesignJob(jobRef.jobId) : undefined;
    if (job?.path === "product") {
      if (job.mode === "deathmatch") {
        if (options.gameMode && options.gameMode !== "deathmatch") {
          throw new Error("Saved map mode does not match the selected game mode");
        }
        assertDeathmatchMap(map);
        return "deathmatch";
      }
      if (options.gameMode && options.gameMode !== "search_destroy") {
        throw new Error("Saved map mode does not match the selected game mode");
      }
      const terminals = map.uploadTerminals ?? [];
      if (terminals.some((t) => t.id === "A") && terminals.some((t) => t.id === "B")) {
        assertSearchDestroyMap(map);
      }
      return "search_destroy";
    }
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
  if (countRoomMapSources(options) > 1) {
    throw new Error("Room request names more than one map source");
  }

  if (options.savedMapLaunchId) {
    const grant = consumeSavedMapLaunch(options.savedMapLaunchId);
    if (!grant) throw new Error("Saved map launch is invalid or expired");
    const stateMapId = savedRuntimeMapId(grant.savedMapId);
    registerSavedRuntimeMap(stateMapId, grant.map);
    return {
      map: grant.map,
      stateMapId,
      allowSoloStart: false,
      savedMode: grant.mode,
    };
  }

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

export { namedSources };
