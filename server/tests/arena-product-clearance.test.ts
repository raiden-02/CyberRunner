import { describe, expect, it } from "vitest";
import { CAPSULE } from "../../shared/physics/constants.js";
import { parseArenaDesignSpec } from "../../shared/world/arena-design-spec.js";
import { inspectArena } from "../src/arena-forge/inspect.js";
import { buildBlankArena } from "../src/arena-forge/blank-map.js";
import {
  inspectProductClearance,
  MIN_PRODUCT_PASSAGE_METERS,
  PLAYER_DIAMETER,
  rejectClearanceRegression,
} from "../src/arena-forge/product-clearance.js";
import {
  applyProductEdit,
  applyProductLayoutEdit,
  productCompletionIssues,
  productInspection,
  productSystemPrompt,
} from "../src/arena-forge/product-tools.js";
import { evaluateArena } from "../src/arena-forge/evaluator.js";
import { loadNativeRecordedDemo } from "../src/arena-forge/native-recorded-demo.js";
import type { ArenaMap, ArenaSolid } from "../src/arena-forge/types.js";
import { GRID_CELL_METERS, PLAYER_RADIUS } from "../src/arena-forge/types.js";
import { ArenaWorkspace } from "../src/arena-forge/workspace.js";

const spec = parseArenaDesignSpec({
  version: 1,
  mode: "search_destroy",
  envelope: { centerX: 0, centerZ: 0, halfWidth: 20, halfDepth: 16 },
  spawnSetup: {
    kind: "search_destroy",
    ghostAnchor: { x: -12, z: 0 },
    sentinelAnchor: { x: 12, z: 0 },
  },
  brief: "Clearance.",
});
if (!spec.ok) throw new Error("spec");

const envelope = spec.spec.envelope;

function solid(
  id: string,
  x: number,
  z: number,
  hx: number,
  hz: number,
  extras: Partial<ArenaSolid> = {},
): ArenaSolid {
  return {
    id,
    kind: "occluder",
    x,
    y: 1.5,
    z,
    hx,
    hy: 1.5,
    hz,
    ...extras,
  };
}

/** Two boxes that overlap on X. `gap` is the positive Z edge-to-edge opening. */
function facingOnZ(idA: string, idB: string, gap: number, hx = 2, hz = 0.5, x = 0): ArenaSolid[] {
  return [
    solid(idA, x, -(hz + gap / 2), hx, hz),
    solid(idB, x, +(hz + gap / 2), hx, hz),
  ];
}

function mapWith(solids: ArenaSolid[]): ArenaMap {
  return { ...buildBlankArena(spec.spec), solids };
}

function workspaceWith(solids: ArenaSolid[]): ArenaWorkspace {
  return new ArenaWorkspace(mapWith(solids));
}

function addBlock(
  ws: ArenaWorkspace,
  args: { x: number; z: number; width: number; depth: number; kind?: string; height?: number },
) {
  return applyProductLayoutEdit(
    ws,
    "add_block",
    {
      kind: args.kind ?? "occluder",
      x: args.x,
      z: args.z,
      width: args.width,
      depth: args.depth,
      height: args.height ?? 3,
      hp: null,
    },
    envelope,
  );
}

function addWall(
  ws: ArenaWorkspace,
  args: { x1: number; z1: number; x2: number; z2: number; thickness?: number },
) {
  return applyProductLayoutEdit(
    ws,
    "add_wall",
    {
      kind: "occluder",
      x1: args.x1,
      z1: args.z1,
      x2: args.x2,
      z2: args.z2,
      height: 3,
      thickness: args.thickness ?? 0.4,
    },
    envelope,
  );
}

describe("product clearance constants", () => {
  it("derives diameter and the 1.2 m product opening from shared physics", () => {
    expect(PLAYER_RADIUS).toBe(CAPSULE.Radius);
    expect(PLAYER_DIAMETER).toBe(CAPSULE.Radius * 2);
    expect(PLAYER_DIAMETER).toBe(0.7);
    expect(GRID_CELL_METERS).toBe(0.5);
    expect(MIN_PRODUCT_PASSAGE_METERS).toBe(PLAYER_DIAMETER + GRID_CELL_METERS);
    expect(MIN_PRODUCT_PASSAGE_METERS).toBe(1.2);
  });
});

describe("synthetic observed-gap regression", () => {
  it("flags a 0.50 m slit and a 0.90 m too-tight opening on one map", () => {
    const report = inspectProductClearance(mapWith([
      ...facingOnZ("slit-a", "slit-b", 0.5),
      ...facingOnZ("tight-a", "tight-b", 0.9, 2, 0.5, 8),
    ]));
    expect(report.issues).toEqual(expect.arrayContaining([
      {
        code: "narrow-solid-gap",
        a: "slit-a",
        b: "slit-b",
        axis: "z",
        gapMeters: 0.5,
        requiredMeters: 1.2,
      },
      {
        code: "narrow-solid-gap",
        a: "tight-a",
        b: "tight-b",
        axis: "z",
        gapMeters: 0.9,
        requiredMeters: 1.2,
      },
    ]));
    expect(report.issues).toHaveLength(2);
  });
});

