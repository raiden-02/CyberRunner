import { describe, expect, it } from "vitest";
import { ScriptedAgentSession, type AgentTurnDecision } from "../src/arena-forge/agent.js";
import {
  CASE4_GHOST_B_MEDIAN_AT_MOST,
  formatConstraint,
  formatFrozenManifest,
  getEvalCase,
  heldOutCases,
  P4_ARMS,
  P4_MANIFEST_ID,
  P4_MAX_EDIT_BUDGET,
  P4_REPLICATES,
  p4ManifestHash,
  type EvalConstraint,
} from "../src/arena-forge/eval-cases.js";
import {
  aggregateHeldOut,
  artifactFromDesign,
  checkConstraint,
  classifyFeedbackResponsive,
  executionOf,
  isTransientInfraMessage,
  median,
  runEvalArm,
  runEvalCaseOnce,
  sanitizeEvalArtifact,
  scoreConstraints,
  snapshotCase,
  startingEvaluationsMatch,
  startingMapsMatch,
  type EvalRunArtifact,
} from "../src/arena-forge/evaluation.js";
import {
  MAX_ONE_SHOT_ACTIONS,
  runOneShotDesign,
  type OneShotDesignInput,
  type OneShotDesigner,
  type OneShotDesignerResult,
  type OneShotRunResult,
} from "../src/arena-forge/one-shot.js";
import { MAX_AGENT_EDIT_ATTEMPTS } from "../src/arena-forge/agent.js";
import type { ArenaEvaluation, ArenaMap, HardIssue, LosPair, PathPair } from "../src/arena-forge/types.js";

