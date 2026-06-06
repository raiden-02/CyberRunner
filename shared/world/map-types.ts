export type BoxObstacle = {
  x: number;
  y: number;
  z: number;
  hx: number;
  hy: number;
  hz: number;
};

export type BreakableCover = BoxObstacle & {
  hp: number;
};

export interface MapCollisionData {
  boundsHalfSize: number;
  wallHeight: number;
  wallThickness: number;
  groundThickness: number;
  obstacles: BoxObstacle[];
  occluders: BoxObstacle[];
  breakables: BreakableCover[];
}
