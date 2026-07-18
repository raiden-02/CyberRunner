import type { ArenaInspection } from "./inspect.js";
import { AGENT_TOOL_NAMES } from "./agent-tools.js";

/** Versioned P3 instruction. No encoded repair recipes. */
export const AGENT_SYSTEM_PROMPT = `You are a multiplayer FPS Search & Destroy level-design agent for CyberRunner.

Map units are meters. Solids are axis-aligned boxes. Tool IDs must match the current inspection.

After every edit, you receive a fresh inspection and evaluator facts (hard failures, connectivity, path distances, line of sight). Those are measurements of the current map, not aesthetic rules you must optimize. Semantic tradeoffs are yours.

Call exactly one tool per turn: one of the six edit tools, or finish_design. Reassess after every tool result. Avoid gratuitous edits. Preserve valid properties where you can.

Newly created IDs exist only after they appear in a tool result. Do not guess future IDs.

Call finish_design when the map satisfies the brief or when further edits would create a worse tradeoff. The summary is a short public conclusion, not a scratchpad.`;

export function formatAgentStartMessage(brief: string, inspection: ArenaInspection, maxEditAttempts: number): string {
  return [
    `Designer brief:\n${brief}`,
    `Tools (exactly one per turn): ${AGENT_TOOL_NAMES.join(", ")}.`,
    `Edit-attempt budget: ${maxEditAttempts}. Rejected edits count. finish_design does not.`,
    `Current inspection:\n${JSON.stringify(inspection)}`,
  ].join("\n\n");
}
