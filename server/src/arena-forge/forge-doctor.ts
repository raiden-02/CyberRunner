import {
  resolveLiveForgePolicy,
  type LiveForgePolicy,
} from "./live-forge-policy.js";
import {
  providerDisplayName,
  resolveArenaForgeProviderConfig,
  type ArenaForgeProviderConfig,
} from "./provider.js";

export type ForgeDoctorReport = {
  ok: boolean;
  lines: string[];
};

export function buildForgeDoctorReport(
  env: NodeJS.ProcessEnv = process.env,
  opts: { databaseAvailable: boolean } = { databaseAvailable: false },
): ForgeDoctorReport {
  const policy = resolveLiveForgePolicy(env, opts);
  const provider = resolveArenaForgeProviderConfig(env);
  const lines = [
    "ArenaForge live configuration",
    "",
    `Mode: ${policy.mode}`,
    `Provider: ${provider.valid ? providerDisplayName(provider.provider) : "invalid"}`,
    `Model: ${provider.model}`,
    `Key: ${provider.keyConfigured ? "configured" : "missing"}`,
    `Database: ${databaseLine(policy, opts.databaseAvailable)}`,
    `Quota: ${policy.requiresQuota ? "required" : "not required"}`,
    `Live: ${env.ARENA_FORGE_LIVE_AGENT_ENABLED === "true" ? "enabled" : "disabled"}`,
    "",
    readinessLine(env, policy, provider, opts.databaseAvailable),
  ];
  return { ok: policy.runnable, lines };
}

function databaseLine(policy: LiveForgePolicy, databaseAvailable: boolean): string {
  if (policy.mode === "self_host") return "not required";
  return databaseAvailable ? "configured" : "missing";
}

function readinessLine(
  env: NodeJS.ProcessEnv,
  policy: LiveForgePolicy,
  provider: ArenaForgeProviderConfig,
  databaseAvailable: boolean,
): string {
  if (policy.runnable) return "Live design: ready";
  if (env.ARENA_FORGE_LIVE_AGENT_ENABLED !== "true") return "Live flag is disabled.";
  if (!provider.valid || !provider.keyConfigured) {
    return provider.error ?? "Live design is not configured on this server.";
  }
  if (policy.mode === "hosted" && !databaseAvailable) {
    return "Hosted mode requires database-backed quota storage.";
  }
  return "Live design is not ready.";
}
