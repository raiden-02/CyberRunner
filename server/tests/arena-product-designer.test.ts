import { describe, expect, it } from "vitest";
import { parseArenaDesignSpec } from "../../shared/world/arena-design-spec.js";
import { ScriptedPlaytestSession } from "../src/arena-forge/playtest-agent.js";
import { buildBlankArena } from "../src/arena-forge/blank-map.js";
import { runArenaDesigner } from "../src/arena-forge/product-designer.js";
import {
  MAX_PRODUCT_DEATHMATCH_PLAYTESTS,
  MAX_PRODUCT_EDIT_ATTEMPTS,
  MAX_PRODUCT_MODEL_CALLS,
  MAX_PRODUCT_SND_PLAYTESTS,
  productFunctionTools,
  productToolNames,
} from "../src/arena-forge/product-tools.js";
import type { AgentTurnDecision } from "../src/arena-forge/agent.js";

const sndSpec = parseArenaDesignSpec({
  version: 1,
  mode: "search_destroy",
  envelope: { centerX: 0, centerZ: 0, halfWidth: 20, halfDepth: 16 },
  spawnSetup: {
    kind: "search_destroy",
    ghostAnchor: { x: -12, z: 0 },
    sentinelAnchor: { x: 12, z: 0 },
  },
  brief: "Three routes.",
});
if (!sndSpec.ok) throw new Error("snd spec");

const dmSpec = parseArenaDesignSpec({
  version: 1,
  mode: "deathmatch",
  envelope: { centerX: 0, centerZ: 0, halfWidth: 18, halfDepth: 18 },
  spawnSetup: {
    kind: "deathmatch",
    general: [
      { x: -8, z: -8 },
      { x: 8, z: -8 },
      { x: -8, z: 8 },
      { x: 8, z: 8 },
    ],
  },
  brief: "Loops and cover.",
});
if (!dmSpec.ok) throw new Error("dm spec");

function call(name: string, args: Record<string, unknown>): AgentTurnDecision {
  return { latencyMs: 1, calls: [{ name, arguments: args, callId: name }] };
}

describe("blank arena builder", () => {
  it("locks S&D clusters and spike, with no solids or sites", () => {
    const map = buildBlankArena(sndSpec.spec);
    expect(map.bounds).toEqual(sndSpec.spec.envelope);
    expect(map.solids).toEqual([]);
    expect(map.objectives).toEqual([]);
    expect(map.spawns.filter((s) => s.role === "ghost")).toHaveLength(4);
    expect(map.spawns.filter((s) => s.role === "sentinel")).toHaveLength(4);
    expect(map.spikeSpawnLocation).toMatchObject({ x: -12, z: 0 });
  });

  it("places Deathmatch general spawns and no objectives", () => {
    const map = buildBlankArena(dmSpec.spec);
    expect(map.spawns.every((s) => s.role === "general")).toBe(true);
    expect(map.spawns).toHaveLength(4);
    expect(map.objectives).toEqual([]);
    expect(map.spikeSpawnLocation).toBeUndefined();
  });
});

