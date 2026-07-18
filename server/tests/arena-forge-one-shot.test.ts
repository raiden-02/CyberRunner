import { beforeAll, describe, expect, it } from "vitest";
import RAPIER from "@dimforge/rapier3d-compat";
import { getGameplayMap } from "../../shared/world/map-registry.js";
import { buildMapColliders } from "../../shared/world/map-physics.js";
import type { ArenaEditAction } from "../src/arena-forge/actions.js";
import { importGameplayMap } from "../src/arena-forge/import-map.js";
import {
  ACTION_VOCABULARY,
  MAX_ONE_SHOT_ACTIONS,
  missingOpenAIKeyMessage,
  parseOneShotProposal,
  readOpenAIApiKey,
  runOneShotDesign,
  type OneShotDesignInput,
  type OneShotDesigner,
  type OneShotDesignerResult,
} from "../src/arena-forge/one-shot.js";
import { OpenAIOneShotDesigner } from "../src/arena-forge/openai-designer.js";
import { exportGameplayMap } from "../src/arena-forge/export-map.js";
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
        model: { requested: "fake", returned: "fake" },
        latencyMs: 0,
      };
    },
  };
  return designer;
}

const brief = "Make mid more aggressive while preserving both site routes.";

describe("ArenaForge one-shot", () => {
  it("passes brief, inspection, and action vocabulary to the designer once", async () => {
    const map = arena({
      solids: [box("obstacle-0", "obstacle", { x: 0, y: 1, z: 0, hx: 1, hy: 1, hz: 1 })],
    });
    const designer = fakeDesigner({ designSummary: "leave as is", actions: [] });
    const result = await runOneShotDesign({ map, brief, designer });

    expect(designer.calls).toBe(1);
    expect(designer.lastInput?.brief).toBe(brief);
    expect(designer.lastInput?.maxActions).toBe(MAX_ONE_SHOT_ACTIONS);
    expect(designer.lastInput?.actionVocabulary).toEqual([...ACTION_VOCABULARY]);
    expect(designer.lastInput?.inspection.solids.map((s) => s.id)).toEqual(["obstacle-0"]);
    expect(designer.lastInput?.inspection.evaluation?.hardFailureCount).toBeDefined();
    expect(designer.lastInput?.inspection.evaluation?.navigation.anchors.length).toBeGreaterThan(0);
    expect(result.executionStatus).toBe("completed");
  });

  it("executes a valid two-action proposal without a second model call", async () => {
    const map = arena({
      solids: [box("obstacle-0", "obstacle", { x: 0, y: 1, z: 0, hx: 1, hy: 1, hz: 1 })],
    });
    const actions: ArenaEditAction[] = [
      { type: "move_solid", solidId: "obstacle-0", x: 4, y: 1, z: 0 },
      {
        type: "add_solid",
        kind: "occluder",
        x: 0, y: 2, z: 0,
        hx: 2, hy: 2, hz: 0.4,
      },
    ];
    const designer = fakeDesigner({
      designSummary: "Shift cover and add a mid occluder.",
      actions,
    });
    const result = await runOneShotDesign({ map, brief, designer });

    expect(designer.calls).toBe(1);
    expect(result.executionStatus).toBe("completed");
    expect(result.actionResults).toHaveLength(2);
    expect(result.actionResults.every((r) => r.ok)).toBe(true);
    expect(result.actionResults[0]).toMatchObject({ ok: true, changedIds: ["obstacle-0"] });
    expect(result.actionResults[1]).toMatchObject({ ok: true, changedIds: ["occluder-0"] });
    expect(result.finalMap.solids.find((s) => s.id === "obstacle-0")).toMatchObject({ x: 4 });
    expect(result.finalMap.solids.find((s) => s.id === "occluder-0")).toBeDefined();
    const pair = result.finalEvaluation.lineOfSight.pairs.find(
      (p) => p.from === "ghost-spawn-0" && p.to === "sentinel-spawn-0",
    );
    expect(pair?.clear).toBe(false);
    expect(pair?.blockedBy).toBe("occluder-0");
  });

  it("stops after the first action-layer rejection and does not call the model again", async () => {
    const map = arena({
      solids: [box("obstacle-0", "obstacle", { x: 0, y: 1, z: 0, hx: 1, hy: 1, hz: 1 })],
    });
    const designer = fakeDesigner({
      designSummary: "Move then resize with a zero extent.",
      actions: [
        { type: "move_solid", solidId: "obstacle-0", x: 3, y: 1, z: 0 },
        { type: "resize_solid", solidId: "obstacle-0", hx: 0, hy: 1, hz: 1 },
        { type: "add_solid", kind: "occluder", x: 0, y: 2, z: 0, hx: 1, hy: 2, hz: 0.4 },
      ],
    });
    const result = await runOneShotDesign({ map, brief, designer });

    expect(designer.calls).toBe(1);
    expect(result.executionStatus).toBe("action_rejected");
    expect(result.actionResults).toHaveLength(2);
    expect(result.actionResults[0]).toMatchObject({ ok: true, changedIds: ["obstacle-0"] });
    expect(result.actionResults[1]).toMatchObject({
      ok: false,
      error: { code: "non-positive-extent", target: "obstacle-0" },
    });
    expect(result.finalMap.solids.map((s) => s.id)).toEqual(["obstacle-0"]);
    expect(result.finalMap.solids.some((s) => s.kind === "occluder")).toBe(false);
  });

  it("keeps applying after an evaluator hard failure", async () => {
    const map = arena({
      solids: [box("obstacle-0", "obstacle", { x: 0, y: 1, z: 0, hx: 1, hy: 1, hz: 1 })],
    });
    const designer = fakeDesigner({
      designSummary: "Push a box out of bounds, then add cover.",
      actions: [
        { type: "move_solid", solidId: "obstacle-0", x: 11, y: 1, z: 0 },
        { type: "add_solid", kind: "occluder", x: 0, y: 2, z: 0, hx: 2, hy: 2, hz: 0.4 },
      ],
    });
    const result = await runOneShotDesign({ map, brief, designer });

    expect(result.executionStatus).toBe("completed");
    expect(result.actionResults).toHaveLength(2);
    expect(result.actionResults.every((r) => r.ok)).toBe(true);
    expect(result.finalEvaluation.summary.hardFailures.some(
      (i) => i.code === "solid-out-of-bounds" && i.id === "obstacle-0",
    )).toBe(true);
    expect(result.finalMap.solids.map((s) => s.id)).toEqual(["obstacle-0", "occluder-0"]);
  });

  it("preserves the untouched initial map and evaluation", async () => {
    const map = arena({
      solids: [box("obstacle-0", "obstacle", { x: 0, y: 1, z: 0, hx: 1, hy: 1, hz: 1 })],
    });
    const designer = fakeDesigner({
      designSummary: "Move cover.",
      actions: [{ type: "move_solid", solidId: "obstacle-0", x: 5, y: 1, z: 2 }],
    });
    const result = await runOneShotDesign({ map, brief, designer });

    expect(map.solids[0]).toMatchObject({ x: 0, z: 0 });
    expect(result.initialMap.solids[0]).toMatchObject({ id: "obstacle-0", x: 0, z: 0 });
    expect(result.finalMap.solids[0]).toMatchObject({ x: 5, z: 2 });
    expect(result.initialMap).not.toBe(result.finalMap);
    expect(result.initialEvaluation.summary.hardFailureCount).toBe(0);
    expect(result.initialMap.solids[0].x).not.toBe(result.finalMap.solids[0].x);
  });

  it("rejects a proposal above the action budget without truncating", async () => {
    const actions = Array.from({ length: MAX_ONE_SHOT_ACTIONS + 1 }, (_, i) => ({
      type: "add_solid" as const,
      kind: "obstacle" as const,
      x: i, y: 1, z: 0,
      hx: 1, hy: 1, hz: 1,
    }));
    const designer = fakeDesigner({
      designSummary: "too many",
      actions,
    });
    const result = await runOneShotDesign({ map: arena(), brief, designer });

    expect(designer.calls).toBe(1);
    expect(result.executionStatus).toBe("invalid_model_output");
    expect(result.invalidReason).toMatch(/MAX_ONE_SHOT_ACTIONS/);
    expect(result.actionResults).toEqual([]);
    expect(result.finalMap.solids).toEqual([]);
    expect(result.proposal).toBeUndefined();
  });

  it("rejects arbitrary map replacement or unknown fields", () => {
    expect(parseOneShotProposal({
      replaceEntireMap: { solids: [] },
      designSummary: "nope",
      actions: [],
    }).ok).toBe(false);
    expect(parseOneShotProposal({
      designSummary: "nope",
      actions: [],
      source: "edit evaluator.ts",
    }).ok).toBe(false);
    expect(parseOneShotProposal({
      designSummary: "nope",
      actions: [{ type: "eval_script", code: "process.exit(1)" }],
    }).ok).toBe(false);
  });

  it("rejects a proposal that targets a predicted newly-created ID", async () => {
    const map = arena();
    expect(map.solids).toEqual([]);
    const designer = fakeDesigner({
      designSummary: "Add then immediately move the new occluder.",
      actions: [
        { type: "add_solid", kind: "occluder", x: 0, y: 2, z: 0, hx: 2, hy: 2, hz: 0.4 },
        { type: "move_solid", solidId: "occluder-0", x: 2, y: 2, z: 0 },
      ],
    });
    const result = await runOneShotDesign({ map, brief, designer });

    expect(designer.calls).toBe(1);
    expect(result.executionStatus).toBe("invalid_model_output");
    expect(result.invalidReason).toBe(
      "actions[1] references solidId occluder-0 that was not present in the initial inspection",
    );
    expect(result.actionResults).toEqual([]);
    expect(result.finalMap.solids).toEqual([]);
    expect(result.finalMap).toEqual(result.initialMap);
    expect(result.finalEvaluation).toEqual(result.initialEvaluation);
  });

  it("allows multiple actions against the same initially observed solid", async () => {
    const map = arena({
      solids: [box("obstacle-0", "obstacle", { x: 0, y: 1, z: 0, hx: 1, hy: 1, hz: 1 })],
    });
    const designer = fakeDesigner({
      designSummary: "Nudge and slim the existing box.",
      actions: [
        { type: "move_solid", solidId: "obstacle-0", x: 3, y: 1, z: 1 },
        { type: "resize_solid", solidId: "obstacle-0", hx: 0.6, hy: 1, hz: 0.6 },
      ],
    });
    const result = await runOneShotDesign({ map, brief, designer });

    expect(designer.calls).toBe(1);
    expect(result.executionStatus).toBe("completed");
    expect(result.actionResults).toHaveLength(2);
    expect(result.actionResults.every((r) => r.ok)).toBe(true);
    expect(result.finalMap.solids[0]).toMatchObject({ id: "obstacle-0", x: 3, z: 1, hx: 0.6, hz: 0.6 });
  });

  it("rejects spawn and objective IDs that were not in the initial inspection", async () => {
    const spawnDesigner = fakeDesigner({
      designSummary: "Move a spawn that is not on the map.",
      actions: [{ type: "move_spawn", spawnId: "ghost-spawn-9", x: 0, y: 1, z: 0 }],
    });
    const spawnResult = await runOneShotDesign({ map: arena(), brief, designer: spawnDesigner });
    expect(spawnDesigner.calls).toBe(1);
    expect(spawnResult.executionStatus).toBe("invalid_model_output");
    expect(spawnResult.invalidReason).toBe(
      "actions[0] references spawnId ghost-spawn-9 that was not present in the initial inspection",
    );
    expect(spawnResult.actionResults).toEqual([]);
    expect(spawnResult.finalMap.spawns.map((s) => s.id)).toEqual(["ghost-spawn-0", "sentinel-spawn-0"]);

    const noB = arena({
      objectives: [{ id: "A", x: -4, y: 0, z: -4, radius: 2 }],
    });
    const objDesigner = fakeDesigner({
      designSummary: "Move B even though it is missing.",
      actions: [{ type: "move_objective", objectiveId: "B", x: 2, y: 0, z: 2 }],
    });
    const objResult = await runOneShotDesign({ map: noB, brief, designer: objDesigner });
    expect(objDesigner.calls).toBe(1);
    expect(objResult.executionStatus).toBe("invalid_model_output");
    expect(objResult.invalidReason).toBe(
      "actions[0] references objectiveId B that was not present in the initial inspection",
    );
    expect(objResult.actionResults).toEqual([]);
  });
});

