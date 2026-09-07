import { randomUUID } from "node:crypto";
import { assertExploreMap, runtimeMapId } from "@shared/world/explore-map.js";
import type { ArenaGameMode } from "@shared/world/arena-design-spec.js";
import type { GameplayMapDefinition } from "@shared/world/map-types.js";
import { exportGameplayMap } from "./export-map.js";
import { getDesignJob, getDesignJobMap } from "./design-jobs.js";
import {
  jobOwnedBy,
  loadValidatedSavedMap,
  savedRuntimeMapId,
  type SavedMapRecord,
} from "./saved-maps.js";

export const LAUNCH_GRANT_TTL_MS = 3 * 60 * 1000;

export type LaunchPurpose = "explore" | "match";

export type RuntimeMapLaunch = {
  id: string;
  map: GameplayMapDefinition;
  designedMode: ArenaGameMode;
  /** Same as designedMode. Kept for existing saved-map launch tests. */
  mode: ArenaGameMode;
  purpose: LaunchPurpose;
  expiresAt: number;
  savedMapId?: string;
  ownerUserId?: string;
};

/** Historical name. Same grant as RuntimeMapLaunch. */
export type SavedMapLaunchGrant = RuntimeMapLaunch;

const grants = new Map<string, RuntimeMapLaunch>();

export function resetSavedMapLaunches(): void {
  grants.clear();
}

export function resetRuntimeMapLaunches(): void {
  grants.clear();
}

export function issueRuntimeMapLaunch(input: {
  map: GameplayMapDefinition;
  designedMode: ArenaGameMode;
  purpose: LaunchPurpose;
  savedMapId?: string;
  ownerUserId?: string;
  now?: number;
  createId?: () => string;
}): RuntimeMapLaunch {
  const id = (input.createId ?? randomUUID)();
  const grant: RuntimeMapLaunch = {
    id,
    map: input.map,
    designedMode: input.designedMode,
    mode: input.designedMode,
    purpose: input.purpose,
    expiresAt: (input.now ?? Date.now()) + LAUNCH_GRANT_TTL_MS,
    ...(input.savedMapId ? { savedMapId: input.savedMapId } : {}),
    ...(input.ownerUserId ? { ownerUserId: input.ownerUserId } : {}),
  };
  grants.set(grant.id, grant);
  return grant;
}

export function consumeRuntimeMapLaunch(
  launchId: string,
  now = Date.now(),
): RuntimeMapLaunch | undefined {
  const grant = grants.get(launchId);
  if (!grant) return undefined;
  grants.delete(launchId);
  if (grant.expiresAt <= now) return undefined;
  return grant;
}

export function peekRuntimeMapLaunch(launchId: string): RuntimeMapLaunch | undefined {
  return grants.get(launchId);
}

export function issueSavedMapLaunch(
  record: SavedMapRecord,
  ownerUserId: string,
  now = Date.now(),
  createId: () => string = randomUUID,
): RuntimeMapLaunch {
  if (record.userId !== ownerUserId) {
    throw new Error("You do not own that map.");
  }
  const map = loadValidatedSavedMap(record);
  return issueRuntimeMapLaunch({
    map: { ...map, id: savedRuntimeMapId(record.id), name: record.name },
    designedMode: record.mode,
    purpose: "match",
    savedMapId: record.id,
    ownerUserId,
    now,
    createId,
  });
}

export function consumeSavedMapLaunch(
  launchId: string,
  now = Date.now(),
): RuntimeMapLaunch | undefined {
  return consumeRuntimeMapLaunch(launchId, now);
}

export function peekSavedMapLaunch(launchId: string): RuntimeMapLaunch | undefined {
  return peekRuntimeMapLaunch(launchId);
}

export type ExploreWhich = "original" | "generated";

export function issueExploreFromJob(args: {
  jobId: string;
  which: ExploreWhich;
  actorId: string;
  now?: number;
  createId?: () => string;
}): { ok: true; grant: RuntimeMapLaunch } | { ok: false; status: number; error: string } {
  const job = getDesignJob(args.jobId);
  if (!job) return { ok: false, status: 404, error: "That design job is gone." };
  if (!jobOwnedBy(job, args.actorId)) {
    return { ok: false, status: 403, error: "You do not own that design job." };
  }
  if (job.path !== "product" || !job.mode) {
    return { ok: false, status: 400, error: "Explore is for ArenaForge product designs." };
  }
  if (args.which === "generated" && job.status !== "completed") {
    return { ok: false, status: 409, error: "Generated map is not ready." };
  }
  const arena = getDesignJobMap(args.jobId, args.which === "original" ? "initial" : "final");
  if (!arena) return { ok: false, status: 409, error: "That map snapshot is not available." };

  const grantId = (args.createId ?? randomUUID)();
  const map = exportGameplayMap(arena, {
    id: runtimeMapId(grantId),
    name: args.which === "original" ? "Original setup" : "Generated arena",
  });
  try {
    assertExploreMap(map);
  } catch (err) {
    return { ok: false, status: 409, error: err instanceof Error ? err.message : "Map cannot be explored." };
  }

  const grant = issueRuntimeMapLaunch({
    map,
    designedMode: job.mode,
    purpose: "explore",
    ownerUserId: args.actorId,
    now: args.now,
    createId: () => grantId,
  });
  return { ok: true, grant };
}
