import { describe, expect, it } from "vitest";
import { applyArenaEdit, createIdAllocator, type ArenaEditAction } from "../src/arena-forge/actions.js";
import { ScriptedAgentSession, type AgentTurnDecision } from "../src/arena-forge/agent.js";
import {
  asEvalCase,
  formatFrozenP4BManifest,
  getP4BCase,
  P4B_ARMS,
  P4B_MANIFEST_ID,
  P4B_MAX_EDIT_BUDGET,
  P4B_REPLICATES,
  p4bHeldOutCases,
  p4bManifestHash,
} from "../src/arena-forge/eval-cases-p4b.js";
import { p4ManifestHash } from "../src/arena-forge/eval-cases.js";
import {
  aggregateP4B,
  classifyRegressionRecovery,
  decorateP4BArtifact,
  initialRoleScores,
  runP4BEvalCaseOnce,
  type P4BRunArtifact,
} from "../src/arena-forge/evaluation-p4b.js";
import {
  checkConstraint,
  runEvalArm,
  scoreConstraints,
  snapshotCase,
  startingEvaluationsMatch,
  startingMapsMatch,
  type EvalRunArtifact,
} from "../src/arena-forge/evaluation.js";
import type { OneShotDesignInput, OneShotDesigner, OneShotDesignerResult } from "../src/arena-forge/one-shot.js";
import { evaluateArena } from "../src/arena-forge/evaluator.js";
import type { ArenaEvaluation, ArenaMap, HardIssue, LosPair, PathPair } from "../src/arena-forge/types.js";

const P4A_FROZEN_HASH = "6acb4b3274ec7d1bb06090f5342816737227a9855945558958bc3d29154282e2";

const P4B_REFERENCE: Record<string, ArenaEditAction[]> = {
  "p4b-route-opens-los": [{ type: "resize_solid", solidId: "obstacle-2", hx: 4, hy: 2, hz: 2 }],
  "p4b-cover-hurts-nav": [
    { type: "add_solid", kind: "occluder", x: -6, y: 2, z: -3, hx: 0.4, hy: 2, hz: 0.4 },
  ],
  "p4b-shared-ab": [{ type: "resize_solid", solidId: "obstacle-2", hx: 2.2, hy: 2, hz: 2.5 }],
  "p4b-gap-vs-los": [{ type: "resize_solid", solidId: "obstacle-2", hx: 4.5, hy: 2, hz: 0.4 }],
  "p4b-multi-coupled": [
    { type: "resize_solid", solidId: "obstacle-2", hx: 4.5, hy: 2, hz: 0.4 },
    { type: "resize_solid", solidId: "obstacle-4", hx: 2.2, hy: 2, hz: 2.5 },
  ],
};

function apply(map: ArenaMap, action: ArenaEditAction): ArenaMap {
  const result = applyArenaEdit(map, action, createIdAllocator(map));
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.map;
}

function applyAll(map: ArenaMap, actions: ArenaEditAction[]): ArenaMap {
  return actions.reduce(apply, map);
}

function fakeDesigner(raw: unknown): OneShotDesigner {
  return {
    async propose(_input: OneShotDesignInput): Promise<OneShotDesignerResult> {
      return {
        raw,
        model: { requested: "gpt-5.6", returned: "gpt-5.6-sol" },
        latencyMs: 1,
      };
    },
  };
}

function decision(name: string, args: unknown): AgentTurnDecision {
  return { calls: [{ name, arguments: args, callId: `call-${name}` }], latencyMs: 1 };
}

function emptyEval(partial: Partial<ArenaEvaluation> = {}): ArenaEvaluation {
  return {
    mode: "search_destroy",
    geometry: { issues: [] },
    spawns: { results: [] },
    objectives: { results: [] },
    navigation: {
      cellMeters: 0.5,
      neighbors: "4",
      limitation: "test",
      walkableCells: 1,
      totalCells: 1,
      components: { count: 1, largestCells: 1, largestFraction: 1 },
      anchors: [],
      paths: [],
      aggregates: [],
    },
    lineOfSight: { eyeHeight: 1.6, pairs: [] },
    summary: { hardFailureCount: 0, hardFailures: [] },
    ...partial,
  };
}

