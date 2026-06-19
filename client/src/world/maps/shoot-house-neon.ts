import type { ShootHouseVisuals } from "./map-types.js";

export const SHOOT_HOUSE_VISUALS: ShootHouseVisuals = {
  buildings: [
    { x: -24, y: 2.5, z: 0, hx: 3, hy: 2.5, hz: 8, type: "warehouse", windowColor: 0xd4893a },
    { x: 24, y: 2.5, z: 0, hx: 3, hy: 2.5, hz: 8, type: "bar", windowColor: 0x4a8b8a },
    { x: 0, y: 4, z: 0, hx: 6, hy: 4, hz: 1.5, type: "billboard", windowColor: 0xd4893a },
  ],
  catwalks: [],
  ramps: [],
  connectors: [
    { x: -6, y: 1.5, z: -6, hx: 1.5, hy: 1.5, hz: 1.5, type: "doorway", lighting: "warm" },
    { x: -6, y: 1.5, z: 6, hx: 1.5, hy: 1.5, hz: 1.5, type: "doorway", lighting: "warm" },
    { x: 6, y: 1.5, z: -6, hx: 1.5, hy: 1.5, hz: 1.5, type: "doorway", lighting: "cool" },
    { x: 6, y: 1.5, z: 6, hx: 1.5, hy: 1.5, hz: 1.5, type: "doorway", lighting: "cool" },
  ],
  neonSigns: [
    { x: 0, y: 5, z: 1.6, width: 8, height: 2.5, rotationY: 0, color: "orange", flicker: false },
    { x: 0, y: 5, z: -1.6, width: 8, height: 2.5, rotationY: Math.PI, color: "teal", flicker: false },
    { x: 0, y: 2.5, z: -27, width: 4, height: 1, rotationY: 0, color: "orange", flicker: false },
    { x: 0, y: 2.5, z: 27, width: 4, height: 1, rotationY: Math.PI, color: "teal", flicker: false },
  ],
  props: [],
  laneLights: [
    { x: -16, y: 8, z: 0, color: 0xd4893a, intensity: 0.9, distance: 18, decay: 1.6 },
    { x: 0, y: 10, z: 0, color: 0xf0e6d4, intensity: 1.2, distance: 28, decay: 1.3 },
    { x: 16, y: 8, z: 0, color: 0x4a8b8a, intensity: 0.7, distance: 18, decay: 1.6 },
    { x: 0, y: 6, z: -26, color: 0xd4893a, intensity: 0.8, distance: 16, decay: 1.5 },
    { x: 0, y: 6, z: 26, color: 0x4a8b8a, intensity: 0.65, distance: 16, decay: 1.5 },
  ],
  spawnLightColors: {
    north: 0xd4893a,
    south: 0x4a8b8a,
  },
};
