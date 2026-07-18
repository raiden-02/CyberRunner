import { cloneArenaMap } from "./actions.js";
import type { ArenaEditError } from "./actions.js";
import {
  AGENT_EDIT_TOOLS,
  AGENT_TOOL_NAMES,
  FINISH_DESIGN_TOOL,
  applyEditTool,
  parseEditToolArgs,
  parseFinishSummary,
  readIntent,
  type AgentToolOutput,
} from "./agent-tools.js";
import type { ArenaInspection } from "./inspect.js";
import { MAX_ONE_SHOT_ACTIONS } from "./one-shot.js";
import type { ArenaEvaluation, ArenaEvaluationMode, ArenaMap } from "./types.js";
import { ArenaWorkspace } from "./workspace.js";

export const MAX_AGENT_EDIT_ATTEMPTS = MAX_ONE_SHOT_ACTIONS;
/** Initial decision plus one decision after every executed edit, including edit 8. */
export const MAX_AGENT_MODEL_CALLS = MAX_AGENT_EDIT_ATTEMPTS + 1;

export type TokenUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

export type AgentToolCall = {
  name: string;
  arguments: unknown;
  callId?: string;
};

export type AgentTurnDecision = {
  responseId?: string;
  returnedModel?: string;
  latencyMs: number;
  usage?: TokenUsage;
  calls: AgentToolCall[];
};

export type AgentStartInput = {
  brief: string;
  inspection: ArenaInspection;
  maxEditAttempts: number;
  toolNames: readonly string[];
};

export type AgentToolFeedback = {
  callId?: string;
  name: string;
  output: AgentToolOutput;
};

export interface AgentSession {
  start(input: AgentStartInput): Promise<AgentTurnDecision>;
  continueWithTool(feedback: AgentToolFeedback): Promise<AgentTurnDecision>;
}

export class ScriptedAgentSession implements AgentSession {
  readonly starts: AgentStartInput[] = [];
  readonly feedbacks: AgentToolFeedback[] = [];
  private readonly queue: AgentTurnDecision[];

  constructor(turns: AgentTurnDecision[]) {
    this.queue = [...turns];
  }

  async start(input: AgentStartInput): Promise<AgentTurnDecision> {
    this.starts.push(input);
    return this.next("script has no initial decision");
  }

  async continueWithTool(feedback: AgentToolFeedback): Promise<AgentTurnDecision> {
    this.feedbacks.push(feedback);
    return this.next("script exhausted before finish");
  }

  private next(message: string): AgentTurnDecision {
    const turn = this.queue.shift();
    if (!turn) throw new Error(message);
    return turn;
  }
}

export type AgentTurnRecord = {
  turn: number;
  responseId?: string;
  callId?: string;
  tool: string;
  arguments: unknown;
  intent?: string;
  outcome?: {
    ok: boolean;
    changedIds?: string[];
    error?: ArenaEditError;
  };
  evaluationAfter?: ArenaEvaluation;
  latencyMs: number;
  usage?: TokenUsage;
};

export type AgentRunStatus =
  | "completed"
  | "budget_exhausted"
  | "model_error"
  | "invalid_model_output";

export type AgentRunResult = {
  kind: "agent";
  brief: string;
  sourceMapId?: string;
  model: {
    requested: string;
    returnedModels: string[];
  };
  initialMap: ArenaMap;
  initialEvaluation: ArenaEvaluation;
  turns: AgentTurnRecord[];
  status: AgentRunStatus;
  finishSummary?: string;
  invalidReason?: string;
  editAttempts: number;
  successfulEdits: number;
  modelCalls: number;
  totalUsage?: TokenUsage;
  totalLatencyMs: number;
  finalMap: ArenaMap;
  finalEvaluation: ArenaEvaluation;
};

function addUsage(into: TokenUsage, extra?: TokenUsage): TokenUsage {
  if (!extra) return into;
  return {
    inputTokens: (into.inputTokens ?? 0) + (extra.inputTokens ?? 0),
    outputTokens: (into.outputTokens ?? 0) + (extra.outputTokens ?? 0),
    totalTokens: (into.totalTokens ?? 0) + (extra.totalTokens ?? 0),
  };
}

const EDIT_TOOLS = new Set<string>(AGENT_EDIT_TOOLS);

