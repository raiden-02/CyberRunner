import type { AgentTurnDecision } from "./agent.js";
import { buildBlankArena } from "./blank-map.js";
import { NATIVE_DEMO_SPEC } from "./native-demo-spec.js";
import { demoFromProductResult, type NativeRecordedDemo } from "./native-recorded-demo.js";
import { runArenaDesigner } from "./product-designer.js";
import { ScriptedPlaytestSession } from "./playtest-agent.js";

function call(name: string, args: Record<string, unknown>): AgentTurnDecision {
  return { latencyMs: 1, calls: [{ name, arguments: args, callId: name }] };
}

/** Scripted product run used for fixture plumbing and tests. Not a live model. */
export function syntheticNativeDemoSession(): ScriptedPlaytestSession {
  return new ScriptedPlaytestSession([
    call("propose_design_plan", {
      summary: "Three lanes between the team starts. Enclose A, leave B more open, and break the long mid sightline.",
      layout: [
        "North lane hugs the long wall toward A",
        "South lane opens toward B",
        "Center stays fast but gets a mid break after the first route check",
      ],
      priorities: [
        "Keep both teams a choice off spawn",
        "Make A tighter than B",
        "Do not let one sightline own the rotations",
      ],
    }),
    call("add_wall_chain", {
      kind: "occluder",
      height: 3,
      thickness: 0.5,
      points: [
        { x: -10, z: 11 },
        { x: 2, z: 11 },
        { x: 2, z: 5 },
      ],
    }),
    call("add_wall_chain", {
      kind: "occluder",
      height: 3,
      thickness: 0.5,
      points: [
        { x: 10, z: -11 },
        { x: -2, z: -11 },
        { x: -2, z: -5 },
      ],
    }),
    call("add_block", {
      kind: "occluder",
      x: -8,
      z: 7,
      width: 5,
      depth: 1,
      height: 3,
      hp: null,
    }),
    call("add_block", {
      kind: "obstacle",
      x: 8,
      z: -6,
      width: 2.5,
      depth: 2.5,
      height: 1.6,
      hp: null,
    }),
    call("place_objective", { objectiveId: "A", x: -8, y: 0, z: 8, radius: 2 }),
    call("place_objective", { objectiveId: "B", x: 8, y: 0, z: -8, radius: 2 }),
    call("trace_route", { fromId: "ghost-spawn-0", toId: "A" }),
    call("run_playtest", { intent: "See whether the open center pulls everyone through one line." }),
    call("add_wall", {
      kind: "occluder",
      x1: -1.5,
      z1: 1.5,
      x2: 1.5,
      z2: 1.5,
      height: 3,
      thickness: 0.6,
    }),
    call("finish_design", {
      summary: "A is boxed in, B stays more open, and the mid wall breaks the first straight route.",
    }),
  ]);
}

export async function runSyntheticNativeDemo(): Promise<NativeRecordedDemo> {
  const result = await runArenaDesigner({
    spec: NATIVE_DEMO_SPEC,
    map: buildBlankArena(NATIVE_DEMO_SPEC),
    session: syntheticNativeDemoSession(),
  });
  return demoFromProductResult({
    result,
    origin: "synthetic",
    provider: "scripted",
    model: "synthetic",
  });
}
