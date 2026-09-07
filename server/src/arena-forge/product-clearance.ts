import { CAPSULE } from "@shared/physics/constants.js";
import {
  boundsMaxX,
  boundsMaxZ,
  boundsMinX,
  boundsMinZ,
  resolveMapBounds,
  type BoundSide,
} from "@shared/world/map-bounds.js";
import { roundMeters } from "./geometry.js";
import type { ArenaEditError } from "./actions.js";
import {
  GRID_CELL_METERS,
  STANDING_CAPSULE_TOP,
  type ArenaMap,
  type ArenaSolid,
} from "./types.js";

export const PLAYER_DIAMETER = CAPSULE.Radius * 2;

/** ArenaForge V1 minimum opening: standing player diameter plus one nav cell. */
export const MIN_PRODUCT_PASSAGE_METERS = PLAYER_DIAMETER + GRID_CELL_METERS;

/** Projection must overlap by more than this to count as a corridor, not a diagonal near-miss. */
const PROJECTION_OVERLAP_EPS = 1e-3;
const GAP_TOUCH_EPS = 1e-6;

export type ProductClearanceIssue =
  | {
      code: "narrow-solid-gap";
      a: string;
      b: string;
      axis: "x" | "z";
      gapMeters: number;
      requiredMeters: number;
    }
  | {
      code: "narrow-boundary-gap";
      solidId: string;
      side: BoundSide;
      gapMeters: number;
      requiredMeters: number;
    };

export type ProductClearanceReport = {
  minimumPassageMeters: number;
  issues: ProductClearanceIssue[];
};

type Interval = { min: number; max: number };

function intervalOf(center: number, half: number): Interval {
  return { min: center - half, max: center + half };
}

function overlapLength(a: Interval, b: Interval): number {
  return Math.min(a.max, b.max) - Math.max(a.min, b.min);
}

function edgeGap(a: Interval, b: Interval): number {
  return Math.max(a.min, b.min) - Math.min(a.max, b.max);
}

function projectsOverlap(a: Interval, b: Interval): boolean {
  return overlapLength(a, b) > PROJECTION_OVERLAP_EPS;
}

function isNarrowPositiveGap(rawGap: number): boolean {
  const gap = roundMeters(rawGap);
  return gap > 0 && gap < MIN_PRODUCT_PASSAGE_METERS;
}

/** Y range intersects the standing capsule. Grounded product boxes normally do. */
export function solidBlocksStandingTraversal(solid: ArenaSolid): boolean {
  const top = solid.y + solid.hy;
  const bottom = solid.y - solid.hy;
  return top > 0 && bottom < STANDING_CAPSULE_TOP;
}

function standingSolids(map: ArenaMap): ArenaSolid[] {
  return map.solids.filter(solidBlocksStandingTraversal).sort((a, b) => a.id.localeCompare(b.id));
}

function pairwiseIssues(solids: ArenaSolid[]): ProductClearanceIssue[] {
  const issues: ProductClearanceIssue[] = [];
  for (let i = 0; i < solids.length; i++) {
    const a = solids[i]!;
    const ax = intervalOf(a.x, a.hx);
    const az = intervalOf(a.z, a.hz);
    for (let j = i + 1; j < solids.length; j++) {
      const b = solids[j]!;
      const bx = intervalOf(b.x, b.hx);
      const bz = intervalOf(b.z, b.hz);
      if (projectsOverlap(ax, bx)) {
        const gap = edgeGap(az, bz);
        if (isNarrowPositiveGap(gap)) {
          const [left, right] = a.id < b.id ? [a.id, b.id] : [b.id, a.id];
          issues.push({
            code: "narrow-solid-gap",
            a: left,
            b: right,
            axis: "z",
            gapMeters: roundMeters(gap),
            requiredMeters: MIN_PRODUCT_PASSAGE_METERS,
          });
        }
      }
      if (projectsOverlap(az, bz)) {
        const gap = edgeGap(ax, bx);
        if (isNarrowPositiveGap(gap)) {
          const [left, right] = a.id < b.id ? [a.id, b.id] : [b.id, a.id];
          issues.push({
            code: "narrow-solid-gap",
            a: left,
            b: right,
            axis: "x",
            gapMeters: roundMeters(gap),
            requiredMeters: MIN_PRODUCT_PASSAGE_METERS,
          });
        }
      }
    }
  }
  return issues;
}

