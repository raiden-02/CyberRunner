import { beforeAll, describe, expect, it } from "vitest";
import RAPIER from "@dimforge/rapier3d-compat";
import { getGameplayMap } from "../../shared/world/map-registry.js";
import { buildMapColliders } from "../../shared/world/map-physics.js";
import {
  MAX_AGENT_EDIT_ATTEMPTS,
  ScriptedAgentSession,
  runAgentDesign,
  type AgentTurnDecision,
} from "../src/arena-forge/agent.js";
import { AGENT_TOOL_NAMES } from "../src/arena-forge/agent-tools.js";
import { exportGameplayMap } from "../src/arena-forge/export-map.js";
import { importGameplayMap } from "../src/arena-forge/import-map.js";
import type { ArenaMap, ArenaSolid } from "../src/arena-forge/types.js";

function arena(partial: Partial<ArenaMap> = {}): ArenaMap {
  return {
    boundsHalfSize: 10,
    wallHeight: 4,
    wallThickness: 0.5,
    groundThickness: 0.1,
    solids: [],
    spawns: [
      { id: "ghost-spawn-0", role: "ghost", x: 0, y: 1, z: -8 },
      { id: "sentinel-spawn-0", role: "sentinel", x: 0, y: 1, z: 8 },
    ],
    objectives: [
      { id: "A", x: -4, y: 0, z: -4, radius: 2 },
      { id: "B", x: 4, y: 0, z: -4, radius: 2 },
    ],
    spawnProtectionZones: [],
    spikeSpawnLocation: { id: "spike-spawn", x: 0, y: 1, z: -6 },
    ...partial,
  };
}

function box(id: string, kind: ArenaSolid["kind"], extra: Omit<ArenaSolid, "id" | "kind">): ArenaSolid {
  return { id, kind, ...extra };
}

function decision(name: string, args: unknown, extras: Partial<AgentTurnDecision> = {}): AgentTurnDecision {
  return {
    calls: [{ name, arguments: args, callId: `call-${name}` }],
    latencyMs: 0,
    ...extras,
  };
}

const brief = "Make mid more aggressive while preserving both site routes.";

