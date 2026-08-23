import { describe, expect, it } from "vitest";
import { publicLiveCapability } from "../src/arena-forge/live-design-admission.js";
import { resolveLiveForgePolicy } from "../src/arena-forge/live-forge-policy.js";

const liveOn = {
  ARENA_FORGE_LIVE_AGENT_ENABLED: "true",
  OPENAI_API_KEY: "test-placeholder",
};

describe("live Forge access mode", () => {
  it("defaults to hosted and does not infer self-host from a missing database", () => {
    const noDb = resolveLiveForgePolicy({ ...liveOn }, { databaseAvailable: false });
    expect(noDb.mode).toBe("hosted");
    expect(noDb.runnable).toBe(false);
    expect(noDb.requiresAuth).toBe(true);
    expect(noDb.requiresQuota).toBe(true);

    const prodNoDb = resolveLiveForgePolicy(
      { ...liveOn, NODE_ENV: "production" },
      { databaseAvailable: false },
    );
    expect(prodNoDb.mode).toBe("hosted");
    expect(prodNoDb.runnable).toBe(false);
  });

  it("makes hosted runnable only when the database is up", () => {
    const hosted = resolveLiveForgePolicy({ ...liveOn }, { databaseAvailable: true });
    expect(hosted.mode).toBe("hosted");
    expect(hosted.runnable).toBe(true);
    expect(hosted.requiresAuth).toBe(true);
    expect(hosted.requiresQuota).toBe(true);
  });

  it("requires an explicit self_host flag", () => {
    const selfHost = resolveLiveForgePolicy(
      { ...liveOn, ARENA_FORGE_ACCESS_MODE: "self_host" },
      { databaseAvailable: false },
    );
    expect(selfHost.mode).toBe("self_host");
    expect(selfHost.runnable).toBe(true);
    expect(selfHost.requiresAuth).toBe(false);
    expect(selfHost.requiresQuota).toBe(false);
  });

  it("keeps self_host off when the flag or key is missing", () => {
    const noKey = resolveLiveForgePolicy(
      { ARENA_FORGE_LIVE_AGENT_ENABLED: "true", ARENA_FORGE_ACCESS_MODE: "self_host" },
      { databaseAvailable: false },
    );
    expect(noKey.runnable).toBe(false);
  });

  it("publishes capability that matches selected-mode runnability", () => {
    expect(
      publicLiveCapability({
        liveAvailable: true,
        accessMode: "hosted",
        requiresSignIn: true,
        remainingRunsToday: 1,
      }),
    ).toEqual({
      liveAgentAvailable: true,
      accessMode: "hosted",
      requiresSignIn: true,
      remainingRunsToday: 1,
    });

    expect(
      publicLiveCapability({
        liveAvailable: false,
        accessMode: "hosted",
        requiresSignIn: true,
      }),
    ).toEqual({
      liveAgentAvailable: false,
      accessMode: "hosted",
      requiresSignIn: true,
    });

    expect(
      publicLiveCapability({
        liveAvailable: true,
        accessMode: "self_host",
        requiresSignIn: false,
      }),
    ).toEqual({
      liveAgentAvailable: true,
      accessMode: "self_host",
      requiresSignIn: false,
    });
  });
});