function boundaryIssues(solids: ArenaSolid[], map: ArenaMap): ProductClearanceIssue[] {
  const bounds = resolveMapBounds(map);
  const issues: ProductClearanceIssue[] = [];
  for (const solid of solids) {
    const gaps: Array<{ side: BoundSide; gap: number }> = [
      { side: "x-", gap: intervalOf(solid.x, solid.hx).min - boundsMinX(bounds) },
      { side: "x+", gap: boundsMaxX(bounds) - intervalOf(solid.x, solid.hx).max },
      { side: "z-", gap: intervalOf(solid.z, solid.hz).min - boundsMinZ(bounds) },
      { side: "z+", gap: boundsMaxZ(bounds) - intervalOf(solid.z, solid.hz).max },
    ];
    for (const { side, gap } of gaps) {
      if (!isNarrowPositiveGap(gap)) continue;
      issues.push({
        code: "narrow-boundary-gap",
        solidId: solid.id,
        side,
        gapMeters: roundMeters(gap),
        requiredMeters: MIN_PRODUCT_PASSAGE_METERS,
      });
    }
  }
  return issues;
}

export function clearanceIssueKey(issue: ProductClearanceIssue): string {
  if (issue.code === "narrow-solid-gap") {
    return `solid:${issue.a}:${issue.b}:${issue.axis}`;
  }
  return `boundary:${issue.solidId}:${issue.side}`;
}

function compareIssues(a: ProductClearanceIssue, b: ProductClearanceIssue): number {
  if (a.gapMeters !== b.gapMeters) return a.gapMeters - b.gapMeters;
  return clearanceIssueKey(a).localeCompare(clearanceIssueKey(b));
}

export function inspectProductClearance(map: ArenaMap): ProductClearanceReport {
  const solids = standingSolids(map);
  const issues = [...pairwiseIssues(solids), ...boundaryIssues(solids, map)].sort(compareIssues);
  return {
    minimumPassageMeters: MIN_PRODUCT_PASSAGE_METERS,
    issues,
  };
}

export function clearanceRegressions(
  before: readonly ProductClearanceIssue[],
  after: readonly ProductClearanceIssue[],
): ProductClearanceIssue[] {
  const prior = new Map(before.map((issue) => [clearanceIssueKey(issue), issue]));
  const introduced: ProductClearanceIssue[] = [];
  for (const issue of after) {
    const prev = prior.get(clearanceIssueKey(issue));
    if (!prev) {
      introduced.push(issue);
      continue;
    }
    if (issue.gapMeters + GAP_TOUCH_EPS < prev.gapMeters) {
      introduced.push(issue);
    }
  }
  return introduced.sort(compareIssues);
}

export function passageTooNarrowError(issue: ProductClearanceIssue): ArenaEditError {
  if (issue.code === "narrow-solid-gap") {
    return {
      code: "passage-too-narrow",
      between: `${issue.a}, ${issue.b}`,
      axis: issue.axis,
      gapMeters: issue.gapMeters,
      requiredMeters: issue.requiredMeters,
    };
  }
  return {
    code: "passage-too-narrow",
    target: issue.solidId,
    side: issue.side,
    gapMeters: issue.gapMeters,
    requiredMeters: issue.requiredMeters,
  };
}

export function rejectClearanceRegression(
  before: ArenaMap,
  after: ArenaMap,
): ArenaEditError | undefined {
  const introduced = clearanceRegressions(
    inspectProductClearance(before).issues,
    inspectProductClearance(after).issues,
  );
  const worst = introduced[0];
  return worst ? passageTooNarrowError(worst) : undefined;
}
