import type { AgentRunResult, AgentSession, AgentTurnRecord } from "./agent.js";
import {
  asEvalCase,
  P4B_ARMS,
  P4B_MANIFEST_ID,
  p4bManifestHash,
  type P4BCaseDefinition,
} from "./eval-cases-p4b.js";
import { formatConstraint, type EvalConstraint, type P4Arm } from "./eval-cases.js";
import {
  classifyFeedbackResponsive,
  median,
  runEvalCaseOnce,
  scoreConstraints,
  type ClaimVerdict,
  type EvalRunArtifact,
} from "./evaluation.js";
import type { OneShotDesigner } from "./one-shot.js";
import type { ArenaEvaluation } from "./types.js";

export type P4BRunArtifact = EvalRunArtifact & {
  targets: ReturnType<typeof scoreConstraints>;
  guardrails: ReturnType<typeof scoreConstraints>;
  targetSatisfied: number;
  targetDeclared: number;
  guardrailSatisfied: number;
  guardrailDeclared: number;
  regressionRecovery?: { classification: "yes" | "no"; evidence: string };
};

export type P4BArmAggregate = {
  arm: P4Arm;
  runs: number;
  satisfied: number;
  declared: number;
  satisfactionRate: number;
  targetSatisfied: number;
  targetDeclared: number;
  guardrailSatisfied: number;
  guardrailDeclared: number;
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
  regressionYes?: number;
  regressionNo?: number;
};

export type P4BCaseComparison = {
  caseId: string;
  title: string;
  oneShotSatisfied: number;
  oneShotDeclared: number;
  agentSatisfied: number;
  agentDeclared: number;
  oneShotTargets: string;
  agentTargets: string;
  oneShotGuardrails: string;
  agentGuardrails: string;
  winner: "one_shot" | "agent" | "tie";
};

const STRONG_CLAIM =
  "evaluator-grounded iterative revision improved deterministic performance on interaction-stress cases";
const MIXED_CLAIM =
  "ArenaForge is a bounded tool-using level-design agent that uses deterministic gameplay evaluation to inspect and revise map edits.";
const FAIL_CLAIM =
  "ArenaForge is a bounded tool-using level-design experiment with deterministic evaluation and traceable revisions.";

function editTurns(turns: AgentTurnRecord[]): AgentTurnRecord[] {
  return turns.filter((t) => t.tool !== "finish_design");
}

export function classifyRegressionRecovery(
  design: AgentRunResult,
  guardrails: EvalConstraint[],
): { classification: "yes" | "no"; evidence: string } {
  const edits = editTurns(design.turns);
  if (edits.length < 2) {
    return { classification: "no", evidence: "fewer than two edits; no later restore step" };
  }

  for (let i = 0; i < edits.length - 1; i++) {
    const before = i === 0 ? design.initialEvaluation : edits[i - 1].evaluationAfter;
    const after = edits[i].evaluationAfter;
    if (!before || !after) continue;

    const beforeHard = before.summary.hardFailureCount;
    const afterHard = after.summary.hardFailureCount;
    const beforeG = scoreConstraints(before, guardrails);
    const afterG = scoreConstraints(after, guardrails);
    const broken = afterG.filter((g, idx) => beforeG[idx]?.satisfied && !g.satisfied);
    const newHard = beforeHard === 0 && afterHard > 0;

    if (broken.length === 0 && !newHard) continue;

    for (let j = i + 1; j < edits.length; j++) {
      const later = edits[j].evaluationAfter;
      if (!later) continue;
      const laterG = scoreConstraints(later, guardrails);
      const restored = broken.every((b) => {
        const idx = afterG.findIndex((x) => x.label === b.label);
        return laterG[idx]?.satisfied;
      });
      const hardRestored = !newHard || later.summary.hardFailureCount === 0;
      if (restored && hardRestored) {
        return {
          classification: "yes",
          evidence: `turn ${edits[i].turn} broke ${broken.map((b) => b.label).join(", ") || "zero-hard-failure"}; turn ${edits[j].turn} restored it`,
        };
      }
    }
  }

  return { classification: "no", evidence: "no broken guardrail or new hard failure was later restored" };
}

