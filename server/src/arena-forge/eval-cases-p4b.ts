import { createHash } from "node:crypto";
import { getGameplayMap } from "@shared/world/map-registry.js";
import { cloneArenaMap, type ArenaEditAction } from "./actions.js";
import { P4_ARMS, P4_MAX_EDIT_BUDGET, P4_REPLICATES, formatConstraint, type EvalConstraint, type P4Arm, type P4Split } from "./eval-cases.js";
import { importGameplayMap } from "./import-map.js";
import type { ArenaMap } from "./types.js";

export const P4B_MANIFEST_ID = "arena-forge-p4b-v1";
export const P4B_REPLICATES = P4_REPLICATES;
export const P4B_ARMS = P4_ARMS;
export const P4B_MAX_EDIT_BUDGET = P4_MAX_EDIT_BUDGET;

/**
 * Smoke Ghost→A median is 12.5 m. The west-south bar at (-2, 2, -4) hx=9 inflates it to 33.5 m.
 * Threshold 18 m requires a clear shortening while remaining above a trivial 1 m nudge.
 */
export const P4B_A_GHOST_A_MEDIAN_AT_MOST = 18;

/** Smoke Ghost→A is 12.5 m. Guardrail allows a little extra after adding cover. */
export const P4B_B_GHOST_A_MEDIAN_AT_MOST = 16;

/**
 * Case C start: Ghost→A 25.5 m, Ghost→B 12 m.
 * Target 18 m is below the start A median. Guardrail 16 m is the start B median plus 4 m slack.
 */
export const P4B_C_GHOST_A_MEDIAN_AT_MOST = 18;
export const P4B_C_GHOST_B_MEDIAN_AT_MOST = 16;

export type P4BRole = "target" | "guardrail";

export type P4BConstraint = EvalConstraint & { role: P4BRole };

export type P4BProbe = {
  label: string;
  action: ArenaEditAction;
  improvesTarget: string;
  changesOther: string;
};

export type P4BCaseDefinition = {
  id: string;
  split: P4Split;
  title: string;
  sourceRegisteredMap: "map-contract-smoke" | "custom-smoke-layout";
  brief: string;
  perturbation: string;
  targets: EvalConstraint[];
  guardrails: EvalConstraint[];
  thresholdRationale?: string;
  probe: P4BProbe;
  jointlySatisfiable: true;
  buildMap: () => ArenaMap;
};

function smokeCopy(caseId: string): ArenaMap {
  const map = cloneArenaMap(importGameplayMap(getGameplayMap("map-contract-smoke")));
  map.sourceMapId = caseId;
  return map;
}

function addObstacle(
  map: ArenaMap,
  id: string,
  extra: Omit<ArenaMap["solids"][number], "id" | "kind">,
): ArenaMap {
  map.solids.push({ id, kind: "obstacle", ...extra });
  return map;
}