describe("ArenaForge agent", () => {
  it("sends brief, inspection, and tool names on the first turn", async () => {
    const map = arena({
      solids: [box("obstacle-0", "obstacle", { x: 0, y: 1, z: 0, hx: 1, hy: 1, hz: 1 })],
    });
    const session = new ScriptedAgentSession([
      decision("finish_design", { summary: "Already fine." }),
    ]);
    const result = await runAgentDesign({ map, brief, session });

    expect(session.starts).toHaveLength(1);
    expect(session.starts[0].brief).toBe(brief);
    expect(session.starts[0].maxEditAttempts).toBe(MAX_AGENT_EDIT_ATTEMPTS);
    expect(session.starts[0].toolNames).toEqual([...AGENT_TOOL_NAMES]);
    expect(session.starts[0].inspection.solids.map((s) => s.id)).toEqual(["obstacle-0"]);
    expect(session.starts[0].inspection.evaluation?.navigation.anchors.length).toBeGreaterThan(0);
    expect(result.status).toBe("completed");
  });

  it("applies one edit, evaluates, then finishes after tool output", async () => {
    const map = arena({
      solids: [box("obstacle-0", "obstacle", { x: 0, y: 1, z: 0, hx: 1, hy: 1, hz: 1 })],
    });
    const session = new ScriptedAgentSession([
      decision("move_solid", { solidId: "obstacle-0", x: 4, y: 1, z: 0, intent: "Shift cover." }),
      decision("finish_design", { summary: "Moved one box." }),
    ]);
    const result = await runAgentDesign({ map, brief, session });

    expect(result.status).toBe("completed");
    expect(result.successfulEdits).toBe(1);
    expect(result.editAttempts).toBe(1);
    expect(result.modelCalls).toBe(2);
    expect(result.turns[0].outcome).toEqual({ ok: true, changedIds: ["obstacle-0"] });
    expect(result.finalMap.solids[0]).toMatchObject({ x: 4 });
    expect(session.feedbacks).toHaveLength(1);
    expect(session.feedbacks[0].output.ok).toBe(true);
    expect(result.finishSummary).toBe("Moved one box.");
  });

  it("lets the next turn use a newly created ID from tool output", async () => {
    const session = new ScriptedAgentSession([
      decision("add_solid", {
        kind: "occluder",
        x: 0, y: 2, z: 0,
        hx: 2, hy: 2, hz: 0.4,
        hp: null,
      }),
      decision("move_solid", { solidId: "occluder-0", x: 1, y: 2, z: 0 }),
      decision("finish_design", { summary: "Placed then nudged the occluder." }),
    ]);
    const result = await runAgentDesign({ map: arena(), brief, session });

    expect(result.status).toBe("completed");
    expect(session.feedbacks[0].output).toMatchObject({ ok: true, changedIds: ["occluder-0"] });
    if (!session.feedbacks[0].output.ok) return;
    expect(session.feedbacks[0].output.inspection.solids.map((s) => s.id)).toContain("occluder-0");
    expect(result.turns[1].outcome).toEqual({ ok: true, changedIds: ["occluder-0"] });
    expect(result.finalMap.solids[0]).toMatchObject({ id: "occluder-0", x: 1 });
  });

  it("returns evaluator hard failures so the next turn can correct them", async () => {
    const map = arena({
      solids: [box("obstacle-0", "obstacle", { x: 0, y: 1, z: 0, hx: 1, hy: 1, hz: 1 })],
    });
    const session = new ScriptedAgentSession([
      decision("move_solid", { solidId: "obstacle-0", x: 11, y: 1, z: 0 }),
      decision("move_solid", { solidId: "obstacle-0", x: 0, y: 1, z: 0 }),
      decision("finish_design", { summary: "Put the box back." }),
    ]);
    const result = await runAgentDesign({ map, brief, session });

    expect(result.status).toBe("completed");
    expect(session.feedbacks[0].output.ok).toBe(true);
    const afterFirst = session.feedbacks[0].output.inspection.evaluation;
    expect(afterFirst?.hardFailures.some((i) => i.code === "solid-out-of-bounds" && i.id === "obstacle-0")).toBe(true);
    expect(result.turns[0].evaluationAfter?.summary.hardFailures.some(
      (i) => i.code === "solid-out-of-bounds",
    )).toBe(true);
    expect(result.turns[1].evaluationAfter?.summary.hardFailures.some(
      (i) => i.code === "solid-out-of-bounds",
    )).toBe(false);
    expect(result.finalEvaluation.summary.hardFailureCount).toBe(0);
  });

  it("treats a P1 rejection as recoverable feedback that still spends budget", async () => {
    const map = arena({
      solids: [box("obstacle-0", "obstacle", { x: 0, y: 1, z: 0, hx: 1, hy: 1, hz: 1 })],
    });
    const session = new ScriptedAgentSession([
      decision("move_solid", { solidId: "obstacle-99", x: 2, y: 1, z: 0 }),
      decision("move_solid", { solidId: "obstacle-0", x: 3, y: 1, z: 0 }),
      decision("finish_design", { summary: "Used the real ID." }),
    ]);
    const result = await runAgentDesign({ map, brief, session });

    expect(result.status).toBe("completed");
    expect(result.editAttempts).toBe(2);
    expect(result.successfulEdits).toBe(1);
    expect(session.feedbacks[0].output).toMatchObject({
      ok: false,
      error: { code: "unknown-solid", target: "obstacle-99" },
    });
    expect(session.feedbacks[0].output.inspection.solids[0]).toMatchObject({ id: "obstacle-0", x: 0 });
    expect(result.finalMap.solids[0]).toMatchObject({ x: 3 });
  });

  it("exposes a LOS change in the next model observation", async () => {
    const session = new ScriptedAgentSession([
      decision("add_solid", {
        kind: "occluder",
        x: 0, y: 2, z: 0,
        hx: 2, hy: 2, hz: 0.4,
        hp: null,
      }),
      decision("finish_design", { summary: "Blocked the mid sightline." }),
    ]);
    const result = await runAgentDesign({ map: arena(), brief, session });

    const before = session.starts[0].inspection.evaluation?.lineOfSight.find(
      (p) => p.from === "ghost-spawn-0" && p.to === "sentinel-spawn-0",
    );
    expect(before?.clear).toBe(true);
    const after = session.feedbacks[0].output.inspection.evaluation?.lineOfSight.find(
      (p) => p.from === "ghost-spawn-0" && p.to === "sentinel-spawn-0",
    );
    expect(after?.clear).toBe(false);
    expect(after?.blockedBy).toBe("occluder-0");
    expect(result.status).toBe("completed");
  });

  it("rejects two tool calls in one turn without applying either", async () => {
    const map = arena({
      solids: [box("obstacle-0", "obstacle", { x: 0, y: 1, z: 0, hx: 1, hy: 1, hz: 1 })],
    });
    const session = new ScriptedAgentSession([{
      latencyMs: 0,
      calls: [
        { name: "move_solid", arguments: { solidId: "obstacle-0", x: 4, y: 1, z: 0 }, callId: "a" },
        { name: "add_solid", arguments: { kind: "occluder", x: 0, y: 2, z: 0, hx: 1, hy: 2, hz: 0.4, hp: null }, callId: "b" },
      ],
    }]);
    const result = await runAgentDesign({ map, brief, session });

    expect(result.status).toBe("invalid_model_output");
    expect(result.editAttempts).toBe(0);
    expect(result.finalMap.solids[0]).toMatchObject({ x: 0 });
    expect(session.feedbacks).toEqual([]);
  });

  it("finishes after eight edits once the model sees the last evaluation", async () => {
    const turns = [
      ...Array.from({ length: MAX_AGENT_EDIT_ATTEMPTS }, (_, i) =>
        decision("add_solid", {
          kind: i === MAX_AGENT_EDIT_ATTEMPTS - 1 ? "occluder" : "obstacle",
          x: i === MAX_AGENT_EDIT_ATTEMPTS - 1 ? 0 : i - 3,
          y: 2,
          z: i === MAX_AGENT_EDIT_ATTEMPTS - 1 ? 0 : 4,
          hx: i === MAX_AGENT_EDIT_ATTEMPTS - 1 ? 2 : 0.4,
          hy: 2,
          hz: i === MAX_AGENT_EDIT_ATTEMPTS - 1 ? 0.4 : 0.4,
          hp: null,
        }),
      ),
      decision("finish_design", { summary: "Eight edits are enough." }),
    ];
    const session = new ScriptedAgentSession(turns);
    const result = await runAgentDesign({ map: arena(), brief, session });

    expect(result.status).toBe("completed");
    expect(result.editAttempts).toBe(8);
    expect(result.successfulEdits).toBe(8);
    expect(result.modelCalls).toBe(9);
    expect(result.finishSummary).toBe("Eight edits are enough.");
    expect(session.feedbacks).toHaveLength(8);
    const lastFeedback = session.feedbacks[7];
    expect(lastFeedback.output.ok).toBe(true);
    if (!lastFeedback.output.ok) return;
    expect(lastFeedback.output.changedIds).toEqual(["occluder-0"]);
    const los = lastFeedback.output.inspection.evaluation?.lineOfSight.find(
      (p) => p.from === "ghost-spawn-0" && p.to === "sentinel-spawn-0",
    );
    expect(los?.clear).toBe(false);
    expect(los?.blockedBy).toBe("occluder-0");
  });

  it("does not execute a ninth edit after the budget", async () => {
    const turns = Array.from({ length: MAX_AGENT_EDIT_ATTEMPTS + 1 }, (_, i) =>
      decision("add_solid", {
        kind: "obstacle",
        x: i, y: 1, z: 0,
        hx: 0.4, hy: 1, hz: 0.4,
        hp: null,
      }),
    );
    const session = new ScriptedAgentSession(turns);
    const result = await runAgentDesign({ map: arena(), brief, session });

    expect(result.status).toBe("budget_exhausted");
    expect(result.editAttempts).toBe(8);
    expect(result.successfulEdits).toBe(8);
    expect(result.modelCalls).toBe(9);
    expect(result.finalMap.solids).toHaveLength(8);
    expect(result.finalMap.solids.map((s) => s.id)).not.toContain("obstacle-8");
    expect(session.feedbacks).toHaveLength(8);
    expect(result.turns[8].tool).toBe("add_solid");
    expect(result.turns[8].outcome).toBeUndefined();
    const afterEight = session.feedbacks[7].output;
    expect(afterEight.ok).toBe(true);
    if (!afterEight.ok) return;
    expect(result.finalMap.solids.map((s) => s.id)).toEqual(afterEight.inspection.solids.map((s) => s.id));
    expect(result.finalEvaluation.summary.hardFailures).toEqual(afterEight.inspection.evaluation?.hardFailures);
  });

  it("can finish immediately with zero edits", async () => {
    const session = new ScriptedAgentSession([
      decision("finish_design", { summary: "No change needed." }),
    ]);
    const result = await runAgentDesign({ map: arena(), brief, session });

    expect(result.status).toBe("completed");
    expect(result.editAttempts).toBe(0);
    expect(result.successfulEdits).toBe(0);
    expect(result.modelCalls).toBe(1);
    expect(result.finalMap.solids).toEqual([]);
  });

  it("does not mutate the retained initial map or evaluation", async () => {
    const map = arena({
      solids: [box("obstacle-0", "obstacle", { x: 0, y: 1, z: 0, hx: 1, hy: 1, hz: 1 })],
    });
    const session = new ScriptedAgentSession([
      decision("move_solid", { solidId: "obstacle-0", x: 5, y: 1, z: 2 }),
      decision("finish_design", { summary: "Moved." }),
    ]);
    const result = await runAgentDesign({ map, brief, session });

    expect(map.solids[0]).toMatchObject({ x: 0, z: 0 });
    expect(result.initialMap.solids[0]).toMatchObject({ x: 0, z: 0 });
    expect(result.finalMap.solids[0]).toMatchObject({ x: 5, z: 2 });
    expect(result.initialMap).not.toBe(result.finalMap);
    expect(result.initialEvaluation.summary.hardFailureCount).toBe(0);
  });
});

describe("ArenaForge agent export", () => {
  beforeAll(async () => {
    await RAPIER.init();
  });

  it("exports the final agent map for buildMapColliders", async () => {
    const source = getGameplayMap("map-contract-smoke");
    const session = new ScriptedAgentSession([
      decision("move_solid", { solidId: "obstacle-1", x: 4, y: 1, z: -2 }),
      decision("finish_design", { summary: "Nudge one obstacle." }),
    ]);
    const result = await runAgentDesign({
      map: importGameplayMap(source),
      brief,
      session,
    });
    expect(result.status).toBe("completed");

    const exported = exportGameplayMap(result.finalMap, { id: source.id, name: source.name });
    expect(exported.obstacles[1]).toEqual({ x: 4, y: 1, z: -2, hx: 1, hy: 1, hz: 1 });

    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    const { breakableColliders } = buildMapColliders(RAPIER, world, exported);
    expect(breakableColliders.length).toBe(exported.breakables.length);
    const expected =
      1 + 4 + exported.obstacles.length + exported.occluders.length + exported.breakables.length;
    expect(world.colliders.len()).toBe(expected);
    world.free();
  });
});
