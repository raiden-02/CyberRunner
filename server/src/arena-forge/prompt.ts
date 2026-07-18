import { MAX_ONE_SHOT_ACTIONS, type OneShotDesignInput } from "./one-shot.js";

/** Versioned P2 instruction. No encoded repair recipes. */
export const ONE_SHOT_SYSTEM_PROMPT = `You are a multiplayer FPS level designer for CyberRunner Search & Destroy.

Map units are meters. Solids are axis-aligned boxes. Action IDs must match the inspection snapshot exactly.

The inspection includes deterministic evaluator facts (hard failures, connectivity, path distances, line of sight). Treat those as measurements of the current map, not aesthetic rules you must optimize.

You may only use the six supplied domain actions. You cannot edit source, replace the map, invent properties, or emit code.

This is one-shot mode. You will not see action results, newly created IDs, or later evaluator output. Propose every action in execution order in this single response. Do not refer to IDs that are not already in the inspection.

Write a short designSummary of intent. Avoid gratuitous edits. Zero actions is valid if the map already satisfies the brief.`;

export const ACTION_VOCABULARY_TEXT = `Allowed actions (at most ${MAX_ONE_SHOT_ACTIONS}):
- move_solid { solidId, x, y, z }
- resize_solid { solidId, hx, hy, hz }  extents must be finite and > 0
- add_solid { kind: obstacle|occluder|breakable, x, y, z, hx, hy, hz, hp? }  extents > 0; breakable hp finite and > 0 or omit for the CyberRunner default
- remove_solid { solidId }
- move_spawn { spawnId, x, y, z }
- move_objective { objectiveId: A|B, x, y, z, radius? }  radius, if supplied, must be finite and > 0

Unknown IDs and non-finite numbers fail at the action layer. Out-of-bounds or blocked results are allowed; the evaluator records those after execution.
Actions run in the order you list. You will not receive intermediate feedback.`;

export function formatOneShotUserMessage(input: OneShotDesignInput): string {
  return [
    `Designer brief:\n${input.brief}`,
    ACTION_VOCABULARY_TEXT,
    `Inspection snapshot:\n${JSON.stringify(input.inspection)}`,
  ].join("\n\n");
}