function fakeDesigner(
  raw: unknown,
  onPropose?: (input: OneShotDesignInput) => void,
): OneShotDesigner & { calls: number; lastInput?: OneShotDesignInput } {
  const designer = {
    calls: 0,
    lastInput: undefined as OneShotDesignInput | undefined,
    async propose(input: OneShotDesignInput): Promise<OneShotDesignerResult> {
      designer.calls += 1;
      designer.lastInput = input;
      onPropose?.(input);
      return {
        raw,
        model: { requested: "gpt-5.6", returned: "gpt-5.6-sol" },
        latencyMs: 1,
      };
    },
  };
  return designer;
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

function fakeOneShot(partial: Partial<OneShotRunResult> & { brief: string; initialMap: ArenaMap }): OneShotRunResult {
  const evaluation = partial.finalEvaluation ?? emptyEval();
  return {
    kind: "one_shot",
    sourceMapId: partial.initialMap.sourceMapId,
    model: { requested: "gpt-5.6", returned: "gpt-5.6-sol" },
    timing: { modelLatencyMs: 10, totalLatencyMs: 20 },
    usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    initialEvaluation: partial.initialEvaluation ?? evaluation,
    actionResults: [],
    executionStatus: "completed",
    finalMap: partial.finalMap ?? partial.initialMap,
    finalEvaluation: evaluation,
    ...partial,
  };
}

function artifact(partial: Partial<EvalRunArtifact> & Pick<EvalRunArtifact, "caseId" | "arm" | "replicate">): EvalRunArtifact {
  const constraints = partial.constraints ?? [
    {
      constraint: { type: "no_hard_failures" },
      label: "no_hard_failures",
      satisfied: true,
      detail: "0",
    },
  ];
  return {
    schemaVersion: 1,
    manifestId: P4_MANIFEST_ID,
    manifestHash: p4ManifestHash(),
    split: "held_out",
    title: partial.caseId,
    brief: "brief",
    requestedModel: "gpt-5.6",
    returnedModels: ["gpt-5.6-sol"],
    infrastructureRetry: false,
    initialMap: { boundsHalfSize: 12, wallHeight: 3, wallThickness: 0.4, groundThickness: 0.1, solids: [], spawns: [], objectives: [], spawnProtectionZones: [] },
    initialEvaluation: emptyEval(),
    design: fakeOneShot({
      brief: "brief",
      initialMap: { boundsHalfSize: 12, wallHeight: 3, wallThickness: 0.4, groundThickness: 0.1, solids: [], spawns: [], objectives: [], spawnProtectionZones: [] },
    }),
    finalMap: { boundsHalfSize: 12, wallHeight: 3, wallThickness: 0.4, groundThickness: 0.1, solids: [], spawns: [], objectives: [], spawnProtectionZones: [] },
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
    ...partial,
  };
}

describe("P4 frozen cases", () => {
  it("exposes five held-out cases and two dev cases", () => {
    expect(heldOutCases().map((c) => c.id)).toEqual([
      "p4-blocked-spawn",
      "p4-disconnected-route",
      "p4-exposed-los",
      "p4-route-cover",
      "p4-coupled-fault",
    ]);
    expect(getEvalCase("p4-dev-smoke-ok").split).toBe("dev");
    expect(getEvalCase("p4-dev-blocked-sentinel").split).toBe("dev");
    expect(P4_REPLICATES).toBe(2);
    expect(P4_ARMS).toEqual(["one_shot", "agent"]);
    expect(P4_MAX_EDIT_BUDGET).toBe(8);
    expect(MAX_ONE_SHOT_ACTIONS).toBe(8);
    expect(MAX_AGENT_EDIT_ATTEMPTS).toBe(8);
  });

  it("locks fixture construction before any API run", () => {
    const blocked = snapshotCase(getEvalCase("p4-blocked-spawn"));
    expect(blocked.evaluation.spawns.results.find((s) => s.id === "ghost-spawn-1")?.valid).toBe(false);
    expect(blocked.evaluation.summary.hardFailureCount).toBe(2);

    const cut = snapshotCase(getEvalCase("p4-disconnected-route"));
    expect(cut.evaluation.summary.hardFailureCount).toBe(6);
    expect(
      cut.evaluation.navigation.paths.find((p) => p.from === "sentinel-spawn-0" && p.to === "objective-A")
        ?.reachable,
    ).toBe(false);

    const exposed = snapshotCase(getEvalCase("p4-exposed-los"));
    expect(exposed.evaluation.summary.hardFailureCount).toBe(0);
    expect(
      exposed.evaluation.lineOfSight.pairs.find(
        (p) => p.from === "ghost-spawn-0" && p.to === "sentinel-spawn-0",
      )?.clear,
    ).toBe(true);

    const cover = snapshotCase(getEvalCase("p4-route-cover"));
    expect(cover.evaluation.summary.hardFailureCount).toBe(0);
    expect(cover.evaluation.navigation.paths.every((p) => p.reachable)).toBe(true);
    expect(
      cover.evaluation.navigation.aggregates.find((a) => a.fromRole === "ghost" && a.to === "objective-B")
        ?.medianMeters,
    ).toBe(29.5);
    expect(CASE4_GHOST_B_MEDIAN_AT_MOST).toBe(21);

    const coupled = snapshotCase(getEvalCase("p4-coupled-fault"));
    expect(coupled.evaluation.summary.hardFailureCount).toBe(6);
    expect(
      coupled.evaluation.lineOfSight.pairs.find(
        (p) => p.from === "ghost-spawn-0" && p.to === "sentinel-spawn-0",
      )?.clear,
    ).toBe(false);

    expect(p4ManifestHash()).toMatch(/^[a-f0-9]{64}$/);
    expect(formatFrozenManifest("gpt-5.6")).toContain("P4 MANIFEST FROZEN");
    expect(formatFrozenManifest("gpt-5.6")).toContain("p4-blocked-spawn");
  });
});

describe("P4 A same starting state", () => {
  it("gives both arms deep-equal starting maps and initial P0 evaluations", async () => {
    const evalCase = getEvalCase("p4-blocked-spawn");
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
    expect(one.brief).toBe(evalCase.brief);
    expect(agent.brief).toBe(evalCase.brief);
  });
});

describe("P4 B constraint evaluator", () => {
  it("scores every declared constraint type from a synthetic evaluation", () => {
    const ev = emptyEval({
      summary: { hardFailureCount: 1, hardFailures: [hard("spawn-blocked", { id: "ghost-spawn-1" })] },
      spawns: {
        results: [
          { id: "ghost-spawn-1", role: "ghost", valid: false, issues: [], blockedBy: "obstacle-2" },
          { id: "ghost-spawn-0", role: "ghost", valid: true, issues: [] },
        ],
      },
      navigation: {
        ...emptyEval().navigation,
        paths: [
          path("ghost-spawn-0", "objective-A", true, 10),
          path("sentinel-spawn-0", "objective-B", false),
        ],
        aggregates: [{ fromRole: "ghost", to: "objective-B", sampleCount: 3, medianMeters: 29.5 }],
      },
      lineOfSight: {
        eyeHeight: 1.6,
        pairs: [los("ghost-spawn-0", "sentinel-spawn-0", true)],
      },
    });

    const constraints: EvalConstraint[] = [
      { type: "no_hard_failures" },
      { type: "spawn_valid", spawnId: "ghost-spawn-1" },
      { type: "spawn_valid", spawnId: "ghost-spawn-0" },
      { type: "path_reachable", from: "ghost-spawn-0", to: "objective-A" },
      { type: "path_reachable", from: "sentinel-spawn-0", to: "objective-B" },
      { type: "all_sd_paths_reachable" },
      { type: "los_blocked", from: "ghost-spawn-0", to: "sentinel-spawn-0" },
      { type: "los_clear", from: "ghost-spawn-0", to: "sentinel-spawn-0" },
      { type: "aggregate_median_at_most", fromRole: "ghost", to: "objective-B", meters: 21 },
    ];
    const scored = scoreConstraints(ev, constraints);
    expect(scored.map((s) => s.satisfied)).toEqual([
      false,
      false,
      true,
      true,
      false,
      false,
      false,
      true,
      false,
    ]);
    expect(checkConstraint(emptyEval(), { type: "no_hard_failures" }).satisfied).toBe(true);
    expect(formatConstraint(constraints[8])).toContain("≤ 21");
  });
});

describe("P4 C no fixture mutation", () => {
  it("leaves the case builder output unchanged after either arm", async () => {
    const evalCase = getEvalCase("p4-route-cover");
    const before = JSON.stringify(evalCase.buildMap());
    await runEvalArm({
      evalCase,
      arm: "one_shot",
      designer: fakeDesigner({
        designSummary: "move",
        actions: [{ type: "move_solid", solidId: "obstacle-2", x: 0, y: 2, z: 0 }],
      }),
      requestedModel: "gpt-5.6",
    });
    await runEvalArm({
      evalCase,
      arm: "agent",
      session: new ScriptedAgentSession([
        decision("remove_solid", { solidId: "obstacle-2", intent: "open mid" }),
        decision("finish_design", { summary: "opened" }),
      ]),
      requestedModel: "gpt-5.6",
    });
    expect(JSON.stringify(evalCase.buildMap())).toBe(before);
  });
});

describe("P4 D arm configuration", () => {
  it("uses the same brief, map, model alias, and max edit budget", async () => {
    const evalCase = getEvalCase("p4-exposed-los");
    const fixture = evalCase.buildMap();
    const designer = fakeDesigner({ designSummary: "none", actions: [] });
    const session = new ScriptedAgentSession([decision("finish_design", { summary: "stop" })]);

    const one = await runEvalArm({
      evalCase,
      arm: "one_shot",
      designer,
      requestedModel: "gpt-5.6",
    });
    const agent = await runEvalArm({
      evalCase,
      arm: "agent",
      session,
      requestedModel: "gpt-5.6",
    });

    expect(designer.lastInput?.brief).toBe(evalCase.brief);
    expect(designer.lastInput?.maxActions).toBe(8);
    expect(session.starts[0].brief).toBe(evalCase.brief);
    expect(session.starts[0].maxEditAttempts).toBe(8);
    expect(startingMapsMatch(one.initialMap, fixture)).toBe(true);
    expect(startingMapsMatch(agent.initialMap, fixture)).toBe(true);
    expect(one.model.requested).toBe("gpt-5.6");
    expect(agent.model.requested).toBe("gpt-5.6");
  });
});

describe("P4 E result accounting", () => {
  it("keeps completed, invalid, rejected, budget-exhausted, and model-error runs", () => {
    const runs: EvalRunArtifact[] = [
      artifact({ caseId: "p4-blocked-spawn", arm: "one_shot", replicate: 1, execution: "completed" }),
      artifact({ caseId: "p4-blocked-spawn", arm: "one_shot", replicate: 2, execution: "invalid_model_output" }),
      artifact({ caseId: "p4-disconnected-route", arm: "one_shot", replicate: 1, execution: "action_rejected" }),
      artifact({ caseId: "p4-disconnected-route", arm: "one_shot", replicate: 2, execution: "model_error" }),
      artifact({ caseId: "p4-exposed-los", arm: "one_shot", replicate: 1, execution: "completed" }),
      artifact({ caseId: "p4-exposed-los", arm: "one_shot", replicate: 2, execution: "completed" }),
      artifact({ caseId: "p4-route-cover", arm: "one_shot", replicate: 1, execution: "completed" }),
      artifact({ caseId: "p4-route-cover", arm: "one_shot", replicate: 2, execution: "completed" }),
      artifact({ caseId: "p4-coupled-fault", arm: "one_shot", replicate: 1, execution: "completed" }),
      artifact({ caseId: "p4-coupled-fault", arm: "one_shot", replicate: 2, execution: "completed" }),
      artifact({
        caseId: "p4-blocked-spawn",
        arm: "agent",
        replicate: 1,
        execution: "budget_exhausted",
        feedbackResponsive: { classification: "no", evidence: "x" },
      }),
      artifact({
        caseId: "p4-blocked-spawn",
        arm: "agent",
        replicate: 2,
        execution: "completed",
        feedbackResponsive: { classification: "yes", evidence: "x" },
      }),
      artifact({ caseId: "p4-disconnected-route", arm: "agent", replicate: 1, execution: "completed" }),
      artifact({ caseId: "p4-disconnected-route", arm: "agent", replicate: 2, execution: "completed" }),
      artifact({ caseId: "p4-exposed-los", arm: "agent", replicate: 1, execution: "completed" }),
      artifact({ caseId: "p4-exposed-los", arm: "agent", replicate: 2, execution: "completed" }),
      artifact({ caseId: "p4-route-cover", arm: "agent", replicate: 1, execution: "completed" }),
      artifact({ caseId: "p4-route-cover", arm: "agent", replicate: 2, execution: "completed" }),
      artifact({ caseId: "p4-coupled-fault", arm: "agent", replicate: 1, execution: "completed" }),
      artifact({ caseId: "p4-coupled-fault", arm: "agent", replicate: 2, execution: "completed" }),
    ];
    const agg = aggregateHeldOut(runs, "gpt-5.6");
    expect(agg.heldOutRuns).toBe(20);
    expect(agg.oneShot.completed).toBe(7);
    expect(agg.oneShot.invalidModelOutput).toBe(1);
    expect(agg.oneShot.actionRejected).toBe(1);
    expect(agg.oneShot.modelError).toBe(1);
    expect(agg.agent.budgetExhausted).toBe(1);
    expect(agg.agent.completed).toBe(9);
    expect(agg.oneShot.runs + agg.agent.runs).toBe(20);
  });
});

describe("P4 F artifact serialization", () => {
  it("round-trips a result JSON without secrets or SDK objects", async () => {
    const evalCase = getEvalCase("p4-dev-smoke-ok");
    const design = await runOneShotDesign({
      map: evalCase.buildMap(),
      brief: evalCase.brief,
      designer: fakeDesigner({ designSummary: "none", actions: [] }),
    });
    const raw = artifactFromDesign({
      evalCase,
      arm: "one_shot",
      replicate: 1,
      requestedModel: "gpt-5.6",
      design,
      infrastructureRetry: false,
    });
    const json = JSON.stringify(sanitizeEvalArtifact(raw));
    const back = JSON.parse(json) as EvalRunArtifact;
    expect(back.caseId).toBe("p4-dev-smoke-ok");
    expect(json).not.toMatch(/sk-/);
    expect(json).not.toMatch(/OPENAI_API_KEY/);
    expect(json).not.toMatch(/apiKey/);
    expect(typeof back.design).toBe("object");
  });
});

describe("P4 G summary aggregation", () => {
  it("computes satisfaction totals and per-case winners from fake results", () => {
    const constraintsOk = [
      { constraint: { type: "no_hard_failures" } as EvalConstraint, label: "no_hard_failures", satisfied: true, detail: "" },
      { constraint: { type: "all_sd_paths_reachable" } as EvalConstraint, label: "all_sd_paths_reachable", satisfied: true, detail: "" },
    ];
    const constraintsHalf = [
      { ...constraintsOk[0], satisfied: true },
      { ...constraintsOk[1], satisfied: false },
    ];
    const runs: EvalRunArtifact[] = [];
    const cases = heldOutCases().map((c) => c.id);
    for (const [i, caseId] of cases.entries()) {
      for (const arm of P4_ARMS) {
        for (const replicate of [1, 2] as const) {
          const agentBetter = i < 3;
          const satisfied =
            arm === "agent"
              ? agentBetter
                ? constraintsOk
                : constraintsHalf
              : agentBetter
                ? constraintsHalf
                : constraintsOk;
          runs.push(
            artifact({
              caseId,
              arm,
              replicate,
              constraints: satisfied,
              satisfiedCount: satisfied.filter((c) => c.satisfied).length,
              declaredCount: 2,
              zeroHardFailures: true,
              hardFailureCount: 0,
              feedbackResponsive:
                arm === "agent"
                  ? { classification: i < 2 ? "yes" : "no", evidence: "note" }
                  : undefined,
            }),
          );
        }
      }
    }
    const agg = aggregateHeldOut(runs, "gpt-5.6");
    expect(agg.oneShot.declared).toBe(20);
    expect(agg.agent.declared).toBe(20);
    expect(agg.oneShot.satisfied).toBe(3 * 2 * 1 + 2 * 2 * 2);
    expect(agg.agent.satisfied).toBe(3 * 2 * 2 + 2 * 2 * 1);
    expect(agg.cases.filter((c) => c.winner === "agent")).toHaveLength(3);
    expect(agg.cases.filter((c) => c.winner === "one_shot")).toHaveLength(2);
    expect(agg.verdict).toBe("MIXED");
  });

  it("returns STRONG PASS only when the predeclared gate holds", () => {
    const ok = [
      { constraint: { type: "no_hard_failures" } as EvalConstraint, label: "x", satisfied: true, detail: "" },
    ];
    const fail = [{ ...ok[0], satisfied: false }];
    const runs: EvalRunArtifact[] = [];
    for (const [i, caseId] of heldOutCases().map((c) => c.id).entries()) {
      for (const arm of P4_ARMS) {
        for (const replicate of [1, 2] as const) {
          const p3Wins = i < 4;
          const sat = arm === "agent" ? (p3Wins ? ok : fail) : p3Wins ? fail : ok;
          runs.push(
            artifact({
              caseId,
              arm,
              replicate,
              constraints: sat,
              satisfiedCount: sat.filter((c) => c.satisfied).length,
              declaredCount: 1,
              zeroHardFailures: true,
              feedbackResponsive:
                arm === "agent" ? { classification: "yes", evidence: "rev" } : undefined,
            }),
          );
        }
      }
    }
    const agg = aggregateHeldOut(runs, "gpt-5.6");
    expect(agg.agent.satisfactionRate).toBeGreaterThanOrEqual(agg.oneShot.satisfactionRate + 0.1);
    expect(agg.cases.filter((c) => c.winner === "agent").length).toBeGreaterThanOrEqual(3);
    expect(agg.agent.feedbackYes).toBeGreaterThanOrEqual(2);
    expect(agg.verdict).toBe("STRONG PASS");
  });
});

describe("P4 feedback-responsive classification", () => {
  it("marks yes when a later edit targets a newly created solid after evaluator feedback", async () => {
    const evalCase = getEvalCase("p4-dev-smoke-ok");
    const result = await runEvalArm({
      evalCase,
      arm: "agent",
      requestedModel: "gpt-5.6",
      session: new ScriptedAgentSession([
        decision("add_solid", {
          kind: "obstacle",
          x: 0,
          y: 1,
          z: 6,
          hx: 1,
          hy: 1,
          hz: 1,
          intent: "add cover",
        }),
        decision("move_solid", { solidId: "obstacle-2", x: 1, y: 1, z: 6, intent: "nudge the new cover" }),
        decision("finish_design", { summary: "done" }),
      ]),
    });
    expect(result.kind).toBe("agent");
    if (result.kind !== "agent") return;
    const classified = classifyFeedbackResponsive(result);
    expect(classified.classification).toBe("yes");
    expect(classified.evidence).toMatch(/obstacle-2/);
  });

  it("marks no when the agent edits once and finishes", async () => {
    const evalCase = getEvalCase("p4-dev-smoke-ok");
    const result = await runEvalArm({
      evalCase,
      arm: "agent",
      requestedModel: "gpt-5.6",
      session: new ScriptedAgentSession([
        decision("resize_solid", { solidId: "obstacle-0", hx: 1.5, hy: 1, hz: 1.5, intent: "shrink" }),
        decision("finish_design", { summary: "done" }),
      ]),
    });
    expect(result.kind).toBe("agent");
    if (result.kind !== "agent") return;
    expect(classifyFeedbackResponsive(result).classification).toBe("no");
  });
});

describe("P4 helpers", () => {
  it("classifies transient infrastructure messages and keeps model-behavior messages out", () => {
    expect(isTransientInfraMessage("429 Rate limit exceeded")).toBe(true);
    expect(isTransientInfraMessage("Connection error")).toBe(true);
    expect(isTransientInfraMessage("actions exceed MAX_ONE_SHOT_ACTIONS (8)")).toBe(false);
    expect(median([1, 8, 3])).toBe(3);
    expect(median([2, 4])).toBe(3);
    expect(executionOf(fakeOneShot({
      brief: "x",
      initialMap: getEvalCase("p4-dev-smoke-ok").buildMap(),
      executionStatus: "action_rejected",
    }))).toBe("action_rejected");
  });

  it("retries only a transient model_error and records that retry", async () => {
    let calls = 0;
    const designer: OneShotDesigner = {
      async propose(): Promise<OneShotDesignerResult> {
        calls += 1;
        if (calls === 1) throw new Error("503 Service Unavailable");
        return {
          raw: { designSummary: "none", actions: [] },
          model: { requested: "gpt-5.6", returned: "gpt-5.6-sol" },
          latencyMs: 1,
        };
      },
    };
    const artifact = await runEvalCaseOnce({
      evalCase: getEvalCase("p4-dev-smoke-ok"),
      arm: "one_shot",
      replicate: 1,
      requestedModel: "gpt-5.6",
      designerFactory: () => designer,
    });
    expect(calls).toBe(2);
    expect(artifact.infrastructureRetry).toBe(true);
    expect(artifact.execution).toBe("completed");
  });

  it("does not retry invalid model output", async () => {
    let calls = 0;
    const designer: OneShotDesigner = {
      async propose(): Promise<OneShotDesignerResult> {
        calls += 1;
        return {
          raw: { designSummary: "bad", actions: "nope" },
          model: { requested: "gpt-5.6" },
          latencyMs: 1,
        };
      },
    };
    const artifact = await runEvalCaseOnce({
      evalCase: getEvalCase("p4-dev-smoke-ok"),
      arm: "one_shot",
      replicate: 1,
      requestedModel: "gpt-5.6",
      designerFactory: () => designer,
    });
    expect(calls).toBe(1);
    expect(artifact.infrastructureRetry).toBe(false);
    expect(artifact.execution).toBe("invalid_model_output");
  });
});