export function decorateP4BArtifact(
  base: EvalRunArtifact,
  def: P4BCaseDefinition,
): P4BRunArtifact {
  const targets = scoreConstraints(base.finalEvaluation, def.targets);
  const guardrails = scoreConstraints(base.finalEvaluation, def.guardrails);
  const artifact: P4BRunArtifact = {
    ...base,
    manifestId: P4B_MANIFEST_ID,
    manifestHash: p4bManifestHash(),
    targets,
    guardrails,
    targetSatisfied: targets.filter((c) => c.satisfied).length,
    targetDeclared: targets.length,
    guardrailSatisfied: guardrails.filter((c) => c.satisfied).length,
    guardrailDeclared: guardrails.length,
  };
  if (base.design.kind === "agent") {
    artifact.regressionRecovery = classifyRegressionRecovery(base.design, def.guardrails);
    artifact.feedbackResponsive = classifyFeedbackResponsive(base.design);
  }
  return artifact;
}

export async function runP4BEvalCaseOnce(args: {
  def: P4BCaseDefinition;
  arm: P4Arm;
  replicate: number;
  requestedModel: string;
  designerFactory?: () => OneShotDesigner;
  sessionFactory?: () => AgentSession;
}): Promise<P4BRunArtifact> {
  const base = await runEvalCaseOnce({
    evalCase: asEvalCase(args.def),
    arm: args.arm,
    replicate: args.replicate,
    requestedModel: args.requestedModel,
    designerFactory: args.designerFactory,
    sessionFactory: args.sessionFactory,
  });
  return decorateP4BArtifact(base, args.def);
}

function accumulate(runs: P4BRunArtifact[], arm: P4Arm): P4BArmAggregate {
  const mine = runs.filter((r) => r.arm === arm);
  const agg: P4BArmAggregate = {
    arm,
    runs: mine.length,
    satisfied: 0,
    declared: 0,
    satisfactionRate: 0,
    targetSatisfied: 0,
    targetDeclared: 0,
    guardrailSatisfied: 0,
    guardrailDeclared: 0,
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
    ...(arm === "agent"
      ? { feedbackYes: 0, feedbackNo: 0, feedbackUnclear: 0, regressionYes: 0, regressionNo: 0 }
      : {}),
  };
  for (const run of mine) {
    agg.satisfied += run.satisfiedCount;
    agg.declared += run.declaredCount;
    agg.targetSatisfied += run.targetSatisfied;
    agg.targetDeclared += run.targetDeclared;
    agg.guardrailSatisfied += run.guardrailSatisfied;
    agg.guardrailDeclared += run.guardrailDeclared;
    if (run.zeroHardFailures) agg.zeroHardFailureRuns += 1;
    else agg.hardFailureRuns += 1;
    if (run.execution === "completed") agg.completed += 1;
    if (run.execution === "invalid_model_output") agg.invalidModelOutput += 1;
    if (run.execution === "action_rejected") agg.actionRejected += 1;
    if (run.execution === "budget_exhausted") agg.budgetExhausted += 1;
    if (run.execution === "model_error") agg.modelError += 1;
    if (arm === "agent") {
      if (run.feedbackResponsive?.classification === "yes") agg.feedbackYes = (agg.feedbackYes ?? 0) + 1;
      if (run.feedbackResponsive?.classification === "no") agg.feedbackNo = (agg.feedbackNo ?? 0) + 1;
      if (run.feedbackResponsive?.classification === "unclear") {
        agg.feedbackUnclear = (agg.feedbackUnclear ?? 0) + 1;
      }
      if (run.regressionRecovery?.classification === "yes") agg.regressionYes = (agg.regressionYes ?? 0) + 1;
      if (run.regressionRecovery?.classification === "no") agg.regressionNo = (agg.regressionNo ?? 0) + 1;
    }
  }
  agg.satisfactionRate = agg.declared === 0 ? 0 : agg.satisfied / agg.declared;
  agg.medianSuccessfulEdits = median(mine.map((r) => r.successfulEdits));
  agg.medianTotalTokens = median(mine.map((r) => r.usage.totalTokens));
  agg.medianLatencyMs = median(mine.map((r) => r.latencyMs));
  return agg;
}

