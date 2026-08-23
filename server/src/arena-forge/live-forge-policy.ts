import { readOpenAIApiKey } from "./one-shot.js";

export type LiveAccessMode = "hosted" | "self_host";

export type LiveForgePolicy = {
  mode: LiveAccessMode;
  liveEnabled: boolean;
  runnable: boolean;
  requiresAuth: boolean;
  requiresQuota: boolean;
};

export function resolveLiveAccessMode(env: NodeJS.ProcessEnv = process.env): LiveAccessMode {
  return env.ARENA_FORGE_ACCESS_MODE === "self_host" ? "self_host" : "hosted";
}

export function resolveLiveForgePolicy(
  env: NodeJS.ProcessEnv = process.env,
  opts: { databaseAvailable: boolean } = { databaseAvailable: false },
): LiveForgePolicy {
  const mode = resolveLiveAccessMode(env);
  const liveEnabled = env.ARENA_FORGE_LIVE_AGENT_ENABLED === "true" && Boolean(readOpenAIApiKey(env));

  if (mode === "self_host") {
    return {
      mode,
      liveEnabled,
      runnable: liveEnabled,
      requiresAuth: false,
      requiresQuota: false,
    };
  }

  return {
    mode: "hosted",
    liveEnabled,
    runnable: liveEnabled && opts.databaseAvailable,
    requiresAuth: true,
    requiresQuota: true,
  };
}
