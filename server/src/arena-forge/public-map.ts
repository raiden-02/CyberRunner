import type { PublicArenaMapView } from "@shared/world/arena-map-view.js";
import { parseEditToolArgs } from "./agent-tools.js";
import { applyArenaEdit, cloneArenaMap, createIdAllocator, type ArenaEditAction } from "./actions.js";
import { AGENT_EDIT_TOOLS } from "./agent-tools.js";
import type { PlaytestAgentTurnRecord } from "./playtest-agent.js";
import type { ArenaMap } from "./types.js";

const EDIT_TOOLS = new Set<string>(AGENT_EDIT_TOOLS);

export function toPublicArenaMapView(map: ArenaMap): PublicArenaMapView {
  return {
    boundsHalfSize: map.boundsHalfSize,
    wallHeight: map.wallHeight,
    wallThickness: map.wallThickness,
    groundThickness: map.groundThickness,
    solids: map.solids.map((s) => ({
      id: s.id,
      kind: s.kind,
      x: s.x,
      y: s.y,
      z: s.z,
      hx: s.hx,
      hy: s.hy,
      hz: s.hz,
      ...(s.hp !== undefined ? { hp: s.hp } : {}),
    })),
    spawns: map.spawns.map((s) => ({
      id: s.id,
      role: s.role,
      x: s.x,
      y: s.y,
      z: s.z,
    })),
    objectives: map.objectives.map((o) => ({
      id: o.id,
      x: o.x,
      y: o.y,
      z: o.z,
      radius: o.radius,
    })),
  };
}

/**
 * Recorded P5 edits, in order. Taken from the committed development run
 * (`server/arena-forge-playtest.md`). Used only to rebuild sanitized revision
 * snapshots. Not sent to any model.
 */
export const P5_RECORDED_REVISION_EDITS: ArenaEditAction[] = [
  {
    type: "add_solid",
    kind: "occluder",
    x: -5.5,
    y: 1.5,
    z: -3.5,
    hx: 2,
    hy: 1.5,
    hz: 0.4,
  },
  {
    type: "resize_solid",
    solidId: "occluder-1",
    hx: 1.2,
    hy: 1.5,
    hz: 0.4,
  },
];

export function applyRevisionEdits(initial: ArenaMap, edits: ArenaEditAction[]): ArenaMap[] {
  const maps = [cloneArenaMap(initial)];
  let current = cloneArenaMap(initial);
  let ids = createIdAllocator(current);
  for (const action of edits) {
    const result = applyArenaEdit(current, action, ids);
    if (!result.ok) {
      throw new Error(`revision edit failed: ${result.error.code}`);
    }
    current = result.map;
    ids = result.ids;
    maps.push(cloneArenaMap(current));
  }
  return maps;
}

export function revisionMapsFromTurns(initial: ArenaMap, turns: PlaytestAgentTurnRecord[]): ArenaMap[] {
  const maps = [cloneArenaMap(initial)];
  let current = cloneArenaMap(initial);
  let ids = createIdAllocator(current);
  for (const turn of turns) {
    if (!EDIT_TOOLS.has(turn.tool) || !turn.outcome?.ok) continue;
    const parsed = parseEditToolArgs(turn.tool, turn.arguments);
    if (typeof parsed === "string") continue;
    const result = applyArenaEdit(current, parsed, ids);
    if (!result.ok) continue;
    current = result.map;
    ids = result.ids;
    maps.push(cloneArenaMap(current));
  }
  return maps;
}

export function publicRevisionMaps(maps: ArenaMap[]): PublicArenaMapView[] {
  return maps.map(toPublicArenaMapView);
}

export function solidsEqual(a: ArenaMap, b: ArenaMap): boolean {
  return JSON.stringify(a.solids) === JSON.stringify(b.solids);
}
