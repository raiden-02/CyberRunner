import type { ArenaEditError } from "./actions.js";
import {
  AGENT_EDIT_TOOLS,
  AGENT_FUNCTION_TOOLS,
  FINISH_DESIGN_TOOL,
  applyEditTool,
  parseEditToolArgs,
  parseFinishSummary,
  readIntent,
  type AgentToolOutput,
} from "./agent-tools.js";
import type { AgentStartInput, AgentTurnDecision, TokenUsage } from "./agent.js";
import type { ArenaInspection } from "./inspect.js";
import {
  PLAYTEST_ROLLOUTS,
  PLAYTEST_SEED,
  runPlaytest,
  type ArenaPlaytestReport,
} from "./playtest.js";
import type { ArenaEvaluation, ArenaEvaluationMode, ArenaMap } from "./types.js";
import { ArenaWorkspace } from "./workspace.js";

export const MAX_PLAYTEST_EDIT_ATTEMPTS = 8;
export const MAX_PLAYTEST_CALLS = 3;
export const MAX_PLAYTEST_MODEL_CALLS = 12;
export const RUN_PLAYTEST_TOOL = "run_playtest";

export const PLAYTEST_TOOL_NAMES = [
  ...AGENT_EDIT_TOOLS,
  RUN_PLAYTEST_TOOL,
  FINISH_DESIGN_TOOL,
] as const;

export const PLAYTEST_SYSTEM_PROMPT = `You are a multiplayer FPS Search & Destroy level-design agent for CyberRunner.

Map units are meters. Solids are axis-aligned boxes. Tool IDs must match the current inspection.

P0 geometry, navigation, spawn, and LOS facts are deterministic measurements of the current map.

run_playtest is a seeded scripted-playtest proxy. It is not human play, combat AI, or a universal quality score. Use it when route choice, arrival timing, exposure, or first-contact location could inform the design. Do not call it on every turn. The same seed and rollout count are reused, so later reports are paired with earlier ones.

Call exactly one tool per turn. After an edit you receive a fresh P0 inspection. After a playtest you receive the compact report plus current P0 facts. Preserve useful properties while addressing the brief.

Newly created IDs exist only after they appear in a tool result. Do not guess future IDs.

Call finish_design when further edits are unlikely to improve the design. The summary is a short public conclusion, not a scratchpad.`;

const RUN_PLAYTEST_SCHEMA = {
  type: "function" as const,
  name: RUN_PLAYTEST_TOOL,
  description:
    "Run the fixed-seed scripted playtest on the current map. Read-only. Seed and rollout count are not caller-chosen.",
  strict: true,
  allowed_callers: ["direct" as const],
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["intent"],
    properties: { intent: { type: ["string", "null"] as const } },
  },
};

export const PLAYTEST_FUNCTION_TOOLS = [
  ...AGENT_FUNCTION_TOOLS.filter((t) => t.name !== FINISH_DESIGN_TOOL),
  RUN_PLAYTEST_SCHEMA,
  AGENT_FUNCTION_TOOLS.find((t) => t.name === FINISH_DESIGN_TOOL)!,
];

export type PlaytestAgentStartInput = AgentStartInput & {
  maxPlaytestCalls: number;
  playtestSeed: number;
  playtestRollouts: number;
};

export type PlaytestToolOutput =
  | AgentToolOutput
  | { ok: true; playtest: ArenaPlaytestReport; inspection: ArenaInspection };

export type PlaytestAgentToolFeedback = {
  callId?: string;
  name: string;
  output: PlaytestToolOutput;
};

export interface PlaytestAgentSession {
  readonly requestedModel?: string;
  start(input: PlaytestAgentStartInput): Promise<AgentTurnDecision>;
  continueWithTool(feedback: PlaytestAgentToolFeedback): Promise<AgentTurnDecision>;
}

export class ScriptedPlaytestSession implements PlaytestAgentSession {
  readonly starts: PlaytestAgentStartInput[] = [];
  readonly feedbacks: PlaytestAgentToolFeedback[] = [];
  private readonly queue: AgentTurnDecision[];

  constructor(turns: AgentTurnDecision[]) {
    this.queue = [...turns];
  }

