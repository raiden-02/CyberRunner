import { describe, expect, it } from "vitest";
import { assertNoSecrets, publicError } from "../src/arena-forge/design-view.js";
import { publicLiveCapability } from "../src/arena-forge/live-design-admission.js";
import { resolveLiveForgePolicy } from "../src/arena-forge/live-forge-policy.js";
import {
  DEFAULT_ANTHROPIC_MODEL,
  DEFAULT_ARENA_FORGE_MODEL,
  publicProviderError,
  resolveArenaForgeProvider,
  resolveArenaForgeProviderConfig,
} from "../src/arena-forge/provider.js";

const openaiKey = { OPENAI_API_KEY: "test-placeholder" };
const anthropicKey = { ANTHROPIC_API_KEY: "test-placeholder" };

describe("ArenaForge provider policy", () => {
  it("defaults to openai when the provider is unset", () => {
    expect(resolveArenaForgeProvider({})).toBe("openai");
    const cfg = resolveArenaForgeProviderConfig({ ...openaiKey });
    expect(cfg).toMatchObject({
      provider: "openai",
      model: DEFAULT_ARENA_FORGE_MODEL,
      keyConfigured: true,
      valid: true,
    });
  });

  it("treats openai + OpenAI key as configured", () => {
    const cfg = resolveArenaForgeProviderConfig({
      ARENA_FORGE_PROVIDER: "openai",
      ...openaiKey,
    });
    expect(cfg.valid).toBe(true);
    expect(cfg.keyConfigured).toBe(true);
    expect(cfg.provider).toBe("openai");
  });

  it("does not treat openai + only Anthropic key as configured", () => {
    const cfg = resolveArenaForgeProviderConfig({
      ARENA_FORGE_PROVIDER: "openai",
      ...anthropicKey,
    });
    expect(cfg.keyConfigured).toBe(false);
    expect(cfg.error).toMatch(/OPENAI_API_KEY is not configured/);
  });

  it("treats anthropic + Anthropic key as configured", () => {
    const cfg = resolveArenaForgeProviderConfig({
      ARENA_FORGE_PROVIDER: "anthropic",
      ...anthropicKey,
    });
    expect(cfg.valid).toBe(true);
    expect(cfg.keyConfigured).toBe(true);
    expect(cfg.provider).toBe("anthropic");
    expect(cfg.model).toBe(DEFAULT_ANTHROPIC_MODEL);
  });

  it("does not treat anthropic + only OpenAI key as configured", () => {
    const cfg = resolveArenaForgeProviderConfig({
      ARENA_FORGE_PROVIDER: "anthropic",
      ...openaiKey,
    });
    expect(cfg.keyConfigured).toBe(false);
    expect(cfg.error).toMatch(/ANTHROPIC_API_KEY is not configured/);
  });

  it("fails closed on an explicit invalid provider", () => {
    const cfg = resolveArenaForgeProviderConfig({
      ARENA_FORGE_PROVIDER: "openrouter",
      ...openaiKey,
      ...anthropicKey,
    });
    expect(cfg.valid).toBe(false);
    expect(cfg.keyConfigured).toBe(false);
    expect(cfg.error).toMatch(/must be openai or anthropic/);
  });

  it("lets ARENA_FORGE_MODEL override both defaults", () => {
    expect(
      resolveArenaForgeProviderConfig({
        ARENA_FORGE_PROVIDER: "openai",
        ARENA_FORGE_MODEL: "gpt-test",
        ...openaiKey,
      }).model,
    ).toBe("gpt-test");
    expect(
      resolveArenaForgeProviderConfig({
        ARENA_FORGE_PROVIDER: "anthropic",
        ARENA_FORGE_MODEL: "claude-test",
        ...anthropicKey,
      }).model,
    ).toBe("claude-test");
  });
});

describe("access mode stays orthogonal to provider", () => {
  const live = { ARENA_FORGE_LIVE_AGENT_ENABLED: "true" };

  it("keeps hosted auth and quota for both providers", () => {
    for (const env of [
      { ...live, ARENA_FORGE_PROVIDER: "openai", ...openaiKey },
      { ...live, ARENA_FORGE_PROVIDER: "anthropic", ...anthropicKey },
    ]) {
      const hosted = resolveLiveForgePolicy(env, { databaseAvailable: true });
      expect(hosted.mode).toBe("hosted");
      expect(hosted.liveEnabled).toBe(true);
      expect(hosted.runnable).toBe(true);
      expect(hosted.requiresAuth).toBe(true);
      expect(hosted.requiresQuota).toBe(true);
    }
  });

  it("keeps self-host free of auth and quota for both providers", () => {
    for (const env of [
      { ...live, ARENA_FORGE_ACCESS_MODE: "self_host", ARENA_FORGE_PROVIDER: "openai", ...openaiKey },
      {
        ...live,
        ARENA_FORGE_ACCESS_MODE: "self_host",
        ARENA_FORGE_PROVIDER: "anthropic",
        ...anthropicKey,
      },
    ]) {
      const selfHost = resolveLiveForgePolicy(env, { databaseAvailable: false });
      expect(selfHost.mode).toBe("self_host");
      expect(selfHost.runnable).toBe(true);
      expect(selfHost.requiresAuth).toBe(false);
      expect(selfHost.requiresQuota).toBe(false);
    }
  });
});

describe("public capability and provider errors", () => {
  it("includes provider and model without keys", () => {
    const cap = publicLiveCapability({
      liveAvailable: true,
      accessMode: "self_host",
      requiresSignIn: false,
      provider: "openai",
      model: "gpt-5.6",
    });
    expect(cap).toEqual({
      liveAgentAvailable: true,
      accessMode: "self_host",
      requiresSignIn: false,
      provider: "openai",
      model: "gpt-5.6",
    });
    const text = JSON.stringify(cap);
    expect(text).not.toMatch(/OPENAI_API_KEY|ANTHROPIC_API_KEY|sk-ant-|sk-[a-zA-Z0-9]/);
  });

  it("normalizes provider failures to public categories", () => {
    expect(publicProviderError({ status: 401, message: "Incorrect API key provided: sk-abc" })).toBe(
      "Provider authentication failed.",
    );
    expect(publicProviderError({ status: 401, message: "invalid x-api-key" })).toBe(
      "Provider authentication failed.",
    );
    expect(publicProviderError({ status: 429, message: "rate_limit_exceeded" })).toBe(
      "Provider rate limit reached.",
    );
    expect(publicProviderError({ status: 404, message: "model not found" })).toBe(
      "Configured model is unavailable.",
    );
    expect(publicProviderError(new Error("socket hang up"))).toBe("Live design request failed.");
  });

  it("strips key-like public error text", () => {
    expect(publicError("Incorrect API key provided: sk-abc123xyz")).toBe("The model call failed.");
    expect(publicError("ANTHROPIC_API_KEY rejected sk-ant-secret")).toBe("The model call failed.");
    expect(publicError("Provider authentication failed.")).toBe("Provider authentication failed.");
    expect(() =>
      assertNoSecrets({ error: "OPENAI_API_KEY=sk-abc", note: "ANTHROPIC_API_KEY" }),
    ).toThrow(/secret/);
  });
});
