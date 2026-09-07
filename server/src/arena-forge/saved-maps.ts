import { randomUUID } from "node:crypto";
import type { PublicDesignPlan } from "./design-view.js";
import type { ArenaGameMode } from "@shared/world/arena-design-spec.js";
import { resolveMapBounds, isUsableBounds } from "@shared/world/map-bounds.js";
import type { GameplayMapDefinition } from "@shared/world/map-types.js";
import { assertDeathmatchMap, assertSearchDestroyMap } from "@shared/world/map-registry.js";
import { evaluateGameplayMap } from "./evaluator.js";
import { isDatabaseEnabled, query } from "../db/pool.js";
import { getDesignJob, type DesignJobRecord } from "./design-jobs.js";
import { guestMapOwnerId } from "./guest-map-session.js";
import { exportGameplayMap } from "./export-map.js";
import { productCompletionIssues } from "./product-tools.js";

export const SAVED_MAP_FORMAT_VERSION = 1;
export const MAX_SAVED_MAPS_PER_USER = 20;
export const SAVED_MAP_NAME_MIN = 2;
export const SAVED_MAP_NAME_MAX = 40;

export type SavedMapMeta = {
  id: string;
  name: string;
  mode: ArenaGameMode;
  createdAt: string;
  updatedAt: string;
  sessionOnly?: boolean;
};

export type SavedMapRecord = SavedMapMeta & {
  userId: string;
  brief: string;
  designPlan: PublicDesignPlan;
  mapDefinition: GameplayMapDefinition;
  mapFormatVersion: number;
  sourceJobId?: string;
  provider?: string;
  model?: string;
};

export type SavedMapStore = {
  list(userId: string): Promise<SavedMapMeta[]>;
  get(id: string): Promise<SavedMapRecord | undefined>;
  findBySourceJob(userId: string, jobId: string): Promise<SavedMapRecord | undefined>;
  count(userId: string): Promise<number>;
  insert(record: SavedMapRecord): Promise<void>;
  updateName(id: string, userId: string, name: string): Promise<boolean>;
  delete(id: string, userId: string): Promise<boolean>;
};

export class MemorySavedMapStore implements SavedMapStore {
  private readonly rows = new Map<string, SavedMapRecord>();

