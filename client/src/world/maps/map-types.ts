/** Decorative geometry for the bespoke Shoot House level. Gameplay collision lives in shared/. */
export type Building = {
  x: number;
  y: number;
  z: number;
  hx: number;
  hy: number;
  hz: number;
  type: "pub" | "bar" | "shop" | "warehouse" | "tower" | "billboard";
  windowColor?: number;
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
  color: "cyan" | "magenta" | "pink" | "green" | "orange" | "purple" | "teal" | "blue";
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
  connectors: Connector[];
  neonSigns: NeonSign[];
  laneLights: LaneLight[];
  spawnLightColors: {
    north: number;
    south: number;
  };
}
