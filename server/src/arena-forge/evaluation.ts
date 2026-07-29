import { cloneArenaMap } from "./actions.js";
import {
  runAgentDesign,
  type AgentRunResult,
  type AgentSession,
  type AgentTurnRecord,
} from "./agent.js";
import {
  formatConstraint,
  P4_ARMS,
  P4_MANIFEST_ID,
  P4_MAX_EDIT_BUDGET,
  P4_REPLICATES,
  p4ManifestHash,
  type EvalCaseDefinition,
  type EvalConstraint,
  type P4Arm,
} from "./eval-cases.js";
import { evaluateArena } from "./evaluator.js";
import {
  MAX_ONE_SHOT_ACTIONS,
  runOneShotDesign,
  type OneShotDesigner,
  type OneShotRunResult,
} from "./one-shot.js";
import type { ArenaEvaluation, ArenaMap } from "./types.js";

export const P4_SCHEMA_VERSION = 1;

export type ExecutionValidity =
  | "completed"
  | "invalid_model_output"
  | "action_rejected"
  | "budget_exhausted"
  | "model_error";

export type FeedbackResponsive = "yes" | "no" | "unclear";

export type ConstraintCheck = {
  constraint: EvalConstraint;
  label: string;
  satisfied: boolean;
  detail: string;
};

export type DesignTrace = OneShotRunResult | AgentRunResult;

export type EvalRunArtifact = {
  schemaVersion: number;
  manifestId: string;
  manifestHash: string;
  caseId: string;
  split: EvalCaseDefinition["split"];
  title: string;
  arm: P4Arm;
  replicate: number;
  brief: string;
  requestedModel: string;
  returnedModels: string[];
  infrastructureRetry: boolean;
  initialMap: ArenaMap;
  initialEvaluation: ArenaEvaluation;
  design: DesignTrace;
  finalMap: ArenaMap;
  finalEvaluation: ArenaEvaluation;
  constraints: ConstraintCheck[];
  satisfiedCount: number;
  declaredCount: number;
  hardFailureCount: number;
  zeroHardFailures: boolean;
  execution: ExecutionValidity;
  invalidReason?: string;
  successfulEdits: number;
  editAttempts: number;
  rejectedEditAttempts: number;
  modelCalls: number;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  latencyMs: number;
  feedbackResponsive?: {
    classification: FeedbackResponsive;
    evidence: string;
  };
};

export type ArmAggregate = {
  arm: P4Arm;
  runs: number;
  satisfied: number;
  declared: number;
  satisfactionRate: number;
  zeroHardFailureRuns: number;
  hardFailureRuns: number;
  completed: number;
  invalidModelOutput: number;
  actionRejected: number;
  budgetExhausted: number;
  modelError: number;
  medianSuccessfulEdits: number | undefined;
  medianTotalTokens: number | undefined;
  medianLatencyMs: number | undefined;
  feedbackYes?: number;
  feedbackNo?: number;
  feedbackUnclear?: number;
};

export type CaseComparison = {
  caseId: string;
  title: string;
  declaredPerRun: number;
  oneShotSatisfied: number;
  oneShotDeclared: number;
  agentSatisfied: number;
  agentDeclared: number;
  winner: "one_shot" | "agent" | "tie";
};

export type ClaimVerdict = "STRONG PASS" | "MIXED" | "FAIL";