function caseComparisons(runs: P4BRunArtifact[]): P4BCaseComparison[] {
  const ids = [...new Set(runs.map((r) => r.caseId))];
  return ids.map((caseId) => {
    const mine = runs.filter((r) => r.caseId === caseId);
    const one = mine.filter((r) => r.arm === "one_shot");
    const agent = mine.filter((r) => r.arm === "agent");
    const sum = (xs: P4BRunArtifact[], pick: (r: P4BRunArtifact) => number) =>
      xs.reduce((n, r) => n + pick(r), 0);
    const oneShotSatisfied = sum(one, (r) => r.satisfiedCount);
    const oneShotDeclared = sum(one, (r) => r.declaredCount);
    const agentSatisfied = sum(agent, (r) => r.satisfiedCount);
    const agentDeclared = sum(agent, (r) => r.declaredCount);
    const oneRate = oneShotDeclared === 0 ? 0 : oneShotSatisfied / oneShotDeclared;
    const agentRate = agentDeclared === 0 ? 0 : agentSatisfied / agentDeclared;
    let winner: P4BCaseComparison["winner"] = "tie";
    if (agentRate > oneRate) winner = "agent";
    else if (oneRate > agentRate) winner = "one_shot";
    return {
      caseId,
      title: mine[0]?.title ?? caseId,
      oneShotSatisfied,
      oneShotDeclared,
      agentSatisfied,
      agentDeclared,
      oneShotTargets: `${sum(one, (r) => r.targetSatisfied)}/${sum(one, (r) => r.targetDeclared)}`,
      agentTargets: `${sum(agent, (r) => r.targetSatisfied)}/${sum(agent, (r) => r.targetDeclared)}`,
      oneShotGuardrails: `${sum(one, (r) => r.guardrailSatisfied)}/${sum(one, (r) => r.guardrailDeclared)}`,
      agentGuardrails: `${sum(agent, (r) => r.guardrailSatisfied)}/${sum(agent, (r) => r.guardrailDeclared)}`,
      winner,
    };
  });
}

export type P4BSuiteAggregate = {
  manifestId: string;
  manifestHash: string;
  requestedModel: string;
  returnedModels: string[];
  mixedReturnedModels: boolean;
  heldOutRuns: number;
  oneShot: P4BArmAggregate;
  agent: P4BArmAggregate;
  cases: P4BCaseComparison[];
  verdict: ClaimVerdict;
  verdictReasons: string[];
  portfolioClaim: string;
};

function guardrailHarm(runs: P4BRunArtifact[]): boolean {
  const yes = runs.filter((r) => r.arm === "agent" && r.feedbackResponsive?.classification === "yes");
  if (yes.length === 0) return false;
  const harmed = yes.filter((r) => r.guardrailSatisfied < r.guardrailDeclared);
  return harmed.length * 2 >= yes.length;
}

