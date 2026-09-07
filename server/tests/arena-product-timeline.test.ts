import { describe, expect, it } from "vitest";
import type { AgentTurnDecision } from "../src/arena-forge/agent.js";
import { buildBlankArena } from "../src/arena-forge/blank-map.js";
import { viewFromAgentResult, compactP0 } from "../src/arena-forge/design-view.js";
import { evaluateArena } from "../src/arena-forge/evaluator.js";
import { NATIVE_DEMO_SPEC } from "../src/arena-forge/native-demo-spec.js";
import { ScriptedPlaytestSession } from "../src/arena-forge/playtest-agent.js";
import { runArenaDesigner } from "../src/arena-forge/product-designer.js";
import {
  isSuccessfulMapMutation,
  replayProductTimeline,
} from "../src/arena-forge/product-timeline.js";
import { toPublicArenaMapView } from "../src/arena-forge/public-map.js";

function rec(tool: string, ok = true) {
  return { tool, outcome: { ok } };
}

describe("product mutation classification", () => {
  it.each([
    ["propose_design_plan", true, false],
    ["add_block", true, true],
    ["add_wall", true, true],
    ["add_wall_chain", true, true],
    ["move_solid", true, true],
    ["resize_solid", true, true],
    ["remove_solid", true, true],
    ["place_objective", true, true],
    ["move_objective", true, true],
    ["trace_route", true, false],
    ["run_playtest", true, false],
    ["finish_design", true, false],
    ["add_block", false, false],
    ["resize_solid", false, false],
    ["place_objective", false, false],
  ] as const)("%s ok=%s increments=%s", (tool, ok, increments) => {
    expect(isSuccessfulMapMutation(rec(tool, ok))).toBe(increments);
  });
});

function call(name: string, args: Record<string, unknown>): AgentTurnDecision {
  return { latencyMs: 1, calls: [{ name, arguments: args, callId: name }] };
}

describe("product timeline replay", () => {
  it("replays a wall-chain as one revision containing every segment", async () => {
    const spec = NATIVE_DEMO_SPEC;
    const result = await runArenaDesigner({
      spec,
      map: buildBlankArena(spec),
      session: new ScriptedPlaytestSession([
        call("propose_design_plan", {
          summary: "Box A, leave B open, break mid.",
          layout: ["North A", "Mid break", "South B"],
          priorities: ["Place A and B", "Keep one nav component", "Break the long sightline"],
        }),
        call("add_wall_chain", {
          kind: "occluder",
          height: 3,
          thickness: 0.5,
          points: [
            { x: -8, z: 8 },
            { x: 2, z: 8 },
            { x: 2, z: 2 },
          ],
        }),
        call("finish_design", { summary: "One chain." }),
      ]),
    });
    const replay = replayProductTimeline(result.initialMap, result.turns);
    expect(result.successfulEdits).toBe(1);
    expect(replay.successfulEdits).toBe(1);
    expect(replay.maps).toHaveLength(2);
    expect(replay.maps[1]!.solids.length).toBeGreaterThanOrEqual(2);
    const view = viewFromAgentResult({
      jobId: "synth-chain",
      source: "live",
      startingMapId: "blank-arena",
      brief: spec.brief,
      status: "completed",
      result,
      initialP0: compactP0(evaluateArena(result.initialMap, "search_destroy")),
      playOriginalId: "job:x:initial",
      initialMap: result.initialMap,
      path: "product",
      mode: "search_destroy",
    });
    expect(view.turns.find((t) => t.tool === "add_wall_chain")?.mapRevision).toBe(1);
    expect(view.revisionMaps).toHaveLength(2);
  });

  it("assigns the exact snapshot after every product turn", async () => {
    const spec = NATIVE_DEMO_SPEC;
    const result = await runArenaDesigner({
      spec,
      map: buildBlankArena(spec),
      session: new ScriptedPlaytestSession([
        call("propose_design_plan", {
          summary: "Three routes. Enclose A. Leave B open.",
          layout: ["A north", "mid", "B south"],
          priorities: ["Place both sites", "Keep routes", "Revise from playtest"],
        }),
        call("add_wall_chain", {
          kind: "occluder",
          height: 3,
          thickness: 0.5,
          points: [
            { x: -10, z: 10 },
            { x: 4, z: 10 },
            { x: 4, z: 4 },
          ],
        }),
        call("place_objective", { objectiveId: "A", x: -8, y: 0.1, z: 8, radius: 1.8 }),
        call("place_objective", { objectiveId: "B", x: 8, y: 0.1, z: -8, radius: 1.8 }),
        call("add_block", {
          kind: "occluder",
          x: 0,
          z: 0,
          width: 2.4,
          depth: 2.2,
          height: 3,
          hp: null,
        }),
        call("trace_route", { fromId: "ghost-spawn-0", toId: "A" }),
        call("run_playtest", { intent: "Check mid exposure." }),
        call("resize_solid", { solidId: "occluder-2", hx: 1.8, hy: 1.5, hz: 1.8 }),
        call("finish_design", { summary: "A and B placed, mid resized after playtest." }),
      ]),
    });
    expect(result.status).toBe("completed");
    const view = viewFromAgentResult({
      jobId: "synth-steps",
      source: "live",
      startingMapId: "blank-arena",
      brief: spec.brief,
      status: "completed",
      result,
      initialP0: compactP0(evaluateArena(result.initialMap, "search_destroy")),
      playOriginalId: "job:x:initial",
      initialMap: result.initialMap,
      path: "product",
      mode: "search_destroy",
    });
    const replay = replayProductTimeline(result.initialMap, result.turns);
    expect(view.revisionMaps).toHaveLength(replay.successfulEdits + 1);
    expect(view.revisionMaps[0]).toEqual(toPublicArenaMapView(result.initialMap));
    expect(view.revisionMaps[view.finalMapRevision]).toEqual(toPublicArenaMapView(result.finalMap));

    const expectedRev = (tool: string) => view.turns.find((t) => t.tool === tool)?.mapRevision;
    expect(expectedRev("propose_design_plan")).toBe(0);
    expect(expectedRev("add_wall_chain")).toBe(1);
    expect(expectedRev("place_objective")).toBe(2);
    expect(view.turns.filter((t) => t.tool === "place_objective").map((t) => t.mapRevision)).toEqual([2, 3]);
    expect(expectedRev("add_block")).toBe(4);
    expect(expectedRev("trace_route")).toBe(4);
    expect(expectedRev("run_playtest")).toBe(4);
    expect(expectedRev("resize_solid")).toBe(5);
    expect(expectedRev("finish_design")).toBe(5);

    const afterA = view.revisionMaps[2]!;
    expect(afterA.objectives.map((o) => o.id)).toEqual(["A"]);
    const afterB = view.revisionMaps[3]!;
    expect(afterB.objectives.map((o) => o.id).sort()).toEqual(["A", "B"]);

    const route = view.turns.find((t) => t.kind === "route")!;
    const playtest = view.turns.find((t) => t.kind === "playtest")!;
    expect(route.mapRevision).toBe(playtest.mapRevision);
    expect(view.revisionMaps[route.mapRevision]).toEqual(view.revisionMaps[4]);
  });
});
