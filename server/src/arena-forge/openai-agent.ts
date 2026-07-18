import OpenAI from "openai";
import type {
  AgentSession,
  AgentStartInput,
  AgentToolCall,
  AgentToolFeedback,
  AgentTurnDecision,
  TokenUsage,
} from "./agent.js";
import { formatAgentStartMessage, AGENT_SYSTEM_PROMPT } from "./agent-prompt.js";
import { AGENT_FUNCTION_TOOLS } from "./agent-tools.js";
import { MissingOpenAIKeyError } from "./openai-designer.js";
import { readOpenAIApiKey, resolveArenaForgeModel } from "./one-shot.js";

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

/** Responses API session. previous_response_id + function_call_output. One tool per turn. */
export class OpenAIAgentSession implements AgentSession {
  readonly requestedModel: string;
  private readonly client: OpenAI;
  private previousResponseId: string | undefined;

  constructor(opts?: { apiKey?: string; model?: string }) {
    const key = opts?.apiKey ?? readOpenAIApiKey();
    if (!key) throw new MissingOpenAIKeyError();
    this.client = new OpenAI({ apiKey: key });
    this.requestedModel = opts?.model ?? resolveArenaForgeModel();
  }

  async start(input: AgentStartInput): Promise<AgentTurnDecision> {
    return this.request({
      input: formatAgentStartMessage(input.brief, input.inspection, input.maxEditAttempts),
    });
  }

  async continueWithTool(feedback: AgentToolFeedback): Promise<AgentTurnDecision> {
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
    const response = await this.client.responses.create({
      model: this.requestedModel,
      instructions: AGENT_SYSTEM_PROMPT,
      tools: AGENT_FUNCTION_TOOLS,
      tool_choice: "required",
      parallel_tool_calls: false,
      store: true,
      ...body,
    });
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