export function decideP4BClaimGate(
  oneShot: P4BArmAggregate,
  agent: P4BArmAggregate,
  cases: P4BCaseComparison[],
  runs: P4BRunArtifact[],
): { verdict: ClaimVerdict; reasons: string[]; claim: string } {
  const reasons: string[] = [];
  const delta = agent.satisfactionRate - oneShot.satisfactionRate;
  const better = cases.filter((c) => c.winner === "agent").length;
  const worse = cases.filter((c) => c.winner === "one_shot").length;
  const yes = agent.feedbackYes ?? 0;
  const reg = agent.regressionYes ?? 0;
  const p2Target = oneShot.targetDeclared === 0 ? 0 : oneShot.targetSatisfied / oneShot.targetDeclared;
  const p3Target = agent.targetDeclared === 0 ? 0 : agent.targetSatisfied / agent.targetDeclared;
  const p2G = oneShot.guardrailDeclared === 0 ? 0 : oneShot.guardrailSatisfied / oneShot.guardrailDeclared;
  const p3G = agent.guardrailDeclared === 0 ? 0 : agent.guardrailSatisfied / agent.guardrailDeclared;

  const strong =
    delta >= 0.1 &&
    p3Target > p2Target &&
    p3G >= p2G &&
    better >= 3 &&
    worse <= 1 &&
    yes >= 3 &&
    reg >= 1 &&
    agent.hardFailureRuns <= oneShot.hardFailureRuns;

  reasons.push(
    `P3 overall ${(agent.satisfactionRate * 100).toFixed(1)}% vs P2 ${(oneShot.satisfactionRate * 100).toFixed(1)}% (delta ${(delta * 100).toFixed(1)} pp)`,
  );
  reasons.push(
    `targets P3 ${agent.targetSatisfied}/${agent.targetDeclared} vs P2 ${oneShot.targetSatisfied}/${oneShot.targetDeclared}`,
  );
  reasons.push(
    `guardrails P3 ${agent.guardrailSatisfied}/${agent.guardrailDeclared} vs P2 ${oneShot.guardrailSatisfied}/${oneShot.guardrailDeclared}`,
  );
  reasons.push(`case winners: agent ${better}, one_shot ${worse}, tie ${cases.filter((c) => c.winner === "tie").length}`);
  reasons.push(`feedback-responsive yes=${yes}  regression-recovery yes=${reg}`);
  reasons.push(`hard-failure runs P3 ${agent.hardFailureRuns}, P2 ${oneShot.hardFailureRuns}`);

  if (strong) {
    return { verdict: "STRONG PASS", reasons, claim: STRONG_CLAIM };
  }

  const noBeat = agent.satisfactionRate <= oneShot.satisfactionRate;
  const rareFeedback = yes === 0;
  const harmed = guardrailHarm(runs);
  if (noBeat && (rareFeedback || harmed)) {
    if (noBeat) reasons.push("P3 does not outperform P2 overall");
    if (rareFeedback) reasons.push("meaningful feedback-responsive revision is absent");
    if (harmed) reasons.push("iterative revisions commonly leave guardrails broken");
    return { verdict: "FAIL", reasons, claim: FAIL_CLAIM };
  }
  if (yes > 0 && !strong) {
    reasons.push("feedback-responsive revision appeared, but the quantitative STRONG PASS gate was not met");
    return { verdict: "MIXED", reasons, claim: MIXED_CLAIM };
  }
  return { verdict: "FAIL", reasons, claim: FAIL_CLAIM };
}