export async function runAgentDesign(args: {
  map: ArenaMap;
  brief: string;
  session: AgentSession;
  mode?: ArenaEvaluationMode;
  requestedModel?: string;
}): Promise<AgentRunResult> {
  const started = Date.now();
  const workspace = new ArenaWorkspace(args.map, args.mode ?? "search_destroy");
  const initialMap = workspace.currentMap();
  const initialEvaluation = structuredClone(workspace.evaluation);
  const requested = args.requestedModel ?? "scripted";
  const returnedModels: string[] = [];
  const turns: AgentTurnRecord[] = [];
  let usage: TokenUsage = {};
  let editAttempts = 0;
  let successfulEdits = 0;
  let modelCalls = 0;

  const fail = (
    status: AgentRunStatus,
    invalidReason: string,
    extras: Partial<AgentRunResult> = {},
  ): AgentRunResult => ({
    kind: "agent",
    brief: args.brief,
    sourceMapId: initialMap.sourceMapId,
    model: { requested, returnedModels },
    initialMap,
    initialEvaluation,
    turns,
    status,
    invalidReason,
    editAttempts,
    successfulEdits,
    modelCalls,
    totalUsage: usage,
    totalLatencyMs: Date.now() - started,
    finalMap: workspace.currentMap(),
    finalEvaluation: structuredClone(workspace.evaluation),
    ...extras,
  });

  let decision: AgentTurnDecision;
  try {
    decision = await args.session.start({
      brief: args.brief,
      inspection: workspace.inspect(),
      maxEditAttempts: MAX_AGENT_EDIT_ATTEMPTS,
      toolNames: AGENT_TOOL_NAMES,
    });
  } catch (err) {
    return fail("model_error", err instanceof Error ? err.message : String(err));
  }

  while (true) {
    modelCalls += 1;
    if (decision.returnedModel) returnedModels.push(decision.returnedModel);
    usage = addUsage(usage, decision.usage);

    if (modelCalls > MAX_AGENT_MODEL_CALLS) {
      return fail("budget_exhausted", `model calls exceeded MAX_AGENT_MODEL_CALLS (${MAX_AGENT_MODEL_CALLS})`);
    }

    if (decision.calls.length !== 1) {
      return fail(
        "invalid_model_output",
        `turn must contain exactly one tool call, got ${decision.calls.length}`,
      );
    }

    const call = decision.calls[0];
    const intent = readIntent(call.arguments);
    const record: AgentTurnRecord = {
      turn: turns.length + 1,
      responseId: decision.responseId,
      callId: call.callId,
      tool: call.name,
      arguments: call.arguments,
      intent,
      latencyMs: decision.latencyMs,
      usage: decision.usage,
    };

    if (call.name === FINISH_DESIGN_TOOL) {
      const summary = parseFinishSummary(call.arguments);
      if (summary === undefined) {
        turns.push(record);
        return fail("invalid_model_output", "finish_design requires a summary string");
      }
      record.evaluationAfter = structuredClone(workspace.evaluation);
      turns.push(record);
      return {
        kind: "agent",
        brief: args.brief,
        sourceMapId: initialMap.sourceMapId,
        model: { requested, returnedModels },
        initialMap,
        initialEvaluation,
        turns,
        status: "completed",
        finishSummary: summary,
        editAttempts,
        successfulEdits,
        modelCalls,
        totalUsage: usage,
        totalLatencyMs: Date.now() - started,
        finalMap: workspace.currentMap(),
        finalEvaluation: structuredClone(workspace.evaluation),
      };
    }

    if (!EDIT_TOOLS.has(call.name)) {
      turns.push(record);
      return fail("invalid_model_output", `unknown tool: ${call.name}`);
    }

    if (editAttempts >= MAX_AGENT_EDIT_ATTEMPTS) {
      record.evaluationAfter = structuredClone(workspace.evaluation);
      turns.push(record);
      return fail(
        "budget_exhausted",
        `edit attempts reached MAX_AGENT_EDIT_ATTEMPTS (${MAX_AGENT_EDIT_ATTEMPTS})`,
      );
    }

    const parsed = parseEditToolArgs(call.name, call.arguments);
    if (typeof parsed === "string") {
      turns.push(record);
      return fail("invalid_model_output", parsed);
    }

    const output = applyEditTool(workspace, parsed);
    editAttempts += 1;
    if (output.ok) successfulEdits += 1;
    record.outcome = output.ok
      ? { ok: true, changedIds: output.changedIds }
      : { ok: false, error: output.error };
    record.evaluationAfter = structuredClone(workspace.evaluation);
    turns.push(record);

    try {
      decision = await args.session.continueWithTool({
        callId: call.callId,
        name: call.name,
        output,
      });
    } catch (err) {
      return fail("model_error", err instanceof Error ? err.message : String(err));
    }
  }
}
