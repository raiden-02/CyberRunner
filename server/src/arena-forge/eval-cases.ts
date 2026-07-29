import { createHash } from "node:crypto";
import { getGameplayMap } from "@shared/world/map-registry.js";
import { cloneArenaMap } from "./actions.js";
import { importGameplayMap } from "./import-map.js";
import type { ArenaMap, SpawnRole } from "./types.js";

export const P4_MANIFEST_ID = "arena-forge-p4-v1";
export const P4_REPLICATES = 2;
export const P4_MAX_EDIT_BUDGET = 8;
export const P4_ARMS = ["one_shot", "agent"] as const;
export type P4Arm = (typeof P4_ARMS)[number];
export type P4Split = "dev" | "held_out";

/**
 * Smoke ghost→B median is 12 m. The south bar at z=-5 inflates it to 29.5 m.
 * Threshold 21 m is the rounded midpoint (12 + 29.5) / 2 = 20.75.
 * Recovery must remove at least half that inflation. Frozen before any held-out API call.
 */
export const CASE4_GHOST_B_MEDIAN_AT_MOST = 21;

export type EvalConstraint =
  | { type: "no_hard_failures" }
  | { type: "spawn_valid"; spawnId: string }
  | { type: "path_reachable"; from: string; to: string }
  | { type: "all_sd_paths_reachable" }
  | { type: "los_blocked"; from: string; to: string }
  | { type: "los_clear"; from: string; to: string }
  | {
      type: "aggregate_median_at_most";
      fromRole: SpawnRole;
      to: string;
      meters: number;
    };

export type EvalCaseDefinition = {
  id: string;
  split: P4Split;
  title: string;
  sourceRegisteredMap: "map-contract-smoke";
  brief: string;
  perturbation: string;
  constraints: EvalConstraint[];
  thresholdRationale?: string;
  buildMap: () => ArenaMap;
};

function smokeCopy(caseId: string): ArenaMap {
  const map = cloneArenaMap(importGameplayMap(getGameplayMap("map-contract-smoke")));
  map.sourceMapId = caseId;
  return map;
}

function addObstacle(map: ArenaMap, id: string, extra: Omit<ArenaMap["solids"][number], "id" | "kind">): ArenaMap {
  map.solids.push({ id, kind: "obstacle", ...extra });
  return map;
}