  async start(input: PlaytestAgentStartInput): Promise<AgentTurnDecision> {
    this.starts.push(input);
    return this.next("script has no initial decision");
  }

  async continueWithTool(feedback: PlaytestAgentToolFeedback): Promise<AgentTurnDecision> {
    this.feedbacks.push(feedback);
    return this.next("script exhausted before finish");
  }

  remaining(): number {
    return this.queue.length;
  }

  private next(message: string): AgentTurnDecision {
    const turn = this.queue.shift();
    if (!turn) throw new Error(message);
    return turn;
  }
}

export function formatPlaytestStartMessage(input: PlaytestAgentStartInput): string {
  return [
    `Designer brief:\n${input.brief}`,
    `Tools (exactly one per turn): ${PLAYTEST_TOOL_NAMES.join(", ")}.`,
    `Edit-attempt budget: ${input.maxEditAttempts}. Rejected edits count. finish_design does not.`,
    `Playtest budget: ${input.maxPlaytestCalls}. Seed ${input.playtestSeed}. Rollouts ${input.playtestRollouts}.`,
    `Current inspection:\n${JSON.stringify(input.inspection)}`,
  ].join("\n\n");
}

export type PlaytestAgentTurnRecord = {
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
  playtest?: ArenaPlaytestReport;
  latencyMs: number;
  usage?: TokenUsage;
};

export type PlaytestAgentRunStatus =
  | "completed"
  | "budget_exhausted"
  | "model_error"
  | "invalid_model_output";

