import type { ArenaDesignSpec, ArenaGameMode } from "@shared/world/arena-design-spec.js";
import type { AgentTurnDecision, TokenUsage } from "./agent.js";
import type { ArenaInspection } from "./inspect.js";
import {
  PLAYTEST_ROLLOUTS,
  PLAYTEST_SEED,
  runPlaytest,
  type ArenaPlaytestReport,
} from "./playtest.js";
import type { PlaytestAgentSession, PlaytestAgentStartInput, PlaytestAgentTurnRecord, PlaytestToolOutput } from "./playtest-agent.js";
import {
  FINISH_DESIGN_TOOL,
  MAX_PRODUCT_DESIGN_PLANS,
  MAX_PRODUCT_DEATHMATCH_PLAYTESTS,
  MAX_PRODUCT_EDIT_ATTEMPTS,
  MAX_PRODUCT_MODEL_CALLS,
  MAX_PRODUCT_SND_PLAYTESTS,
  PLACE_OBJECTIVE_TOOL,
  PROPOSE_DESIGN_PLAN_TOOL,
  RUN_PLAYTEST_TOOL,
  applyProductEdit,
  formatProductStartMessage,
  isProductGeometryTool,
  parseDesignPlan,
  parseEditToolArgs,
  parseFinishSummary,
  productCompletionIssues,
  productSystemPrompt,
  productToolNames,
  readIntent,
  type PublicDesignPlan,
} from "./product-tools.js";
import type { ArenaEvaluation, ArenaMap } from "./types.js";
import { ArenaWorkspace } from "./workspace.js";

export type ProductDesignerRunStatus =
  | "completed"
  | "budget_exhausted"
  | "model_error"
  | "invalid_model_output";

