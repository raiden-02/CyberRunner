import { aabbOverhangs, pointInsideRect, type MapBoundsRect } from "@shared/world/map-bounds.js";
import type { ArenaGameMode } from "@shared/world/arena-design-spec.js";
import {
  applyArenaEdit,
  createIdAllocator,
  type ArenaEditAction,
  type ArenaEditError,
} from "./actions.js";
import {
  applyEditTool,
  FINISH_DESIGN_TOOL,
  parseEditToolArgs,
  parseFinishSummary,
  readIntent,
  type AgentToolOutput,
} from "./agent-tools.js";
import { circleInsideBounds, isFiniteNumber } from "./geometry.js";
import {
  inspectProductClearance,
  MIN_PRODUCT_PASSAGE_METERS,
  rejectClearanceRegression,
} from "./product-clearance.js";
import { deathmatchAllPairs } from "./product-dm-diagnostics.js";
import {
  isProductLayoutTool,
  layoutSolidActions,
  parseProductLayoutAction,
  PRODUCT_LAYOUT_TOOLS,
} from "./product-layout.js";
import { PLAYER_RADIUS, type ArenaEvaluation, type ArenaMap } from "./types.js";
import type { ArenaWorkspace } from "./workspace.js";

export const PROPOSE_DESIGN_PLAN_TOOL = "propose_design_plan";
export const PLACE_OBJECTIVE_TOOL = "place_objective";
export const RUN_PLAYTEST_TOOL = "run_playtest";

export const MAX_PRODUCT_DESIGN_PLANS = 1;
export const MAX_PRODUCT_EDIT_ATTEMPTS = 16;
export const MAX_PRODUCT_SND_PLAYTESTS = 3;
export const MAX_PRODUCT_DEATHMATCH_PLAYTESTS = 0;
export const MAX_PRODUCT_MODEL_CALLS = 24;

export const TRACE_ROUTE_TOOL = "trace_route";

export const PRODUCT_GEOMETRY_TOOLS = [
  ...PRODUCT_LAYOUT_TOOLS,
  "move_solid",
  "resize_solid",
  "remove_solid",
] as const;

export type PublicDesignPlan = {
  summary: string;
  layout: string[];
  priorities: string[];
};

const intentField = { type: ["string", "null"] as const };

function obj(
  required: string[],
  properties: Record<string, unknown>,
): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: [...required, "intent"],
    properties: { ...properties, intent: intentField },
  };
}

export const PRODUCT_PLAN_TOOL = {
  type: "function" as const,
  name: PROPOSE_DESIGN_PLAN_TOOL,
  description:
    "Publish the public design plan. Must be the first tool. Does not change geometry.",
  strict: true,
  allowed_callers: ["direct" as const],
  parameters: obj(["summary", "layout", "priorities"], {
    summary: { type: "string" },
    layout: { type: "array", items: { type: "string" } },
    priorities: { type: "array", items: { type: "string" } },
  }),
};

const GEOMETRY_FUNCTION_TOOLS = [
  {
    type: "function" as const,
    name: "add_block",
    description: "Add a grounded axis-aligned block. Server sets y from height. No floating geometry.",
    strict: true,
    allowed_callers: ["direct" as const],
    parameters: obj(["kind", "x", "z", "width", "depth", "height", "hp"], {
      kind: { type: "string", enum: ["obstacle", "occluder", "breakable"] },
      x: { type: "number" },
      z: { type: "number" },
      width: { type: "number" },
      depth: { type: "number" },
      height: { type: "number" },
      hp: { type: ["number", "null"] },
    }),
  },
  {
    type: "function" as const,
    name: "add_wall",
    description: "Add one orthogonal grounded wall from (x1,z1) to (x2,z2). Diagonal walls are rejected.",
    strict: true,
    allowed_callers: ["direct" as const],
    parameters: obj(["x1", "z1", "x2", "z2", "height", "thickness", "kind"], {
      x1: { type: "number" },
      z1: { type: "number" },
      x2: { type: "number" },
      z2: { type: "number" },
      height: { type: "number" },
      thickness: { type: "number" },
      kind: { type: "string", enum: ["obstacle", "occluder", "breakable"] },
    }),
  },
  {
    type: "function" as const,
    name: "add_wall_chain",
    description: "Add a connected orthogonal wall chain. 2 to 7 points. Atomic. Corners overlap so there is no player-sized crack.",
    strict: true,
    allowed_callers: ["direct" as const],
    parameters: obj(["points", "height", "thickness", "kind"], {
      points: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["x", "z"],
          properties: { x: { type: "number" }, z: { type: "number" } },
        },
      },
      height: { type: "number" },
      thickness: { type: "number" },
      kind: { type: "string", enum: ["obstacle", "occluder", "breakable"] },
    }),
  },
  {
    type: "function" as const,
    name: "move_solid",
    description: "Move an existing solid. Must stay inside the envelope.",
    strict: true,
    allowed_callers: ["direct" as const],
    parameters: obj(["solidId", "x", "y", "z"], {
      solidId: { type: "string" },
      x: { type: "number" },
      y: { type: "number" },
      z: { type: "number" },
    }),
  },
  {
    type: "function" as const,
    name: "resize_solid",
    description: "Resize an existing solid. Must stay inside the envelope.",
    strict: true,
    allowed_callers: ["direct" as const],
    parameters: obj(["solidId", "hx", "hy", "hz"], {
      solidId: { type: "string" },
      hx: { type: "number" },
      hy: { type: "number" },
      hz: { type: "number" },
    }),
  },
  {
    type: "function" as const,
    name: "remove_solid",
    description: "Remove an existing solid by ID.",
    strict: true,
    allowed_callers: ["direct" as const],
    parameters: obj(["solidId"], { solidId: { type: "string" } }),
  },
];

