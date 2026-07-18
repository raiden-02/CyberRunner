import type { ArenaEditAction, ArenaEditError } from "./actions.js";
import type { ArenaInspection } from "./inspect.js";
import { parseArenaEditAction } from "./one-shot.js";
import type { ArenaWorkspace } from "./workspace.js";

export const AGENT_EDIT_TOOLS = [
  "move_solid",
  "resize_solid",
  "add_solid",
  "remove_solid",
  "move_spawn",
  "move_objective",
] as const;

export const FINISH_DESIGN_TOOL = "finish_design";

export const AGENT_TOOL_NAMES = [...AGENT_EDIT_TOOLS, FINISH_DESIGN_TOOL] as const;

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

export const AGENT_FUNCTION_TOOLS = [
  {
    type: "function" as const,
    name: "move_solid",
    description: "Move an existing solid to a new center. Coordinates are meters.",
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
    description: "Resize an existing solid. Extents must be finite and greater than 0.",
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
    name: "add_solid",
    description: "Add a new obstacle, occluder, or breakable. The new ID appears only after this tool returns.",
    strict: true,
    allowed_callers: ["direct" as const],
    parameters: obj(["kind", "x", "y", "z", "hx", "hy", "hz", "hp"], {
      kind: { type: "string", enum: ["obstacle", "occluder", "breakable"] },
      x: { type: "number" },
      y: { type: "number" },
      z: { type: "number" },
      hx: { type: "number" },
      hy: { type: "number" },
      hz: { type: "number" },
      hp: { type: ["number", "null"] },
    }),
  },
  {
    type: "function" as const,
    name: "remove_solid",
    description: "Remove an existing solid by ID.",
    strict: true,
    allowed_callers: ["direct" as const],
    parameters: obj(["solidId"], {
      solidId: { type: "string" },
    }),
  },
  {
    type: "function" as const,
    name: "move_spawn",
    description: "Move an existing spawn. Blocked or out-of-bounds results are recorded by the evaluator.",
    strict: true,
    allowed_callers: ["direct" as const],
    parameters: obj(["spawnId", "x", "y", "z"], {
      spawnId: { type: "string" },
      x: { type: "number" },
      y: { type: "number" },
      z: { type: "number" },
    }),
  },
  {
    type: "function" as const,
    name: "move_objective",
    description: "Move objective A or B. Radius, if supplied, must be finite and greater than 0.",
    strict: true,
    allowed_callers: ["direct" as const],
    parameters: obj(["objectiveId", "x", "y", "z", "radius"], {
      objectiveId: { type: "string", enum: ["A", "B"] },
      x: { type: "number" },
      y: { type: "number" },
      z: { type: "number" },
      radius: { type: ["number", "null"] },
    }),
  },
  {
    type: "function" as const,
    name: FINISH_DESIGN_TOOL,
    description: "Stop editing and return a short public design conclusion. Does not change the map.",
    strict: true,
    allowed_callers: ["direct" as const],
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["summary"],
      properties: { summary: { type: "string" } },
    },
  },
];

export type AgentToolOutput =
  | { ok: true; changedIds: string[]; inspection: ArenaInspection }
  | { ok: false; error: ArenaEditError; inspection: ArenaInspection };

export function readIntent(args: unknown): string | undefined {
  if (typeof args !== "object" || args === null) return undefined;
  const intent = (args as { intent?: unknown }).intent;
  return typeof intent === "string" && intent.trim() ? intent : undefined;
}

export function parseFinishSummary(args: unknown): string | undefined {
  if (typeof args !== "object" || args === null) return undefined;
  const summary = (args as { summary?: unknown }).summary;
  return typeof summary === "string" ? summary : undefined;
}

export function parseEditToolArgs(name: string, args: unknown): ArenaEditAction | string {
  if (typeof args !== "object" || args === null || Array.isArray(args)) {
    return "tool arguments must be an object";
  }
  const { intent: _intent, ...rest } = args as Record<string, unknown>;
  return parseArenaEditAction({ type: name, ...rest });
}

export function applyEditTool(workspace: ArenaWorkspace, action: ArenaEditAction): AgentToolOutput {
  const result = workspace.apply(action);
  const inspection = workspace.inspect();
  if (result.ok) return { ok: true, changedIds: result.changedIds, inspection };
  return { ok: false, error: result.error, inspection };
}
