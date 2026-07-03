import { CAPSULE } from "@shared/physics/constants.js";

/** Standing XZ occupancy grid. 0.5 m is enough for the 56 m Shoot House. */
export const GRID_CELL_METERS = 0.5;

/** LocalPlayer eye height. LOS rays use this Y. */
export const EYE_HEIGHT = 1.6;

/** Standing capsule occupies Y [0, 2 * (HalfHeight + Radius)] when feet are on the floor. */
export const STANDING_CAPSULE_TOP = 2 * (CAPSULE.HalfHeight + CAPSULE.Radius);

export const PLAYER_RADIUS = CAPSULE.Radius;

export type SolidKind = "obstacle" | "occluder" | "breakable";
export type SpawnRole = "general" | "ghost" | "sentinel";
export type ArenaEvaluationMode = "search_destroy" | "deathmatch";

export type ArenaSolid = {
  id: string;
  kind: SolidKind;
  x: number;
  y: number;
  z: number;
  hx: number;
  hy: number;
  hz: number;
  hp?: number;
};

export type ArenaSpawn = {
  id: string;
  role: SpawnRole;
  x: number;
  y: number;
  z: number;
};

export type ArenaObjective = {
  id: "A" | "B";
  x: number;
  y: number;
  z: number;
  radius: number;
};

export type ArenaZone = {
  id: string;
  x: number;
  y: number;
  z: number;
  hx: number;
  hy: number;
  hz: number;
};

/**
 * ArenaForge working map. Derived from GameplayMapDefinition.
 * IDs are stable for one import. No AI / prompt fields.
 */
export type ArenaMap = {
  sourceMapId?: string;
  boundsHalfSize: number;
  wallHeight: number;
  wallThickness: number;
  groundThickness: number;
  solids: ArenaSolid[];
  spawns: ArenaSpawn[];
  objectives: ArenaObjective[];
  spawnProtectionZones: ArenaZone[];
  spikeSpawnLocation?: { id: string; x: number; y: number; z: number };
};

export type HardIssue = {
  code: string;
  id?: string;
  [key: string]: string | number | boolean | undefined;
};

export type SpawnCheck = {
  id: string;
  role: SpawnRole;
  valid: boolean;
  issues: HardIssue[];
  blockedBy?: string;
};

export type ObjectiveCheck = {
  id: string;
  letter: "A" | "B";
  valid: boolean;
  issues: HardIssue[];
  navigableCellCount: number;
};

export type PathPair = {
  from: string;
  to: string;
  reachable: boolean;
  distanceMeters?: number;
};

export type DistanceAggregate = {
  fromRole: SpawnRole;
  to: string;
  sampleCount: number;
  minMeters?: number;
  medianMeters?: number;
};

export type AnchorComponent = {
  id: string;
  componentId: number | null;
};

export type LosPair = {
  from: string;
  to: string;
  clear: boolean;
  distanceMeters: number;
  blockedBy?: string;
};

export type ArenaEvaluation = {
  sourceMapId?: string;
  mode: ArenaEvaluationMode;
  geometry: { issues: HardIssue[] };
  spawns: { results: SpawnCheck[] };
  objectives: { results: ObjectiveCheck[] };
  navigation: {
    cellMeters: number;
    neighbors: "4";
    limitation: string;
    walkableCells: number;
    totalCells: number;
    components: {
      count: number;
      largestCells: number;
      largestFraction: number;
    };
    anchors: AnchorComponent[];
    paths: PathPair[];
    aggregates: DistanceAggregate[];
  };
  lineOfSight: {
    eyeHeight: number;
    pairs: LosPair[];
  };
  summary: {
    hardFailureCount: number;
    hardFailures: HardIssue[];
  };
};

export function objectiveId(letter: "A" | "B"): string {
  return `objective-${letter}`;
}
