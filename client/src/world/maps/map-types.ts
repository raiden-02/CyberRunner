/**
 * MAP TYPE DEFINITIONS
 * Shared types for all map definitions.
 */

// ═══════════════════════════════════════════════════════════════════════════
// BASE GEOMETRY TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type BoxObstacle = {
  x: number;
  y: number;
  z: number;
  hx: number;
  hy: number;
  hz: number;
};

export type SpawnPoint = {
  x: number;
  y: number;
  z: number;
};

export type BreakableCover = BoxObstacle & {
  hp: number;
};

export type VolumeBox = BoxObstacle;

export type UploadTerminal = {
  id: "A" | "B";
  x: number;
  y: number;
  z: number;
  radius: number;
};

// ═══════════════════════════════════════════════════════════════════════════
// STRUCTURE TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type Building = BoxObstacle & {
  type: "pub" | "bar" | "shop" | "warehouse" | "tower" | "billboard";
  hasInterior?: boolean;
  windowColor?: number;
};

export type Catwalk = {
  x: number;
  y: number;
  z: number;
  width: number;
  length: number;
  rotationY: number;
  hasRailing: boolean;
  neonColor?: "cyan" | "magenta" | "teal" | "blue" | "pink";
};

export type Ramp = {
  x: number;
  y: number;
  z: number;
  width: number;
  length: number;
  height: number;
  rotationY: number;
};

export type Connector = {
  x: number;
  y: number;
  z: number;
  hx: number;
  hy: number;
  hz: number;
  type: "hallway" | "stairwell" | "doorway";
  lighting?: "warm" | "cool" | "neutral";
};

// ═══════════════════════════════════════════════════════════════════════════
// VISUAL ELEMENT TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type NeonSign = {
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  rotationY: number;
  text?: string;
  color: "cyan" | "magenta" | "pink" | "green" | "orange" | "purple" | "teal" | "blue";
  flicker?: boolean;
};

export type EnvironmentProp = {
  x: number;
  y: number;
  z: number;
  type: "crate" | "barrel" | "vent" | "dumpster" | "terminal" | "hologram";
  rotationY?: number;
  scale?: number;
};

export type LaneLight = {
  x: number;
  y: number;
  z: number;
  color: number;
  intensity: number;
  distance: number;
  decay: number;
};

// ═══════════════════════════════════════════════════════════════════════════
// MAP DEFINITION INTERFACES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Base map definition - required for all maps
 */
export interface MapDefinition {
  name: string;
  displayName: string;
  boundsHalfSize: number;
  wallHeight: number;
  wallThickness: number;
  groundThickness: number;
  obstacles: BoxObstacle[];
  occluders: BoxObstacle[];
  breakables: BreakableCover[];
  spawnProtectionZones: VolumeBox[];
  spawnPoints: SpawnPoint[];
  uploadTerminals?: UploadTerminal[];
}

/**
 * Full Shoot House Neon map definition
 * Extends base with all cyberpunk visual elements
 */
export interface ShootHouseMapDefinition extends MapDefinition {
  buildings: Building[];
  catwalks: Catwalk[];
  ramps: Ramp[];
  connectors: Connector[];
  neonSigns: NeonSign[];
  props: EnvironmentProp[];
  laneLights: LaneLight[];
  spawnLightColors: {
    north: number;
    south: number;
  };
}