export const PLACE_OBJECTIVE_FUNCTION_TOOL = {
  type: "function" as const,
  name: PLACE_OBJECTIVE_TOOL,
  description: "Place missing site A or B. Use move_objective after it exists.",
  strict: true,
  allowed_callers: ["direct" as const],
  parameters: obj(["objectiveId", "x", "y", "z", "radius"], {
    objectiveId: { type: "string", enum: ["A", "B"] },
    x: { type: "number" },
    y: { type: "number" },
    z: { type: "number" },
    radius: { type: ["number", "null"] },
  }),
};

export const MOVE_OBJECTIVE_FUNCTION_TOOL = {
  type: "function" as const,
  name: "move_objective",
  description: "Move an already-placed site A or B.",
  strict: true,
  allowed_callers: ["direct" as const],
  parameters: obj(["objectiveId", "x", "y", "z", "radius"], {
    objectiveId: { type: "string", enum: ["A", "B"] },
    x: { type: "number" },
    y: { type: "number" },
    z: { type: "number" },
    radius: { type: ["number", "null"] },
  }),
};

export const RUN_PLAYTEST_FUNCTION_TOOL = {
  type: "function" as const,
  name: RUN_PLAYTEST_TOOL,
  description:
    "Run the fixed-seed scripted Search & Destroy playtest. Read-only. Not available in Deathmatch.",
  strict: true,
  allowed_callers: ["direct" as const],
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["intent"],
    properties: { intent: intentField },
  },
};

export const TRACE_ROUTE_FUNCTION_TOOL = {
  type: "function" as const,
  name: TRACE_ROUTE_TOOL,
  description:
    "Read-only path between named anchors such as ghost-spawn-0, spawn-1, A, or B. Returns simplified waypoints.",
  strict: true,
  allowed_callers: ["direct" as const],
  parameters: obj(["fromId", "toId"], {
    fromId: { type: "string" },
    toId: { type: "string" },
  }),
};

export const FINISH_FUNCTION_TOOL = {
  type: "function" as const,
  name: FINISH_DESIGN_TOOL,
  description:
    "Finish only when the map satisfies the hard completion contract. Blocked maps stay in progress.",
  strict: true,
  allowed_callers: ["direct" as const],
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["summary"],
    properties: { summary: { type: "string" } },
  },
};

export function productToolNames(mode: ArenaGameMode): string[] {
  const names = [PROPOSE_DESIGN_PLAN_TOOL, ...PRODUCT_GEOMETRY_TOOLS];
  if (mode === "search_destroy") {
    names.push(PLACE_OBJECTIVE_TOOL, "move_objective", RUN_PLAYTEST_TOOL);
  }
  names.push(TRACE_ROUTE_TOOL, FINISH_DESIGN_TOOL);
  return names;
}

export function productFunctionTools(mode: ArenaGameMode) {
  const tools = [PRODUCT_PLAN_TOOL, ...GEOMETRY_FUNCTION_TOOLS];
  if (mode === "search_destroy") {
    tools.push(PLACE_OBJECTIVE_FUNCTION_TOOL, MOVE_OBJECTIVE_FUNCTION_TOOL, RUN_PLAYTEST_FUNCTION_TOOL);
  }
  tools.push(TRACE_ROUTE_FUNCTION_TOOL, FINISH_FUNCTION_TOOL);
  return tools;
}

