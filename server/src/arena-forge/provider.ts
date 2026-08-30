import { DEFAULT_ARENA_FORGE_MODEL, readOpenAIApiKey, resolveArenaForgeModel } from "./one-shot.js";

export type ArenaForgeProvider = "openai" | "anthropic";

export const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-5";

export type ArenaForgeProviderConfig = {
  provider: ArenaForgeProvider;
  model: string;
  keyConfigured: boolean;
  valid: boolean;
  error?: string;
};

export function readAnthropicApiKey(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const key = env.ANTHROPIC_API_KEY?.trim();
  return key ? key : undefined;
}

export function resolveArenaForgeProvider(env: NodeJS.ProcessEnv = process.env): ArenaForgeProvider | undefined {
  const raw = env.ARENA_FORGE_PROVIDER?.trim().toLowerCase();
  if (!raw) return "openai";
  if (raw === "openai" || raw === "anthropic") return raw;
  return undefined;
}

export function resolveArenaForgeProviderConfig(
  env: NodeJS.ProcessEnv = process.env,
): ArenaForgeProviderConfig {
  const provider = resolveArenaForgeProvider(env);
  if (!provider) {
    return {
      provider: "openai",
      model: resolveArenaForgeModel(env),
      keyConfigured: false,
      valid: false,
      error: "ARENA_FORGE_PROVIDER must be openai or anthropic.",
    };
  }

  const model =
    provider === "anthropic"
      ? env.ARENA_FORGE_MODEL?.trim() || DEFAULT_ANTHROPIC_MODEL
      : resolveArenaForgeModel(env);

  const keyConfigured =
    provider === "openai" ? Boolean(readOpenAIApiKey(env)) : Boolean(readAnthropicApiKey(env));

  if (!keyConfigured) {
    const needed = provider === "openai" ? "OPENAI_API_KEY" : "ANTHROPIC_API_KEY";
    return {
      provider,
      model,
      keyConfigured: false,
      valid: true,
      error: `Provider is ${provider} but ${needed} is not configured.`,
    };
  }

  return { provider, model, keyConfigured: true, valid: true };
}

export function providerDisplayName(provider: ArenaForgeProvider): string {
  return provider === "anthropic" ? "Anthropic" : "OpenAI";
}

export function publicProviderError(err: unknown): string {
  const status = readStatus(err);
  const text = err instanceof Error ? err.message : String(err);
  if (status === 401 || status === 403 || /auth|invalid.?api.?key|incorrect api key|permission/i.test(text)) {
    return "Provider authentication failed.";
  }
  if (status === 429 || /rate limit|too many requests/i.test(text)) {
    return "Provider rate limit reached.";
  }
  if (status === 404 || /model.*not found|does not exist|unknown model|unavailable/i.test(text)) {
    return "Configured model is unavailable.";
  }
  return "Live design request failed.";
}

function readStatus(err: unknown): number | undefined {
  if (!err || typeof err !== "object") return undefined;
  const rec = err as { status?: unknown; statusCode?: unknown };
  if (typeof rec.status === "number") return rec.status;
  if (typeof rec.statusCode === "number") return rec.statusCode;
  return undefined;
}

export { DEFAULT_ARENA_FORGE_MODEL };
