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

export interface MapCollisionData {
  boundsHalfSize: number;
  wallHeight: number;
  wallThickness: number;
  groundThickness: number;
  obstacles: BoxObstacle[];
  occluders: BoxObstacle[];
  breakables: BreakableCover[];
}

/**
 * Canonical gameplay map. Collision, spawns, and objectives live here.
 * Client visual decoration (neon, lighting, skybox) stays out of this type.
 */
export interface GameplayMapDefinition extends MapCollisionData {
  id: string;
  name: string;
  spawnProtectionZones: VolumeBox[];
  spawnPoints: SpawnPoint[];
  uploadTerminals?: UploadTerminal[];
  ghostSpawnPoints?: SpawnPoint[];
  sentinelSpawnPoints?: SpawnPoint[];
  spikeSpawnLocation?: SpawnPoint;
}

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

/** Yaw to face the map origin. rotationY=0 faces -Z. */
export function calculateSpawnFacing(x: number, z: number): number {
  return Math.atan2(x, z);
}
