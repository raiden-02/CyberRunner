import type { GameplayMapDefinition } from "./map-types.js";
import { SHOOT_HOUSE_NEON } from "./maps/shoot-house-neon.js";
import { MAP_CONTRACT_SMOKE } from "./maps/map-contract-smoke.js";

export type MapId = "shoot-house-neon" | "map-contract-smoke";

const GAMEPLAY_MAPS: Record<MapId, GameplayMapDefinition> = {
  "shoot-house-neon": SHOOT_HOUSE_NEON,
  "map-contract-smoke": MAP_CONTRACT_SMOKE,
};

export function getDefaultMapId(): MapId {
  return "shoot-house-neon";
}

export function isRegisteredMapId(id: string): id is MapId {
  return Object.prototype.hasOwnProperty.call(GAMEPLAY_MAPS, id);
}

export function getGameplayMap(mapId: string): GameplayMapDefinition {
  if (!isRegisteredMapId(mapId)) {
    throw new Error(
      `Unknown map id "${mapId}". Known maps: ${Object.keys(GAMEPLAY_MAPS).join(", ")}`,
    );
  }
  return GAMEPLAY_MAPS[mapId];
}

export function getRegisteredMapIds(): MapId[] {
  return Object.keys(GAMEPLAY_MAPS) as MapId[];
}

export function assertDeathmatchMap(map: GameplayMapDefinition): void {
  if (map.spawnPoints.length === 0) {
    throw new Error(`Map "${map.id}" has no spawnPoints`);
  }
}

export function assertSearchDestroyMap(map: GameplayMapDefinition): void {
  const terminals = map.uploadTerminals ?? [];
  const hasA = terminals.some((t) => t.id === "A");
  const hasB = terminals.some((t) => t.id === "B");
  if (!hasA || !hasB) {
    throw new Error(`Map "${map.id}" cannot run Search & Destroy: need upload terminals A and B`);
  }
  if (!map.ghostSpawnPoints || map.ghostSpawnPoints.length === 0) {
    throw new Error(`Map "${map.id}" cannot run Search & Destroy: need ghostSpawnPoints`);
  }
  if (!map.sentinelSpawnPoints || map.sentinelSpawnPoints.length === 0) {
    throw new Error(`Map "${map.id}" cannot run Search & Destroy: need sentinelSpawnPoints`);
  }
  if (!map.spikeSpawnLocation) {
    throw new Error(`Map "${map.id}" cannot run Search & Destroy: need spikeSpawnLocation`);
  }
}

/** Room-local map pick. Not process-global state. */
export function resolveRoomMapId(optionsMapId?: string, envMapId?: string): MapId {
  const raw = optionsMapId || envMapId || getDefaultMapId();
  if (!isRegisteredMapId(raw)) {
    throw new Error(
      `Unknown map id "${raw}". Known maps: ${getRegisteredMapIds().join(", ")}`,
    );
  }
  return raw;
}
