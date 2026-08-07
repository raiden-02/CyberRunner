import { beforeAll, describe, expect, it } from "vitest";
import RAPIER from "@dimforge/rapier3d-compat";
import { getGameplayMap } from "../../shared/world/map-registry.js";
import { buildMapColliders } from "../../shared/world/map-physics.js";
import type { AgentTurnDecision } from "../src/arena-forge/agent.js";
import { exportGameplayMap } from "../src/arena-forge/export-map.js";
import { importGameplayMap } from "../src/arena-forge/import-map.js";
import {
  MAX_PLAYTEST_CALLS,
  MAX_PLAYTEST_EDIT_ATTEMPTS,
  MAX_PLAYTEST_MODEL_CALLS,
  PLAYTEST_TOOL_NAMES,
  ScriptedPlaytestSession,
  runPlaytestAgentDesign,
} from "../src/arena-forge/playtest-agent.js";
import { PLAYTEST_ROLLOUTS, PLAYTEST_SEED } from "../src/arena-forge/playtest.js";
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
      { id: "A", x: -4, y: 0, z: 0, radius: 1.5 },
      { id: "B", x: 4, y: 0, z: 0, radius: 1.5 },
    ],
    spawnProtectionZones: [],
    spikeSpawnLocation: { id: "spike-spawn", x: 0, y: 1, z: -6 },
    ...partial,
  };
}

function box(id: string, extra: Omit<ArenaSolid, "id" | "kind">): ArenaSolid {
  return { id, kind: "obstacle", ...extra };
}

function decision(name: string, args: unknown): AgentTurnDecision {
  return { calls: [{ name, arguments: args, callId: `call-${name}-${JSON.stringify(args).length}` }], latencyMs: 1 };
}

const brief = "Use playtest evidence to make attacker routing less concentrated while keeping both sites reachable.";

describe("P5 agent A immediate playtest", () => {
  it("returns a report then finishes", async () => {
    const session = new ScriptedPlaytestSession([
      decision("run_playtest", { intent: "baseline" }),
      decision("finish_design", { summary: "Looked once." }),
    ]);
    const result = await runPlaytestAgentDesign({
      map: importGameplayMap(getGameplayMap("map-contract-smoke")),
      brief,
      session,
    });
    expect(result.status).toBe("completed");
    expect(result.playtestCalls).toBe(1);
    expect(result.turns[0]?.playtest?.seed).toBe(PLAYTEST_SEED);
    expect(result.turns[0]?.playtest?.rollouts).toBe(PLAYTEST_ROLLOUTS);
    expect(result.lastPlaytest).toEqual(result.turns[0]?.playtest);
    expect(session.starts[0]?.toolNames).toEqual([...PLAYTEST_TOOL_NAMES]);
    expect(session.starts[0]?.maxPlaytestCalls).toBe(MAX_PLAYTEST_CALLS);
  });
});

describe("P5 agent B edit then playtest", () => {
  it("reruns the same seed on the changed workspace", async () => {
    const map = importGameplayMap(getGameplayMap("map-contract-smoke"));
    const session = new ScriptedPlaytestSession([
      decision("run_playtest", { intent: "before" }),
      decision("add_solid", {
        kind: "obstacle",
        x: 6,
        y: 2,
        z: -2,
        hx: 4,
        hy: 2,
        hz: 1.2,
        intent: "lengthen Ghost B",
      }),
      decision("run_playtest", { intent: "after" }),
      decision("finish_design", { summary: "Compared." }),
    ]);
    const result = await runPlaytestAgentDesign({ map, brief, session });
    expect(result.status).toBe("completed");
    expect(result.successfulEdits).toBe(1);
    expect(result.playtestCalls).toBe(2);
    const first = result.turns.find((t) => t.tool === "run_playtest");
    const second = [...result.turns].reverse().find((t) => t.tool === "run_playtest");
    expect(first?.playtest?.seed).toBe(second?.playtest?.seed);
    expect(first?.playtest?.rollouts).toBe(second?.playtest?.rollouts);
    expect(JSON.stringify(first?.playtest)).not.toBe(JSON.stringify(second?.playtest));
    expect(result.turns[1]?.evaluationAfter?.summary.hardFailureCount).toBe(0);
    expect(map.solids.some((s) => s.x === 6 && s.hx === 4)).toBe(false);
  });
});

describe("P5 agent C semantic revision", () => {
  it("shows a playtest change after the scripted east B cover", async () => {
    const session = new ScriptedPlaytestSession([
      decision("run_playtest", { intent: "measure" }),
      decision("add_solid", {
        kind: "obstacle",
        x: 6,
        y: 2,
        z: -2,
        hx: 4,
        hy: 2,
        hz: 1.2,
        intent: "lengthen Ghost B",
      }),
      decision("run_playtest", { intent: "recheck" }),
      decision("finish_design", { summary: "Shifted Ghost B cost." }),
    ]);
    const result = await runPlaytestAgentDesign({
      map: importGameplayMap(getGameplayMap("map-contract-smoke")),
      brief,
      session,
    });
    const reports = result.turns.filter((t) => t.playtest).map((t) => t.playtest!);
    expect(reports).toHaveLength(2);
    expect(reports[1]!.ghost.siteChoice.A).toBeGreaterThan(reports[0]!.ghost.siteChoice.A);
    expect(reports[1]!.ghost.siteChoice.B).toBeGreaterThan(0);
    expect(reports[1]!.ghost.medianArrivalSeconds.B).toBeGreaterThan(
      reports[0]!.ghost.medianArrivalSeconds.B!,
    );
  });
});

