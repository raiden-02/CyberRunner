import { getClient, isDatabaseEnabled } from "../db/pool.js";

export const GLOBAL_USAGE_ID = "__global__";

export type ForgeQuotaLimits = {
  userDaily: number;
  globalDaily: number;
};

export type ConsumeResult =
  | { ok: true; userUsed: number; globalUsed: number }
  | { ok: false; status: 429 | 503; reason: "user_limit" | "global_limit" | "unavailable"; error: string };

export type ForgeQuotaStore = {
  tryConsume(userId: string, usageDate?: string): Promise<ConsumeResult>;
  remaining(userId: string, usageDate?: string): Promise<number>;
};

function parseLimit(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.floor(n);
}

export function forgeQuotaLimits(env: NodeJS.ProcessEnv = process.env): ForgeQuotaLimits {
  return {
    userDaily: parseLimit(env.ARENA_FORGE_USER_DAILY_LIMIT, 1),
    globalDaily: parseLimit(env.ARENA_FORGE_GLOBAL_DAILY_LIMIT, 10),
  };
}

export function utcUsageDate(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export class MemoryForgeQuotaStore implements ForgeQuotaStore {
  private counts = new Map<string, number>();

  constructor(private readonly limits: ForgeQuotaLimits = forgeQuotaLimits()) {}

  reset(): void {
    this.counts.clear();
  }

  async tryConsume(userId: string, usageDate: string = utcUsageDate()): Promise<ConsumeResult> {
    const userKey = `${userId}:${usageDate}`;
    const globalKey = `${GLOBAL_USAGE_ID}:${usageDate}`;
    const userUsed = this.counts.get(userKey) ?? 0;
    const globalUsed = this.counts.get(globalKey) ?? 0;

    if (userUsed >= this.limits.userDaily) {
      return {
        ok: false,
        status: 429,
        reason: "user_limit",
        error: "Daily live ArenaForge limit reached.",
      };
    }
    if (globalUsed >= this.limits.globalDaily) {
      return {
        ok: false,
        status: 429,
        reason: "global_limit",
        error: "Server live ArenaForge capacity for today is full.",
      };
    }

    this.counts.set(userKey, userUsed + 1);
    this.counts.set(globalKey, globalUsed + 1);
    return { ok: true, userUsed: userUsed + 1, globalUsed: globalUsed + 1 };
  }

  async remaining(userId: string, usageDate: string = utcUsageDate()): Promise<number> {
    const used = this.counts.get(`${userId}:${usageDate}`) ?? 0;
    return Math.max(0, this.limits.userDaily - used);
  }
}

async function incrementUsage(
  client: { query: (text: string, params?: unknown[]) => Promise<{ rows: Array<{ jobs_started: number }> }> },
  userId: string,
  usageDate: string,
  limit: number,
): Promise<number | null> {
  const result = await client.query(
    `INSERT INTO arena_forge_usage (user_id, usage_date, jobs_started)
     VALUES ($1, $2::date, 1)
     ON CONFLICT (user_id, usage_date)
     DO UPDATE SET jobs_started = arena_forge_usage.jobs_started + 1
     WHERE arena_forge_usage.jobs_started < $3
     RETURNING jobs_started`,
    [userId, usageDate, limit],
  );
  if (result.rows.length === 0) return null;
  return Number(result.rows[0].jobs_started);
}

export class PostgresForgeQuotaStore implements ForgeQuotaStore {
  constructor(private readonly limits: ForgeQuotaLimits = forgeQuotaLimits()) {}

  async tryConsume(userId: string, usageDate: string = utcUsageDate()): Promise<ConsumeResult> {
    let client;
    try {
      client = await getClient();
    } catch {
      return {
        ok: false,
        status: 503,
        reason: "unavailable",
        error: "Live design is unavailable. Quota storage is not configured.",
      };
    }

    try {
      await client.query("BEGIN");
      const userUsed = await incrementUsage(client, userId, usageDate, this.limits.userDaily);
      if (userUsed === null) {
        await client.query("ROLLBACK");
        return {
          ok: false,
          status: 429,
          reason: "user_limit",
          error: "Daily live ArenaForge limit reached.",
        };
      }
      const globalUsed = await incrementUsage(client, GLOBAL_USAGE_ID, usageDate, this.limits.globalDaily);
      if (globalUsed === null) {
        await client.query("ROLLBACK");
        return {
          ok: false,
          status: 429,
          reason: "global_limit",
          error: "Server live ArenaForge capacity for today is full.",
        };
      }
      await client.query("COMMIT");
      return { ok: true, userUsed, globalUsed };
    } catch {
      try {
        await client.query("ROLLBACK");
      } catch {
        // ignore rollback failure
      }
      return {
        ok: false,
        status: 503,
        reason: "unavailable",
        error: "Live design is unavailable. Quota storage is not configured.",
      };
    } finally {
      client.release();
    }
  }

  async remaining(userId: string, usageDate: string = utcUsageDate()): Promise<number> {
    const { query } = await import("../db/pool.js");
    const result = await query(
      `SELECT jobs_started FROM arena_forge_usage
       WHERE user_id = $1 AND usage_date = $2::date`,
      [userId, usageDate],
    );
    const used = result.rows[0] ? Number(result.rows[0].jobs_started) : 0;
    return Math.max(0, this.limits.userDaily - used);
  }
}

let postgresStore: PostgresForgeQuotaStore | null = null;

export function getForgeQuotaStore(): ForgeQuotaStore | null {
  if (!isDatabaseEnabled()) return null;
  if (!postgresStore) {
    postgresStore = new PostgresForgeQuotaStore();
  }
  return postgresStore;
}