const HELD_OUT: P4BCaseDefinition[] = [
  {
    id: "p4b-route-opens-los",
    split: "held_out",
    title: "Shorten Ghost A without opening spawn LOS",
    sourceRegisteredMap: "map-contract-smoke",
    perturbation:
      "Add obstacle-2 at (-2, 2, -4) hx=9 hy=2 hz=2. Ghost→A median becomes 33.5 m. ghost-spawn-0 → sentinel-spawn-0 is blocked by that bar.",
    thresholdRationale:
      "Smoke Ghost→A median is 12.5 m. The bar inflates it to 33.5 m. Threshold 18 m is a clear recovery that still needs the bar to stay wide enough to block ghost-spawn-0 → sentinel-spawn-0.",
    brief:
      "Shorten the Ghost route to site A. Keep every Search & Destroy route reachable. Keep the ghost-spawn-0 to sentinel-spawn-0 sightline blocked. Do not introduce hard failures.",
    targets: [
      {
        type: "aggregate_median_at_most",
        fromRole: "ghost",
        to: "objective-A",
        meters: P4B_A_GHOST_A_MEDIAN_AT_MOST,
      },
    ],
    guardrails: [
      { type: "no_hard_failures" },
      { type: "all_sd_paths_reachable" },
      { type: "los_blocked", from: "ghost-spawn-0", to: "sentinel-spawn-0" },
    ],
    probe: {
      label: "resize obstacle-2 hx=2.5",
      action: { type: "resize_solid", solidId: "obstacle-2", hx: 2.5, hy: 2, hz: 2 },
      improvesTarget: "Ghost→A median 33.5 → 13",
      changesOther: "ghost-spawn-0 → sentinel-spawn-0 blocked → clear",
    },
    jointlySatisfiable: true,
    buildMap: () =>
      addObstacle(smokeCopy("p4b-route-opens-los"), "obstacle-2", {
        x: -2,
        y: 2,
        z: -4,
        hx: 9,
        hy: 2,
        hz: 2,
      }),
  },
  {
    id: "p4b-cover-hurts-nav",
    split: "held_out",
    title: "Block exposed spawn LOS without wrecking A",
    sourceRegisteredMap: "map-contract-smoke",
    perturbation:
      "Unmodified smoke copy. ghost-spawn-0 → sentinel-spawn-0 is clear. Ghost→A median is 12.5 m.",
    thresholdRationale:
      "Ghost→A starts at 12.5 m. Guardrail 16 m allows a modest detour after cover is added, and rejects a cover piece that swallows site A.",
    brief:
      "Block the direct sightline from ghost-spawn-0 to sentinel-spawn-0. Keep both sites reachable. Do not make the Ghost route to A excessively long. Do not introduce hard failures.",
    targets: [{ type: "los_blocked", from: "ghost-spawn-0", to: "sentinel-spawn-0" }],
    guardrails: [
      { type: "no_hard_failures" },
      { type: "all_sd_paths_reachable" },
      {
        type: "aggregate_median_at_most",
        fromRole: "ghost",
        to: "objective-A",
        meters: P4B_B_GHOST_A_MEDIAN_AT_MOST,
      },
    ],
    probe: {
      label: "add fat obstacle on site A",
      action: { type: "add_solid", kind: "obstacle", x: -6, y: 2, z: 0, hx: 4, hy: 2, hz: 2 },
      improvesTarget: "ghost-spawn-0 → sentinel-spawn-0 becomes blocked",
      changesOther: "objective-A loses navigable cells; A routes fail",
    },
    jointlySatisfiable: true,
    buildMap: () => smokeCopy("p4b-cover-hurts-nav"),
  },
  {
    id: "p4b-shared-ab",
    split: "held_out",
    title: "Shorten Ghost A without dumping the cost on B",
    sourceRegisteredMap: "map-contract-smoke",
    perturbation:
      "Add obstacle-2 at (-4, 2, -5) hx=7 hy=2 hz=2.5. Ghost→A median 25.5 m. Ghost→B stays 12 m.",
    thresholdRationale:
      "Start Ghost→A 25.5 m, Ghost→B 12 m. Target 18 m for A. Guardrail 16 m for B is start B plus 4 m, frozen from the fixture, not from model output.",
    brief:
      "Shorten the excessive Ghost approach to site A. Keep the Ghost approach to B from becoming long. Keep both sites reachable. Do not introduce hard failures.",
    targets: [
      {
        type: "aggregate_median_at_most",
        fromRole: "ghost",
        to: "objective-A",
        meters: P4B_C_GHOST_A_MEDIAN_AT_MOST,
      },
    ],
    guardrails: [
      { type: "no_hard_failures" },
      { type: "all_sd_paths_reachable" },
      {
        type: "aggregate_median_at_most",
        fromRole: "ghost",
        to: "objective-B",
        meters: P4B_C_GHOST_B_MEDIAN_AT_MOST,
      },
    ],
    probe: {
      label: "move obstacle-2 to x=4",
      action: { type: "move_solid", solidId: "obstacle-2", x: 4, y: 2, z: -5 },
      improvesTarget: "Ghost→A median 25.5 → 12.5",
      changesOther: "Ghost→B median 12 → 25.5",
    },
    jointlySatisfiable: true,
    buildMap: () =>
      addObstacle(smokeCopy("p4b-shared-ab"), "obstacle-2", {
        x: -4,
        y: 2,
        z: -5,
        hx: 7,
        hy: 2,
        hz: 2.5,
      }),
  },
  {
    id: "p4b-gap-vs-los",
    split: "held_out",
    title: "Open Sentinel routes without clearing mid LOS",
    sourceRegisteredMap: "map-contract-smoke",
    perturbation:
      "Add obstacle-2 at (-6.2, 2, 2) hx=5.4 hy=2 hz=0.4 and obstacle-3 at (6.2, 2, 2) hx=5.4 hy=2 hz=0.4. Sentinel routes to A and B fail (6 hard failures from those cuts). ghost-spawn-0 → sentinel-spawn-0 is blocked by obstacle-2. no_hard_failures is not a guardrail because those start hard failures are the target fault.",
    brief:
      "Restore Sentinel routes to both sites. Keep Ghost routes. Keep the ghost-spawn-0 to sentinel-spawn-0 sightline blocked. Do not introduce hard geometry failures.",
    targets: [{ type: "all_sd_paths_reachable" }],
    guardrails: [{ type: "los_blocked", from: "ghost-spawn-0", to: "sentinel-spawn-0" }],
    probe: {
      label: "remove obstacle-2",
      action: { type: "remove_solid", solidId: "obstacle-2" },
      improvesTarget: "all Sentinel site routes become reachable",
      changesOther: "ghost-spawn-0 → sentinel-spawn-0 blocked → clear",
    },
    jointlySatisfiable: true,
    buildMap: () =>
      addObstacle(
        addObstacle(smokeCopy("p4b-gap-vs-los"), "obstacle-2", {
          x: -6.2,
          y: 2,
          z: 2,
          hx: 5.4,
          hy: 2,
          hz: 0.4,
        }),
        "obstacle-3",
        { x: 6.2, y: 2, z: 2, hx: 5.4, hy: 2, hz: 0.4 },
      ),
  },
  {
    id: "p4b-multi-coupled",
    split: "held_out",
    title: "Open Sentinel routes and shorten Ghost A together",
    sourceRegisteredMap: "custom-smoke-layout",
    perturbation:
      "Same split mid walls as p4b-gap-vs-los, plus the west-south bar from p4b-shared-ab as obstacle-4. Sentinel routes fail. Ghost→A is unreachable. ghost-spawn-0 → sentinel-spawn-0 stays blocked. Ghost→B stays 12 m.",
    thresholdRationale:
      "Ghost→A target 18 m and Ghost→B guardrail 16 m reuse the Case C fixture numbers. The extra split wall is the second interacting fault. no_hard_failures is not a guardrail here because the start already has unreachable-path hard failures.",
    brief:
      "Restore every Sentinel site route and shorten the Ghost route to A. Keep Ghost B from becoming long. Keep ghost-spawn-0 to sentinel-spawn-0 blocked. Do not introduce hard failures.",
    targets: [
      { type: "all_sd_paths_reachable" },
      {
        type: "aggregate_median_at_most",
        fromRole: "ghost",
        to: "objective-A",
        meters: P4B_C_GHOST_A_MEDIAN_AT_MOST,
      },
    ],
    guardrails: [
      { type: "los_blocked", from: "ghost-spawn-0", to: "sentinel-spawn-0" },
      {
        type: "aggregate_median_at_most",
        fromRole: "ghost",
        to: "objective-B",
        meters: P4B_C_GHOST_B_MEDIAN_AT_MOST,
      },
    ],
    probe: {
      label: "move obstacle-4 to x=4",
      action: { type: "move_solid", solidId: "obstacle-4", x: 4, y: 2, z: -5 },
      improvesTarget: "Ghost→A median undefined → 12.5",
      changesOther: "Ghost→B median 12 → unreachable",
    },
    jointlySatisfiable: true,
    buildMap: () => {
      const map = smokeCopy("p4b-multi-coupled");
      addObstacle(map, "obstacle-2", { x: -6.2, y: 2, z: 2, hx: 5.4, hy: 2, hz: 0.4 });
      addObstacle(map, "obstacle-3", { x: 6.2, y: 2, z: 2, hx: 5.4, hy: 2, hz: 0.4 });
      addObstacle(map, "obstacle-4", { x: -4, y: 2, z: -5, hx: 7, hy: 2, hz: 2.5 });
      return map;
    },
  },
];

