import Anthropic from "@anthropic-ai/sdk";
import type { AgentToolCall, AgentTurnDecision, TokenUsage } from "./agent.js";
import { anthropicToolsFromPlaytest, type AnthropicToolSchema } from "./anthropic-tools.js";
import {
  PLAYTEST_SYSTEM_PROMPT,
  formatPlaytestStartMessage,
  type PlaytestAgentSession,
  type PlaytestAgentStartInput,
  type PlaytestAgentToolFeedback,
} from "./playtest-agent.js";
import { DEFAULT_ANTHROPIC_MODEL, publicProviderError, readAnthropicApiKey } from "./provider.js";

export type AnthropicContentBlock = {
  type: string;
  id?: string;
  name?: string;
  input?: unknown;
  text?: string;
  tool_use_id?: string;
  content?: string;
};

export type AnthropicMessageParam = {
  role: "user" | "assistant";
  content: string | AnthropicContentBlock[];
};

export type AnthropicCreateParams = {
  model: string;
  max_tokens: number;
  system: string;
  tools: AnthropicToolSchema[];
  tool_choice: { type: "any"; disable_parallel_tool_use: true };
  messages: AnthropicMessageParam[];
};

export type AnthropicCreateResult = {
  id: string;
  model?: string;
  content: AnthropicContentBlock[];
  usage?: { input_tokens?: number; output_tokens?: number };
};

export type AnthropicMessagesClient = {
  messages: {
    create(params: AnthropicCreateParams): Promise<AnthropicCreateResult>;
  };
};

export class MissingAnthropicKeyError extends Error {
  constructor() {
    super("ANTHROPIC_API_KEY is not set.");
    this.name = "MissingAnthropicKeyError";
  }
}

function usageOf(response: AnthropicCreateResult): TokenUsage | undefined {
  if (!response.usage) return undefined;
  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;
  const total =
    inputTokens !== undefined || outputTokens !== undefined
      ? (inputTokens ?? 0) + (outputTokens ?? 0)
      : undefined;
  return { inputTokens, outputTokens, totalTokens: total };
}

function callsFrom(content: AnthropicContentBlock[]): AgentToolCall[] {
  const calls: AgentToolCall[] = [];
  for (const block of content) {
    if (block.type !== "tool_use") continue;
    calls.push({
      name: block.name ?? "",
      arguments: block.input,
      callId: block.id,
    });
  }
  return calls;
}

function publicAssistantContent(content: AnthropicContentBlock[]): AnthropicContentBlock[] {
  return content.filter((block) => block.type !== "thinking" && block.type !== "redacted_thinking");
}

/** Messages session. Same ArenaForge tools and prompt as the OpenAI adapter. */
export class AnthropicPlaytestAgentSession implements PlaytestAgentSession {
  readonly requestedModel: string;
  private readonly client: AnthropicMessagesClient;
  private readonly messages: AnthropicMessageParam[] = [];

  constructor(opts?: { apiKey?: string; model?: string; client?: AnthropicMessagesClient }) {
    if (opts?.client) {
      this.client = opts.client;
    } else {
      const key = opts?.apiKey ?? readAnthropicApiKey();
      if (!key) throw new MissingAnthropicKeyError();
      this.client = new Anthropic({ apiKey: key }) as unknown as AnthropicMessagesClient;
    }
    this.requestedModel = opts?.model ?? DEFAULT_ANTHROPIC_MODEL;
  }

  async start(input: PlaytestAgentStartInput): Promise<AgentTurnDecision> {
    this.messages.length = 0;
    this.messages.push({
      role: "user",
      content: formatPlaytestStartMessage(input),
    });
    return this.request();
  }

  async continueWithTool(feedback: PlaytestAgentToolFeedback): Promise<AgentTurnDecision> {
    if (this.messages.length === 0) throw new Error("continueWithTool called before start");
    this.messages.push({
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: feedback.callId ?? "",
          content: JSON.stringify(feedback.output),
        },
      ],
    });
    return this.request();
  }

  private async request(): Promise<AgentTurnDecision> {
    const started = Date.now();
    let response: AnthropicCreateResult;
    try {
      response = await this.client.messages.create({
        model: this.requestedModel,
        max_tokens: 4096,
        system: PLAYTEST_SYSTEM_PROMPT,
        tools: anthropicToolsFromPlaytest(),
        tool_choice: { type: "any", disable_parallel_tool_use: true },
        messages: this.messages,
      });
    } catch (err) {
      throw new Error(publicProviderError(err));
    }

    this.messages.push({
      role: "assistant",
      content: publicAssistantContent(response.content),
    });

    return {
      responseId: response.id,
      returnedModel: typeof response.model === "string" ? response.model : undefined,
      latencyMs: Date.now() - started,
      usage: usageOf(response),
      calls: callsFrom(response.content),
    };
  }
}