export function aggregateP4B(runs: P4BRunArtifact[], requestedModel: string): P4BSuiteAggregate {
  const held = runs.filter((r) => r.split === "held_out");
  const oneShot = accumulate(held, "one_shot");
  const agent = accumulate(held, "agent");
  const cases = caseComparisons(held);
  const returned = [...new Set(held.flatMap((r) => r.returnedModels))];
  const gate = decideP4BClaimGate(oneShot, agent, cases, held);
  return {
    manifestId: P4B_MANIFEST_ID,
    manifestHash: p4bManifestHash(),
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

export function renderP4BMarkdown(args: {
  requestedModel: string;
  aggregate: P4BSuiteAggregate;
  runs: P4BRunArtifact[];
}): string {
  const { aggregate, runs, requestedModel } = args;
  const held = runs.filter((r) => r.split === "held_out");
  const yesTraces = held.filter((r) => r.arm === "agent" && r.feedbackResponsive?.classification === "yes");
  const regTraces = held.filter((r) => r.arm === "agent" && r.regressionRecovery?.classification === "yes");
  const lines = [
    "# ArenaForge P4-B evaluation",
    "",
    "Interaction / revision stress suite. Separate from P4-A basic repair.",
    "",
    "## Why P4-B exists",
    "",
    "P4-A was a valid basic-recovery check. Both frozen modes scored 34/34 (100%). P3 feedback-responsive revision was 0/10 because almost every run was one edit then finish. That ceiling did not test evaluator-grounded revision.",
    "",
    "P4-B asks: when an edit that helps a target can change a guardrail, does the iterative agent recover or refine better than one-shot?",
    "",
    "## P4-A (do not mix into P4-B percents)",
    "",
    "- basic recovery",
    "- P2 100%",
    "- P3 100%",
    "",
    "## Contract",
    "",
    `- Manifest: \`${aggregate.manifestId}\``,
    `- Hash: \`${aggregate.manifestHash}\``,
    "- Arms: frozen `runOneShotDesign` vs frozen `runAgentDesign`",
    `- Model alias: \`${requestedModel}\``,
    "- 5 cases × 2 arms × 2 replicates = 20 runs",
    "- P2 is one structured proposal. P3 is sequential function calls. This is not a pure causal test of feedback.",
    "",
    "## Cases",
    "",
    "| Case | Targets | Guardrails |",
    "| --- | --- | --- |",
  ];

  const seen = new Map<string, P4BRunArtifact>();
  for (const run of held) {
    if (!seen.has(run.caseId)) seen.set(run.caseId, run);
  }
  for (const run of seen.values()) {
    lines.push(
      `| \`${run.caseId}\` | ${run.targets.map((c) => c.label).join("; ")} | ${run.guardrails.map((c) => c.label).join("; ")} |`,
    );
  }

  const pct = (s: number, d: number) => (d === 0 ? "n/a" : `${((s / d) * 100).toFixed(1)}%`);
  const md = (v: number | undefined) => (v === undefined ? "-" : String(Math.round(v)));

  lines.push(
    "",
    "## Aggregate",
    "",
    "| Metric | one_shot (P2) | agent (P3) |",
    "| --- | --- | --- |",
    `| Overall constraints | ${aggregate.oneShot.satisfied}/${aggregate.oneShot.declared} (${pct(aggregate.oneShot.satisfied, aggregate.oneShot.declared)}) | ${aggregate.agent.satisfied}/${aggregate.agent.declared} (${pct(aggregate.agent.satisfied, aggregate.agent.declared)}) |`,
    `| Targets | ${aggregate.oneShot.targetSatisfied}/${aggregate.oneShot.targetDeclared} | ${aggregate.agent.targetSatisfied}/${aggregate.agent.targetDeclared} |`,
    `| Guardrails | ${aggregate.oneShot.guardrailSatisfied}/${aggregate.oneShot.guardrailDeclared} | ${aggregate.agent.guardrailSatisfied}/${aggregate.agent.guardrailDeclared} |`,
    `| Zero-hard-failure runs | ${aggregate.oneShot.zeroHardFailureRuns}/${aggregate.oneShot.runs} | ${aggregate.agent.zeroHardFailureRuns}/${aggregate.agent.runs} |`,
    `| Completed | ${aggregate.oneShot.completed}/${aggregate.oneShot.runs} | ${aggregate.agent.completed}/${aggregate.agent.runs} |`,
    `| Invalid / rejected / budget / error | ${aggregate.oneShot.invalidModelOutput}/${aggregate.oneShot.actionRejected}/${aggregate.oneShot.budgetExhausted}/${aggregate.oneShot.modelError} | ${aggregate.agent.invalidModelOutput}/${aggregate.agent.actionRejected}/${aggregate.agent.budgetExhausted}/${aggregate.agent.modelError} |`,
    `| Median successful edits | ${md(aggregate.oneShot.medianSuccessfulEdits)} | ${md(aggregate.agent.medianSuccessfulEdits)} |`,
    `| Median tokens | ${md(aggregate.oneShot.medianTotalTokens)} | ${md(aggregate.agent.medianTotalTokens)} |`,
    `| Median latency ms | ${md(aggregate.oneShot.medianLatencyMs)} | ${md(aggregate.agent.medianLatencyMs)} |`,
    `| Feedback yes/no/unclear | n/a | ${aggregate.agent.feedbackYes ?? 0}/${aggregate.agent.feedbackNo ?? 0}/${aggregate.agent.feedbackUnclear ?? 0} |`,
    `| Regression recovery yes/no | n/a | ${aggregate.agent.regressionYes ?? 0}/${aggregate.agent.regressionNo ?? 0} |`,
    "",
    `Returned models: ${aggregate.returnedModels.map((m) => `\`${m}\``).join(", ") || "(none)"}`,
    "",
    "## Per-case",
    "",
    "| Case | P2 | P3 | Targets P2/P3 | Guardrails P2/P3 | Winner |",
    "| --- | --- | --- | --- | --- | --- |",
  );
  for (const c of aggregate.cases) {
    lines.push(
      `| \`${c.caseId}\` | ${c.oneShotSatisfied}/${c.oneShotDeclared} | ${c.agentSatisfied}/${c.agentDeclared} | ${c.oneShotTargets} / ${c.agentTargets} | ${c.oneShotGuardrails} / ${c.agentGuardrails} | ${c.winner} |`,
    );
  }

  lines.push("", "### Replicate grid", "");
  for (const caseId of [...new Set(held.map((r) => r.caseId))]) {
    lines.push(`#### \`${caseId}\``, "");
    for (const arm of P4B_ARMS) {
      for (const rep of [1, 2] as const) {
        const run = held.find((r) => r.caseId === caseId && r.arm === arm && r.replicate === rep);
        if (!run) {
          lines.push(`- ${arm} r${rep}: missing`);
          continue;
        }
        lines.push(
          `- ${arm} r${rep}: ${run.satisfiedCount}/${run.declaredCount}  target ${run.targetSatisfied}/${run.targetDeclared}  guard ${run.guardrailSatisfied}/${run.guardrailDeclared}  ${run.execution}  edits=${run.successfulEdits}`,
        );
      }
    }
    lines.push("");
  }

  lines.push("## Feedback-responsive traces", "");
  if (yesTraces.length === 0) {
    lines.push("No held-out P3 run had a later action that targeted a newly observed evaluator fact.");
  } else {
    for (const t of yesTraces.slice(0, 3)) {
      lines.push(`- \`${t.caseId}\` r${t.replicate}: ${t.feedbackResponsive?.evidence}`);
    }
  }

  lines.push("", "## Regression-recovery traces", "");
  if (regTraces.length === 0) {
    lines.push("No held-out P3 run restored a guardrail or hard-failure regression after a later edit.");
  } else {
    for (const t of regTraces) {
      lines.push(`- \`${t.caseId}\` r${t.replicate}: ${t.regressionRecovery?.evidence}`);
    }
  }

  const p3w = aggregate.cases.filter((c) => c.winner === "agent").map((c) => c.caseId);
  const p2w = aggregate.cases.filter((c) => c.winner === "one_shot").map((c) => c.caseId);
  lines.push(
    "",
    "## Winners",
    "",
    `- P3 better: ${p3w.length ? p3w.map((id) => `\`${id}\``).join(", ") : "none"}`,
    `- P2 better: ${p2w.length ? p2w.map((id) => `\`${id}\``).join(", ") : "none"}`,
    "",
    "## Verdict",
    "",
    `**${aggregate.verdict}**`,
    "",
    ...aggregate.verdictReasons.map((r) => `- ${r}`),
    "",
    "## Portfolio claim",
    "",
    aggregate.portfolioClaim,
    "",
  );
  return lines.join("\n");
}

export function p4bEvalCase(def: P4BCaseDefinition) {
  return asEvalCase(def);
}

export function formatConstraintList(constraints: EvalConstraint[]): string {
  return constraints.map(formatConstraint).join(" | ");
}

export function initialRoleScores(evaluation: ArenaEvaluation, def: P4BCaseDefinition) {
  return {
    targets: scoreConstraints(evaluation, def.targets),
    guardrails: scoreConstraints(evaluation, def.guardrails),
  };
}
