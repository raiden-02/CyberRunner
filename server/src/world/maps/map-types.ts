/**
 * SERVER-SIDE MAP TYPES
 * Shared types for server map definitions.
 */

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

export interface ServerMapDefinition {
  name: string;
  boundsHalfSize: number;
  wallHeight: number;
  wallThickness: number;
  groundThickness: number;
  obstacles: BoxObstacle[];
  occluders: BoxObstacle[];
  breakables: BreakableCover[];
  spawnProtectionZones: VolumeBox[];
  spawnPoints: SpawnPoint[];
}

/**
 * Check if a point is inside a box obstacle
 */
export function isPointInsideBox(point: SpawnPoint, obstacle: BoxObstacle): boolean {
  return (
    point.x >= obstacle.x - obstacle.hx &&
    point.x <= obstacle.x + obstacle.hx &&
    point.z >= obstacle.z - obstacle.hz &&
    point.z <= obstacle.z + obstacle.hz &&
    point.y >= obstacle.y - obstacle.hy &&
    point.y <= obstacle.y + obstacle.hy
  );
}

/**
 * Calculate yaw rotation to face the center of the map (0, 0) from a spawn position.
 * Returns the rotationY value in radians.
 */
export function calculateSpawnFacing(x: number, z: number): number {
  // Direction to center is (-x, -z). To face that direction with Three.js conventions
  // (rotationY=0 faces -Z), we use atan2(x, z)
  return Math.atan2(x, z);
}
