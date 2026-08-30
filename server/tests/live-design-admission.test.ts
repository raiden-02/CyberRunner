import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { p4ManifestHash } from "../src/arena-forge/eval-cases.js";
import { p4bManifestHash } from "../src/arena-forge/eval-cases-p4b.js";
import {
  getDesignJob,
  hasActiveDesignJob,
  resetDesignJobs,
  startDesignJob,
  type DesignRunner,
} from "../src/arena-forge/design-jobs.js";
import { assertNoSecrets } from "../src/arena-forge/design-view.js";
import { MemoryForgeQuotaStore, type ForgeQuotaStore } from "../src/arena-forge/forge-quota.js";
import {
  admitLiveDesign,
  publicLiveCapability,
  resetLiveAdmission,
} from "../src/arena-forge/live-design-admission.js";
import { resolveLiveForgePolicy } from "../src/arena-forge/live-forge-policy.js";
import { recordedDemoView } from "../src/arena-forge/recorded-demo.js";
import { ScriptedPlaytestSession, runPlaytestAgentDesign } from "../src/arena-forge/playtest-agent.js";
import type { AgentTurnDecision } from "../src/arena-forge/agent.js";

const P4A_HASH = "6acb4b3274ec7d1bb06090f5342816737227a9855945558958bc3d29154282e2";
const P4B_HASH = "0ad49258552c067ebf1117dacc37b0c02ce16505870e943ef33e60ef571faa39";

function decision(name: string, args: unknown): AgentTurnDecision {
  return { calls: [{ name, arguments: args, callId: `call-${name}` }], latencyMs: 1 };
}

const idleRun: DesignRunner = async ({ map, brief, onTurn }) =>
  runPlaytestAgentDesign({
    map,
    brief,
    session: new ScriptedPlaytestSession([decision("finish_design", { summary: "Idle." })]),
    onTurn,
  });

function liveDeps(run: DesignRunner = idleRun) {
  return { isLiveAvailable: () => true, run };
}

beforeEach(() => {
  process.env.ARENA_FORGE_ACCESS_MODE = "hosted";
});

afterEach(() => {
  resetDesignJobs();
  resetLiveAdmission();
});

describe("P4 hashes stay frozen", () => {
  it("keeps P4-A and P4-B manifest hashes", () => {
    expect(p4ManifestHash()).toBe(P4A_HASH);
    expect(p4bManifestHash()).toBe(P4B_HASH);
  });
});

