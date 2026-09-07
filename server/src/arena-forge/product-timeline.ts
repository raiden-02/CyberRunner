import { resolveMapBounds, type MapBoundsRect } from "@shared/world/map-bounds.js";
import { cloneArenaMap } from "./actions.js";
import type { PlaytestAgentTurnRecord } from "./playtest-agent.js";
import {
  applyProductEdit,
  applyProductLayoutEdit,
  isProductLayoutTool,
  parseEditToolArgs,
  PLACE_OBJECTIVE_TOOL,
} from "./product-tools.js";
import type { ArenaMap } from "./types.js";
import { ArenaWorkspace } from "./workspace.js";

/** Successful calls increment the map revision exactly once. */
export const PRODUCT_MUTATION_TOOLS = [
  "add_block",
  "add_wall",
  "add_wall_chain",
  "move_solid",
  "resize_solid",
  "remove_solid",
  PLACE_OBJECTIVE_TOOL,
  "move_objective",
] as const;

export const PRODUCT_OBSERVATION_TOOLS = [
  "propose_design_plan",
  "trace_route",
  "run_playtest",
  "finish_design",
] as const;

export function isProductMutationTool(tool: string): boolean {
  return (PRODUCT_MUTATION_TOOLS as readonly string[]).includes(tool);
}

export function isSuccessfulMapMutation(turn: {
  tool: string;
  outcome?: { ok?: boolean };
}): boolean {
  return Boolean(turn.outcome?.ok && isProductMutationTool(turn.tool));
}

export function envelopeFromArenaMap(map: ArenaMap): MapBoundsRect {
  return resolveMapBounds(map);
}

export function arenaMapsEqual(a: ArenaMap, b: ArenaMap): boolean {
  return JSON.stringify(mapState(a)) === JSON.stringify(mapState(b));
}

function mapState(map: ArenaMap) {
  return {
    boundsHalfSize: map.boundsHalfSize,
    bounds: map.bounds,
    solids: map.solids,
    spawns: map.spawns,
    objectives: map.objectives,
    spawnProtectionZones: map.spawnProtectionZones,
    spike: map.spikeSpawnLocation,
  };
}

export function applyProductMutation(
  workspace: ArenaWorkspace,
  record: PlaytestAgentTurnRecord,
  envelope: MapBoundsRect,
): string[] {
  if (isProductLayoutTool(record.tool)) {
    const output = applyProductLayoutEdit(workspace, record.tool, record.arguments, envelope);
    if (!output.ok) {
      throw new Error(`product replay failed: ${record.tool} (${output.error.code})`);
    }
    return output.changedIds;
  }
  const parsed = parseEditToolArgs(record.tool, record.arguments);
  if (typeof parsed === "string") {
    throw new Error(`product replay parse failed: ${record.tool}: ${parsed}`);
  }
  const output = applyProductEdit(workspace, parsed, envelope);
  if (!output.ok) {
    throw new Error(`product replay failed: ${record.tool} (${output.error.code})`);
  }
  return output.changedIds;
}

export type ProductRevisionReplay = {
  maps: ArenaMap[];
  successfulEdits: number;
};

/** Replay successful product mutations. One snapshot per successful tool call, plus the blank original. */
export function replayProductTimeline(
  initialMap: ArenaMap,
  records: PlaytestAgentTurnRecord[],
): ProductRevisionReplay {
  const envelope = envelopeFromArenaMap(initialMap);
  const workspace = new ArenaWorkspace(initialMap);
  const maps = [cloneArenaMap(initialMap)];
  for (const record of records) {
    if (!isSuccessfulMapMutation(record)) continue;
    applyProductMutation(workspace, record, envelope);
    maps.push(workspace.currentMap());
  }
  return { maps, successfulEdits: maps.length - 1 };
}

export function assertProductReplayMatchesFinal(
  initialMap: ArenaMap,
  records: PlaytestAgentTurnRecord[],
  finalMap: ArenaMap,
): void {
  const replayed = replayProductTimeline(initialMap, records);
  if (!arenaMapsEqual(replayed.maps[replayed.maps.length - 1]!, finalMap)) {
    throw new Error("Product timeline replay does not match the recorded final map.");
  }
}

export function assertProductViewRevisions(args: {
  turns: Array<{ turn: number; mapRevision: number }>;
  revisionMaps: unknown[];
  finalMapRevision: number;
  finalPublic?: unknown;
}): void {
  for (const turn of args.turns) {
    if (turn.mapRevision < 0 || turn.mapRevision >= args.revisionMaps.length) {
      throw new Error(`turn ${turn.turn} mapRevision ${turn.mapRevision} is outside revisionMaps`);
    }
  }
  if (args.finalMapRevision !== args.revisionMaps.length - 1) {
    throw new Error(
      `finalMapRevision ${args.finalMapRevision} !== revisionMaps.length - 1 (${args.revisionMaps.length - 1})`,
    );
  }
  if (args.finalPublic !== undefined) {
    const last = args.revisionMaps[args.finalMapRevision];
    if (JSON.stringify(last) !== JSON.stringify(args.finalPublic)) {
      throw new Error("revisionMaps[final] does not match the public final map.");
    }
  }
}
