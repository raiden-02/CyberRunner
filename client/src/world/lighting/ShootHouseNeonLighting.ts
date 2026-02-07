/**
 * SHOOT HOUSE NEON LIGHTING
 * Competitive-focused lighting: clear visibility, minimal distraction.
 * Subtle neon accents without overwhelming the gameplay.
 */
import * as THREE from "three";
import { BaseLighting, type LightingConfig } from "../core/BaseLighting.js";

export const SHOOT_HOUSE_NEON_LIGHTING_CONFIG: LightingConfig = {
  ambient: {
    color: 0x101418,
    intensity: 0.35,
  },

  hemisphere: {
    skyColor: 0x2a3040,
    groundColor: 0x080a0c,
    intensity: 0.25,
  },

  keyLight: {
    color: 0xffffff,
    intensity: 1.6,
    position: new THREE.Vector3(0, 30, 0),
    castShadow: true,
    shadowMapSize: 2048,
    shadowBias: -0.0002,
    shadowCameraBounds: 40,
  },

  rimLight: {
    color: 0xcc88ff,
    intensity: 0.25,
    position: new THREE.Vector3(-15, 10, 20),
  },

  fillLight: {
    color: 0x88ccff,
    intensity: 0.2,
    position: new THREE.Vector3(15, 8, -20),
  },

  neonAccents: [
    { color: 0xff8866, intensity: 1.0, position: new THREE.Vector3(-16, 8, 0), distance: 18, decay: 1.6 },
    { color: 0xffffff, intensity: 1.5, position: new THREE.Vector3(0, 10, 0), distance: 25, decay: 1.4 },
    { color: 0x66aaff, intensity: 1.0, position: new THREE.Vector3(16, 8, 0), distance: 18, decay: 1.6 },
    { color: 0x00dddd, intensity: 1.2, position: new THREE.Vector3(0, 6, -26), distance: 16, decay: 1.5 },
    { color: 0xdd00dd, intensity: 1.2, position: new THREE.Vector3(0, 6, 26), distance: 16, decay: 1.5 },
  ],

  exposure: 1.3,

  fog: {
    color: 0x0a0c10,
    near: 40,
    far: 100,
  },
};

export class ShootHouseNeonLighting extends BaseLighting {
  constructor(scene: THREE.Scene, config: LightingConfig = SHOOT_HOUSE_NEON_LIGHTING_CONFIG) {
    super(scene, config);
  }

  public override update(_deltaTime: number): void {}
}