describe("live Forge admission", () => {
  it("rejects anonymous live design and keeps the recorded demo public", () => {
    const quota = new MemoryForgeQuotaStore({ userDaily: 1, globalDaily: 10 });
    const started = admitLiveDesign(
      { brief: "Even the sites.", mapId: "map-contract-smoke" },
      { quota, deps: liveDeps() },
    );
    return started.then((result) => {
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(401);
        expect(result.error).toMatch(/sign in/i);
      }
      const demo = recordedDemoView();
      expect(demo.source).toBe("recorded");
      assertNoSecrets(demo);
    });
  });

  it("rejects live design when the feature is off and does not consume quota", async () => {
    const quota = new MemoryForgeQuotaStore({ userDaily: 1, globalDaily: 10 });
    const result = await admitLiveDesign(
      { brief: "Even the sites.", mapId: "map-contract-smoke" },
      { userId: "user-1", quota, deps: { isLiveAvailable: () => false, run: idleRun } },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
    expect(await quota.remaining("user-1")).toBe(1);
    expect(recordedDemoView().source).toBe("recorded");
  });

  it("fails closed when quota storage is missing", async () => {
    const result = await admitLiveDesign(
      { brief: "Even the sites.", mapId: "map-contract-smoke" },
      { userId: "user-1", quota: null, deps: liveDeps() },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(503);
      expect(result.error).not.toMatch(/OPENAI|api[_-]?key/i);
    }
  });

  it("does not consume quota when the brief is invalid", async () => {
    const quota = new MemoryForgeQuotaStore({ userDaily: 1, globalDaily: 10 });
    const result = await admitLiveDesign(
      { brief: "   ", mapId: "map-contract-smoke" },
      { userId: "user-1", quota, deps: liveDeps() },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(400);
    expect(await quota.remaining("user-1")).toBe(1);
  });

  it("admits the first user run and rejects the next as over the daily limit", async () => {
    const quota = new MemoryForgeQuotaStore({ userDaily: 1, globalDaily: 10 });
    const first = await admitLiveDesign(
      { brief: "First run.", mapId: "map-contract-smoke" },
      { userId: "user-1", quota, deps: liveDeps(idleRun) },
    );
    expect(first.ok).toBe(true);
    if (first.ok) await waitForJob(first.jobId);
    expect(await quota.remaining("user-1")).toBe(0);

    const second = await admitLiveDesign(
      { brief: "Second run.", mapId: "map-contract-smoke" },
      { userId: "user-1", quota, deps: liveDeps(async () => {
        throw new Error("should not run");
      }) },
    );
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.status).toBe(429);
      expect(second.error).toMatch(/daily/i);
    }
  });

  it("enforces the global daily cap", async () => {
    const quota = new MemoryForgeQuotaStore({ userDaily: 5, globalDaily: 1 });
    const first = await admitLiveDesign(
      { brief: "Global first.", mapId: "map-contract-smoke" },
      { userId: "user-a", quota, deps: liveDeps() },
    );
    expect(first.ok).toBe(true);
    if (first.ok) await waitForJob(first.jobId);

    const second = await admitLiveDesign(
      { brief: "Global second.", mapId: "map-contract-smoke" },
      { userId: "user-b", quota, deps: liveDeps(async () => {
        throw new Error("should not run");
      }) },
    );
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.status).toBe(429);
      expect(second.error).toMatch(/capacity/i);
    }
  });

  it("keeps one-active-job concurrency and does not consume the blocked start", async () => {
    const quota = new MemoryForgeQuotaStore({ userDaily: 5, globalDaily: 10 });
    let release!: () => void;
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const run: DesignRunner = async (args) => {
      await hold;
      return idleRun(args);
    };

    const first = await admitLiveDesign(
      { brief: "Held job.", mapId: "map-contract-smoke" },
      { userId: "user-1", quota, deps: liveDeps(run) },
    );
    expect(first.ok).toBe(true);

    const blocked = await admitLiveDesign(
      { brief: "Blocked job.", mapId: "map-contract-smoke" },
      { userId: "user-2", quota, deps: liveDeps() },
    );
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.status).toBe(409);
    expect(await quota.remaining("user-2")).toBe(5);
    release();
    if (first.ok) await waitForJob(first.jobId);
  });

  it("documents the persistent usage table", () => {
    const sql = readFileSync(
      resolve(import.meta.dirname, "../src/db/migrations/003_arena_forge_usage.sql"),
      "utf8",
    );
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS arena_forge_usage/);
    expect(sql).toMatch(/PRIMARY KEY \(user_id, usage_date\)/);
  });

  it("exposes public capability fields without secrets", () => {
    const cap = publicLiveCapability({ liveAvailable: true, remainingRunsToday: 1 });
    expect(cap).toEqual({
      liveAgentAvailable: true,
      accessMode: "hosted",
      requiresSignIn: true,
      remainingRunsToday: 1,
    });
    expect(JSON.stringify(cap)).not.toMatch(/OPENAI_API_KEY|ANTHROPIC_API_KEY|sk-ant-|sk-[a-zA-Z0-9]/);
    expect(publicLiveCapability({ liveAvailable: false })).toEqual({
      liveAgentAvailable: false,
      accessMode: "hosted",
      requiresSignIn: true,
    });
  });

  it("admits exactly one of two simultaneous requests and consumes quota only for the winner", async () => {
    const inner = new MemoryForgeQuotaStore({ userDaily: 5, globalDaily: 10 });
    let releaseConsume!: () => void;
    const holdConsume = new Promise<void>((resolve) => {
      releaseConsume = resolve;
    });
    const quota: ForgeQuotaStore = {
      async tryConsume(userId) {
        await holdConsume;
        return inner.tryConsume(userId);
      },
      remaining: (userId) => inner.remaining(userId),
    };

    let releaseJob!: () => void;
    const holdJob = new Promise<void>((resolve) => {
      releaseJob = resolve;
    });
    const run: DesignRunner = async (args) => {
      await holdJob;
      return idleRun(args);
    };

    const started = Promise.all([
      admitLiveDesign(
        { brief: "Concurrent A.", mapId: "map-contract-smoke" },
        { userId: "user-a", quota, deps: liveDeps(run) },
      ),
      admitLiveDesign(
        { brief: "Concurrent B.", mapId: "map-contract-smoke" },
        { userId: "user-b", quota, deps: liveDeps(run) },
      ),
    ]);

    releaseConsume();
    const [first, second] = await started;
    const statuses = [first, second].map((r) => (r.ok ? r.status : r.status)).sort((a, b) => a - b);
    expect(statuses).toEqual([202, 409]);

    const winner = first.ok ? first : second;
    const loser = first.ok ? second : first;
    expect(winner.ok).toBe(true);
    expect(loser.ok).toBe(false);
    if (!loser.ok) expect(loser.status).toBe(409);

    const remainingA = await inner.remaining("user-a");
    const remainingB = await inner.remaining("user-b");
    expect([remainingA, remainingB].sort()).toEqual([4, 5]);
    expect(remainingA + remainingB).toBe(9);

    releaseJob();
    if (winner.ok) await waitForJob(winner.jobId);
  });

  it("releases the active slot when quota rejects so another user can start", async () => {
    const quota = new MemoryForgeQuotaStore({ userDaily: 1, globalDaily: 1 });
    const first = await admitLiveDesign(
      { brief: "Takes the global slot.", mapId: "map-contract-smoke" },
      { userId: "user-full", quota, deps: liveDeps() },
    );
    expect(first.ok).toBe(true);
    if (first.ok) await waitForJob(first.jobId);
    expect(hasActiveDesignJob()).toBe(false);

    const rejected = await admitLiveDesign(
      { brief: "Over the global cap.", mapId: "map-contract-smoke" },
      { userId: "user-next", quota, deps: liveDeps(async () => {
        throw new Error("should not run");
      }) },
    );
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.status).toBe(429);
    expect(hasActiveDesignJob()).toBe(false);
    expect(await quota.remaining("user-next")).toBe(1);
  });

  it("lets a later user start after a quota rejection leaves no phantom job", async () => {
    const quota = new MemoryForgeQuotaStore({ userDaily: 1, globalDaily: 10 });
    await quota.tryConsume("user-spent");
    expect(hasActiveDesignJob()).toBe(false);

    const rejected = await admitLiveDesign(
      { brief: "Spent user.", mapId: "map-contract-smoke" },
      { userId: "user-spent", quota, deps: liveDeps() },
    );
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.status).toBe(429);
    expect(hasActiveDesignJob()).toBe(false);

    const next = await admitLiveDesign(
      { brief: "Fresh user.", mapId: "map-contract-smoke" },
      { userId: "user-fresh", quota, deps: liveDeps() },
    );
    expect(next.ok).toBe(true);
    if (next.ok) await waitForJob(next.jobId);
  });

  it("admits self-host Anthropic live design without a user or quota store", async () => {
    const policy = resolveLiveForgePolicy(
      {
        ARENA_FORGE_LIVE_AGENT_ENABLED: "true",
        ANTHROPIC_API_KEY: "test-placeholder",
        ARENA_FORGE_PROVIDER: "anthropic",
        ARENA_FORGE_ACCESS_MODE: "self_host",
      },
      { databaseAvailable: false },
    );
    expect(policy.requiresAuth).toBe(false);
    expect(policy.requiresQuota).toBe(false);

    const result = await admitLiveDesign(
      { brief: "Self-host Anthropic run.", mapId: "map-contract-smoke" },
      { policy, deps: liveDeps() },
    );
    expect(result.ok).toBe(true);
    if (result.ok) await waitForJob(result.jobId);
  });

  it("admits self-host live design without a user or quota store", async () => {
    const policy = resolveLiveForgePolicy(
      {
        ARENA_FORGE_LIVE_AGENT_ENABLED: "true",
        OPENAI_API_KEY: "test-placeholder",
        ARENA_FORGE_ACCESS_MODE: "self_host",
      },
      { databaseAvailable: false },
    );
    expect(policy.requiresAuth).toBe(false);
    expect(policy.requiresQuota).toBe(false);

    const result = await admitLiveDesign(
      { brief: "Self-host run.", mapId: "map-contract-smoke" },
      { policy, deps: liveDeps() },
    );
    expect(result.ok).toBe(true);
    if (result.ok) await waitForJob(result.jobId);
  });

  it("keeps one-active-job concurrency in self-host mode", async () => {
    const policy = resolveLiveForgePolicy(
      {
        ARENA_FORGE_LIVE_AGENT_ENABLED: "true",
        OPENAI_API_KEY: "test-placeholder",
        ARENA_FORGE_ACCESS_MODE: "self_host",
      },
      { databaseAvailable: false },
    );
    let release!: () => void;
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const [first, second] = await Promise.all([
      admitLiveDesign(
        { brief: "Self-host A.", mapId: "map-contract-smoke" },
        { policy, deps: liveDeps(async (args) => {
          await hold;
          return idleRun(args);
        }) },
      ),
      admitLiveDesign(
        { brief: "Self-host B.", mapId: "map-contract-smoke" },
        { policy, deps: liveDeps() },
      ),
    ]);
    const statuses = [first, second].map((r) => (r.ok ? 202 : r.status)).sort((a, b) => a - b);
    expect(statuses).toEqual([202, 409]);
    release();
    const winner = first.ok ? first : second;
    if (winner.ok) await waitForJob(winner.jobId);
  });

  it("keeps hosted Anthropic behind sign-in and quota", async () => {
    const policy = resolveLiveForgePolicy(
      {
        ARENA_FORGE_LIVE_AGENT_ENABLED: "true",
        ARENA_FORGE_PROVIDER: "anthropic",
        ANTHROPIC_API_KEY: "test-placeholder",
      },
      { databaseAvailable: true },
    );
    expect(policy.requiresAuth).toBe(true);
    expect(policy.requiresQuota).toBe(true);
    const result = await admitLiveDesign(
      { brief: "Hosted Anthropic.", mapId: "map-contract-smoke" },
      { policy, deps: liveDeps() },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(401);
  });

  it("does not treat a missing database as self-host", async () => {
    const result = await admitLiveDesign(
      { brief: "Should stay hosted.", mapId: "map-contract-smoke" },
      {
        userId: "user-1",
        quota: null,
        databaseAvailable: false,
        env: {
          ARENA_FORGE_LIVE_AGENT_ENABLED: "true",
          OPENAI_API_KEY: "test-placeholder",
        },
        deps: liveDeps(),
      },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(503);
    expect(hasActiveDesignJob()).toBe(false);
  });
});

async function waitForJob(jobId: string): Promise<void> {
  const start = Date.now();
  while (true) {
    const status = getDesignJob(jobId)?.status;
    if (status === "completed" || status === "failed") return;
    if (Date.now() - start > 2000) throw new Error("timed out waiting for job");
    await new Promise((r) => setTimeout(r, 10));
  }
}

describe("direct startDesignJob still used by P6 tests", () => {
  it("can start a fake job without going through admission", () => {
    const started = startDesignJob(
      { brief: "Legacy path.", mapId: "map-contract-smoke" },
      liveDeps(),
    );
    expect(started.ok).toBe(true);
  });
});
