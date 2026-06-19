export type {
  BoxObstacle,
  SpawnPoint,
  BreakableCover,
  VolumeBox,
  UploadTerminal,
  GameplayMapDefinition,
} from "@shared/world/map-types.js";

export type Building = {
  x: number;
  y: number;
  z: number;
  hx: number;
  hy: number;
  hz: number;
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

export interface ShootHouseVisuals {
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