const BY_ID = new Map(HELD_OUT.map((c) => [c.id, c]));

export function p4bHeldOutCases(): P4BCaseDefinition[] {
  return HELD_OUT.map((c) => ({ ...c }));
}

export function getP4BCase(id: string): P4BCaseDefinition {
  const found = BY_ID.get(id);
  if (!found) throw new Error(`unknown P4-B eval case: ${id}`);
  return found;
}

export function p4bConstraints(def: P4BCaseDefinition): EvalConstraint[] {
  return [...def.targets, ...def.guardrails];
}

export type FrozenP4BCaseRecord = {
  id: string;
  split: P4Split;
  title: string;
  sourceRegisteredMap: string;
  perturbation: string;
  brief: string;
  targets: EvalConstraint[];
  guardrails: EvalConstraint[];
  thresholdRationale?: string;
  probe: { label: string; improvesTarget: string; changesOther: string };
  jointlySatisfiable: true;
};

export function frozenP4BCaseRecord(def: P4BCaseDefinition): FrozenP4BCaseRecord {
  return {
    id: def.id,
    split: def.split,
    title: def.title,
    sourceRegisteredMap: def.sourceRegisteredMap,
    perturbation: def.perturbation,
    brief: def.brief,
    targets: def.targets,
    guardrails: def.guardrails,
    ...(def.thresholdRationale ? { thresholdRationale: def.thresholdRationale } : {}),
    probe: {
      label: def.probe.label,
      improvesTarget: def.probe.improvesTarget,
      changesOther: def.probe.changesOther,
    },
    jointlySatisfiable: true,
  };
}