  async list(userId: string): Promise<SavedMapMeta[]> {
    return [...this.rows.values()]
      .filter((r) => r.userId === userId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map(toMeta);
  }

  async get(id: string): Promise<SavedMapRecord | undefined> {
    return this.rows.get(id);
  }

  async findBySourceJob(userId: string, jobId: string): Promise<SavedMapRecord | undefined> {
    return [...this.rows.values()].find((r) => r.userId === userId && r.sourceJobId === jobId);
  }

  async count(userId: string): Promise<number> {
    return [...this.rows.values()].filter((r) => r.userId === userId).length;
  }

  async insert(record: SavedMapRecord): Promise<void> {
    this.rows.set(record.id, record);
  }

  async updateName(id: string, userId: string, name: string): Promise<boolean> {
    const row = this.rows.get(id);
    if (!row || row.userId !== userId) return false;
    row.name = name;
    row.updatedAt = new Date().toISOString();
    return true;
  }

  async delete(id: string, userId: string): Promise<boolean> {
    const row = this.rows.get(id);
    if (!row || row.userId !== userId) return false;
    this.rows.delete(id);
    return true;
  }

  clear(): void {
    this.rows.clear();
  }
}

export class PostgresSavedMapStore implements SavedMapStore {
  async list(userId: string): Promise<SavedMapMeta[]> {
    const result = await query(
      `SELECT id, name, game_mode, created_at, updated_at
       FROM arena_forge_maps WHERE user_id = $1
       ORDER BY updated_at DESC`,
      [userId],
    );
    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      mode: row.game_mode,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    }));
  }

  async get(id: string): Promise<SavedMapRecord | undefined> {
    const result = await query(
      `SELECT id, user_id, name, game_mode, brief, design_plan, map_definition,
              map_format_version, source_job_id, provider, model, created_at, updated_at
       FROM arena_forge_maps WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) return undefined;
    return postgresRowToRecord(row);
  }

  async findBySourceJob(userId: string, jobId: string): Promise<SavedMapRecord | undefined> {
    const result = await query(
      `SELECT id, user_id, name, game_mode, brief, design_plan, map_definition,
              map_format_version, source_job_id, provider, model, created_at, updated_at
       FROM arena_forge_maps WHERE user_id = $1 AND source_job_id = $2
       ORDER BY created_at DESC LIMIT 1`,
      [userId, jobId],
    );
    const row = result.rows[0];
    if (!row) return undefined;
    return postgresRowToRecord(row);
  }

  async count(userId: string): Promise<number> {
    const result = await query(
      `SELECT COUNT(*)::int AS n FROM arena_forge_maps WHERE user_id = $1`,
      [userId],
    );
    return result.rows[0]?.n ?? 0;
  }

  async insert(record: SavedMapRecord): Promise<void> {
    await query(
      `INSERT INTO arena_forge_maps
        (id, user_id, name, game_mode, brief, design_plan, map_definition,
         map_format_version, source_job_id, provider, model, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        record.id,
        record.userId,
        record.name,
        record.mode,
        record.brief,
        JSON.stringify(record.designPlan),
        JSON.stringify(record.mapDefinition),
        record.mapFormatVersion,
        record.sourceJobId ?? null,
        record.provider ?? null,
        record.model ?? null,
        record.createdAt,
        record.updatedAt,
      ],
    );
  }

  async updateName(id: string, userId: string, name: string): Promise<boolean> {
    const result = await query(
      `UPDATE arena_forge_maps SET name = $1 WHERE id = $2 AND user_id = $3`,
      [name, id, userId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async delete(id: string, userId: string): Promise<boolean> {
    const result = await query(
      `DELETE FROM arena_forge_maps WHERE id = $1 AND user_id = $2`,
      [id, userId],
    );
    return (result.rowCount ?? 0) > 0;
  }
}

let storeOverride: SavedMapStore | null = null;
const guestStore = new MemorySavedMapStore();

export function setSavedMapStoreForTests(store: SavedMapStore | null): void {
  storeOverride = store;
}

export function getSavedMapStore(): SavedMapStore | null {
  if (storeOverride) return storeOverride;
  if (!isDatabaseEnabled()) return null;
  return new PostgresSavedMapStore();
}

/** In-process guest maps. Gone on restart. Never written to Postgres. */
export function getGuestSavedMapStore(): SavedMapStore {
  return storeOverride ?? guestStore;
}

export function resetGuestSavedMaps(): void {
  guestStore.clear();
}

export function jobOwnedBy(job: DesignJobRecord, actorId: string): boolean {
  if (job.ownerUserId) return job.ownerUserId === actorId;
  if (job.guestSessionId) return guestMapOwnerId(job.guestSessionId) === actorId;
  return false;
}

function postgresRowToRecord(row: {
  id: string;
  user_id: string;
  name: string;
  game_mode: ArenaGameMode;
  brief: string;
  design_plan: PublicDesignPlan;
  map_definition: GameplayMapDefinition;
  map_format_version: number;
  source_job_id?: string | null;
  provider?: string | null;
  model?: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}): SavedMapRecord {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    mode: row.game_mode,
    brief: row.brief,
    designPlan: row.design_plan,
    mapDefinition: row.map_definition,
    mapFormatVersion: row.map_format_version,
    sourceJobId: row.source_job_id ?? undefined,
    provider: row.provider ?? undefined,
    model: row.model ?? undefined,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function toMeta(row: SavedMapRecord): SavedMapMeta {
  return {
    id: row.id,
    name: row.name,
    mode: row.mode,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function parseSavedMapName(raw: unknown): { ok: true; name: string } | { ok: false; error: string } {
  if (typeof raw !== "string") return { ok: false, error: "Map name is required." };
  const name = raw.trim();
  const visible = [...name].length;
  if (visible < SAVED_MAP_NAME_MIN || visible > SAVED_MAP_NAME_MAX) {
    return {
      ok: false,
      error: `Map name must be ${SAVED_MAP_NAME_MIN}–${SAVED_MAP_NAME_MAX} characters.`,
    };
  }
  return { ok: true, name };
}

export function parseSavedMapDefinition(raw: unknown): GameplayMapDefinition {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("Saved map definition is missing.");
  }
  const rec = raw as GameplayMapDefinition & { version?: number };
  if (typeof rec.id !== "string" || typeof rec.name !== "string") {
    throw new Error("Saved map definition is incomplete.");
  }
  if (!Array.isArray(rec.obstacles) || !Array.isArray(rec.occluders) || !Array.isArray(rec.breakables)) {
    throw new Error("Saved map geometry is invalid.");
  }
  if (rec.obstacles.length + rec.occluders.length + rec.breakables.length > 80) {
    throw new Error("Saved map has too many solids.");
  }
  const bounds = resolveMapBounds(rec);
  if (!isUsableBounds(bounds)) throw new Error("Saved map bounds are invalid.");
  if (bounds.halfWidth * 2 > 80 || bounds.halfDepth * 2 > 80) {
    throw new Error("Saved map bounds exceed the supported size.");
  }
  return rec;
}

export function savedRuntimeMapId(id: string): string {
  return `user-map:${id}`;
}

export function parseSavedRuntimeMapId(id: string): string | undefined {
  if (!id.startsWith("user-map:")) return undefined;
  return id.slice("user-map:".length);
}

export async function saveCompletedDesign(args: {
  userId: string;
  jobId: string;
  name: string;
  store: SavedMapStore;
  createId?: () => string;
}): Promise<{ ok: true; record: SavedMapRecord } | { ok: false; status: number; error: string }> {
  const job = getDesignJob(args.jobId);
  if (!job) return { ok: false, status: 404, error: "That design job is gone." };
  if (!jobOwnedBy(job, args.userId)) {
    return { ok: false, status: 403, error: "You do not own that design job." };
  }
  if (job.status !== "completed" || !job.result || job.result.status !== "completed") {
    return { ok: false, status: 409, error: "Only a completed design can be saved." };
  }
  if (job.path !== "product" || !job.spec || !job.mode) {
    return { ok: false, status: 400, error: "Only ArenaForge product designs can be saved." };
  }
  const plan = job.designPlan ?? ("designPlan" in job.result ? job.result.designPlan : undefined);
  if (!plan) return { ok: false, status: 409, error: "Completed design is missing a design plan." };

  const blockers = productCompletionIssues(job.result.finalMap, job.result.finalEvaluation, job.mode);
  if (blockers.length) {
    return { ok: false, status: 409, error: `Map is not ready to save: ${blockers.join(", ")}.` };
  }

  const named = parseSavedMapName(args.name);
  if (!named.ok) return { ok: false, status: 400, error: named.error };

  const existing = await args.store.findBySourceJob(args.userId, args.jobId);
  if (existing) return { ok: true, record: existing };

  const count = await args.store.count(args.userId);
  if (count >= MAX_SAVED_MAPS_PER_USER) {
    return { ok: false, status: 409, error: `You can save at most ${MAX_SAVED_MAPS_PER_USER} maps.` };
  }

  const id = (args.createId ?? randomUUID)();
  const runtimeId = savedRuntimeMapId(id);
  const mapDefinition = exportGameplayMap(job.result.finalMap, {
    id: runtimeId,
    name: named.name,
  });
  try {
    if (job.mode === "search_destroy") assertSearchDestroyMap(mapDefinition);
    else assertDeathmatchMap(mapDefinition);
    const ev = evaluateGameplayMap(mapDefinition, job.mode);
    const again = productCompletionIssues(job.result.finalMap, ev, job.mode);
    if (again.length) {
      return { ok: false, status: 409, error: `Map failed validation: ${again.join(", ")}.` };
    }
  } catch (err) {
    return { ok: false, status: 409, error: err instanceof Error ? err.message : "Map failed validation." };
  }

  const now = new Date().toISOString();
  const record: SavedMapRecord = {
    id,
    userId: args.userId,
    name: named.name,
    mode: job.mode,
    brief: job.brief,
    designPlan: plan,
    mapDefinition,
    mapFormatVersion: SAVED_MAP_FORMAT_VERSION,
    sourceJobId: job.id,
    provider: job.provider,
    model: job.providerModel,
    createdAt: now,
    updatedAt: now,
  };
  await args.store.insert(record);
  return { ok: true, record };
}

export function loadValidatedSavedMap(record: SavedMapRecord): GameplayMapDefinition {
  if (record.mapFormatVersion !== SAVED_MAP_FORMAT_VERSION) {
    throw new Error("Unsupported saved map format.");
  }
  const def = parseSavedMapDefinition(record.mapDefinition);
  if (record.mode === "search_destroy") assertSearchDestroyMap(def);
  else if (record.mode === "deathmatch") assertDeathmatchMap(def);
  else throw new Error("Unsupported saved map mode.");
  const ev = evaluateGameplayMap(def, record.mode);
  if (ev.summary.hardFailureCount > 0) {
    throw new Error("Saved map failed gameplay validation.");
  }
  return { ...def, id: savedRuntimeMapId(record.id), name: record.name };
}