export function parseDesignPlan(args: unknown): PublicDesignPlan | string {
  if (typeof args !== "object" || args === null) return "propose_design_plan requires an object";
  const rec = args as Record<string, unknown>;
  if (typeof rec.summary !== "string" || !rec.summary.trim()) {
    return "propose_design_plan requires a summary string";
  }
  const layout = Array.isArray(rec.layout)
    ? rec.layout.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((s) => s.trim())
    : [];
  const priorities = Array.isArray(rec.priorities)
    ? rec.priorities.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((s) => s.trim())
    : [];
  if (layout.length === 0) return "propose_design_plan requires at least one layout line";
  if (priorities.length === 0) return "propose_design_plan requires at least one priority";
  if (rec.summary.length > 240) return "design plan summary is too long";
  if (layout.length > 8 || priorities.length > 8) return "design plan lists are too long";
  return {
    summary: rec.summary.trim(),
    layout: layout.slice(0, 6),
    priorities: priorities.slice(0, 6),
  };
}

export function productSystemPrompt(mode: ArenaGameMode): string {
  const modeLine =
    mode === "search_destroy"
      ? "Mode: Search & Destroy. Place sites A and B. Scripted playtest is a seeded offline proxy, not human play."
      : "Mode: Deathmatch. Do not place objectives. There is no scripted playtest.";
  return `You are the ArenaForge level designer for CyberRunner.

Map units are meters. Solids are axis-aligned boxes.
The human envelope is fixed. Human spawn locations are fixed. Do not try to move either.

${modeLine}

Publish exactly one public design plan first with propose_design_plan.
Build with add_block, add_wall, and add_wall_chain. Those tools are grounded. Do not supply y.
Walls must be axis-aligned. Use move_solid, resize_solid, and remove_solid for corrections.
Use trace_route to see where a path travels. It does not change the map.
Call exactly one tool per turn.
The deterministic evaluator is authoritative for geometry, navigation, and line of sight.
Any intentional opening between walls or cover must be at least ${MIN_PRODUCT_PASSAGE_METERS} m wide; otherwise connect the pieces with no gap. Deterministic clearance checks are authoritative.
Preserve viable routes. Finish when further edits are unlikely to help and the map meets the hard completion checks.`;
}

export function formatProductStartMessage(input: {
  brief: string;
  inspection: unknown;
  mode: ArenaGameMode;
  maxEditAttempts: number;
  maxPlaytestCalls: number;
}): string {
  return [
    `Designer brief:\n${input.brief}`,
    `Mode: ${input.mode}.`,
    `Tools (exactly one per turn): ${productToolNames(input.mode).join(", ")}.`,
    `Edit-attempt budget: ${input.maxEditAttempts}. Rejected edits count. finish_design does not.`,
    input.mode === "search_destroy"
      ? `Playtest budget: ${input.maxPlaytestCalls}. Seeded scripted Search & Destroy proxy.`
      : "No playtest tool in Deathmatch.",
    `Human envelope and spawn layout are immutable.`,
    `Current inspection:\n${JSON.stringify(input.inspection)}`,
  ].join("\n\n");
}

function trialEdit(map: ArenaMap, action: ArenaEditAction) {
  return applyArenaEdit(map, action, createIdAllocator(map));
}

export function rejectOutOfEnvelope(
  map: ArenaMap,
  action: ArenaEditAction,
  envelope: MapBoundsRect,
): ArenaEditError | undefined {
  const trial = trialEdit(map, action);
  if (!trial.ok) return undefined;
  for (const solid of trial.map.solids) {
    const overhangs = aabbOverhangs(
      solid.x - solid.hx,
      solid.x + solid.hx,
      solid.z - solid.hz,
      solid.z + solid.hz,
      envelope,
    );
    if (overhangs.length) {
      return { code: "out-of-envelope", target: solid.id, side: overhangs[0]!.side };
    }
  }
  for (const obj of trial.map.objectives) {
    if (!pointInsideRect(obj.x, obj.z, envelope)) {
      return { code: "out-of-envelope", target: obj.id };
    }
  }
  return undefined;
}

export function productInspection(workspace: ArenaWorkspace) {
  const inspection = workspace.inspect();
  const withClearance = {
    ...inspection,
    clearance: inspectProductClearance(workspace.currentMap()),
  };
  if (workspace.mode !== "deathmatch") return withClearance;
  return {
    ...withClearance,
    deathmatchPairs: deathmatchAllPairs(workspace.currentMap()),
  };
}

function failProductEdit(
  workspace: ArenaWorkspace,
  error: ArenaEditError,
): AgentToolOutput {
  return { ok: false, error, inspection: productInspection(workspace) };
}

export type ProductApplyOptions = {
  /** Historical timeline replay applies already-accepted edits. Live tools keep this on. */
  enforceClearance?: boolean;
};