function path(from: string, to: string, reachable: boolean, distanceMeters?: number): PathPair {
  return { from, to, reachable, distanceMeters };
}

function los(from: string, to: string, clear: boolean, blockedBy?: string): LosPair {
  return { from, to, clear, distanceMeters: 20, blockedBy };
}

function hard(code: string, extra: HardIssue = { code }): HardIssue {
  return { code, ...extra };
}

function blankMap(): ArenaMap {
  return {
    boundsHalfSize: 12,
    wallHeight: 3,
    wallThickness: 0.4,
    groundThickness: 0.1,
    solids: [],
    spawns: [],
    objectives: [],
    spawnProtectionZones: [],
  };
}

function p4bRun(partial: Partial<P4BRunArtifact> & Pick<P4BRunArtifact, "caseId" | "arm" | "replicate">): P4BRunArtifact {
  const targets = partial.targets ?? [
    { constraint: { type: "all_sd_paths_reachable" } as const, label: "target", satisfied: true, detail: "" },
  ];
  const guardrails = partial.guardrails ?? [
    { constraint: { type: "no_hard_failures" } as const, label: "guard", satisfied: true, detail: "" },
  ];
  const constraints = [...targets, ...guardrails];
  const base: EvalRunArtifact = {
    schemaVersion: 1,
    manifestId: P4B_MANIFEST_ID,
    manifestHash: p4bManifestHash(),
    split: "held_out",
    title: partial.caseId,
    brief: "brief",
    requestedModel: "gpt-5.6",
    returnedModels: ["gpt-5.6-sol"],
    infrastructureRetry: false,
    initialMap: blankMap(),
    initialEvaluation: emptyEval(),
    design: {
      kind: "one_shot",
      brief: "brief",
      sourceMapId: partial.caseId,
      model: { requested: "gpt-5.6", returned: "gpt-5.6-sol" },
      timing: { modelLatencyMs: 1, totalLatencyMs: 1 },
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      initialMap: blankMap(),
      initialEvaluation: emptyEval(),
      actionResults: [],
      executionStatus: "completed",
      finalMap: blankMap(),
      finalEvaluation: emptyEval(),
    },
    finalMap: blankMap(),
    finalEvaluation: emptyEval(),
    constraints,
    satisfiedCount: constraints.filter((c) => c.satisfied).length,
    declaredCount: constraints.length,
    hardFailureCount: 0,
    zeroHardFailures: true,
    execution: "completed",
    successfulEdits: 1,
    editAttempts: 1,
    rejectedEditAttempts: 0,
    modelCalls: 1,
    usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    latencyMs: 100,
  };
  return {
    ...base,
    targets,
    guardrails,
    targetSatisfied: targets.filter((c) => c.satisfied).length,
    targetDeclared: targets.length,
    guardrailSatisfied: guardrails.filter((c) => c.satisfied).length,
    guardrailDeclared: guardrails.length,
    ...partial,
  };
}

