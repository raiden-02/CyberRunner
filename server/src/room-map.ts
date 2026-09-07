import { ARENA_FORGE_PREVIEW_MAP_ID } from "@shared/world/arena-forge-preview.js";
import { assertExploreMap } from "@shared/world/explore-map.js";
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
import { consumeRuntimeMapLaunch } from "./arena-forge/saved-map-launches.js";
import { registerSavedRuntimeMap } from "./arena-forge/saved-runtime-maps.js";
import { savedRuntimeMapId } from "./arena-forge/saved-maps.js";

export type RoomCreateOptions = {
  gameMode?: string;
  mapId?: string;
  forgeMapId?: string;
  savedMapLaunchId?: string;
  mapLaunchId?: string;
};

export type LaunchPurpose = "match" | "explore";

export type ResolvedRoomMap = {
  map: GameplayMapDefinition;
  stateMapId: string;
  allowSoloStart: boolean;
  savedMode?: GameModeId;
  purpose: LaunchPurpose;
  designedMode?: "deathmatch" | "search_destroy";
};

export type ResolvedRuntimeMap = {
  map: GameplayMapDefinition;
  mode: GameModeId;
  purpose: LaunchPurpose;
  designedMode?: "deathmatch" | "search_destroy";
};

function namedLaunchId(options: RoomCreateOptions): string | undefined {
  if (options.mapLaunchId && options.savedMapLaunchId && options.mapLaunchId !== options.savedMapLaunchId) {
    throw new Error("Room request names more than one map source");
  }
  return options.mapLaunchId || options.savedMapLaunchId;
}

function namedSources(options: RoomCreateOptions): string[] {
  const out: string[] = [];
  if (namedLaunchId(options)) out.push("mapLaunchId");
  if (options.forgeMapId) out.push("forgeMapId");
  if (options.mapId && !isArenaForgePreviewMapId(options.mapId) && !options.forgeMapId && !namedLaunchId(options)) {
    out.push("mapId");
  } else if (options.mapId && options.forgeMapId) {
    out.push("mapId");
  } else if (options.mapId && namedLaunchId(options)) {
    out.push("mapId");
  } else if (options.mapId && isArenaForgePreviewMapId(options.mapId) && !options.forgeMapId) {
    out.push("forgePreview");
  }
  return out;
}

export function countRoomMapSources(options: RoomCreateOptions): number {
  let n = 0;
  if (namedLaunchId(options)) n += 1;
  if (options.forgeMapId) n += 1;
  if (options.mapId) n += 1;
  return n;
}

export function shouldAllowForgeSoloStart(options: RoomCreateOptions, envMapId?: string): boolean {
  if (namedLaunchId(options)) return false;
  const requestedMap = options.mapId || envMapId || "";
  return Boolean(options.forgeMapId || isArenaForgePreviewMapId(requestedMap));
}

export function isForgeRoomRequest(options: RoomCreateOptions, envMapId?: string): boolean {
  return shouldAllowForgeSoloStart(options, envMapId);
}

function asDesignedMode(mode: string): "deathmatch" | "search_destroy" | undefined {
  if (mode === "deathmatch" || mode === "search_destroy") return mode;
  return undefined;
}

/** Authoritative mode after map resolve. Historical Forge rooms require Search & Destroy. */
export function assertCreatedRoomMode(
  options: RoomCreateOptions,
  map: GameplayMapDefinition,
  envMapId?: string,
  resolved?: ResolvedRoomMap,
): GameModeId {
  if (namedLaunchId(options) || resolved?.purpose === "explore" || resolved?.savedMode === "explore") {
    if (resolved?.purpose === "explore") {
      assertExploreMap(map);
      return "explore";
    }
    const savedMode = resolved?.designedMode ?? asDesignedMode(resolved?.savedMode ?? "");
    if (!savedMode) throw new Error("Saved map launch is missing its mode.");
    if (options.gameMode && options.gameMode !== savedMode && options.gameMode !== "explore") {
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
  if (gameMode === "explore") {
    throw new Error("Explore requires a runtime map launch");
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

  const launchId = namedLaunchId(options);
  if (launchId) {
    const grant = consumeRuntimeMapLaunch(launchId);
    if (!grant) throw new Error("Saved map launch is invalid or expired");
    const stateMapId = grant.map.id;
    registerSavedRuntimeMap(stateMapId, grant.map);
    if (grant.purpose === "explore") {
      return {
        map: grant.map,
        stateMapId,
        allowSoloStart: false,
        purpose: "explore",
        designedMode: grant.designedMode,
        savedMode: "explore",
      };
    }
    return {
      map: grant.map,
      stateMapId: grant.savedMapId ? savedRuntimeMapId(grant.savedMapId) : stateMapId,
      allowSoloStart: false,
      savedMode: grant.designedMode,
      purpose: "match",
      designedMode: grant.designedMode,
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
      purpose: "match",
    };
  }

  const mapId = resolveRoomMapId(options.mapId, envMapId);
  const map = getGameplayMap(mapId);
  return { map, stateMapId: map.id, allowSoloStart: false, purpose: "match" };
}

export function toResolvedRuntimeMap(
  resolved: ResolvedRoomMap,
  mode: GameModeId,
): ResolvedRuntimeMap {
  return {
    map: resolved.map,
    mode,
    purpose: resolved.purpose,
    designedMode: resolved.designedMode,
  };
}

export function assertRoomMode(map: GameplayMapDefinition, gameMode?: string): void {
  if (gameMode === "explore") {
    assertExploreMap(map);
    return;
  }
  if (gameMode === "search_destroy") {
    assertSearchDestroyMap(map);
  } else {
    assertDeathmatchMap(map);
  }
}

export { namedSources };