describe("ArenaForge one-shot export", () => {
  beforeAll(async () => {
    await RAPIER.init();
  });

  it("exports the final map to GameplayMapDefinition for buildMapColliders", async () => {
    const source = getGameplayMap("map-contract-smoke");
    const designer = fakeDesigner({
      designSummary: "Nudge one obstacle.",
      actions: [{ type: "move_solid", solidId: "obstacle-1", x: 4, y: 1, z: -2 }],
    });
    const result = await runOneShotDesign({
      map: importGameplayMap(source),
      brief,
      designer,
    });
    expect(result.executionStatus).toBe("completed");

    const exported = exportGameplayMap(result.finalMap, { id: source.id, name: source.name });
    expect(exported.obstacles[1]).toEqual({ x: 4, y: 1, z: -2, hx: 1, hy: 1, hz: 1 });
    expect(exported.occluders).toEqual(source.occluders);
    expect(exported.breakables).toEqual(source.breakables);

    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    const { breakableColliders } = buildMapColliders(RAPIER, world, exported);
    expect(breakableColliders.length).toBe(exported.breakables.length);
    const expected =
      1 + 4 + exported.obstacles.length + exported.occluders.length + exported.breakables.length;
    expect(world.colliders.len()).toBe(expected);
    world.free();
  });
});

describe("ArenaForge one-shot config", () => {
  it("treats a missing or blank API key as unset", () => {
    expect(readOpenAIApiKey({} as NodeJS.ProcessEnv)).toBeUndefined();
    expect(readOpenAIApiKey({ OPENAI_API_KEY: "   " } as NodeJS.ProcessEnv)).toBeUndefined();
    expect(missingOpenAIKeyMessage()).toContain("server/.env");
    expect(() => new OpenAIOneShotDesigner({ apiKey: "" })).toThrow(/OPENAI_API_KEY/);
  });
});
