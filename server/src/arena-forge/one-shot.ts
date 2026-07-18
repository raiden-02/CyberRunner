import type { ArenaEditAction, ArenaEditError } from "./actions.js";
import { cloneArenaMap } from "./actions.js";
import type { ArenaInspection } from "./inspect.js";
import type { ArenaEvaluation, ArenaEvaluationMode, ArenaMap } from "./types.js";
import { ArenaWorkspace } from "./workspace.js";

export const MAX_ONE_SHOT_ACTIONS = 8;

export const ACTION_VOCABULARY = [
  "move_solid",
  "resize_solid",
  "add_solid",
  "remove_solid",
  "move_spawn",
  "move_objective",
] as const;

export const DEFAULT_ARENA_FORGE_MODEL = "gpt-5.6";

export type OneShotDesignProposal = {
  designSummary: string;
  actions: ArenaEditAction[];
};

export type OneShotDesignInput = {
  brief: string;
  inspection: ArenaInspection;
  maxActions: number;
  actionVocabulary: readonly string[];
};

export type OneShotDesignerResult = {
  raw: unknown;
  model: {
    requested: string;
    returned?: string;
    responseId?: string;
  };
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
  latencyMs: number;
};

export interface OneShotDesigner {
  propose(input: OneShotDesignInput): Promise<OneShotDesignerResult>;
}

export type OneShotActionRecord =
  | { index: number; action: ArenaEditAction; ok: true; changedIds: string[] }
  | { index: number; action: ArenaEditAction; ok: false; error: ArenaEditError };

export type OneShotExecutionStatus =
  | "completed"
  | "action_rejected"
  | "model_error"
  | "invalid_model_output";

export type OneShotRunResult = {
  kind: "one_shot";
  brief: string;
  sourceMapId?: string;
  model: {
    requested: string;
    returned?: string;
    responseId?: string;
  };
  timing: {
    modelLatencyMs: number;
    totalLatencyMs: number;
  };
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
  initialMap: ArenaMap;
  initialEvaluation: ArenaEvaluation;
  proposal?: OneShotDesignProposal;
  invalidReason?: string;
  actionResults: OneShotActionRecord[];
  executionStatus: OneShotExecutionStatus;
  finalEvaluation: ArenaEvaluation;
  finalMap: ArenaMap;
};

const ACTION_TYPES = new Set<string>(ACTION_VOCABULARY);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

export function parseArenaEditAction(raw: unknown): ArenaEditAction | string {
  if (!isRecord(raw) || typeof raw.type !== "string") return "action is not a typed object";
  if (!ACTION_TYPES.has(raw.type)) return `unsupported action type: ${raw.type}`;

  if (raw.type === "move_solid") {
    if (typeof raw.solidId !== "string" || !isFiniteNumber(raw.x) || !isFiniteNumber(raw.y) || !isFiniteNumber(raw.z)) {
      return "move_solid requires solidId and finite x,y,z";
    }
    return { type: "move_solid", solidId: raw.solidId, x: raw.x, y: raw.y, z: raw.z };
  }
  if (raw.type === "resize_solid") {
    if (typeof raw.solidId !== "string" || !isFiniteNumber(raw.hx) || !isFiniteNumber(raw.hy) || !isFiniteNumber(raw.hz)) {
      return "resize_solid requires solidId and finite hx,hy,hz";
    }
    return { type: "resize_solid", solidId: raw.solidId, hx: raw.hx, hy: raw.hy, hz: raw.hz };
  }
  if (raw.type === "add_solid") {
    const kind = raw.kind;
    if (kind !== "obstacle" && kind !== "occluder" && kind !== "breakable") {
      return "add_solid requires kind obstacle|occluder|breakable";
    }
    if (!isFiniteNumber(raw.x) || !isFiniteNumber(raw.y) || !isFiniteNumber(raw.z)) {
      return "add_solid requires finite x,y,z";
    }
    if (!isFiniteNumber(raw.hx) || !isFiniteNumber(raw.hy) || !isFiniteNumber(raw.hz)) {
      return "add_solid requires finite hx,hy,hz";
    }
    const action: ArenaEditAction = {
      type: "add_solid",
      kind,
      x: raw.x, y: raw.y, z: raw.z,
      hx: raw.hx, hy: raw.hy, hz: raw.hz,
    };
    if (raw.hp !== undefined && raw.hp !== null) {
      if (!isFiniteNumber(raw.hp)) return "add_solid hp must be finite when supplied";
      action.hp = raw.hp;
    }
    return action;
  }
  if (raw.type === "remove_solid") {
    if (typeof raw.solidId !== "string") return "remove_solid requires solidId";
    return { type: "remove_solid", solidId: raw.solidId };
  }
  if (raw.type === "move_spawn") {
    if (typeof raw.spawnId !== "string" || !isFiniteNumber(raw.x) || !isFiniteNumber(raw.y) || !isFiniteNumber(raw.z)) {
      return "move_spawn requires spawnId and finite x,y,z";
    }
    return { type: "move_spawn", spawnId: raw.spawnId, x: raw.x, y: raw.y, z: raw.z };
  }
  if (raw.type === "move_objective") {
    if (raw.objectiveId !== "A" && raw.objectiveId !== "B") {
      return "move_objective requires objectiveId A|B";
    }
    if (!isFiniteNumber(raw.x) || !isFiniteNumber(raw.y) || !isFiniteNumber(raw.z)) {
      return "move_objective requires finite x,y,z";
    }
    const action: ArenaEditAction = {
      type: "move_objective",
      objectiveId: raw.objectiveId,
      x: raw.x, y: raw.y, z: raw.z,
    };
    if (raw.radius !== undefined && raw.radius !== null) {
      if (!isFiniteNumber(raw.radius)) return "move_objective radius must be finite when supplied";
      action.radius = raw.radius;
    }
    return action;
  }
  return `unsupported action type: ${raw.type}`;
}

