import OpenAI from "openai";
import {
  ONE_SHOT_PROPOSAL_SCHEMA,
  missingOpenAIKeyMessage,
  readOpenAIApiKey,
  resolveArenaForgeModel,
  type OneShotDesignInput,
  type OneShotDesigner,
  type OneShotDesignerResult,
} from "./one-shot.js";
import { ONE_SHOT_SYSTEM_PROMPT, formatOneShotUserMessage } from "./prompt.js";

export class MissingOpenAIKeyError extends Error {
  constructor() {
    super(missingOpenAIKeyMessage());
    this.name = "MissingOpenAIKeyError";
  }
}

/** Direct Responses API adapter. One call per propose(). */
export class OpenAIOneShotDesigner implements OneShotDesigner {
  readonly requestedModel: string;
  private readonly apiKey: string;

  constructor(opts?: { apiKey?: string; model?: string }) {
    const key = opts?.apiKey ?? readOpenAIApiKey();
    if (!key) throw new MissingOpenAIKeyError();
    this.apiKey = key;
    this.requestedModel = opts?.model ?? resolveArenaForgeModel();
  }

  async propose(input: OneShotDesignInput): Promise<OneShotDesignerResult> {
    const client = new OpenAI({ apiKey: this.apiKey });
    const started = Date.now();
    const response = await client.responses.create({
      model: this.requestedModel,
      instructions: ONE_SHOT_SYSTEM_PROMPT,
      input: formatOneShotUserMessage(input),
      text: {
        format: {
          type: "json_schema",
          name: "one_shot_design",
          strict: true,
          schema: ONE_SHOT_PROPOSAL_SCHEMA,
        },
      },
    });
    const latencyMs = Date.now() - started;

    let raw: unknown = response.output_text;
    if (typeof raw === "string" && raw.length > 0) {
      try {
        raw = JSON.parse(raw);
      } catch {
        raw = { _unparsed: raw };
      }
    }

    return {
      raw,
      model: {
        requested: this.requestedModel,
        returned: typeof response.model === "string" ? response.model : undefined,
        responseId: response.id,
      },
      usage: response.usage
        ? {
            inputTokens: response.usage.input_tokens,
            outputTokens: response.usage.output_tokens,
            totalTokens: response.usage.total_tokens,
          }
        : undefined,
      latencyMs,
    };
  }
}