export function applyProductLayoutEdit(
  workspace: ArenaWorkspace,
  rawName: string,
  rawArgs: unknown,
  envelope: MapBoundsRect,
  options: ProductApplyOptions = {},
): AgentToolOutput {
  const parsed = parseProductLayoutAction(rawName, rawArgs);
  if (typeof parsed === "string") {
    return failProductEdit(workspace, { code: "invalid-args", target: parsed });
  }
  const before = workspace.currentMap();
  const planned = layoutSolidActions(before, parsed, envelope);
  if (!planned.ok) {
    return failProductEdit(workspace, planned.error);
  }
  let trialMap = before;
  for (const solid of planned.actions) {
    const blocked = rejectOutOfEnvelope(trialMap, solid, envelope);
    if (blocked) return failProductEdit(workspace, blocked);
    const next = applyArenaEdit(trialMap, solid, createIdAllocator(trialMap));
    if (!next.ok) return failProductEdit(workspace, next.error);
    trialMap = next.map;
  }
  if (options.enforceClearance !== false) {
    const clearance = rejectClearanceRegression(before, trialMap);
    if (clearance) return failProductEdit(workspace, clearance);
  }

  const changedIds: string[] = [];
  for (const solid of planned.actions) {
    const result = applyEditTool(workspace, solid);
    if (!result.ok) return { ...result, inspection: productInspection(workspace) };
    changedIds.push(...result.changedIds);
  }
  return { ok: true, changedIds, inspection: productInspection(workspace) };
}

export function applyProductEdit(
  workspace: ArenaWorkspace,
  action: ArenaEditAction,
  envelope: MapBoundsRect,
  options: ProductApplyOptions = {},
): AgentToolOutput {
  if (action.type === "move_spawn") {
    return {
      ok: false,
      error: { code: "spawn-locked", target: action.spawnId },
      inspection: productInspection(workspace),
    };
  }
  const before = workspace.currentMap();
  const blocked = rejectOutOfEnvelope(before, action, envelope);
  if (blocked) {
    return failProductEdit(workspace, blocked);
  }
  const trial = trialEdit(before, action);
  if (trial.ok && options.enforceClearance !== false) {
    const clearance = rejectClearanceRegression(before, trial.map);
    if (clearance) return failProductEdit(workspace, clearance);
  }
  const output = applyEditTool(workspace, action);
  return { ...output, inspection: productInspection(workspace) };
}

/** Mode/evaluator checks without product-specific design constraints. */
export function productModeCompletionIssues(
  map: ArenaMap,
  evaluation: ArenaEvaluation,
  mode: ArenaGameMode,
): string[] {
  const issues: string[] = [];
  if (evaluation.summary.hardFailureCount > 0) {
    issues.push(
      ...evaluation.summary.hardFailures.slice(0, 8).map((f) => f.code),
    );
  }
  if (mode === "search_destroy") {
    if (!map.objectives.some((o) => o.id === "A")) issues.push("missing-objective-A");
    if (!map.objectives.some((o) => o.id === "B")) issues.push("missing-objective-B");
    if (!map.spawns.some((s) => s.role === "ghost")) issues.push("missing-ghost-spawn");
    if (!map.spawns.some((s) => s.role === "sentinel")) issues.push("missing-sentinel-spawn");
    if (!map.spikeSpawnLocation) issues.push("missing-spike-spawn");
  } else {
    const generals = evaluation.spawns.results.filter((s) => s.role === "general" && s.valid);
    if (generals.length < 4) issues.push("need-more-spawns");
    if (map.objectives.length > 0) issues.push("unexpected-objectives");
  }
  return [...new Set(issues)];
}

export function productCompletionIssues(
  map: ArenaMap,
  evaluation: ArenaEvaluation,
  mode: ArenaGameMode,
): string[] {
  const issues = productModeCompletionIssues(map, evaluation, mode);
  if (inspectProductClearance(map).issues.length) issues.push("narrow-passage");
  return [...new Set(issues)];
}

export { parseEditToolArgs, parseFinishSummary, readIntent, FINISH_DESIGN_TOOL, isProductLayoutTool };
export type { AgentToolOutput };

export function isProductGeometryTool(name: string): boolean {
  return (PRODUCT_GEOMETRY_TOOLS as readonly string[]).includes(name)
    || name === PLACE_OBJECTIVE_TOOL
    || name === "move_objective";
}

export function isProductObservationalTool(name: string): boolean {
  return name === TRACE_ROUTE_TOOL;
}

export function circleFitsEnvelope(
  x: number,
  z: number,
  envelope: MapBoundsRect,
): boolean {
  return circleInsideBounds(x, z, PLAYER_RADIUS, envelope);
}

export function isFiniteCoord(n: unknown): n is number {
  return typeof n === "number" && isFiniteNumber(n);
}