export type SuiteAggregate = {
  manifestId: string;
  manifestHash: string;
  requestedModel: string;
  returnedModels: string[];
  mixedReturnedModels: boolean;
  heldOutRuns: number;
  oneShot: ArmAggregate;
  agent: ArmAggregate;
  cases: CaseComparison[];
  verdict: ClaimVerdict;
  verdictReasons: string[];
  portfolioClaim: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function checkConstraint(evaluation: ArenaEvaluation, constraint: EvalConstraint): ConstraintCheck {
  const label = formatConstraint(constraint);
  switch (constraint.type) {
    case "no_hard_failures": {
      const n = evaluation.summary.hardFailureCount;
      return {
        constraint,
        label,
        satisfied: n === 0,
        detail: n === 0 ? "0 hard failures" : `${n} hard failures`,
      };
    }
    case "spawn_valid": {
      const spawn = evaluation.spawns.results.find((s) => s.id === constraint.spawnId);
      if (!spawn) {
        return { constraint, label, satisfied: false, detail: "spawn not in evaluation" };
      }
      return {
        constraint,
        label,
        satisfied: spawn.valid,
        detail: spawn.valid ? "valid" : `invalid blockedBy=${spawn.blockedBy ?? "-"}`,
      };
    }
    case "path_reachable": {
      const path = evaluation.navigation.paths.find(
        (p) => p.from === constraint.from && p.to === constraint.to,
      );
      if (!path) {
        return { constraint, label, satisfied: false, detail: "path pair not in evaluation" };
      }
      return {
        constraint,
        label,
        satisfied: path.reachable,
        detail: path.reachable ? `reachable ${path.distanceMeters ?? "-"} m` : "unreachable",
      };
    }
    case "all_sd_paths_reachable": {
      const bad = evaluation.navigation.paths.filter((p) => !p.reachable);
      return {
        constraint,
        label,
        satisfied: bad.length === 0,
        detail:
          bad.length === 0
            ? `${evaluation.navigation.paths.length}/${evaluation.navigation.paths.length} reachable`
            : `${bad.length} unreachable`,
      };
    }
    case "los_blocked":
    case "los_clear": {
      const pair = evaluation.lineOfSight.pairs.find(
        (p) => p.from === constraint.from && p.to === constraint.to,
      );
      if (!pair) {
        return { constraint, label, satisfied: false, detail: "LOS pair not in evaluation" };
      }
      const wantBlocked = constraint.type === "los_blocked";
      const ok = wantBlocked ? !pair.clear : pair.clear;
      return {
        constraint,
        label,
        satisfied: ok,
        detail: pair.clear ? "clear" : `blocked by ${pair.blockedBy ?? "-"}`,
      };
    }
    case "aggregate_median_at_most": {
      const agg = evaluation.navigation.aggregates.find(
        (a) => a.fromRole === constraint.fromRole && a.to === constraint.to,
      );
      if (!agg || agg.medianMeters === undefined) {
        return { constraint, label, satisfied: false, detail: "median undefined" };
      }
      return {
        constraint,
        label,
        satisfied: agg.medianMeters <= constraint.meters,
        detail: `median ${agg.medianMeters} (limit ${constraint.meters})`,
      };
    }
  }
}

export function scoreConstraints(
  evaluation: ArenaEvaluation,
  constraints: EvalConstraint[],
): ConstraintCheck[] {
  return constraints.map((c) => checkConstraint(evaluation, c));
}

export function executionOf(design: DesignTrace): ExecutionValidity {
  if (design.kind === "one_shot") return design.executionStatus;
  return design.status;
}

function usageOf(design: DesignTrace): EvalRunArtifact["usage"] {
  const raw = design.kind === "one_shot" ? design.usage : design.totalUsage;
  return {
    inputTokens: raw?.inputTokens ?? 0,
    outputTokens: raw?.outputTokens ?? 0,
    totalTokens: raw?.totalTokens ?? 0,
  };
}

function returnedModelsOf(design: DesignTrace): string[] {
  if (design.kind === "one_shot") {
    return design.model.returned ? [design.model.returned] : [];
  }
  return [...design.model.returnedModels];
}

function editStats(design: DesignTrace): {
  successfulEdits: number;
  editAttempts: number;
  rejectedEditAttempts: number;
  modelCalls: number;
} {
  if (design.kind === "one_shot") {
    const successful = design.actionResults.filter((r) => r.ok).length;
    const rejected = design.actionResults.filter((r) => !r.ok).length;
    return {
      successfulEdits: successful,
      editAttempts: design.actionResults.length,
      rejectedEditAttempts: rejected,
      modelCalls: 1,
    };
  }
  const rejected = design.turns.filter((t) => t.outcome && !t.outcome.ok).length;
  return {
    successfulEdits: design.successfulEdits,
    editAttempts: design.editAttempts,
    rejectedEditAttempts: rejected,
    modelCalls: design.modelCalls,
  };
}

function actionTargetIds(value: unknown): string[] {
  if (!isRecord(value)) return [];
  const ids: string[] = [];
  for (const key of ["solidId", "spawnId", "objectiveId"]) {
    const v = value[key];
    if (typeof v === "string") ids.push(v);
  }
  return ids;
}

function factKeys(evaluation: ArenaEvaluation): Set<string> {
  const keys = new Set<string>();
  for (const issue of evaluation.summary.hardFailures) {
    keys.add(
      `hard:${issue.code}:${issue.id ?? ""}:${String(issue.from ?? "")}:${String(issue.to ?? "")}:${String(issue.blockedBy ?? "")}`,
    );
  }
  for (const path of evaluation.navigation.paths) {
    if (!path.reachable) keys.add(`unreach:${path.from}:${path.to}`);
  }
  for (const spawn of evaluation.spawns.results) {
    if (!spawn.valid) keys.add(`spawn:${spawn.id}:${spawn.blockedBy ?? ""}`);
  }
  for (const pair of evaluation.lineOfSight.pairs) {
    keys.add(`los:${pair.from}:${pair.to}:${pair.clear ? "clear" : `blocked:${pair.blockedBy ?? ""}`}`);
  }
  return keys;
}

function idsInFacts(facts: Iterable<string>): Set<string> {
  const ids = new Set<string>();
  for (const fact of facts) {
    for (const part of fact.split(/[:]/)) {
      if (
        part.startsWith("obstacle-") ||
        part.startsWith("occluder-") ||
        part.startsWith("breakable-") ||
        part.startsWith("spawn-") ||
        part.startsWith("ghost-spawn-") ||
        part.startsWith("sentinel-spawn-") ||
        part.startsWith("objective-")
      ) {
        ids.add(part);
      }
    }
  }
  return ids;
}

function editTurns(turns: AgentTurnRecord[]): AgentTurnRecord[] {
  return turns.filter((t) => t.tool !== "finish_design");
}

/**
 * Conservative trace signal. Yes only when a later public action
 * targets a fact or ID that the previous edit or its P0 feedback introduced.
 */
export function classifyFeedbackResponsive(design: AgentRunResult): {
  classification: FeedbackResponsive;
  evidence: string;
} {
  const edits = editTurns(design.turns);
  if (edits.length === 0) {
    return { classification: "no", evidence: "no edit attempts before finish or stop" };
  }

  let sawUnclear = false;
  const yesNotes: string[] = [];

  for (let i = 0; i < edits.length; i++) {
    const current = edits[i];
    const next = edits[i + 1];
    const before = i === 0 ? design.initialEvaluation : edits[i - 1].evaluationAfter;
    const after = current.evaluationAfter;
    if (!after) continue;

    const newFacts = new Set<string>();
    if (before) {
      const beforeKeys = factKeys(before);
      for (const key of factKeys(after)) {
        if (!beforeKeys.has(key)) newFacts.add(key);
      }
    }
    const newIds = idsInFacts(newFacts);
    const createdIds = current.outcome?.changedIds ?? [];
    const rejectedTarget = current.outcome && !current.outcome.ok ? actionTargetIds(current.arguments) : [];

    if (!next) {
      if (newFacts.size > 0) sawUnclear = true;
      continue;
    }

    const nextIds = actionTargetIds(next.arguments);
    const intent = (next.intent ?? "").toLowerCase();
    const nextTouchesCreated = nextIds.some((id) => createdIds.includes(id));
    const nextTouchesNewFact = nextIds.some((id) => newIds.has(id));
    const nextRetriesReject = rejectedTarget.some((id) => nextIds.includes(id));
    const intentNamesFact =
      intent.length > 0 &&
      [...newIds, ...createdIds, ...rejectedTarget].some((id) => intent.includes(id.toLowerCase()));

    if (nextTouchesCreated && createdIds.length > 0) {
      yesNotes.push(
        `turn ${current.turn} created/changed ${createdIds.join(", ")}; turn ${next.turn} ${next.tool} targets ${nextIds.join(", ")}`,
      );
      continue;
    }
    if (nextTouchesNewFact && newFacts.size > 0) {
      yesNotes.push(
        `turn ${current.turn} introduced ${[...newFacts].slice(0, 3).join("; ")}; turn ${next.turn} ${next.tool} targets ${nextIds.join(", ")}`,
      );
      continue;
    }
    if (nextRetriesReject) {
      yesNotes.push(
        `turn ${current.turn} rejected ${JSON.stringify(current.outcome?.error)}; turn ${next.turn} retries ${next.tool} on ${nextIds.join(", ")}`,
      );
      continue;
    }
    if (intentNamesFact && (nextTouchesNewFact || nextTouchesCreated || nextRetriesReject)) {
      yesNotes.push(`turn ${next.turn} intent names a newly observed id and the action targets it`);
    }
  }

  if (yesNotes.length > 0) {
    return { classification: "yes", evidence: yesNotes[0] };
  }
  if (edits.length === 1) {
    return { classification: "no", evidence: "single edit then stop; no later action to revise from feedback" };
  }
  if (sawUnclear) {
    return {
      classification: "unclear",
      evidence: "later evaluator facts changed but no subsequent edit targeted those facts",
    };
  }
  return { classification: "no", evidence: "later edits do not target newly observed evaluator facts or IDs" };
}

export function isTransientInfraMessage(message: string): boolean {
  return /rate limit|429|500|502|503|529|timeout|etimedout|econnreset|enotfound|socket hang up|connection error|temporarily unavailable|overloaded|service unavailable|network/i.test(
    message,
  );
}

export function median(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function requestedOf(design: DesignTrace, fallback: string): string {
  return design.model.requested || fallback;
}

export function artifactFromDesign(args: {
  evalCase: EvalCaseDefinition;
  arm: P4Arm;
  replicate: number;
  requestedModel: string;
  design: DesignTrace;
  infrastructureRetry: boolean;
}): EvalRunArtifact {
  const finalEvaluation = args.design.finalEvaluation;
  const constraints = scoreConstraints(finalEvaluation, args.evalCase.constraints);
  const satisfiedCount = constraints.filter((c) => c.satisfied).length;
  const stats = editStats(args.design);
  const execution = executionOf(args.design);
  const artifact: EvalRunArtifact = {
    schemaVersion: P4_SCHEMA_VERSION,
    manifestId: P4_MANIFEST_ID,
    manifestHash: p4ManifestHash(),
    caseId: args.evalCase.id,
    split: args.evalCase.split,
    title: args.evalCase.title,
    arm: args.arm,
    replicate: args.replicate,
    brief: args.evalCase.brief,
    requestedModel: requestedOf(args.design, args.requestedModel),
    returnedModels: returnedModelsOf(args.design),
    infrastructureRetry: args.infrastructureRetry,
    initialMap: args.design.initialMap,
    initialEvaluation: args.design.initialEvaluation,
    design: args.design,
    finalMap: args.design.finalMap,
    finalEvaluation,
    constraints,
    satisfiedCount,
    declaredCount: constraints.length,
    hardFailureCount: finalEvaluation.summary.hardFailureCount,
    zeroHardFailures: finalEvaluation.summary.hardFailureCount === 0,
    execution,
    invalidReason: args.design.invalidReason,
    successfulEdits: stats.successfulEdits,
    editAttempts: stats.editAttempts,
    rejectedEditAttempts: stats.rejectedEditAttempts,
    modelCalls: stats.modelCalls,
    usage: usageOf(args.design),
    latencyMs:
      args.design.kind === "one_shot" ? args.design.timing.totalLatencyMs : args.design.totalLatencyMs,
  };
  if (args.design.kind === "agent") {
    artifact.feedbackResponsive = classifyFeedbackResponsive(args.design);
  }
  return artifact;
}

export function sanitizeEvalArtifact(artifact: EvalRunArtifact): EvalRunArtifact {
  const raw = JSON.stringify(artifact);
  if (/sk-[a-zA-Z0-9_-]{10,}|OPENAI_API_KEY|api[_-]?key/i.test(raw) && /sk-/.test(raw)) {
    throw new Error("refusing to serialize an artifact that looks like it contains an API key");
  }
  return JSON.parse(raw) as EvalRunArtifact;
}

export async function runEvalArm(args: {
  evalCase: EvalCaseDefinition;
  arm: P4Arm;
  designer?: OneShotDesigner;
  session?: AgentSession;
  requestedModel: string;
}): Promise<DesignTrace> {
  const map = args.evalCase.buildMap();
  if (args.arm === "one_shot") {
    if (!args.designer) throw new Error("one_shot arm requires a designer");
    return runOneShotDesign({ map, brief: args.evalCase.brief, designer: args.designer });
  }
  if (!args.session) throw new Error("agent arm requires a session");
  return runAgentDesign({
    map,
    brief: args.evalCase.brief,
    session: args.session,
    requestedModel: args.requestedModel,
  });
}

export async function runEvalCaseOnce(args: {
  evalCase: EvalCaseDefinition;
  arm: P4Arm;
  replicate: number;
  requestedModel: string;
  designerFactory?: () => OneShotDesigner;
  sessionFactory?: () => AgentSession;
}): Promise<EvalRunArtifact> {
  const runOnce = async () => {
    const designer = args.arm === "one_shot" ? args.designerFactory?.() : undefined;
    const session = args.arm === "agent" ? args.sessionFactory?.() : undefined;
    return runEvalArm({
      evalCase: args.evalCase,
      arm: args.arm,
      designer,
      session,
      requestedModel: args.requestedModel,
    });
  };

  let design = await runOnce();
  let infrastructureRetry = false;
  if (
    executionOf(design) === "model_error" &&
    design.invalidReason &&
    isTransientInfraMessage(design.invalidReason)
  ) {
    infrastructureRetry = true;
    design = await runOnce();
  }

  return sanitizeEvalArtifact(
    artifactFromDesign({
      evalCase: args.evalCase,
      arm: args.arm,
      replicate: args.replicate,
      requestedModel: args.requestedModel,
      design,
      infrastructureRetry,
    }),
  );
}

export function assertArmConfiguration(design: DesignTrace, brief: string, map: ArenaMap): void {
  if (design.brief !== brief) throw new Error("arm brief mismatch");
  if (JSON.stringify(design.initialMap.solids) !== JSON.stringify(map.solids)) {
    throw new Error("arm starting solids mismatch");
  }
  if (design.kind === "one_shot") {
    // max budget is enforced by the frozen runner, not a field on the result
    void MAX_ONE_SHOT_ACTIONS;
    void P4_MAX_EDIT_BUDGET;
  }
}

function emptyArm(arm: P4Arm): ArmAggregate {
  return {
    arm,
    runs: 0,
    satisfied: 0,
    declared: 0,
    satisfactionRate: 0,
    zeroHardFailureRuns: 0,
    hardFailureRuns: 0,
    completed: 0,
    invalidModelOutput: 0,
    actionRejected: 0,
    budgetExhausted: 0,
    modelError: 0,
    medianSuccessfulEdits: undefined,
    medianTotalTokens: undefined,
    medianLatencyMs: undefined,
    ...(arm === "agent" ? { feedbackYes: 0, feedbackNo: 0, feedbackUnclear: 0 } : {}),
  };
}

function accumulateArm(runs: EvalRunArtifact[], arm: P4Arm): ArmAggregate {
  const mine = runs.filter((r) => r.arm === arm);
  const agg = emptyArm(arm);
  agg.runs = mine.length;
  for (const run of mine) {
    agg.satisfied += run.satisfiedCount;
    agg.declared += run.declaredCount;
    if (run.zeroHardFailures) agg.zeroHardFailureRuns += 1;
    else agg.hardFailureRuns += 1;
    if (run.execution === "completed") agg.completed += 1;
    if (run.execution === "invalid_model_output") agg.invalidModelOutput += 1;
    if (run.execution === "action_rejected") agg.actionRejected += 1;
    if (run.execution === "budget_exhausted") agg.budgetExhausted += 1;
    if (run.execution === "model_error") agg.modelError += 1;
    if (arm === "agent" && run.feedbackResponsive) {
      if (run.feedbackResponsive.classification === "yes") agg.feedbackYes = (agg.feedbackYes ?? 0) + 1;
      if (run.feedbackResponsive.classification === "no") agg.feedbackNo = (agg.feedbackNo ?? 0) + 1;
      if (run.feedbackResponsive.classification === "unclear") {
        agg.feedbackUnclear = (agg.feedbackUnclear ?? 0) + 1;
      }
    }
  }
  agg.satisfactionRate = agg.declared === 0 ? 0 : agg.satisfied / agg.declared;
  agg.medianSuccessfulEdits = median(mine.map((r) => r.successfulEdits));
  agg.medianTotalTokens = median(mine.map((r) => r.usage.totalTokens));
  agg.medianLatencyMs = median(mine.map((r) => r.latencyMs));
  return agg;
}

function caseComparisons(runs: EvalRunArtifact[]): CaseComparison[] {
  const ids = [...new Set(runs.map((r) => r.caseId))];
  return ids.map((caseId) => {
    const mine = runs.filter((r) => r.caseId === caseId);
    const one = mine.filter((r) => r.arm === "one_shot");
    const agent = mine.filter((r) => r.arm === "agent");
    const oneShotSatisfied = one.reduce((n, r) => n + r.satisfiedCount, 0);
    const oneShotDeclared = one.reduce((n, r) => n + r.declaredCount, 0);
    const agentSatisfied = agent.reduce((n, r) => n + r.satisfiedCount, 0);
    const agentDeclared = agent.reduce((n, r) => n + r.declaredCount, 0);
    const oneRate = oneShotDeclared === 0 ? 0 : oneShotSatisfied / oneShotDeclared;
    const agentRate = agentDeclared === 0 ? 0 : agentSatisfied / agentDeclared;
    let winner: CaseComparison["winner"] = "tie";
    if (agentRate > oneRate) winner = "agent";
    else if (oneRate > agentRate) winner = "one_shot";
    return {
      caseId,
      title: mine[0]?.title ?? caseId,
      declaredPerRun: mine[0]?.declaredCount ?? 0,
      oneShotSatisfied,
      oneShotDeclared,
      agentSatisfied,
      agentDeclared,
      winner,
    };
  });
}

const STRONG_CLAIM =
  "Evaluator-grounded iterative revision improved deterministic constraint satisfaction versus the frozen one-shot design mode on this held-out suite.";
const MIXED_CLAIM =
  "ArenaForge is a bounded tool-using level-design agent that grounds revisions in deterministic game-state evaluation.";
const FAIL_CLAIM =
  "ArenaForge is a bounded tool-using level-design experiment with deterministic evaluation and traceable revisions.";

function feedbackHarmedConstraints(runs: EvalRunArtifact[]): boolean {
  const yes = runs.filter(
    (r) => r.arm === "agent" && r.feedbackResponsive?.classification === "yes",
  );
  if (yes.length === 0) return false;
  const harmed = yes.filter((r) => {
    const initial = scoreConstraints(r.initialEvaluation, r.constraints.map((c) => c.constraint));
    const initialSat = initial.filter((c) => c.satisfied).length;
    return r.satisfiedCount < initialSat;
  });
  return harmed.length * 2 >= yes.length;
}

export function decideClaimGate(oneShot: ArmAggregate, agent: ArmAggregate, cases: CaseComparison[], runs: EvalRunArtifact[]): {
  verdict: ClaimVerdict;
  reasons: string[];
  claim: string;
} {
  const reasons: string[] = [];
  const delta = agent.satisfactionRate - oneShot.satisfactionRate;
  const better = cases.filter((c) => c.winner === "agent").length;
  const worse = cases.filter((c) => c.winner === "one_shot").length;
  const yes = agent.feedbackYes ?? 0;
  const quantitative =
    delta >= 0.1 &&
    agent.hardFailureRuns <= oneShot.hardFailureRuns &&
    better >= 3 &&
    worse <= 1 &&
    yes >= 2;

  if (quantitative) {
    reasons.push(
      `P3 satisfaction ${(agent.satisfactionRate * 100).toFixed(1)}% is ≥ 10 pp above P2 ${(oneShot.satisfactionRate * 100).toFixed(1)}%`,
    );
    reasons.push(`P3 hard-failure runs ${agent.hardFailureRuns} ≤ P2 ${oneShot.hardFailureRuns}`);
    reasons.push(`P3 strictly better on ${better}/5 cases, worse on ${worse}`);
    reasons.push(`feedback-responsive yes runs: ${yes}`);
    return { verdict: "STRONG PASS", reasons, claim: STRONG_CLAIM };
  }

  reasons.push(
    `P3 satisfaction ${(agent.satisfactionRate * 100).toFixed(1)}% vs P2 ${(oneShot.satisfactionRate * 100).toFixed(1)}% (delta ${(delta * 100).toFixed(1)} pp)`,
  );
  reasons.push(`P3 hard-failure runs ${agent.hardFailureRuns}, P2 ${oneShot.hardFailureRuns}`);
  reasons.push(`case winners: agent ${better}, one_shot ${worse}, tie ${cases.filter((c) => c.winner === "tie").length}`);
  reasons.push(`feedback-responsive yes=${yes} no=${agent.feedbackNo ?? 0} unclear=${agent.feedbackUnclear ?? 0}`);

  const noIterativeGain = agent.satisfactionRate <= oneShot.satisfactionRate;
  const noFeedback = yes === 0;
  const harmed = feedbackHarmedConstraints(runs);
  if (noIterativeGain || noFeedback || harmed) {
    if (noIterativeGain) reasons.push("P3 aggregate constraint satisfaction is equal or worse than P2");
    if (noFeedback) reasons.push("no held-out P3 run had clear feedback-responsive revision");
    if (harmed) reasons.push("feedback-responsive revisions commonly reduced constraint satisfaction versus the start state");
    return { verdict: "FAIL", reasons, claim: FAIL_CLAIM };
  }

  reasons.push("useful feedback-responsive revision appeared, but the quantitative STRONG PASS gate was not met");
  return { verdict: "MIXED", reasons, claim: MIXED_CLAIM };
}

export function aggregateHeldOut(runs: EvalRunArtifact[], requestedModel: string): SuiteAggregate {
  const held = runs.filter((r) => r.split === "held_out");
  const oneShot = accumulateArm(held, "one_shot");
  const agent = accumulateArm(held, "agent");
  const cases = caseComparisons(held);
  const returned = [...new Set(held.flatMap((r) => r.returnedModels))];
  const gate = decideClaimGate(oneShot, agent, cases, held);
  return {
    manifestId: P4_MANIFEST_ID,
    manifestHash: p4ManifestHash(),
    requestedModel,
    returnedModels: returned,
    mixedReturnedModels: returned.length > 1,
    heldOutRuns: held.length,
    oneShot,
    agent,
    cases,
    verdict: gate.verdict,
    verdictReasons: gate.reasons,
    portfolioClaim: gate.claim,
  };
}

export function strongestFeedbackTraces(runs: EvalRunArtifact[], limit = 3): Array<{
  caseId: string;
  replicate: number;
  evidence: string;
}> {
  return runs
    .filter((r) => r.arm === "agent" && r.feedbackResponsive?.classification === "yes")
    .map((r) => ({
      caseId: r.caseId,
      replicate: r.replicate,
      evidence: r.feedbackResponsive?.evidence ?? "",
    }))
    .slice(0, limit);
}

function pct(satisfied: number, declared: number): string {
  if (declared === 0) return "n/a";
  return `${((satisfied / declared) * 100).toFixed(1)}%`;
}

function fmtMedian(value: number | undefined, digits = 0): string {
  if (value === undefined) return "-";
  return digits === 0 ? String(Math.round(value)) : value.toFixed(digits);
}

export function renderEvaluationMarkdown(args: {
  requestedModel: string;
  aggregate: SuiteAggregate;
  runs: EvalRunArtifact[];
}): string {
  const { aggregate, runs, requestedModel } = args;
  const held = runs.filter((r) => r.split === "held_out");
  const traces = strongestFeedbackTraces(held);
  const retries = held.filter((r) => r.infrastructureRetry);
  const agentWins = aggregate.cases.filter((c) => c.winner === "agent").map((c) => c.caseId);
  const p2Wins = aggregate.cases.filter((c) => c.winner === "one_shot").map((c) => c.caseId);
  const lines: string[] = [
    "# ArenaForge P4 evaluation",
    "",
    "Held-out comparison of the frozen one-shot designer (P2) and the frozen evaluator-grounded agent loop (P3).",
    "",
    "## Experiment contract",
    "",
    `- Manifest: \`${aggregate.manifestId}\``,
    `- Manifest hash: \`${aggregate.manifestHash}\``,
    `- Arms: one_shot (P2 \`runOneShotDesign\`), agent (P3 \`runAgentDesign\`)`,
    `- Same starting ArenaMap, brief, P0 evaluator, Search & Destroy mode, six P1 actions, max 8 edits, model alias \`${requestedModel}\``,
    `- 5 held-out cases × 2 arms × 2 replicates = 20 runs`,
    `- Scoring is local and deterministic. No second model. No prompt changes after the first held-out request.`,
    "",
    "## Method limitation",
    "",
    "P2 returns one structured proposal. P3 makes repeated function-tool decisions. The formats are different, so this suite does not isolate a pure causal effect of evaluator feedback. It compares the two frozen design modes under the same map, model, action surface, evaluator, brief, and edit budget.",
    "",
    "Model sampling is not bit-for-bit reproducible. The two replicates are a small robustness check. Fixtures, evaluator, and scoring are deterministic.",
    "",
    "Historical P2/P3 smoke runs are development evidence only. They are not in these headline numbers.",
    "",
    "## Cases",
    "",
    "| Case | Split | Constraints |",
    "| --- | --- | --- |",
  ];

  const seen = new Map<string, EvalRunArtifact>();
  for (const run of held) {
    if (!seen.has(run.caseId)) seen.set(run.caseId, run);
  }
  for (const run of seen.values()) {
    const labels = run.constraints.map((c) => c.label).join("; ");
    lines.push(`| \`${run.caseId}\` | held_out | ${labels} |`);
  }

  lines.push(
    "",
    "## Aggregate",
    "",
    "| Metric | one_shot (P2) | agent (P3) |",
    "| --- | --- | --- |",
    `| Constraint satisfaction | ${aggregate.oneShot.satisfied} / ${aggregate.oneShot.declared} (${pct(aggregate.oneShot.satisfied, aggregate.oneShot.declared)}) | ${aggregate.agent.satisfied} / ${aggregate.agent.declared} (${pct(aggregate.agent.satisfied, aggregate.agent.declared)}) |`,
    `| Zero-hard-failure runs | ${aggregate.oneShot.zeroHardFailureRuns} / ${aggregate.oneShot.runs} | ${aggregate.agent.zeroHardFailureRuns} / ${aggregate.agent.runs} |`,
    `| Completed | ${aggregate.oneShot.completed} / ${aggregate.oneShot.runs} | ${aggregate.agent.completed} / ${aggregate.agent.runs} |`,
    `| Invalid model output | ${aggregate.oneShot.invalidModelOutput} | ${aggregate.agent.invalidModelOutput} |`,
    `| Action rejected (run status) | ${aggregate.oneShot.actionRejected} | ${aggregate.agent.actionRejected} |`,
    `| Budget exhausted | ${aggregate.oneShot.budgetExhausted} | ${aggregate.agent.budgetExhausted} |`,
    `| Model error | ${aggregate.oneShot.modelError} | ${aggregate.agent.modelError} |`,
    `| Median successful edits | ${fmtMedian(aggregate.oneShot.medianSuccessfulEdits)} | ${fmtMedian(aggregate.agent.medianSuccessfulEdits)} |`,
    `| Median total tokens | ${fmtMedian(aggregate.oneShot.medianTotalTokens)} | ${fmtMedian(aggregate.agent.medianTotalTokens)} |`,
    `| Median latency (ms) | ${fmtMedian(aggregate.oneShot.medianLatencyMs)} | ${fmtMedian(aggregate.agent.medianLatencyMs)} |`,
    `| Feedback-responsive yes / no / unclear | n/a | ${aggregate.agent.feedbackYes ?? 0} / ${aggregate.agent.feedbackNo ?? 0} / ${aggregate.agent.feedbackUnclear ?? 0} |`,
    "",
    `Requested model alias: \`${requestedModel}\`. Returned identifiers: ${aggregate.returnedModels.length ? aggregate.returnedModels.map((m) => `\`${m}\``).join(", ") : "(none recorded)"}.`,
    aggregate.mixedReturnedModels
      ? "Returned model identifiers were not identical across the suite."
      : "Returned model identifiers did not split across materially different aliases in this recording.",
    retries.length > 0
      ? `Infrastructure retries: ${retries.length} (${retries.map((r) => `${r.caseId}/${r.arm}/r${r.replicate}`).join(", ")}).`
      : "Infrastructure retries: none.",
    "",
    "## Per-case paired outcomes",
    "",
    "| Case | P2 satisfied | P3 satisfied | Winner |",
    "| --- | --- | --- | --- |",
  );
  for (const c of aggregate.cases) {
    lines.push(
      `| \`${c.caseId}\` | ${c.oneShotSatisfied} / ${c.oneShotDeclared} | ${c.agentSatisfied} / ${c.agentDeclared} | ${c.winner} |`,
    );
  }

  lines.push("", "### Replicate grid", "");
  for (const caseId of [...new Set(held.map((r) => r.caseId))]) {
    lines.push(`#### \`${caseId}\``, "");
    for (const arm of P4_ARMS) {
      for (const rep of [1, 2] as const) {
        const run = held.find((r) => r.caseId === caseId && r.arm === arm && r.replicate === rep);
        if (!run) {
          lines.push(`- ${arm} r${rep}: missing`);
          continue;
        }
        const bits = run.constraints.map((c) => `${c.satisfied ? "ok" : "fail"} ${c.label}`).join("; ");
        lines.push(
          `- ${arm} r${rep}: ${run.satisfiedCount}/${run.declaredCount}  ${run.execution}  hard=${run.hardFailureCount}  edits=${run.successfulEdits}  ${bits}`,
        );
      }
    }
    lines.push("");
  }

  lines.push("## Feedback-responsive revision", "");
  if (traces.length === 0) {
    lines.push("No held-out P3 run had a clear action → evaluator fact → later compensating action chain.");
  } else {
    lines.push("Strongest traces from public intent, tool action, deterministic feedback, and the next action:");
    lines.push("");
    for (const t of traces) {
      lines.push(`- \`${t.caseId}\` r${t.replicate}: ${t.evidence}`);
    }
  }

  lines.push(
    "",
    "## Cases P3 won / P2 won",
    "",
    `- P3 better: ${agentWins.length ? agentWins.map((id) => `\`${id}\``).join(", ") : "none"}`,
    `- P2 better: ${p2Wins.length ? p2Wins.map((id) => `\`${id}\``).join(", ") : "none"}`,
    "",
    "## Kill-gate verdict",
    "",
    `**${aggregate.verdict}**`,
    "",
    ...aggregate.verdictReasons.map((r) => `- ${r}`),
    "",
    "## Portfolio claim supported by this evidence",
    "",
    aggregate.portfolioClaim,
    "",
    "## Arms and budget",
    "",
    `Both arms used \`${requestedModel}\`, Search & Destroy, the six P1 edit actions, and max edit budget ${P4_MAX_EDIT_BUDGET} (P2 \`MAX_ONE_SHOT_ACTIONS\`, P3 \`MAX_AGENT_EDIT_ATTEMPTS\`).`,
    `Replicates per case per arm: ${P4_REPLICATES}.`,
    "",
  );
  return lines.join("\n");
}

export function startingMapsMatch(a: ArenaMap, b: ArenaMap): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function startingEvaluationsMatch(a: ArenaEvaluation, b: ArenaEvaluation): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function snapshotCase(evalCase: EvalCaseDefinition): {
  map: ArenaMap;
  evaluation: ArenaEvaluation;
} {
  const map = evalCase.buildMap();
  return { map, evaluation: evaluateArena(cloneArenaMap(map)) };
}