describe("native recorded fixture clearance", () => {
  it("keeps the current recorded final map clearance-clean", () => {
    const demo = loadNativeRecordedDemo();
    const report = inspectProductClearance(demo.finalMap);
    expect(report.issues).toEqual([]);
    expect(productCompletionIssues(demo.finalMap, demo.result.finalEvaluation, "search_destroy")).toEqual([]);
  });
});

describe("pairwise product openings", () => {
  it("accepts exact touch, overlap, the 1.2 m minimum, and a comfortable 2.0 m opening", () => {
    expect(inspectProductClearance(mapWith(facingOnZ("a", "b", 0))).issues).toEqual([]);
    expect(inspectProductClearance(mapWith(facingOnZ("a", "b", -0.4))).issues).toEqual([]);
    expect(inspectProductClearance(mapWith(facingOnZ("a", "b", 1.2))).issues).toEqual([]);
    expect(inspectProductClearance(mapWith(facingOnZ("a", "b", 2))).issues).toEqual([]);
  });

  it("rejects a 0.5 m impossible slit and a 0.9 m too-tight opening", () => {
    const slit = inspectProductClearance(mapWith(facingOnZ("occluder-a", "occluder-b", 0.5)));
    expect(slit.issues).toEqual([
      {
        code: "narrow-solid-gap",
        a: "occluder-a",
        b: "occluder-b",
        axis: "z",
        gapMeters: 0.5,
        requiredMeters: 1.2,
      },
    ]);
    const tight = inspectProductClearance(mapWith(facingOnZ("occluder-a", "occluder-b", 0.9)));
    expect(tight.issues[0]).toMatchObject({ gapMeters: 0.9, axis: "z" });
  });

  it("does not treat diagonal corner-near boxes as a corridor", () => {
    const map = mapWith([
      solid("a", 0, 0, 1, 1),
      solid("b", 2.4, 2.4, 1, 1),
    ]);
    expect(inspectProductClearance(map).issues).toEqual([]);
  });

  it("ignores solids whose Y range misses the standing capsule", () => {
    const map = mapWith([
      ...facingOnZ("low-a", "low-b", 0.5),
      solid("high-a", 0, -1, 2, 0.5, { y: 8, hy: 0.5 }),
      solid("high-b", 0, 1, 2, 0.5, { y: 8, hy: 0.5 }),
    ]);
    const ids = inspectProductClearance(map).issues.flatMap((issue) =>
      issue.code === "narrow-solid-gap" ? [issue.a, issue.b] : [issue.solidId],
    );
    expect(ids).toContain("low-a");
    expect(ids).not.toContain("high-a");
    expect(ids).not.toContain("high-b");
  });
});

describe("boundary clearance", () => {
  it("rejects a 0.5 m strip, accepts 1.2 m, and accepts a wall that touches the envelope", () => {
    const near = inspectProductClearance(mapWith([solid("edge", 18.5, 6, 1, 1)]));
    expect(near.issues).toEqual([
      {
        code: "narrow-boundary-gap",
        solidId: "edge",
        side: "x+",
        gapMeters: 0.5,
        requiredMeters: 1.2,
      },
    ]);
    expect(inspectProductClearance(mapWith([solid("ok", 17.8, 6, 1, 1)])).issues).toEqual([]);
    expect(inspectProductClearance(mapWith([solid("touch", 19, 6, 1, 1)])).issues).toEqual([]);
  });
});

describe("product inspection and completion", () => {
  it("adds clearance only on the product inspection payload", () => {
    const map = mapWith(facingOnZ("a", "b", 0.5));
    const ws = new ArenaWorkspace(map);
    const historical = inspectArena(map, ws.evaluation);
    expect("clearance" in historical).toBe(false);
    const product = productInspection(ws);
    expect(product.clearance.minimumPassageMeters).toBe(1.2);
    expect(product.clearance.issues).toHaveLength(1);
    const evaled = evaluateArena(map, "search_destroy");
    expect(productCompletionIssues(map, evaled, "search_destroy")).toContain("narrow-passage");
  });

  it("states the 1.2 m opening rule in the product prompt", () => {
    expect(productSystemPrompt("search_destroy")).toContain(
      "Any intentional opening between walls or cover must be at least 1.2 m wide; otherwise connect the pieces with no gap. Deterministic clearance checks are authoritative.",
    );
  });
});