export function p4bManifestPayload(): {
  manifestId: string;
  replicates: number;
  arms: readonly P4Arm[];
  maxEditBudget: number;
  heldOutCases: FrozenP4BCaseRecord[];
} {
  return {
    manifestId: P4B_MANIFEST_ID,
    replicates: P4B_REPLICATES,
    arms: P4B_ARMS,
    maxEditBudget: P4B_MAX_EDIT_BUDGET,
    heldOutCases: p4bHeldOutCases().map(frozenP4BCaseRecord),
  };
}

export function p4bManifestHash(): string {
  return createHash("sha256").update(JSON.stringify(p4bManifestPayload())).digest("hex");
}

export function formatFrozenP4BManifest(requestedModel: string): string {
  const hash = p4bManifestHash();
  const held = p4bHeldOutCases();
  const lines = [
    "P4-B MANIFEST FROZEN",
    "",
    `manifest: ${P4B_MANIFEST_ID}`,
    `hash: ${hash}`,
    `model: ${requestedModel}`,
    `held-out cases: ${held.length}`,
    `replicates: ${P4B_REPLICATES}`,
    `arms: ${P4B_ARMS.join(", ")}`,
    `max edit budget: ${P4B_MAX_EDIT_BUDGET}`,
    `runs: ${held.length * P4B_ARMS.length * P4B_REPLICATES}`,
    "",
    "P4-A remains a separate basic-repair suite. Do not mix raw counts.",
    "",
  ];
  for (const c of held) {
    lines.push(`${c.id}  ${c.title}`);
    lines.push(`  source: ${c.sourceRegisteredMap}`);
    lines.push(`  perturbation: ${c.perturbation}`);
    if (c.thresholdRationale) lines.push(`  threshold: ${c.thresholdRationale}`);
    lines.push(`  brief: ${c.brief}`);
    lines.push(`  targets: ${c.targets.map(formatConstraint).join(" | ")}`);
    lines.push(`  guardrails: ${c.guardrails.map(formatConstraint).join(" | ")}`);
    lines.push(`  probe: ${c.probe.label}`);
    lines.push(`    target: ${c.probe.improvesTarget}`);
    lines.push(`    other: ${c.probe.changesOther}`);
    lines.push("  jointly satisfiable: yes");
    lines.push("");
  }
  return lines.join("\n");
}

export function asEvalCase(def: P4BCaseDefinition) {
  return {
    id: def.id,
    split: def.split,
    title: def.title,
    sourceRegisteredMap: "map-contract-smoke" as const,
    brief: def.brief,
    perturbation: def.perturbation,
    constraints: p4bConstraints(def),
    thresholdRationale: def.thresholdRationale,
    buildMap: def.buildMap,
  };
}