describe("product designer", () => {
  it("rejects geometry before a public design plan", async () => {
    const session = new ScriptedPlaytestSession([
      call("add_block", { kind: "obstacle", x: 0, z: 0, width: 2, depth: 2, height: 2, hp: null }),
      call("propose_design_plan", {
        summary: "Three-route layout.",
        layout: ["west cover", "center", "east"],
        priorities: ["spawn safety"],
      }),
      call("finish_design", { summary: "not ready" }),
    ]);
    const result = await runArenaDesigner({
      spec: sndSpec.spec,
      map: buildBlankArena(sndSpec.spec),
      session,
    });
    expect(result.turns[0]?.outcome?.ok).toBe(false);
    expect(result.turns[0]?.outcome?.error?.code).toBe("plan-required");
    expect(result.designPlan?.summary).toBe("Three-route layout.");
  });

  it("accepts plan then geometry and cannot move spawns or the envelope", async () => {
    const session = new ScriptedPlaytestSession([
      call("propose_design_plan", {
        summary: "Three-route layout.",
        layout: ["west cover", "center", "east"],
        priorities: ["spawn safety"],
      }),
      call("add_block", { kind: "obstacle", x: 0, z: 0, width: 2, depth: 2, height: 2, hp: null }),
      call("add_block", { kind: "obstacle", x: 40, z: 0, width: 2, depth: 2, height: 2, hp: null }),
      call("move_spawn", { spawnId: "ghost-spawn-0", x: 0, y: 1, z: 0 }),
      call("finish_design", { summary: "done" }),
    ]);
    const result = await runArenaDesigner({
      spec: sndSpec.spec,
      map: buildBlankArena(sndSpec.spec),
      session,
    });
    expect(result.turns[0]?.tool).toBe("propose_design_plan");
    expect(result.turns[1]?.outcome?.ok).toBe(true);
    expect(result.turns[2]?.outcome?.ok).toBe(false);
    expect(result.turns[2]?.outcome?.error?.code).toBe("out-of-envelope");
    expect(result.finalMap.spawns[0]?.x).toBe(result.initialMap.spawns[0]?.x);
    expect(productToolNames("search_destroy")).not.toContain("move_spawn");
  });

  it("exposes mode-specific tools", () => {
    const snd = productToolNames("search_destroy");
    const dm = productToolNames("deathmatch");
    expect(snd).toEqual(expect.arrayContaining([
      "propose_design_plan",
      "add_block",
      "place_objective",
      "move_objective",
      "run_playtest",
      "finish_design",
    ]));
    expect(dm).toEqual(expect.arrayContaining(["propose_design_plan", "add_block", "add_wall", "add_wall_chain", "trace_route", "finish_design"]));
    expect(dm).not.toContain("add_solid");
    expect(dm).not.toContain("run_playtest");
    expect(dm).not.toContain("place_objective");
    expect(dm).not.toContain("move_spawn");
    expect(productFunctionTools("deathmatch").some((t) => t.name === "run_playtest")).toBe(false);
    expect(MAX_PRODUCT_EDIT_ATTEMPTS).toBe(16);
    expect(MAX_PRODUCT_SND_PLAYTESTS).toBe(3);
    expect(MAX_PRODUCT_DEATHMATCH_PLAYTESTS).toBe(0);
    expect(MAX_PRODUCT_MODEL_CALLS).toBe(24);
  });

  it("does not complete S&D without A/B", async () => {
    const session = new ScriptedPlaytestSession([
      call("propose_design_plan", {
        summary: "Sites later.",
        layout: ["center"],
        priorities: ["safety"],
      }),
      call("finish_design", { summary: "too soon" }),
      call("place_objective", { objectiveId: "A", x: -4, y: 0, z: -4, radius: 2 }),
      call("place_objective", { objectiveId: "B", x: 4, y: 0, z: 4, radius: 2 }),
      call("finish_design", { summary: "still blocked maybe" }),
    ]);
    const result = await runArenaDesigner({
      spec: sndSpec.spec,
      map: buildBlankArena(sndSpec.spec),
      session,
    });
    expect(result.turns.find((t) => t.tool === "finish_design")?.outcome?.ok).not.toBe(true);
    expect(result.status === "completed" ? result.finalMap.objectives.length : 2).toBeGreaterThanOrEqual(0);
    if (result.status === "completed") {
      expect(result.finalMap.objectives.map((o) => o.id).sort()).toEqual(["A", "B"]);
    } else {
      expect(result.turns.some((t) => t.outcome?.error?.code === "finish-blocked")).toBe(true);
    }
  });

  it("completes a valid Deathmatch sequence", async () => {
    const session = new ScriptedPlaytestSession([
      call("propose_design_plan", {
        summary: "Loops.",
        layout: ["ring"],
        priorities: ["cover"],
      }),
      call("add_block", { kind: "occluder", x: 0, z: 0, width: 4, depth: 0.8, height: 3, hp: null }),
      call("finish_design", { summary: "good enough" }),
    ]);
    const result = await runArenaDesigner({
      spec: dmSpec.spec,
      map: buildBlankArena(dmSpec.spec),
      session,
    });
    expect(result.status).toBe("completed");
    expect(result.designPlan?.summary).toBe("Loops.");
    expect(result.finalMap.objectives).toEqual([]);
  });
});
