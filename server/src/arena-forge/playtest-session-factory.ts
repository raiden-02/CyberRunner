import { AnthropicPlaytestAgentSession, type AnthropicMessagesClient } from "./anthropic-playtest-agent.js";
import { OpenAIPlaytestAgentSession, type OpenAIResponsesClient } from "./openai-playtest-agent.js";
import type { PlaytestAgentSession } from "./playtest-agent.js";
import { readAnthropicApiKey, resolveArenaForgeProviderConfig } from "./provider.js";
import { readOpenAIApiKey } from "./one-shot.js";

export function createPlaytestAgentSession(opts?: {
  env?: NodeJS.ProcessEnv;
  openaiClient?: OpenAIResponsesClient;
  anthropicClient?: AnthropicMessagesClient;
}): PlaytestAgentSession {
  const env = opts?.env ?? process.env;
  const config = resolveArenaForgeProviderConfig(env);
  if (!config.valid || !config.keyConfigured) {
    throw new Error(config.error ?? "Live design is not configured on this server.");
  }
  if (config.provider === "anthropic") {
    return new AnthropicPlaytestAgentSession({
      model: config.model,
      apiKey: readAnthropicApiKey(env),
      ...(opts?.anthropicClient ? { client: opts.anthropicClient } : {}),
    });
  }
  return new OpenAIPlaytestAgentSession({
    model: config.model,
    apiKey: readOpenAIApiKey(env),
    ...(opts?.openaiClient ? { client: opts.openaiClient } : {}),
  });
}
