import { randomUUID } from "node:crypto";
import type { ArenaGameMode } from "@shared/world/arena-design-spec.js";
import type { GameplayMapDefinition } from "@shared/world/map-types.js";
import {
  loadValidatedSavedMap,
  savedRuntimeMapId,
  type SavedMapRecord,
} from "./saved-maps.js";

export const LAUNCH_GRANT_TTL_MS = 3 * 60 * 1000;

export type SavedMapLaunchGrant = {
  id: string;
  ownerUserId: string;
  savedMapId: string;
  mode: ArenaGameMode;
  map: GameplayMapDefinition;
  expiresAt: number;
};

const grants = new Map<string, SavedMapLaunchGrant>();

export function resetSavedMapLaunches(): void {
  grants.clear();
}

export function issueSavedMapLaunch(
  record: SavedMapRecord,
  ownerUserId: string,
  now = Date.now(),
  createId: () => string = randomUUID,
): SavedMapLaunchGrant {
  if (record.userId !== ownerUserId) {
    throw new Error("You do not own that map.");
  }
  const map = loadValidatedSavedMap(record);
  const grant: SavedMapLaunchGrant = {
    id: createId(),
    ownerUserId,
    savedMapId: record.id,
    mode: record.mode,
    map: { ...map, id: savedRuntimeMapId(record.id), name: record.name },
    expiresAt: now + LAUNCH_GRANT_TTL_MS,
  };
  grants.set(grant.id, grant);
  return grant;
}

export function consumeSavedMapLaunch(
  launchId: string,
  now = Date.now(),
): SavedMapLaunchGrant | undefined {
  const grant = grants.get(launchId);
  if (!grant) return undefined;
  grants.delete(launchId);
  if (grant.expiresAt <= now) return undefined;
  return grant;
}

export function peekSavedMapLaunch(launchId: string): SavedMapLaunchGrant | undefined {
  return grants.get(launchId);
}
