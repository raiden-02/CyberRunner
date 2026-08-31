import { describe, expect, it } from "vitest";
import { getGameplayMap } from "@shared/world/map-registry.js";
import {
  AnthropicPlaytestAgentSession,
  type AnthropicCreateParams,
  type AnthropicCreateResult,
  type AnthropicMessagesClient,
} from "../src/arena-forge/anthropic-playtest-agent.js";
import { anthropicToolsFromPlaytest } from "../src/arena-forge/anthropic-tools.js";
import { importGameplayMap } from "../src/arena-forge/import-map.js";
import {
  PLAYTEST_FUNCTION_TOOLS,
  PLAYTEST_SYSTEM_PROMPT,
  PLAYTEST_TOOL_NAMES,
  formatPlaytestStartMessage,
  runPlaytestAgentDesign,
  type PlaytestAgentStartInput,
} from "../src/arena-forge/playtest-agent.js";
import { compactP0, viewFromAgentResult } from "../src/arena-forge/design-view.js";
import { createPlaytestAgentSession } from "../src/arena-forge/playtest-session-factory.js";
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

function toolUseResult(overrides?: Partial<AnthropicCreateResult>): AnthropicCreateResult {
  return {
    id: "msg_1",
    model: "claude-sonnet-5",
    content: [
      {
        type: "tool_use",
        id: "toolu_1",
        name: "run_playtest",
        input: { intent: "check routes" },
      },
    ],
    usage: { input_tokens: 11, output_tokens: 7 },
    ...overrides,
  };
}

function fakeClient(
  responses: AnthropicCreateResult[],
): { client: AnthropicMessagesClient; calls: AnthropicCreateParams[] } {
  const calls: AnthropicCreateParams[] = [];
  return {
    calls,
    client: {
      messages: {
        async create(params) {
          calls.push(structuredClone(params));
          const next = responses.shift();
          if (!next) throw new Error("unexpected Anthropic request");
          return next;
        },
      },
    },
  };
}