const HELD_OUT: EvalCaseDefinition[] = [
  {
    id: "p4-blocked-spawn",
    split: "held_out",
    title: "Blocked Ghost spawn recovery",
    sourceRegisteredMap: "map-contract-smoke",
    perturbation:
      "Add obstacle-2 at (0, 1, -10) hx=hy=hz=1, covering ghost-spawn-1 and spawn-1.",
    brief:
      "Restore valid spawning at the blocked Ghost spawn. Keep both objective routes reachable. Do not move objectives or the other spawns unless you must.",
    constraints: [
      { type: "no_hard_failures" },
      { type: "spawn_valid", spawnId: "ghost-spawn-1" },
      { type: "spawn_valid", spawnId: "spawn-1" },
      { type: "all_sd_paths_reachable" },
    ],
    buildMap: () =>
      addObstacle(smokeCopy("p4-blocked-spawn"), "obstacle-2", {
        x: 0,
        y: 1,
        z: -10,
        hx: 1,
        hy: 1,
        hz: 1,
      }),
  },
  {
    id: "p4-disconnected-route",
    split: "held_out",
    title: "Disconnected Sentinel site routes",
    sourceRegisteredMap: "map-contract-smoke",
    perturbation:
      "Add obstacle-2 wall at (0, 2, 2) hx=12 hy=2 hz=0.4, cutting every Sentinel path to A and B.",
    brief:
      "Restore both Sentinel routes to A and B. Keep Ghost routes to both sites. Avoid opening a direct Ghost-to-Sentinel sightline across mid if you can.",
    constraints: [
      { type: "no_hard_failures" },
      { type: "path_reachable", from: "sentinel-spawn-0", to: "objective-A" },
      { type: "path_reachable", from: "sentinel-spawn-0", to: "objective-B" },
      { type: "all_sd_paths_reachable" },
    ],
    buildMap: () =>
      addObstacle(smokeCopy("p4-disconnected-route"), "obstacle-2", {
        x: 0,
        y: 2,
        z: 2,
        hx: 12,
        hy: 2,
        hz: 0.4,
      }),
  },
  {
    id: "p4-exposed-los",
    split: "held_out",
    title: "Exposed Ghost-Sentinel spawn sightline",
    sourceRegisteredMap: "map-contract-smoke",
    perturbation:
      "Unmodified smoke copy. ghost-spawn-0 → sentinel-spawn-0 is a clear 20 m LOS.",
    brief:
      "Block the direct sightline from ghost-spawn-0 to sentinel-spawn-0. Keep both objectives reachable from every team spawn. Preserve existing spawn positions if you can.",
    constraints: [
      { type: "no_hard_failures" },
      { type: "los_blocked", from: "ghost-spawn-0", to: "sentinel-spawn-0" },
      { type: "all_sd_paths_reachable" },
    ],
    buildMap: () => smokeCopy("p4-exposed-los"),
  },
  {
    id: "p4-route-cover",
    split: "held_out",
    title: "Route versus cover at south mid",
    sourceRegisteredMap: "map-contract-smoke",
    perturbation:
      "Add obstacle-2 south bar at (3, 2, -5) hx=8 hy=2 hz=2.5. Ghost→B median becomes 29.5 m. All paths stay reachable.",
    thresholdRationale:
      "Smoke Ghost→B median is 12 m. This bar inflates it to 29.5 m. Threshold 21 m is the rounded midpoint, so recovery must remove at least half the inflation.",
    brief:
      "Open the south mid enough to shorten the excessive Ghost route to site B. Keep both sites reachable. Do not introduce spawn or geometry hard failures.",
    constraints: [
      { type: "no_hard_failures" },
      { type: "all_sd_paths_reachable" },
      {
        type: "aggregate_median_at_most",
        fromRole: "ghost",
        to: "objective-B",
        meters: CASE4_GHOST_B_MEDIAN_AT_MOST,
      },
    ],
    buildMap: () =>
      addObstacle(smokeCopy("p4-route-cover"), "obstacle-2", {
        x: 3,
        y: 2,
        z: -5,
        hx: 8,
        hy: 2,
        hz: 2.5,
      }),
  },
  {
    id: "p4-coupled-fault",
    split: "held_out",
    title: "Disconnected Sentinel routes plus spawn sightline",
    sourceRegisteredMap: "map-contract-smoke",
    perturbation:
      "Same full mid wall as p4-disconnected-route. Sentinel routes fail. The wall also blocks ghost-spawn-0 → sentinel-spawn-0. Removing the whole wall restores routes and reopens that LOS.",
    brief:
      "Restore both Sentinel site routes and keep Ghost routes. Also keep the ghost-spawn-0 to sentinel-spawn-0 sightline blocked. Do not trade one of those properties for the other.",
    constraints: [
      { type: "no_hard_failures" },
      { type: "all_sd_paths_reachable" },
      { type: "los_blocked", from: "ghost-spawn-0", to: "sentinel-spawn-0" },
    ],
    buildMap: () =>
      addObstacle(smokeCopy("p4-coupled-fault"), "obstacle-2", {
        x: 0,
        y: 2,
        z: 2,
        hx: 12,
        hy: 2,
        hz: 0.4,
      }),
  },
];

const DEV: EvalCaseDefinition[] = [
  {
    id: "p4-dev-smoke-ok",
    split: "dev",
    title: "Unmodified smoke harness check",
    sourceRegisteredMap: "map-contract-smoke",
    perturbation: "No geometry change. Used only to validate the harness.",
    brief:
      "Leave the map playable. Do not introduce hard failures. Keep both site routes reachable.",
    constraints: [
      { type: "no_hard_failures" },
      { type: "all_sd_paths_reachable" },
    ],
    buildMap: () => smokeCopy("p4-dev-smoke-ok"),
  },
  {
    id: "p4-dev-blocked-sentinel",
    split: "dev",
    title: "Blocked Sentinel spawn harness check",
    sourceRegisteredMap: "map-contract-smoke",
    perturbation:
      "Add obstacle-2 at (0, 1, 10) hx=hy=hz=1, covering sentinel-spawn-1 and spawn-4.",
    brief:
      "Restore the blocked Sentinel spawn. Keep both site routes. Do not move the other spawns unless you must.",
    constraints: [
      { type: "no_hard_failures" },
      { type: "spawn_valid", spawnId: "sentinel-spawn-1" },
      { type: "spawn_valid", spawnId: "spawn-4" },
      { type: "all_sd_paths_reachable" },
    ],
    buildMap: () =>
      addObstacle(smokeCopy("p4-dev-blocked-sentinel"), "obstacle-2", {
        x: 0,
        y: 1,
        z: 10,
        hx: 1,
        hy: 1,
        hz: 1,
      }),
  },
];