describe("tool-time clearance rejection", () => {
  it("rejects add_block that creates a 0.5 m slit and accepts a 2 m corridor", () => {
    const slitWs = new ArenaWorkspace(buildBlankArena(spec.spec));
    expect(addWall(slitWs, { x1: -4, z1: 0, x2: 4, z2: 0 }).ok).toBe(true);
    const slit = addBlock(slitWs, { x: 0, z: 1.2, width: 4, depth: 1 });
    expect(slit.ok).toBe(false);
    if (!slit.ok) {
      expect(slit.error.code).toBe("passage-too-narrow");
      expect(slit.error.gapMeters).toBe(0.5);
      expect(slit.error.requiredMeters).toBe(1.2);
      expect(String(slit.error.between)).toContain("occluder-0");
    }
    expect(slitWs.currentMap().solids).toHaveLength(1);

    const openWs = new ArenaWorkspace(buildBlankArena(spec.spec));
    expect(addWall(openWs, { x1: -4, z1: 0, x2: 4, z2: 0 }).ok).toBe(true);
    const open = addBlock(openWs, { x: 0, z: 2.7, width: 4, depth: 1 });
    expect(open.ok).toBe(true);
    expect(openWs.currentMap().solids).toHaveLength(2);
  });

  it("rejects move_solid and resize_solid that narrow a 2 m opening below 1.2 m", () => {
    const ws = new ArenaWorkspace(buildBlankArena(spec.spec));
    expect(addWall(ws, { x1: -4, z1: 0, x2: 4, z2: 0 }).ok).toBe(true);
    expect(addBlock(ws, { x: 0, z: 2.7, width: 4, depth: 1 }).ok).toBe(true);
    const moved = applyProductEdit(
      ws,
      { type: "move_solid", solidId: "occluder-1", x: 0, y: 1.5, z: 1.5 },
      envelope,
    );
    expect(moved.ok).toBe(false);
    if (!moved.ok) {
      expect(moved.error.code).toBe("passage-too-narrow");
      expect(moved.error.gapMeters).toBe(0.8);
    }
    expect(ws.currentMap().solids.find((s) => s.id === "occluder-1")?.z).toBe(2.7);

    const resized = applyProductEdit(
      ws,
      { type: "resize_solid", solidId: "occluder-1", hx: 2, hy: 1.5, hz: 1.6 },
      envelope,
    );
    expect(resized.ok).toBe(false);
    if (!resized.ok) expect(resized.error.code).toBe("passage-too-narrow");
    expect(ws.currentMap().solids.find((s) => s.id === "occluder-1")?.hz).toBe(0.5);
  });

  it("accepts a wall chain whose corners overlap on purpose", () => {
    const ws = new ArenaWorkspace(buildBlankArena(spec.spec));
    const chain = applyProductLayoutEdit(
      ws,
      "add_wall_chain",
      {
        kind: "occluder",
        height: 3,
        thickness: 0.4,
        points: [
          { x: -8, z: -4 },
          { x: 2, z: -4 },
          { x: 2, z: 8 },
        ],
      },
      envelope,
    );
    expect(chain.ok).toBe(true);
    expect(ws.currentMap().solids).toHaveLength(2);
    expect(inspectProductClearance(ws.currentMap()).issues).toEqual([]);
  });

  it("lets a repair widen or close a pre-existing 0.5 m slit", () => {
    const ws = workspaceWith(facingOnZ("occluder-0", "occluder-1", 0.5));
    expect(inspectProductClearance(ws.currentMap()).issues).toHaveLength(1);

    const far = applyProductEdit(
      ws,
      { type: "move_solid", solidId: "occluder-1", x: 0, y: 1.5, z: 2 },
      envelope,
    );
    expect(far.ok).toBe(true);
    expect(inspectProductClearance(ws.currentMap()).issues).toEqual([]);

    const reset = workspaceWith(facingOnZ("occluder-0", "occluder-1", 0.5));
    const closed = applyProductEdit(
      reset,
      { type: "move_solid", solidId: "occluder-1", x: 0, y: 1.5, z: 0.25 },
      envelope,
    );
    expect(closed.ok).toBe(true);
    expect(inspectProductClearance(reset.currentMap()).issues).toEqual([]);
  });

  it("does not reject an unrelated edit that leaves a pre-existing slit alone", () => {
    const ws = workspaceWith(facingOnZ("occluder-0", "occluder-1", 0.5));
    const extra = addBlock(ws, { x: 8, z: 8, width: 2, depth: 2 });
    expect(extra.ok).toBe(true);
    expect(ws.currentMap().solids).toHaveLength(3);
    const leftover = inspectProductClearance(ws.currentMap()).issues;
    expect(leftover).toHaveLength(1);
    if (leftover[0]?.code === "narrow-solid-gap") {
      expect(leftover[0].a).toBe("occluder-0");
      expect(leftover[0].b).toBe("occluder-1");
    }
  });

  it("compares before/after issues so a partial widen is not treated as a new defect", () => {
    const before = inspectProductClearance(mapWith(facingOnZ("a", "b", 0.5))).issues;
    const after = inspectProductClearance(mapWith(facingOnZ("a", "b", 0.9))).issues;
    expect(rejectClearanceRegression(mapWith(facingOnZ("a", "b", 0.5)), mapWith(facingOnZ("a", "b", 0.9)))).toBeUndefined();
    expect(after[0]?.gapMeters).toBe(0.9);
    expect(before[0]?.gapMeters).toBe(0.5);
  });
});