export function parseOneShotProposal(raw: unknown):
  { ok: true; proposal: OneShotDesignProposal } | { ok: false; error: string } {
  if (!isRecord(raw)) return { ok: false, error: "proposal is not an object" };
  const keys = Object.keys(raw);
  for (const key of keys) {
    if (key !== "designSummary" && key !== "actions") {
      return { ok: false, error: `unexpected field: ${key}` };
    }
  }
  if (typeof raw.designSummary !== "string") {
    return { ok: false, error: "designSummary must be a string" };
  }
  if (!Array.isArray(raw.actions)) {
    return { ok: false, error: "actions must be an array" };
  }
  if (raw.actions.length > MAX_ONE_SHOT_ACTIONS) {
    return { ok: false, error: `actions exceed MAX_ONE_SHOT_ACTIONS (${MAX_ONE_SHOT_ACTIONS})` };
  }
  const actions: ArenaEditAction[] = [];
  for (let i = 0; i < raw.actions.length; i++) {
    const parsed = parseArenaEditAction(raw.actions[i]);
    if (typeof parsed === "string") return { ok: false, error: `actions[${i}]: ${parsed}` };
    actions.push(parsed);
  }
  return { ok: true, proposal: { designSummary: raw.designSummary, actions } };
}

/** Target IDs must exist in the initial inspection. Newly created IDs are not legal in this proposal. */
export function validateInitialReferences(
  proposal: OneShotDesignProposal,
  inspection: ArenaInspection,
): { ok: true } | { ok: false; error: string } {
  const solids = new Set(inspection.solids.map((s) => s.id));
  const spawns = new Set(inspection.spawns.map((s) => s.id));
  const objectives = new Set(inspection.objectives.map((o) => o.id));

  for (let i = 0; i < proposal.actions.length; i++) {
    const action = proposal.actions[i];
    if (action.type === "move_solid" || action.type === "resize_solid" || action.type === "remove_solid") {
      if (!solids.has(action.solidId)) {
        return {
          ok: false,
          error: `actions[${i}] references solidId ${action.solidId} that was not present in the initial inspection`,
        };
      }
    }
    if (action.type === "move_spawn" && !spawns.has(action.spawnId)) {
      return {
        ok: false,
        error: `actions[${i}] references spawnId ${action.spawnId} that was not present in the initial inspection`,
      };
    }
    if (action.type === "move_objective" && !objectives.has(action.objectiveId)) {
      return {
        ok: false,
        error: `actions[${i}] references objectiveId ${action.objectiveId} that was not present in the initial inspection`,
      };
    }
  }
  return { ok: true };
}

/** Strict JSON Schema for the Responses API. maxItems matches the runtime budget. */
export const ONE_SHOT_PROPOSAL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["designSummary", "actions"],
  properties: {
    designSummary: { type: "string" },
    actions: {
      type: "array",
      maxItems: MAX_ONE_SHOT_ACTIONS,
      items: {
        anyOf: [
          {
            type: "object",
            additionalProperties: false,
            required: ["type", "solidId", "x", "y", "z"],
            properties: {
              type: { type: "string", enum: ["move_solid"] },
              solidId: { type: "string" },
              x: { type: "number" },
              y: { type: "number" },
              z: { type: "number" },
            },
          },
          {
            type: "object",
            additionalProperties: false,
            required: ["type", "solidId", "hx", "hy", "hz"],
            properties: {
              type: { type: "string", enum: ["resize_solid"] },
              solidId: { type: "string" },
              hx: { type: "number" },
              hy: { type: "number" },
              hz: { type: "number" },
            },
          },
          {
            type: "object",
            additionalProperties: false,
            required: ["type", "kind", "x", "y", "z", "hx", "hy", "hz", "hp"],
            properties: {
              type: { type: "string", enum: ["add_solid"] },
              kind: { type: "string", enum: ["obstacle", "occluder", "breakable"] },
              x: { type: "number" },
              y: { type: "number" },
              z: { type: "number" },
              hx: { type: "number" },
              hy: { type: "number" },
              hz: { type: "number" },
              hp: { type: ["number", "null"] },
            },
          },
          {
            type: "object",
            additionalProperties: false,
            required: ["type", "solidId"],
            properties: {
              type: { type: "string", enum: ["remove_solid"] },
              solidId: { type: "string" },
            },
          },
          {
            type: "object",
            additionalProperties: false,
            required: ["type", "spawnId", "x", "y", "z"],
            properties: {
              type: { type: "string", enum: ["move_spawn"] },
              spawnId: { type: "string" },
              x: { type: "number" },
              y: { type: "number" },
              z: { type: "number" },
            },
          },
          {
            type: "object",
            additionalProperties: false,
            required: ["type", "objectiveId", "x", "y", "z", "radius"],
            properties: {
              type: { type: "string", enum: ["move_objective"] },
              objectiveId: { type: "string", enum: ["A", "B"] },
              x: { type: "number" },
              y: { type: "number" },
              z: { type: "number" },
              radius: { type: ["number", "null"] },
            },
          },
        ],
      },
    },
  },
};