function suiteGrid(opts: {
  p3Wins: number[];
  p3TargetOk?: boolean;
  p2TargetOk?: boolean;
  p3GuardOk?: boolean;
  p2GuardOk?: boolean;
  feedbackYes?: number;
  regressionYes?: number;
  p3HardRuns?: number;
  p2HardRuns?: number;
}): P4BRunArtifact[] {
  const ids = p4bHeldOutCases().map((c) => c.id);
  const runs: P4BRunArtifact[] = [];
  let feedbackLeft = opts.feedbackYes ?? 0;
  let regressionLeft = opts.regressionYes ?? 0;
  let p3HardLeft = opts.p3HardRuns ?? 0;
  let p2HardLeft = opts.p2HardRuns ?? 0;
  for (const [i, caseId] of ids.entries()) {
    const agentWins = opts.p3Wins.includes(i);
    for (const arm of P4B_ARMS) {
      for (const replicate of [1, 2] as const) {
        const targetOk = arm === "agent" ? (opts.p3TargetOk ?? agentWins) : (opts.p2TargetOk ?? !agentWins);
        const guardOk = arm === "agent" ? (opts.p3GuardOk ?? true) : (opts.p2GuardOk ?? true);
        const hardRun =
          arm === "agent" ? p3HardLeft-- > 0 : p2HardLeft-- > 0;
        runs.push(
          p4bRun({
            caseId,
            arm,
            replicate,
            targets: [
              {
                constraint: { type: "all_sd_paths_reachable" },
                label: "target",
                satisfied: targetOk,
                detail: "",
              },
            ],
            guardrails: [
              { constraint: { type: "no_hard_failures" }, label: "guard", satisfied: guardOk, detail: "" },
            ],
            satisfiedCount: (targetOk ? 1 : 0) + (guardOk ? 1 : 0),
            declaredCount: 2,
            zeroHardFailures: !hardRun,
            hardFailureCount: hardRun ? 1 : 0,
            feedbackResponsive:
              arm === "agent"
                ? {
                    classification: feedbackLeft-- > 0 ? "yes" : "no",
                    evidence: "note",
                  }
                : undefined,
            regressionRecovery:
              arm === "agent"
                ? {
                    classification: regressionLeft-- > 0 ? "yes" : "no",
                    evidence: "note",
                  }
                : undefined,
          }),
        );
      }
    }
  }
  return runs;
}

describe("P4-B A P4-A hash frozen", () => {
  it("does not change the P4-A manifest hash", () => {
    expect(p4ManifestHash()).toBe(P4A_FROZEN_HASH);
  });
});