export type ProductDesignerRunResult = {
  kind: "arena_designer";
  brief: string;
  mode: ArenaGameMode;
  spec: ArenaDesignSpec;
  designPlan?: PublicDesignPlan;
  model: {
    requested: string;
    returnedModels: string[];
  };
  initialMap: ArenaMap;
  initialEvaluation: ArenaEvaluation;
  turns: PlaytestAgentTurnRecord[];
  status: ProductDesignerRunStatus;
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

export type ProductStartInput = PlaytestAgentStartInput & {
  mode: ArenaGameMode;
};

function addUsage(into: TokenUsage, extra?: TokenUsage): TokenUsage {
  if (!extra) return into;
  return {
    inputTokens: (into.inputTokens ?? 0) + (extra.inputTokens ?? 0),
    outputTokens: (into.outputTokens ?? 0) + (extra.outputTokens ?? 0),
    totalTokens: (into.totalTokens ?? 0) + (extra.totalTokens ?? 0),
  };
}

export async function runArenaDesigner(args: {
  spec: ArenaDesignSpec;
  map: ArenaMap;
  session: PlaytestAgentSession;
  requestedModel?: string;
  playtestSeed?: number;
  playtestRollouts?: number;
  onTurn?: (turn: PlaytestAgentTurnRecord) => void;
}): Promise<ProductDesignerRunResult> {
  const started = Date.now();
  const mode = args.spec.mode;
  const envelope = args.spec.envelope;
  const workspace = new ArenaWorkspace(args.map, mode);
  const initialMap = workspace.currentMap();
  const initialEvaluation = structuredClone(workspace.evaluation);
  const requested = args.requestedModel ?? "scripted";
  const playtestSeed = args.playtestSeed ?? PLAYTEST_SEED;
  const playtestRollouts = args.playtestRollouts ?? PLAYTEST_ROLLOUTS;
  const maxPlaytests = mode === "search_destroy" ? MAX_PRODUCT_SND_PLAYTESTS : MAX_PRODUCT_DEATHMATCH_PLAYTESTS;
  const returnedModels: string[] = [];
  const turns: PlaytestAgentTurnRecord[] = [];
  let usage: TokenUsage = {};
  let editAttempts = 0;
  let successfulEdits = 0;
  let playtestCalls = 0;
  let modelCalls = 0;
  let lastPlaytest: ArenaPlaytestReport | undefined;
  let designPlan: PublicDesignPlan | undefined;

  const commitTurn = (record: PlaytestAgentTurnRecord): void => {
    turns.push(record);
    try {
      args.onTurn?.(record);
    } catch {
      // Observer failures must not change the run.
    }
  };

  const fail = (
    status: ProductDesignerRunStatus,
    invalidReason: string,
    extras: Partial<ProductDesignerRunResult> = {},
  ): ProductDesignerRunResult => ({
    kind: "arena_designer",
    brief: args.spec.brief,
    mode,
    spec: args.spec,
    ...(designPlan ? { designPlan } : {}),
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
      brief: args.spec.brief,
      inspection: workspace.inspect(),
      maxEditAttempts: MAX_PRODUCT_EDIT_ATTEMPTS,
      toolNames: productToolNames(mode),
      maxPlaytestCalls: maxPlaytests,
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

    if (modelCalls > MAX_PRODUCT_MODEL_CALLS) {
      return fail(
        "budget_exhausted",
        `model calls exceeded MAX_PRODUCT_MODEL_CALLS (${MAX_PRODUCT_MODEL_CALLS})`,
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

    let continueError: string | undefined;
    const continueWith = async (output: PlaytestToolOutput): Promise<boolean> => {
      try {
        decision = await args.session.continueWithTool({
          callId: call.callId,
          name: call.name,
          output,
        });
        return true;
      } catch (err) {
        continueError = err instanceof Error ? err.message : String(err);
        return false;
      }
    };

    if (call.name === PROPOSE_DESIGN_PLAN_TOOL) {
      if (designPlan) {
        record.outcome = { ok: false, error: { code: "plan-already-published" } };
        record.evaluationAfter = structuredClone(workspace.evaluation);
        commitTurn(record);
        const ok = await continueWith({
          ok: false,
          error: { code: "plan-already-published" },
          inspection: workspace.inspect(),
        });
        if (!ok) return fail("model_error", continueError ?? "provider failed after plan rejection");
        continue;
      }
      const parsed = parseDesignPlan(call.arguments);
      if (typeof parsed === "string") {
        commitTurn(record);
        return fail("invalid_model_output", parsed);
      }
      designPlan = parsed;
      record.outcome = { ok: true };
      record.evaluationAfter = structuredClone(workspace.evaluation);
      commitTurn(record);
      const ok = await continueWith({
        ok: true,
        changedIds: [],
        inspection: workspace.inspect(),
      });
      if (!ok) return fail("model_error", continueError ?? "provider failed after design plan");
      continue;
    }

    if (!designPlan) {
      record.outcome = { ok: false, error: { code: "plan-required" } };
      record.evaluationAfter = structuredClone(workspace.evaluation);
      commitTurn(record);
      if (isProductGeometryTool(call.name) || call.name === RUN_PLAYTEST_TOOL || call.name === FINISH_DESIGN_TOOL) {
        editAttempts += 1;
      }
      const ok = await continueWith({
        ok: false,
        error: { code: "plan-required", target: call.name },
        inspection: workspace.inspect(),
      });
      if (!ok) return fail("model_error", continueError ?? "provider failed after plan-first rejection");
      continue;
    }

    if (call.name === FINISH_DESIGN_TOOL) {
      const summary = parseFinishSummary(call.arguments);
      if (summary === undefined) {
        commitTurn(record);
        return fail("invalid_model_output", "finish_design requires a summary string");
      }
      const blockers = productCompletionIssues(workspace.currentMap(), workspace.evaluation, mode);
      if (blockers.length) {
        record.outcome = { ok: false, error: { code: "finish-blocked", target: blockers.join(",") } };
        record.evaluationAfter = structuredClone(workspace.evaluation);
        commitTurn(record);
        const ok = await continueWith({
          ok: false,
          error: { code: "finish-blocked", target: blockers.join(",") },
          inspection: workspace.inspect(),
        });
        if (!ok) return fail("model_error", continueError ?? "provider failed after finish rejection");
        continue;
      }
      record.evaluationAfter = structuredClone(workspace.evaluation);
      commitTurn(record);
      return {
        kind: "arena_designer",
        brief: args.spec.brief,
        mode,
        spec: args.spec,
        designPlan,
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
      if (mode !== "search_destroy") {
        record.outcome = { ok: false, error: { code: "playtest-not-available" } };
        record.evaluationAfter = structuredClone(workspace.evaluation);
        commitTurn(record);
        return fail("invalid_model_output", "Deathmatch has no scripted playtest");
      }
      if (playtestCalls >= maxPlaytests) {
        record.evaluationAfter = structuredClone(workspace.evaluation);
        commitTurn(record);
        return fail(
          "budget_exhausted",
          `playtest calls reached MAX_PRODUCT_SND_PLAYTESTS (${maxPlaytests})`,
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
      const ok = await continueWith({
        ok: true,
        playtest,
        inspection: workspace.inspect(),
      });
      if (!ok) return fail("model_error", continueError ?? "provider failed after playtest");
      continue;
    }

    if (!isProductGeometryTool(call.name)) {
      commitTurn(record);
      return fail("invalid_model_output", `unknown tool: ${call.name}`);
    }

    if (editAttempts >= MAX_PRODUCT_EDIT_ATTEMPTS) {
      record.evaluationAfter = structuredClone(workspace.evaluation);
      commitTurn(record);
      return fail(
        "budget_exhausted",
        `edit attempts reached MAX_PRODUCT_EDIT_ATTEMPTS (${MAX_PRODUCT_EDIT_ATTEMPTS})`,
      );
    }

    const parsed = parseEditToolArgs(call.name, call.arguments);
    if (typeof parsed === "string") {
      commitTurn(record);
      return fail("invalid_model_output", parsed);
    }

    const output = applyProductEdit(workspace, parsed, envelope);
    editAttempts += 1;
    if (output.ok) successfulEdits += 1;
    record.outcome = output.ok
      ? { ok: true, changedIds: output.changedIds }
      : { ok: false, error: output.error };
    record.evaluationAfter = structuredClone(workspace.evaluation);
    commitTurn(record);

    const ok = await continueWith(output);
    if (!ok) return fail("model_error", continueError ?? "provider failed after edit");
  }
}

export { productSystemPrompt, formatProductStartMessage, MAX_PRODUCT_DESIGN_PLANS };
export type { ArenaInspection };
