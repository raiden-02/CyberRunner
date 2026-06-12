/**
 * SHOOT HOUSE NEON LIGHTING
 * Competitive-focused lighting: clear visibility, minimal distraction.
 * Subtle neon accents without overwhelming the gameplay.
 */
import * as THREE from "three";
import { BaseLighting, type LightingConfig } from "../core/BaseLighting.js";

export const SHOOT_HOUSE_NEON_LIGHTING_CONFIG: LightingConfig = {
  ambient: {
    color: 0x2c2924,
    intensity: 0.62,
  },

  hemisphere: {
    skyColor: 0x6a7a88,
    groundColor: 0x3a3832,
    intensity: 0.5,
  },

  keyLight: {
    color: 0xffe2b8,
    intensity: 2.1,
    position: new THREE.Vector3(12, 28, -8),
    castShadow: true,
    shadowMapSize: 2048,
    shadowBias: -0.0002,
    shadowCameraBounds: 40,
  },

  rimLight: {
    color: 0xd4893a,
    intensity: 0.45,
    position: new THREE.Vector3(-18, 10, 16),
  },

  fillLight: {
    color: 0x7a90a0,
    intensity: 0.38,
    position: new THREE.Vector3(16, 8, -18),
  },

  neonAccents: [
    { color: 0xd4893a, intensity: 0.9, position: new THREE.Vector3(-16, 8, 0), distance: 18, decay: 1.6 },
    { color: 0xf0e6d4, intensity: 1.2, position: new THREE.Vector3(0, 12, 0), distance: 28, decay: 1.3 },
    { color: 0x4a8b8a, intensity: 0.7, position: new THREE.Vector3(16, 8, 0), distance: 18, decay: 1.6 },
    { color: 0xd4893a, intensity: 0.8, position: new THREE.Vector3(0, 6, -26), distance: 16, decay: 1.5 },
    { color: 0x4a8b8a, intensity: 0.65, position: new THREE.Vector3(0, 6, 26), distance: 16, decay: 1.5 },
  ],

  exposure: 1.05,

  fog: {
    color: 0x5a5e62,
    near: 48,
    far: 110,
  },
};

export class ShootHouseNeonLighting extends BaseLighting {
  constructor(scene: THREE.Scene, config: LightingConfig = SHOOT_HOUSE_NEON_LIGHTING_CONFIG) {
    super(scene, config);
  }

  public override update(_deltaTime: number): void {}
}