export type PlaytestAgentRunResult = {
  kind: "playtest_agent";
  brief: string;
  sourceMapId?: string;
  model: {
    requested: string;
    returnedModels: string[];
  };
  initialMap: ArenaMap;
  initialEvaluation: ArenaEvaluation;
  turns: PlaytestAgentTurnRecord[];
  status: PlaytestAgentRunStatus;
  finishSummary?: string;
  invalidReason?: string;
  editAttempts: number;
  successfulEdits: number;
  playtestCalls: number;
  modelCalls: number;
  totalUsage?: TokenUsage;
  totalLatencyMs: number;
  finalMap: ArenaMap;
  finalEvaluation: ArenaEvaluation;
  lastPlaytest?: ArenaPlaytestReport;
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

export async function runPlaytestAgentDesign(args: {
  map: ArenaMap;
  brief: string;
  session: PlaytestAgentSession;
  mode?: ArenaEvaluationMode;
  requestedModel?: string;
  playtestSeed?: number;
  playtestRollouts?: number;
  /** Observe after a turn is recorded. Must not change decisions, budgets, or the map. */
  onTurn?: (turn: PlaytestAgentTurnRecord) => void;
}): Promise<PlaytestAgentRunResult> {
  const started = Date.now();
  const workspace = new ArenaWorkspace(args.map, args.mode ?? "search_destroy");
  const initialMap = workspace.currentMap();
  const initialEvaluation = structuredClone(workspace.evaluation);
  const requested = args.requestedModel ?? "scripted";
  const playtestSeed = args.playtestSeed ?? PLAYTEST_SEED;
  const playtestRollouts = args.playtestRollouts ?? PLAYTEST_ROLLOUTS;
  const returnedModels: string[] = [];
  const turns: PlaytestAgentTurnRecord[] = [];
  let usage: TokenUsage = {};
  let editAttempts = 0;
  let successfulEdits = 0;
  let playtestCalls = 0;
  let modelCalls = 0;
  let lastPlaytest: ArenaPlaytestReport | undefined;

  const commitTurn = (record: PlaytestAgentTurnRecord): void => {
    turns.push(record);
    try {
      args.onTurn?.(record);
    } catch {
      // Observer failures must not change the run.
    }
  };

  const fail = (
    status: PlaytestAgentRunStatus,
    invalidReason: string,
    extras: Partial<PlaytestAgentRunResult> = {},
  ): PlaytestAgentRunResult => ({
    kind: "playtest_agent",
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
    playtestCalls,
    modelCalls,
    totalUsage: usage,
    totalLatencyMs: Date.now() - started,
    finalMap: workspace.currentMap(),
    finalEvaluation: structuredClone(workspace.evaluation),
    ...(lastPlaytest ? { lastPlaytest } : {}),
    ...extras,
  });

  let decision: AgentTurnDecision;
  try {
    decision = await args.session.start({
      brief: args.brief,
      inspection: workspace.inspect(),
      maxEditAttempts: MAX_PLAYTEST_EDIT_ATTEMPTS,
      toolNames: PLAYTEST_TOOL_NAMES,
      maxPlaytestCalls: MAX_PLAYTEST_CALLS,
      playtestSeed,
      playtestRollouts,
    });
  } catch (err) {
    return fail("model_error", err instanceof Error ? err.message : String(err));
  }

  while (true) {
    modelCalls += 1;
    if (decision.returnedModel) returnedModels.push(decision.returnedModel);
    usage = addUsage(usage, decision.usage);

    if (modelCalls > MAX_PLAYTEST_MODEL_CALLS) {
      return fail(
        "budget_exhausted",
        `model calls exceeded MAX_PLAYTEST_MODEL_CALLS (${MAX_PLAYTEST_MODEL_CALLS})`,
      );
    }

    if (decision.calls.length !== 1) {
      return fail(
        "invalid_model_output",
        `turn must contain exactly one tool call, got ${decision.calls.length}`,
      );
    }

    const call = decision.calls[0]!;
    const intent = readIntent(call.arguments);
    const record: PlaytestAgentTurnRecord = {
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
        commitTurn(record);
        return fail("invalid_model_output", "finish_design requires a summary string");
      }
      record.evaluationAfter = structuredClone(workspace.evaluation);
      commitTurn(record);
      return {
        kind: "playtest_agent",
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
        playtestCalls,
        modelCalls,
        totalUsage: usage,
        totalLatencyMs: Date.now() - started,
        finalMap: workspace.currentMap(),
        finalEvaluation: structuredClone(workspace.evaluation),
        ...(lastPlaytest ? { lastPlaytest } : {}),
      };
    }

    if (call.name === RUN_PLAYTEST_TOOL) {
      if (playtestCalls >= MAX_PLAYTEST_CALLS) {
        record.evaluationAfter = structuredClone(workspace.evaluation);
        commitTurn(record);
        return fail(
          "budget_exhausted",
          `playtest calls reached MAX_PLAYTEST_CALLS (${MAX_PLAYTEST_CALLS})`,
        );
      }
      const playtest = runPlaytest(workspace.currentMap(), {
        seed: playtestSeed,
        rollouts: playtestRollouts,
      });
      playtestCalls += 1;
      lastPlaytest = playtest;
      record.playtest = playtest;
      record.evaluationAfter = structuredClone(workspace.evaluation);
      record.outcome = { ok: true };
      commitTurn(record);

      const output: PlaytestToolOutput = {
        ok: true,
        playtest,
        inspection: workspace.inspect(),
      };
      try {
        decision = await args.session.continueWithTool({
          callId: call.callId,
          name: call.name,
          output,
        });
      } catch (err) {
        return fail("model_error", err instanceof Error ? err.message : String(err));
      }
      continue;
    }

    if (!EDIT_TOOLS.has(call.name)) {
      commitTurn(record);
      return fail("invalid_model_output", `unknown tool: ${call.name}`);
    }

    if (editAttempts >= MAX_PLAYTEST_EDIT_ATTEMPTS) {
      record.evaluationAfter = structuredClone(workspace.evaluation);
      commitTurn(record);
      return fail(
        "budget_exhausted",
        `edit attempts reached MAX_PLAYTEST_EDIT_ATTEMPTS (${MAX_PLAYTEST_EDIT_ATTEMPTS})`,
      );
    }

    const parsed = parseEditToolArgs(call.name, call.arguments);
    if (typeof parsed === "string") {
      commitTurn(record);
      return fail("invalid_model_output", parsed);
    }

    const output = applyEditTool(workspace, parsed);
    editAttempts += 1;
    if (output.ok) successfulEdits += 1;
    record.outcome = output.ok
      ? { ok: true, changedIds: output.changedIds }
      : { ok: false, error: output.error };
    record.evaluationAfter = structuredClone(workspace.evaluation);
    commitTurn(record);

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
