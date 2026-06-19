import type { GameplayMapDefinition } from "../map-types.js";

/**
 * Internal contract fixture. Distinct bounds and cover so a MAP_ID switch
 * is obvious. Not a public map.
 */
export const MAP_CONTRACT_SMOKE: GameplayMapDefinition = {
  id: "map-contract-smoke",
  name: "map-contract-smoke",
  boundsHalfSize: 12,
  wallHeight: 3,
  wallThickness: 0.4,
  groundThickness: 0.1,

  obstacles: [
    { x: 0, y: 1, z: 0, hx: 2, hy: 1, hz: 2 },
    { x: 5, y: 1, z: 4, hx: 1, hy: 1, hz: 1 },
  ],

  occluders: [
    { x: -8, y: 1.5, z: 0, hx: 0.4, hy: 1.5, hz: 3 },
  ],

  breakables: [
    { x: -4, y: 0.8, z: 2, hx: 0.8, hy: 0.8, hz: 0.8, hp: 50 },
  ],

  spawnProtectionZones: [
    { x: 0, y: 2, z: -10, hx: 10, hy: 3, hz: 1.5 },
    { x: 0, y: 2, z: 10, hx: 10, hy: 3, hz: 1.5 },
  ],

  spawnPoints: [
    { x: -6, y: 1, z: -10 },
    { x: 0, y: 1, z: -10 },
    { x: 6, y: 1, z: -10 },
    { x: -6, y: 1, z: 10 },
    { x: 0, y: 1, z: 10 },
    { x: 6, y: 1, z: 10 },
  ],

  uploadTerminals: [
    { id: "A", x: -6, y: 0, z: 0, radius: 2.5 },
    { id: "B", x: 6, y: 0, z: 0, radius: 2.5 },
  ],

  ghostSpawnPoints: [
    { x: -6, y: 1, z: -10 },
    { x: 0, y: 1, z: -10 },
    { x: 6, y: 1, z: -10 },
  ],

  sentinelSpawnPoints: [
    { x: -6, y: 1, z: 10 },
    { x: 0, y: 1, z: 10 },
    { x: 6, y: 1, z: 10 },
  ],

  spikeSpawnLocation: { x: 0, y: 1, z: -8 },
};