describe("P4-B B held-out ids", () => {
  it("exposes five held-out interaction cases", () => {
    expect(p4bHeldOutCases().map((c) => c.id)).toEqual([
      "p4b-route-opens-los",
      "p4b-cover-hurts-nav",
      "p4b-shared-ab",
      "p4b-gap-vs-los",
      "p4b-multi-coupled",
    ]);
    expect(P4B_REPLICATES).toBe(2);
    expect(P4B_ARMS).toEqual(["one_shot", "agent"]);
    expect(P4B_MAX_EDIT_BUDGET).toBe(8);
    expect(p4bHeldOutCases().filter((c) => c.split === "held_out")).toHaveLength(5);
    expect(p4bHeldOutCases().filter((c) => c.sourceRegisteredMap === "custom-smoke-layout")).toHaveLength(1);
    expect(formatFrozenP4BManifest("gpt-5.6")).toContain("P4-B MANIFEST FROZEN");
    expect(p4bManifestHash()).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("P4-B C targets start unsatisfied", () => {
  it("fails every target on the starting fixture", () => {
    for (const def of p4bHeldOutCases()) {
      const { evaluation } = snapshotCase(asEvalCase(def));
      const targets = scoreConstraints(evaluation, def.targets);
      expect(targets.length).toBeGreaterThan(0);
      expect(targets.every((c) => !c.satisfied)).toBe(true);
    }
  });
});

describe("P4-B D guardrails start satisfied", () => {
  it("passes every guardrail on the starting fixture", () => {
    for (const def of p4bHeldOutCases()) {
      const { evaluation } = snapshotCase(asEvalCase(def));
      const guards = scoreConstraints(evaluation, def.guardrails);
      expect(guards.length).toBeGreaterThan(0);
      expect(guards.every((c) => c.satisfied)).toBe(true);
    }
  });
});

describe("P4-B E documented probe consequence", () => {
  it("improves a target and changes another monitored property", () => {
    const expected = {
      "p4b-route-opens-los": { a: 13, losClear: true },
      "p4b-cover-hurts-nav": { losClear: false, hard: 1 },
      "p4b-shared-ab": { a: 12.5, b: 25.5 },
      "p4b-gap-vs-los": { paths: 12, losClear: true },
      "p4b-multi-coupled": { a: 12.5, bUndefined: true },
    } as const;

    for (const def of p4bHeldOutCases()) {
      const start = snapshotCase(asEvalCase(def));
      const after = evaluateArena(apply(start.map, def.probe.action));
      const startRoles = initialRoleScores(start.evaluation, def);
      const afterRoles = initialRoleScores(after, def);
      const targetImproved = afterRoles.targets.some(
        (t, i) => t.satisfied && !startRoles.targets[i]?.satisfied,
      );
      const otherChanged =
        afterRoles.guardrails.some((g, i) => g.satisfied !== startRoles.guardrails[i]?.satisfied) ||
        after.summary.hardFailureCount !== start.evaluation.summary.hardFailureCount ||
        JSON.stringify(after.navigation.aggregates) !== JSON.stringify(start.evaluation.navigation.aggregates);
      expect(targetImproved, def.id).toBe(true);
      expect(otherChanged, def.id).toBe(true);

      const ghostA = after.navigation.aggregates.find((a) => a.fromRole === "ghost" && a.to === "objective-A");
      const ghostB = after.navigation.aggregates.find((a) => a.fromRole === "ghost" && a.to === "objective-B");
      const los0 = after.lineOfSight.pairs.find(
        (p) => p.from === "ghost-spawn-0" && p.to === "sentinel-spawn-0",
      );
      const exp = expected[def.id as keyof typeof expected];
      if ("a" in exp) expect(ghostA?.medianMeters).toBe(exp.a);
      if ("b" in exp) expect(ghostB?.medianMeters).toBe(exp.b);
      if ("losClear" in exp) expect(los0?.clear).toBe(exp.losClear);
      if ("hard" in exp) expect(after.summary.hardFailureCount).toBe(exp.hard);
      if ("paths" in exp) expect(after.navigation.paths.filter((p) => p.reachable).length).toBe(exp.paths);
      if ("bUndefined" in exp) expect(ghostB?.medianMeters).toBeUndefined();
    }
  });
});

describe("P4-B F reference edits jointly satisfy", () => {
  it("reaches every target and guardrail with the test-only reference sequence", () => {
    for (const def of p4bHeldOutCases()) {
      const start = def.buildMap();
      const after = evaluateArena(applyAll(start, P4B_REFERENCE[def.id] ?? []));
      const roles = initialRoleScores(after, def);
      expect(roles.targets.every((c) => c.satisfied), def.id).toBe(true);
      expect(roles.guardrails.every((c) => c.satisfied), def.id).toBe(true);
    }
  });
});

describe("P4-B G same starting maps", () => {
  it("gives both arms the same start map and P0 evaluation", async () => {
    const def = getP4BCase("p4b-route-opens-los");
    const evalCase = asEvalCase(def);
    const one = await runEvalArm({
      evalCase,
      arm: "one_shot",
      designer: fakeDesigner({ designSummary: "none", actions: [] }),
      requestedModel: "gpt-5.6",
    });
    const agent = await runEvalArm({
      evalCase,
      arm: "agent",
      session: new ScriptedAgentSession([decision("finish_design", { summary: "stop" })]),
      requestedModel: "gpt-5.6",
    });
    expect(startingMapsMatch(one.initialMap, agent.initialMap)).toBe(true);
    expect(startingEvaluationsMatch(one.initialEvaluation, agent.initialEvaluation)).toBe(true);
    expect(one.brief).toBe(def.brief);
    expect(agent.brief).toBe(def.brief);
  });
});

describe("P4-B H target and guardrail scoring", () => {
  it("scores roles independently from a synthetic evaluation", () => {
    const ev = emptyEval({
      summary: { hardFailureCount: 1, hardFailures: [hard("spawn-blocked")] },
      navigation: {
        ...emptyEval().navigation,
        paths: [path("ghost-spawn-0", "objective-A", true, 10), path("sentinel-spawn-0", "objective-B", false)],
        aggregates: [{ fromRole: "ghost", to: "objective-A", sampleCount: 3, medianMeters: 12.5 }],
      },
      lineOfSight: { eyeHeight: 1.6, pairs: [los("ghost-spawn-0", "sentinel-spawn-0", false, "obstacle-2")] },
    });
    const def = getP4BCase("p4b-route-opens-los");
    const roles = initialRoleScores(ev, def);
    expect(checkConstraint(ev, def.targets[0]!).satisfied).toBe(true);
    expect(roles.targets[0]?.satisfied).toBe(true);
    expect(roles.guardrails.find((g) => g.constraint.type === "no_hard_failures")?.satisfied).toBe(false);
    expect(roles.guardrails.find((g) => g.constraint.type === "all_sd_paths_reachable")?.satisfied).toBe(false);
    expect(roles.guardrails.find((g) => g.constraint.type === "los_blocked")?.satisfied).toBe(true);
  });
});

describe("P4-B I regression-recovery classifier", () => {
  it("marks yes when a later edit restores a broken guardrail", async () => {
    const def = getP4BCase("p4b-route-opens-los");
    const result = await runEvalArm({
      evalCase: asEvalCase(def),
      arm: "agent",
      requestedModel: "gpt-5.6",
      session: new ScriptedAgentSession([
        decision("resize_solid", { solidId: "obstacle-2", hx: 2.5, hy: 2, hz: 2, intent: "open A" }),
        decision("resize_solid", { solidId: "obstacle-2", hx: 4, hy: 2, hz: 2, intent: "restore LOS" }),
        decision("finish_design", { summary: "done" }),
      ]),
    });
    expect(result.kind).toBe("agent");
    if (result.kind !== "agent") return;
    const classified = classifyRegressionRecovery(result, def.guardrails);
    expect(classified.classification).toBe("yes");
    expect(classified.evidence).toMatch(/los_blocked|turn /);
  });

  it("marks no when the agent edits once and finishes", async () => {
    const def = getP4BCase("p4b-route-opens-los");
    const result = await runEvalArm({
      evalCase: asEvalCase(def),
      arm: "agent",
      requestedModel: "gpt-5.6",
      session: new ScriptedAgentSession([
        decision("resize_solid", { solidId: "obstacle-2", hx: 4, hy: 2, hz: 2, intent: "shorten A" }),
        decision("finish_design", { summary: "done" }),
      ]),
    });
    expect(result.kind).toBe("agent");
    if (result.kind !== "agent") return;
    expect(classifyRegressionRecovery(result, def.guardrails).classification).toBe("no");
  });
});

describe("P4-B J claim gate", () => {
  it("returns STRONG PASS only when the predeclared P4-B gate holds", () => {
    const runs = suiteGrid({
      p3Wins: [0, 1, 2, 3],
      feedbackYes: 4,
      regressionYes: 1,
    });
    const agg = aggregateP4B(runs, "gpt-5.6");
    expect(agg.agent.satisfactionRate).toBeGreaterThanOrEqual(agg.oneShot.satisfactionRate + 0.1);
    expect(agg.verdict).toBe("STRONG PASS");
  });

  it("returns MIXED when feedback exists but the quantitative gate is missed", () => {
    const runs = suiteGrid({
      p3Wins: [0, 1],
      p3TargetOk: true,
      p2TargetOk: true,
      feedbackYes: 4,
      regressionYes: 0,
    });
    const agg = aggregateP4B(runs, "gpt-5.6");
    expect(agg.verdict).toBe("MIXED");
  });

  it("returns FAIL when P3 does not beat P2 and feedback is absent", () => {
    const runs = suiteGrid({
      p3Wins: [],
      p3TargetOk: false,
      p2TargetOk: true,
      feedbackYes: 0,
      regressionYes: 0,
    });
    const agg = aggregateP4B(runs, "gpt-5.6");
    expect(agg.oneShot.satisfactionRate).toBeGreaterThan(agg.agent.satisfactionRate);
    expect(agg.verdict).toBe("FAIL");
  });

  it("stamps P4-B manifest ids on decorated artifacts", async () => {
    const def = getP4BCase("p4b-cover-hurts-nav");
    const artifact = await runP4BEvalCaseOnce({
      def,
      arm: "one_shot",
      replicate: 1,
      requestedModel: "gpt-5.6",
      designerFactory: () => fakeDesigner({ designSummary: "none", actions: [] }),
    });
    expect(artifact.manifestId).toBe(P4B_MANIFEST_ID);
    expect(artifact.manifestHash).toBe(p4bManifestHash());
    expect(artifact.targetSatisfied).toBe(0);
    expect(artifact.guardrailSatisfied).toBe(artifact.guardrailDeclared);
    expect(decorateP4BArtifact(artifact, def).manifestId).toBe(P4B_MANIFEST_ID);
  });
});