describe("P5 agent D playtest is read-only", () => {
  it("leaves the map unchanged after observation", async () => {
    const map = arena({ solids: [box("obstacle-0", { x: 0, y: 1, z: 0, hx: 1, hy: 1, hz: 1 })] });
    const session = new ScriptedPlaytestSession([
      decision("run_playtest", { intent: "look" }),
      decision("finish_design", { summary: "No edit." }),
    ]);
    const result = await runPlaytestAgentDesign({ map, brief, session });
    expect(JSON.stringify(result.initialMap.solids)).toBe(JSON.stringify(result.finalMap.solids));
    expect(result.successfulEdits).toBe(0);
  });
});

describe("P5 agent E three-playtest bound", () => {
  it("runs three playtests and refuses the fourth", async () => {
    const session = new ScriptedPlaytestSession([
      decision("run_playtest", { intent: "1" }),
      decision("run_playtest", { intent: "2" }),
      decision("run_playtest", { intent: "3" }),
      decision("run_playtest", { intent: "4" }),
    ]);
    const result = await runPlaytestAgentDesign({ map: arena(), brief, session });
    expect(result.status).toBe("budget_exhausted");
    expect(result.playtestCalls).toBe(3);
    expect(result.turns.filter((t) => t.playtest)).toHaveLength(3);
    expect(result.invalidReason).toMatch(/MAX_PLAYTEST_CALLS/);
  });
});

describe("P5 agent F eight-edit bound", () => {
  it("stops after eight edit attempts", async () => {
    const turns: AgentTurnDecision[] = [];
    for (let i = 0; i < 9; i++) {
      turns.push(
        decision("move_solid", { solidId: "obstacle-0", x: i, y: 1, z: 0, intent: `nudge ${i}` }),
      );
    }
    const session = new ScriptedPlaytestSession(turns);
    const result = await runPlaytestAgentDesign({
      map: arena({ solids: [box("obstacle-0", { x: 0, y: 1, z: 0, hx: 1, hy: 1, hz: 1 })] }),
      brief,
      session,
    });
    expect(result.status).toBe("budget_exhausted");
    expect(result.editAttempts).toBe(MAX_PLAYTEST_EDIT_ATTEMPTS);
    expect(result.invalidReason).toMatch(/MAX_PLAYTEST_EDIT_ATTEMPTS/);
  });
});

describe("P5 agent G twelve-call bound", () => {
  it("allows eight edits, three playtests, and finish, then does not fetch a thirteenth", async () => {
    const turns: AgentTurnDecision[] = [];
    for (let i = 0; i < 8; i++) {
      turns.push(decision("move_solid", { solidId: "obstacle-0", x: i % 4, y: 1, z: 0, intent: "e" }));
    }
    turns.push(decision("run_playtest", { intent: "p1" }));
    turns.push(decision("run_playtest", { intent: "p2" }));
    turns.push(decision("run_playtest", { intent: "p3" }));
    turns.push(decision("finish_design", { summary: "Used the full envelope." }));
    turns.push(decision("finish_design", { summary: "13th should not run" }));
    const session = new ScriptedPlaytestSession(turns);
    const result = await runPlaytestAgentDesign({
      map: arena({ solids: [box("obstacle-0", { x: 0, y: 1, z: 0, hx: 1, hy: 1, hz: 1 })] }),
      brief,
      session,
    });
    expect(MAX_PLAYTEST_MODEL_CALLS).toBe(12);
    expect(result.status).toBe("completed");
    expect(result.modelCalls).toBe(12);
    expect(result.editAttempts).toBe(8);
    expect(result.playtestCalls).toBe(3);
    expect(result.finishSummary).toBe("Used the full envelope.");
    expect(session.remaining()).toBe(1);
  });
});

describe("P5 agent H P1 rejection recoverable", () => {
  it("returns the rejection and continues", async () => {
    const session = new ScriptedPlaytestSession([
      decision("resize_solid", { solidId: "missing", hx: 1, hy: 1, hz: 1, intent: "bad" }),
      decision("finish_design", { summary: "Stopped after reject." }),
    ]);
    const result = await runPlaytestAgentDesign({ map: arena(), brief, session });
    expect(result.status).toBe("completed");
    expect(result.editAttempts).toBe(1);
    expect(result.successfulEdits).toBe(0);
    expect(result.turns[0]?.outcome?.ok).toBe(false);
  });
});

describe("P5 agent I new IDs after observation", () => {
  it("can edit a solid created after a playtest", async () => {
    const session = new ScriptedPlaytestSession([
      decision("run_playtest", { intent: "look" }),
      decision("add_solid", { kind: "obstacle", x: 2, y: 1, z: 2, hx: 1, hy: 1, hz: 1, intent: "add" }),
      decision("move_solid", { solidId: "obstacle-0", x: 3, y: 1, z: 2, intent: "nudge new" }),
      decision("finish_design", { summary: "Used the new id." }),
    ]);
    const result = await runPlaytestAgentDesign({ map: arena(), brief, session });
    expect(result.status).toBe("completed");
    expect(result.successfulEdits).toBe(2);
    expect(result.finalMap.solids.find((s) => s.id === "obstacle-0")).toMatchObject({ x: 3, z: 2 });
  });
});

describe("P5 agent J export", () => {
  beforeAll(async () => {
    await RAPIER.init();
  });

  it("exports the final P5 map through GameplayMapDefinition and RAPIER", async () => {
    const source = getGameplayMap("map-contract-smoke");
    const session = new ScriptedPlaytestSession([
      decision("run_playtest", { intent: "look" }),
      decision("move_solid", { solidId: "obstacle-1", x: 4, y: 1, z: -2, intent: "nudge" }),
      decision("finish_design", { summary: "Exported." }),
    ]);
    const result = await runPlaytestAgentDesign({
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