describe("Anthropic playtest session adapter", () => {
  it("sends the shared system prompt, start message, and converted tools", async () => {
    const input = startInput();
    const fake = fakeClient([toolUseResult()]);
    const session = new AnthropicPlaytestAgentSession({
      model: "claude-sonnet-5",
      client: fake.client,
    });
    await session.start(input);
    expect(fake.calls).toHaveLength(1);
    const req = fake.calls[0]!;
    expect(req.system).toBe(PLAYTEST_SYSTEM_PROMPT);
    expect(req.model).toBe("claude-sonnet-5");
    expect(req.tool_choice).toEqual({ type: "any", disable_parallel_tool_use: true });
    expect(req.messages[0]).toEqual({ role: "user", content: formatPlaytestStartMessage(input) });
    expect(req.tools.map((t) => t.name)).toEqual([...PLAYTEST_TOOL_NAMES]);
  });

  it("normalizes tool_use into AgentToolCall and usage", async () => {
    const fake = fakeClient([toolUseResult()]);
    const session = new AnthropicPlaytestAgentSession({ client: fake.client });
    const decision = await session.start(startInput());
    expect(decision.calls).toEqual([
      { name: "run_playtest", arguments: { intent: "check routes" }, callId: "toolu_1" },
    ]);
    expect(decision.returnedModel).toBe("claude-sonnet-5");
    expect(decision.usage).toEqual({ inputTokens: 11, outputTokens: 7, totalTokens: 18 });
    expect(decision.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("continues with the matching tool_use_id and keeps assistant history", async () => {
    const fake = fakeClient([
      toolUseResult(),
      toolUseResult({
        id: "msg_2",
        content: [
          { type: "tool_use", id: "toolu_2", name: "finish_design", input: { summary: "Done." } },
        ],
      }),
    ]);
    const session = new AnthropicPlaytestAgentSession({ client: fake.client });
    await session.start(startInput());
    await session.continueWithTool({
      callId: "toolu_1",
      name: "run_playtest",
      output: { ok: true, playtest: { seed: 1 } as never, inspection: {} as never },
    });
    expect(fake.calls).toHaveLength(2);
    const second = fake.calls[1]!;
    expect(second.messages[0]?.role).toBe("user");
    expect(second.messages[1]).toEqual({
      role: "assistant",
      content: [
        {
          type: "tool_use",
          id: "toolu_1",
          name: "run_playtest",
          input: { intent: "check routes" },
        },
      ],
    });
    expect(second.messages[2]).toEqual({
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: "toolu_1",
          content: expect.stringContaining("\"ok\":true"),
        },
      ],
    });
  });

  it("preserves Anthropic assistant blocks across tool turns", async () => {
    const thinkingContent = [
      {
        type: "thinking",
        thinking: "opaque-reasoning-fixture",
        signature: "sig-fixture-aaa111",
      },
      {
        type: "tool_use",
        id: "toolu_1",
        name: "finish_design",
        input: { summary: "Done." },
      },
    ];
    const redactedContent = [
      {
        type: "redacted_thinking",
        data: "encrypted-redacted-fixture",
        signature: "sig-fixture-bbb222",
      },
      {
        type: "tool_use",
        id: "toolu_2",
        name: "finish_design",
        input: { summary: "Still done." },
      },
    ];
    const first = toolUseResult({ content: thinkingContent });
    const fake = fakeClient([
      first,
      toolUseResult({ id: "msg_2", content: redactedContent }),
      toolUseResult({
        id: "msg_3",
        content: [{ type: "tool_use", id: "toolu_3", name: "finish_design", input: { summary: "x" } }],
      }),
    ]);
    const session = new AnthropicPlaytestAgentSession({ client: fake.client });
    const firstDecision = await session.start(startInput());
    expect(firstDecision.calls).toEqual([
      { name: "finish_design", arguments: { summary: "Done." }, callId: "toolu_1" },
    ]);
    expect(JSON.stringify(firstDecision)).not.toMatch(
      /thinking|redacted_thinking|opaque-reasoning-fixture|sig-fixture|encrypted-redacted-fixture/,
    );

    await session.continueWithTool({
      callId: "toolu_1",
      name: "finish_design",
      output: { ok: true } as never,
    });
    expect(fake.calls[1]!.messages[1]).toEqual({
      role: "assistant",
      content: thinkingContent,
    });
    expect(fake.calls[1]!.messages[1]?.content).toEqual(first.content);

    await session.continueWithTool({
      callId: "toolu_2",
      name: "finish_design",
      output: { ok: true } as never,
    });
    expect(fake.calls[2]!.messages[3]).toEqual({
      role: "assistant",
      content: redactedContent,
    });
  });

  it("keeps thinking blocks out of the public design view", async () => {
    const fake = fakeClient([
      toolUseResult({
        content: [
          {
            type: "thinking",
            thinking: "opaque-reasoning-fixture",
            signature: "sig-fixture-aaa111",
          },
          {
            type: "tool_use",
            id: "toolu_1",
            name: "finish_design",
            input: { summary: "Finish after observing routes." },
          },
        ],
      }),
    ]);
    const map = importGameplayMap(getGameplayMap("map-contract-smoke"));
    const result = await runPlaytestAgentDesign({
      map,
      brief: "Finish.",
      session: new AnthropicPlaytestAgentSession({ client: fake.client }),
    });
    const view = viewFromAgentResult({
      jobId: "job-public",
      source: "live",
      startingMapId: "map-contract-smoke",
      brief: "Finish.",
      status: "completed",
      result,
      initialP0: compactP0(result.initialEvaluation),
      playOriginalId: "job:job-public:initial",
      playResultId: "job:job-public:final",
      initialMap: map,
    });
    const publicText = JSON.stringify({ turns: result.turns, view });
    expect(publicText).not.toMatch(/"type":"thinking"|redacted_thinking|opaque-reasoning-fixture|sig-fixture-aaa111/);
    expect(view.turns[0]?.tool).toBe("finish_design");
  });

  it("does not silently repair multiple tool calls", async () => {
    const fake = fakeClient([
      toolUseResult({
        content: [
          { type: "tool_use", id: "a", name: "run_playtest", input: { intent: "one" } },
          { type: "tool_use", id: "b", name: "finish_design", input: { summary: "two" } },
        ],
      }),
    ]);
    const session = new AnthropicPlaytestAgentSession({ client: fake.client });
    const decision = await session.start(startInput());
    expect(decision.calls).toHaveLength(2);
  });

  it("lets the existing invalid-output path reject a no-tool turn", async () => {
    const fake = fakeClient([
      {
        id: "msg_text",
        model: "claude-sonnet-5",
        content: [{ type: "text", text: "I will think first." }],
      },
    ]);
    const result = await runPlaytestAgentDesign({
      map: importGameplayMap(getGameplayMap("map-contract-smoke")),
      brief: "No tools.",
      session: new AnthropicPlaytestAgentSession({ client: fake.client }),
    });
    expect(result.status).toBe("invalid_model_output");
    expect(result.invalidReason).toMatch(/exactly one tool call, got 0/);
  });

  it("factory builds an Anthropic session for the selected provider", async () => {
    const fake = fakeClient([toolUseResult()]);
    const session = createPlaytestAgentSession({
      env: {
        ARENA_FORGE_PROVIDER: "anthropic",
        ANTHROPIC_API_KEY: "test-placeholder",
      } as NodeJS.ProcessEnv,
      anthropicClient: fake.client,
    });
    const decision = await session.start(startInput());
    expect(decision.calls[0]?.name).toBe("run_playtest");
    expect(session.requestedModel).toBe("claude-sonnet-5");
  });
});

describe("tool schema conversion parity", () => {
  it("keeps the same logical tool names and required arguments", () => {
    const converted = anthropicToolsFromPlaytest();
    expect(converted.map((t) => t.name)).toEqual([...PLAYTEST_TOOL_NAMES]);
    expect(converted).toHaveLength(8);
    for (const source of PLAYTEST_FUNCTION_TOOLS) {
      const dest = converted.find((t) => t.name === source.name);
      expect(dest, source.name).toBeTruthy();
      expect(dest!.description).toBe(source.description);
      expect(dest!.input_schema.required).toEqual(source.parameters.required);
      expect(dest!.input_schema.properties).toEqual(source.parameters.properties);
      expect(dest).not.toHaveProperty("strict");
      expect(dest).not.toHaveProperty("allowed_callers");
      expect(dest).not.toHaveProperty("type");
    }
  });
});
