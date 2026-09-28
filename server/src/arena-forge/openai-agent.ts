import OpenAI from "openai";
import type {
  AgentSession,
  AgentStartInput,
  AgentToolFeedback,
  AgentTurnDecision,
} from "./agent.js";
import { formatAgentStartMessage, AGENT_SYSTEM_PROMPT } from "./agent-prompt.js";
import { AGENT_FUNCTION_TOOLS } from "./agent-tools.js";
import { MissingOpenAIKeyError } from "./openai-designer.js";
import { readOpenAIApiKey, resolveArenaForgeModel } from "./one-shot.js";
import { callsFrom, usageOf } from "./openai-playtest-agent.js";

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