export function resolveArenaForgeModel(env: NodeJS.ProcessEnv = process.env): string {
  const named = env.ARENA_FORGE_MODEL?.trim();
  return named ? named : DEFAULT_ARENA_FORGE_MODEL;
}

export function readOpenAIApiKey(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const key = env.OPENAI_API_KEY?.trim();
  return key ? key : undefined;
}

export function missingOpenAIKeyMessage(): string {
  return "OPENAI_API_KEY is not set. Add it to server/.env:\n\nOPENAI_API_KEY=<your key>";
}

export async function runOneShotDesign(args: {
  map: ArenaMap;
  brief: string;
  designer: OneShotDesigner;
  mode?: ArenaEvaluationMode;
}): Promise<OneShotRunResult> {
  const started = Date.now();
  const workspace = new ArenaWorkspace(args.map, args.mode ?? "search_destroy");
  const initialMap = workspace.currentMap();
  const initialEvaluation = structuredClone(workspace.evaluation);
  const inspection = workspace.inspect();

  const input: OneShotDesignInput = {
    brief: args.brief,
    inspection,
    maxActions: MAX_ONE_SHOT_ACTIONS,
    actionVocabulary: ACTION_VOCABULARY,
  };

  let designerResult: OneShotDesignerResult;
  try {
    designerResult = await args.designer.propose(input);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      kind: "one_shot",
      brief: args.brief,
      sourceMapId: initialMap.sourceMapId,
      model: { requested: resolveArenaForgeModel() },
      timing: { modelLatencyMs: 0, totalLatencyMs: Date.now() - started },
      initialMap,
      initialEvaluation,
      invalidReason: message,
      actionResults: [],
      executionStatus: "model_error",
      finalEvaluation: structuredClone(initialEvaluation),
      finalMap: cloneArenaMap(initialMap),
    };
  }

  const parsed = parseOneShotProposal(designerResult.raw);
  if (!parsed.ok) {
    return {
      kind: "one_shot",
      brief: args.brief,
      sourceMapId: initialMap.sourceMapId,
      model: designerResult.model,
      timing: { modelLatencyMs: designerResult.latencyMs, totalLatencyMs: Date.now() - started },
      usage: designerResult.usage,
      initialMap,
      initialEvaluation,
      invalidReason: parsed.error,
      actionResults: [],
      executionStatus: "invalid_model_output",
      finalEvaluation: structuredClone(initialEvaluation),
      finalMap: cloneArenaMap(initialMap),
    };
  }

  const refs = validateInitialReferences(parsed.proposal, inspection);
  if (!refs.ok) {
    return {
      kind: "one_shot",
      brief: args.brief,
      sourceMapId: initialMap.sourceMapId,
      model: designerResult.model,
      timing: { modelLatencyMs: designerResult.latencyMs, totalLatencyMs: Date.now() - started },
      usage: designerResult.usage,
      initialMap,
      initialEvaluation,
      proposal: parsed.proposal,
      invalidReason: refs.error,
      actionResults: [],
      executionStatus: "invalid_model_output",
      finalEvaluation: structuredClone(initialEvaluation),
      finalMap: cloneArenaMap(initialMap),
    };
  }

  const actionResults: OneShotActionRecord[] = [];
  let executionStatus: OneShotExecutionStatus = "completed";
  for (let i = 0; i < parsed.proposal.actions.length; i++) {
    const action = parsed.proposal.actions[i];
    const applied = workspace.apply(action);
    if (applied.ok) {
      actionResults.push({ index: i, action, ok: true, changedIds: applied.changedIds });
    } else {
      actionResults.push({ index: i, action, ok: false, error: applied.error });
      executionStatus = "action_rejected";
      break;
    }
  }

  return {
    kind: "one_shot",
    brief: args.brief,
    sourceMapId: initialMap.sourceMapId,
    model: designerResult.model,
    timing: { modelLatencyMs: designerResult.latencyMs, totalLatencyMs: Date.now() - started },
    usage: designerResult.usage,
    initialMap,
    initialEvaluation,
    proposal: parsed.proposal,
    actionResults,
    executionStatus,
    finalEvaluation: structuredClone(workspace.evaluation),
    finalMap: workspace.currentMap(),
  };
}
