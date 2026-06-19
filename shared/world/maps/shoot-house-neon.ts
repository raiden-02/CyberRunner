import type { GameplayMapDefinition } from "../map-types.js";

export const SHOOT_HOUSE_NEON: GameplayMapDefinition = {
  id: "shoot-house-neon",
  name: "shoot-house-neon",
  boundsHalfSize: 28,
  wallHeight: 4.5,
  wallThickness: 0.5,
  groundThickness: 0.1,

  obstacles: [
    { x: 0, y: 1.5, z: 0, hx: 5, hy: 1.5, hz: 1 },
    { x: -9, y: 1.5, z: -10, hx: 0.4, hy: 1.5, hz: 8 },
    { x: -9, y: 1.5, z: 10, hx: 0.4, hy: 1.5, hz: 8 },
    { x: -18, y: 1.2, z: -14, hx: 1.5, hy: 1.2, hz: 1.5 },
    { x: -16, y: 1.2, z: 0, hx: 1.5, hy: 1.2, hz: 1.5 },
    { x: -18, y: 1.2, z: 14, hx: 1.5, hy: 1.2, hz: 1.5 },
    { x: 9, y: 1.5, z: -10, hx: 0.4, hy: 1.5, hz: 8 },
    { x: 9, y: 1.5, z: 10, hx: 0.4, hy: 1.5, hz: 8 },
    { x: 16, y: 1.2, z: -14, hx: 1.5, hy: 1.2, hz: 1.5 },
    { x: 18, y: 1.2, z: 0, hx: 1.5, hy: 1.2, hz: 1.5 },
    { x: 16, y: 1.2, z: 14, hx: 1.5, hy: 1.2, hz: 1.5 },
    { x: -3, y: 1.1, z: -12, hx: 0.8, hy: 1.1, hz: 0.8 },
    { x: 3, y: 1.1, z: 12, hx: 0.8, hy: 1.1, hz: 0.8 },
    { x: -10, y: 1.2, z: -24, hx: 1.5, hy: 1.2, hz: 0.8 },
    { x: 10, y: 1.2, z: -24, hx: 1.5, hy: 1.2, hz: 0.8 },
    { x: -10, y: 1.2, z: 24, hx: 1.5, hy: 1.2, hz: 0.8 },
    { x: 10, y: 1.2, z: 24, hx: 1.5, hy: 1.2, hz: 0.8 },
  ],

  occluders: [
    { x: -24, y: 2.5, z: 0, hx: 3, hy: 2.5, hz: 8 },
    { x: 24, y: 2.5, z: 0, hx: 3, hy: 2.5, hz: 8 },
    { x: -5, y: 1.5, z: -20, hx: 1.5, hy: 1.5, hz: 1 },
    { x: 5, y: 1.5, z: -20, hx: 1.5, hy: 1.5, hz: 1 },
    { x: -5, y: 1.5, z: 20, hx: 1.5, hy: 1.5, hz: 1 },
    { x: 5, y: 1.5, z: 20, hx: 1.5, hy: 1.5, hz: 1 },
  ],

  breakables: [
    { x: -5, y: 0.8, z: -5, hx: 1, hy: 0.8, hz: 1, hp: 50 },
    { x: 5, y: 0.8, z: 5, hx: 1, hy: 0.8, hz: 1, hp: 50 },
  ],

  spawnProtectionZones: [
    { x: 0, y: 2, z: -26, hx: 24, hy: 3, hz: 2 },
    { x: 0, y: 2, z: 26, hx: 24, hy: 3, hz: 2 },
  ],

  spawnPoints: [
    { x: -18, y: 1, z: -26 },
    { x: -8, y: 1, z: -26 },
    { x: 0, y: 1, z: -26 },
    { x: 8, y: 1, z: -26 },
    { x: 18, y: 1, z: -26 },
    { x: -18, y: 1, z: 26 },
    { x: -8, y: 1, z: 26 },
    { x: 0, y: 1, z: 26 },
    { x: 8, y: 1, z: 26 },
    { x: 18, y: 1, z: 26 },
  ],

  uploadTerminals: [
    { id: "A", x: -16, y: 0, z: 0, radius: 2.5 },
    { id: "B", x: 16, y: 0, z: 0, radius: 2.5 },
  ],

  ghostSpawnPoints: [
    { x: -18, y: 1, z: -26 },
    { x: -8, y: 1, z: -26 },
    { x: 0, y: 1, z: -26 },
    { x: 8, y: 1, z: -26 },
  ],

  sentinelSpawnPoints: [
    { x: -18, y: 1, z: 26 },
    { x: -8, y: 1, z: 26 },
    { x: 0, y: 1, z: 26 },
    { x: 8, y: 1, z: 26 },
  ],

  spikeSpawnLocation: { x: 0, y: 1, z: -24 },
};
