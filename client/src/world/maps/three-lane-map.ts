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

export const THREE_LANE_MAP = {
  name: "three-lane-dev",
  boundsHalfSize: 30,
  wallHeight: 4,
  wallThickness: 0.5,
  groundThickness: 0.1,
  obstacles: [
    // Lane dividers (left)
    { x: -8, y: 1, z: -20, hx: 0.5, hy: 1, hz: 5 },
    { x: -8, y: 1, z: 0, hx: 0.5, hy: 1, hz: 6 },
    { x: -8, y: 1, z: 20, hx: 0.5, hy: 1, hz: 5 },

    // Lane dividers (right)
    { x: 8, y: 1, z: -20, hx: 0.5, hy: 1, hz: 5 },
    { x: 8, y: 1, z: 0, hx: 0.5, hy: 1, hz: 6 },
    { x: 8, y: 1, z: 20, hx: 0.5, hy: 1, hz: 5 },

    // Mid-lane cover
    { x: 0, y: 1, z: -12, hx: 2, hy: 1, hz: 2 },
    { x: 0, y: 1, z: 0, hx: 2, hy: 1, hz: 2 },
    { x: 0, y: 1, z: 12, hx: 2, hy: 1, hz: 2 },

    // Left lane cover (staggered)
    { x: -18, y: 1, z: -14, hx: 2, hy: 1, hz: 2 },
    { x: -18, y: 1, z: 4, hx: 2, hy: 1, hz: 2 },
    { x: -18, y: 1, z: 18, hx: 2, hy: 1, hz: 2 },

    // Right lane cover (staggered)
    { x: 18, y: 1, z: -18, hx: 2, hy: 1, hz: 2 },
    { x: 18, y: 1, z: -4, hx: 2, hy: 1, hz: 2 },
    { x: 18, y: 1, z: 14, hx: 2, hy: 1, hz: 2 }
  ] as BoxObstacle[],
  occluders: [
    // Tall occluders to break long sightlines
    { x: -12, y: 2, z: -2, hx: 1, hy: 2, hz: 4 },
    { x: 12, y: 2, z: 2, hx: 1, hy: 2, hz: 4 },
    { x: 0, y: 2, z: -18, hx: 3, hy: 2, hz: 1 },
    { x: 0, y: 2, z: 18, hx: 3, hy: 2, hz: 1 }
  ] as BoxObstacle[],
  breakables: [
    // Breakable cover near lane entries
    { x: -6, y: 1, z: -22, hx: 1.5, hy: 1, hz: 1.5, hp: 60 },
    { x: 6, y: 1, z: -22, hx: 1.5, hy: 1, hz: 1.5, hp: 60 },
    { x: -6, y: 1, z: 22, hx: 1.5, hy: 1, hz: 1.5, hp: 60 },
    { x: 6, y: 1, z: 22, hx: 1.5, hy: 1, hz: 1.5, hp: 60 }
  ] as BreakableCover[],
  spawnProtectionZones: [
    // North spawn zone
    { x: 0, y: 2, z: -26, hx: 22, hy: 3, hz: 3 },
    // South spawn zone
    { x: 0, y: 2, z: 26, hx: 22, hy: 3, hz: 3 }
  ] as VolumeBox[],
  spawnPoints: [
    // North side
    { x: -18, y: 2, z: -26 },
    { x: 0, y: 2, z: -26 },
    { x: 18, y: 2, z: -26 },
    { x: -12, y: 2, z: -24 },
    { x: 12, y: 2, z: -24 },

    // South side
    { x: -18, y: 2, z: 26 },
    { x: 0, y: 2, z: 26 },
    { x: 18, y: 2, z: 26 },
    { x: -12, y: 2, z: 24 },
    { x: 12, y: 2, z: 24 }
  ] as SpawnPoint[]
};
