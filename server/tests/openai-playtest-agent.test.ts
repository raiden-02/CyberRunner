import { describe, expect, it } from "vitest";
import { getGameplayMap } from "@shared/world/map-registry.js";
import { importGameplayMap } from "../src/arena-forge/import-map.js";
import {
  OpenAIPlaytestAgentSession,
  type OpenAIResponsesClient,
  type OpenAIResponsesCreateParams,
} from "../src/arena-forge/openai-playtest-agent.js";
import {
  PLAYTEST_FUNCTION_TOOLS,
  PLAYTEST_SYSTEM_PROMPT,
  PLAYTEST_TOOL_NAMES,
  formatPlaytestStartMessage,
  type PlaytestAgentStartInput,
} from "../src/arena-forge/playtest-agent.js";
import { createPlaytestAgentSession } from "../src/arena-forge/playtest-session-factory.js";
import { publicProviderError } from "../src/arena-forge/provider.js";
import { ArenaWorkspace } from "../src/arena-forge/workspace.js";

function startInput(): PlaytestAgentStartInput {
  const map = importGameplayMap(getGameplayMap("map-contract-smoke"));
  return {
    brief: "Even Ghost routing.",
    inspection: new ArenaWorkspace(map).inspect(),
    maxEditAttempts: 8,
    toolNames: PLAYTEST_TOOL_NAMES,
    maxPlaytestCalls: 3,
    playtestSeed: 1,
    playtestRollouts: 8,
  };
}

function fakeOpenAI(
  handler: (params: OpenAIResponsesCreateParams) => Promise<{
    id: string;
    model?: string;
    usage?: { input_tokens: number; output_tokens: number; total_tokens: number };
    output?: Array<{ type: string; name?: string; arguments?: unknown; call_id?: string }>;
  }>,
): { client: OpenAIResponsesClient; calls: OpenAIResponsesCreateParams[] } {
  const calls: OpenAIResponsesCreateParams[] = [];
  return {
    calls,
    client: {
      responses: {
        async create(params) {
          calls.push(params);
          return handler(params);
        },
      },
    },
  };
}

describe("OpenAI playtest session adapter", () => {
  it("keeps the required one-tool Responses contract", async () => {
    const input = startInput();
    const fake = fakeOpenAI(async () => ({
      id: "resp_1",
      model: "gpt-5.6",
      usage: { input_tokens: 3, output_tokens: 2, total_tokens: 5 },
      output: [
        {
          type: "function_call",
          name: "finish_design",
          arguments: { summary: "Done." },
          call_id: "call_1",
        },
      ],
    }));
    const session = new OpenAIPlaytestAgentSession({ model: "gpt-5.6", client: fake.client });
    const decision = await session.start(input);
    expect(fake.calls[0]).toMatchObject({
      model: "gpt-5.6",
      instructions: PLAYTEST_SYSTEM_PROMPT,
      tools: PLAYTEST_FUNCTION_TOOLS,
      tool_choice: "required",
      parallel_tool_calls: false,
      input: formatPlaytestStartMessage(input),
    });
    expect(decision.calls).toEqual([
      { name: "finish_design", arguments: { summary: "Done." }, callId: "call_1" },
    ]);
    expect(decision.usage).toEqual({ inputTokens: 3, outputTokens: 2, totalTokens: 5 });
  });

  it("sanitizes OpenAI auth failures", async () => {
    const fake = fakeOpenAI(async () => {
      const err = new Error("Incorrect API key provided: sk-abc123");
      (err as { status: number }).status = 401;
      throw err;
    });
    const session = new OpenAIPlaytestAgentSession({ client: fake.client });
    await expect(session.start(startInput())).rejects.toThrow(publicProviderError({ status: 401 }));
  });

  it("factory builds an OpenAI session for the default provider", async () => {
    const fake = fakeOpenAI(async () => ({
      id: "resp_1",
      output: [{ type: "function_call", name: "finish_design", arguments: {}, call_id: "c" }],
    }));
    const session = createPlaytestAgentSession({
      env: { OPENAI_API_KEY: "test-placeholder" } as NodeJS.ProcessEnv,
      openaiClient: fake.client,
    });
    const decision = await session.start(startInput());
    expect(decision.calls[0]?.name).toBe("finish_design");
    expect(session.requestedModel).toBe("gpt-5.6");
  });
});