const BY_ID = new Map([...HELD_OUT, ...DEV].map((c) => [c.id, c]));

export function heldOutCases(): EvalCaseDefinition[] {
  return HELD_OUT.map((c) => ({ ...c }));
}

export function devCases(): EvalCaseDefinition[] {
  return DEV.map((c) => ({ ...c }));
}

export function allEvalCases(): EvalCaseDefinition[] {
  return [...heldOutCases(), ...devCases()];
}

export function getEvalCase(id: string): EvalCaseDefinition {
  const found = BY_ID.get(id);
  if (!found) throw new Error(`unknown eval case: ${id}`);
  return found;
}

export type FrozenCaseRecord = {
  id: string;
  split: P4Split;
  title: string;
  sourceRegisteredMap: string;
  perturbation: string;
  brief: string;
  constraints: EvalConstraint[];
  thresholdRationale?: string;
};

export function frozenCaseRecord(def: EvalCaseDefinition): FrozenCaseRecord {
  return {
    id: def.id,
    split: def.split,
    title: def.title,
    sourceRegisteredMap: def.sourceRegisteredMap,
    perturbation: def.perturbation,
    brief: def.brief,
    constraints: def.constraints,
    ...(def.thresholdRationale ? { thresholdRationale: def.thresholdRationale } : {}),
  };
}

export function p4ManifestPayload(): {
  manifestId: string;
  replicates: number;
  arms: readonly P4Arm[];
  maxEditBudget: number;
  heldOutCases: FrozenCaseRecord[];
  devCases: FrozenCaseRecord[];
} {
  return {
    manifestId: P4_MANIFEST_ID,
    replicates: P4_REPLICATES,
    arms: P4_ARMS,
    maxEditBudget: P4_MAX_EDIT_BUDGET,
    heldOutCases: heldOutCases().map(frozenCaseRecord),
    devCases: devCases().map(frozenCaseRecord),
  };
}

export function p4ManifestHash(): string {
  return createHash("sha256").update(JSON.stringify(p4ManifestPayload())).digest("hex");
}

export function formatConstraint(constraint: EvalConstraint): string {
  switch (constraint.type) {
    case "no_hard_failures":
      return "no_hard_failures";
    case "spawn_valid":
      return `spawn_valid ${constraint.spawnId}`;
    case "path_reachable":
      return `path_reachable ${constraint.from} → ${constraint.to}`;
    case "all_sd_paths_reachable":
      return "all_sd_paths_reachable";
    case "los_blocked":
      return `los_blocked ${constraint.from} → ${constraint.to}`;
    case "los_clear":
      return `los_clear ${constraint.from} → ${constraint.to}`;
    case "aggregate_median_at_most":
      return `aggregate_median_at_most ${constraint.fromRole} → ${constraint.to} ≤ ${constraint.meters}`;
  }
}

export function formatFrozenManifest(requestedModel: string): string {
  const hash = p4ManifestHash();
  const held = heldOutCases();
  const lines = [
    "P4 MANIFEST FROZEN",
    "",
    `manifest: ${P4_MANIFEST_ID}`,
    `hash: ${hash}`,
    `model: ${requestedModel}`,
    `held-out cases: ${held.length}`,
    `replicates: ${P4_REPLICATES}`,
    `arms: ${P4_ARMS.join(", ")}`,
    `max edit budget: ${P4_MAX_EDIT_BUDGET}`,
    `runs: ${held.length * P4_ARMS.length * P4_REPLICATES}`,
    "",
  ];
  for (const c of held) {
    lines.push(`${c.id}  ${c.title}`);
    lines.push(`  source: ${c.sourceRegisteredMap}`);
    lines.push(`  perturbation: ${c.perturbation}`);
    if (c.thresholdRationale) lines.push(`  threshold: ${c.thresholdRationale}`);
    lines.push(`  brief: ${c.brief}`);
    lines.push(`  constraints: ${c.constraints.map(formatConstraint).join(" | ")}`);
    lines.push("");
  }
  return lines.join("\n");
}
