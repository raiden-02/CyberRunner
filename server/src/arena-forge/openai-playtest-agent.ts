import OpenAI from "openai";
import type { AgentToolCall, AgentTurnDecision, TokenUsage } from "./agent.js";
import { MissingOpenAIKeyError } from "./openai-designer.js";
import { readOpenAIApiKey, resolveArenaForgeModel } from "./one-shot.js";
import {
  PLAYTEST_FUNCTION_TOOLS,
  PLAYTEST_SYSTEM_PROMPT,
  formatPlaytestStartMessage,
  type PlaytestAgentSession,
  type PlaytestAgentStartInput,
  type PlaytestAgentToolFeedback,
} from "./playtest-agent.js";
import { publicProviderError } from "./provider.js";

export type OpenAIResponsesCreateParams = {
  model: string;
  instructions: string;
  tools: unknown;
  tool_choice: "required";
  parallel_tool_calls: false;
  store: true;
  input: string | Array<{ type: "function_call_output"; call_id?: string; output: string }>;
  previous_response_id?: string;
};

export type OpenAIResponsesClient = {
  responses: {
    create(params: OpenAIResponsesCreateParams): Promise<{
      id: string;
      model?: string;
      usage?: { input_tokens: number; output_tokens: number; total_tokens: number };
      output?: Array<{ type: string }>;
    }>;
  };
};

function usageOf(response: { usage?: { input_tokens: number; output_tokens: number; total_tokens: number } }): TokenUsage | undefined {
  if (!response.usage) return undefined;
  return {
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    totalTokens: response.usage.total_tokens,
  };
}

function callsFrom(output: Array<{ type: string }> | undefined): AgentToolCall[] {
  const calls: AgentToolCall[] = [];
  for (const item of output ?? []) {
    if (item.type !== "function_call") continue;
    const call = item as { name?: string; arguments?: unknown; call_id?: string };
    let args: unknown = call.arguments;
    if (typeof call.arguments === "string") {
      try {
        args = JSON.parse(call.arguments);
      } catch {
        args = { _unparsed: call.arguments };
      }
    }
    calls.push({ name: call.name ?? "", arguments: args, callId: call.call_id });
  }
  return calls;
}

/** P5 Responses session. Does not use the frozen P3 prompt. */
export class OpenAIPlaytestAgentSession implements PlaytestAgentSession {
  readonly requestedModel: string;
  private readonly client: OpenAIResponsesClient;
  private previousResponseId: string | undefined;

  constructor(opts?: { apiKey?: string; model?: string; client?: OpenAIResponsesClient }) {
    if (opts?.client) {
      this.client = opts.client;
    } else {
      const key = opts?.apiKey ?? readOpenAIApiKey();
      if (!key) throw new MissingOpenAIKeyError();
      this.client = new OpenAI({ apiKey: key }) as unknown as OpenAIResponsesClient;
    }
    this.requestedModel = opts?.model ?? resolveArenaForgeModel();
  }

  async start(input: PlaytestAgentStartInput): Promise<AgentTurnDecision> {
    return this.request({
      input: formatPlaytestStartMessage(input),
    });
  }

  async continueWithTool(feedback: PlaytestAgentToolFeedback): Promise<AgentTurnDecision> {
    if (!this.previousResponseId) throw new Error("continueWithTool called before start");
    return this.request({
      previous_response_id: this.previousResponseId,
      input: [
        {
          type: "function_call_output",
          call_id: feedback.callId,
          output: JSON.stringify(feedback.output),
        },
      ],
    });
  }

  private async request(body: {
    input: string | Array<{ type: "function_call_output"; call_id?: string; output: string }>;
    previous_response_id?: string;
  }): Promise<AgentTurnDecision> {
    const started = Date.now();
    let response: Awaited<ReturnType<OpenAIResponsesClient["responses"]["create"]>>;
    try {
      response = await this.client.responses.create({
        model: this.requestedModel,
        instructions: PLAYTEST_SYSTEM_PROMPT,
        tools: PLAYTEST_FUNCTION_TOOLS,
        tool_choice: "required",
        parallel_tool_calls: false,
        store: true,
        ...body,
      });
    } catch (err) {
      throw new Error(publicProviderError(err));
    }
    this.previousResponseId = response.id;
    return {
      responseId: response.id,
      returnedModel: typeof response.model === "string" ? response.model : undefined,
      latencyMs: Date.now() - started,
      usage: usageOf(response),
      calls: callsFrom(response.output),
    };
  }
}
