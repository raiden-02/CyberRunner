/**
 * CYBERPUNK LIGHTING
 * Default cyberpunk lighting configuration.
 * Extends BaseLighting for common functionality.
 */
import * as THREE from "three";
import { BaseLighting, type LightingConfig, WEAPON_RENDER_LAYER } from "../core/BaseLighting.js";

// Re-export for backwards compatibility
export { WEAPON_RENDER_LAYER };
export type { LightingConfig };

/**
 * Default cyberpunk lighting configuration
 */
export const CYBERPUNK_LIGHTING_CONFIG: LightingConfig = {
  ambient: {
    color: 0x2c2924,
    intensity: 0.55,
  },
  hemisphere: {
    skyColor: 0x6a7a88,
    groundColor: 0x3a3832,
    intensity: 0.45,
  },
  keyLight: {
    color: 0xffe2b8,
    intensity: 2.0,
    position: new THREE.Vector3(15, 25, -10),
    castShadow: true,
    shadowMapSize: 2048,
    shadowBias: -0.0003,
    shadowCameraBounds: 40,
  },
  rimLight: {
    color: 0xd4893a,
    intensity: 0.4,
    position: new THREE.Vector3(-20, 8, 15),
  },
  fillLight: {
    color: 0x7a90a0,
    intensity: 0.32,
    position: new THREE.Vector3(20, 5, -15),
  },
  neonAccents: [
    { color: 0xd4893a, intensity: 1.1, position: new THREE.Vector3(0, 2.5, -26), distance: 18, decay: 1.5 },
    { color: 0x4a8b8a, intensity: 0.8, position: new THREE.Vector3(0, 2.5, 26), distance: 18, decay: 1.5 },
    { color: 0xd4893a, intensity: 0.7, position: new THREE.Vector3(-18, 2, 0), distance: 14, decay: 1.8 },
    { color: 0x4a8b8a, intensity: 0.65, position: new THREE.Vector3(18, 2, 0), distance: 14, decay: 1.8 },
    { color: 0xf0e6d4, intensity: 0.9, position: new THREE.Vector3(0, 8, 0), distance: 16, decay: 1.8 },
  ],
  exposure: 1.05,
  fog: {
    color: 0x5a5e62,
    near: 40,
    far: 100,
  },
};

/**
 * Default cyberpunk lighting class.
 * Used for the three-lane dev map and as a base for other maps.
 */
export class CyberpunkLighting extends BaseLighting {
  constructor(scene: THREE.Scene, config: LightingConfig = CYBERPUNK_LIGHTING_CONFIG) {
    super(scene, config);
  }
}
