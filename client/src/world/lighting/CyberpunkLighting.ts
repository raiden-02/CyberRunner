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
    color: 0x1a1e2e,
    intensity: 0.4,
  },
  hemisphere: {
    skyColor: 0x4466aa,
    groundColor: 0x0a0c12,
    intensity: 0.35,
  },
  keyLight: {
    color: 0xffeedd,
    intensity: 1.8,
    position: new THREE.Vector3(15, 25, -10),
    castShadow: true,
    shadowMapSize: 2048,
    shadowBias: -0.0003,
    shadowCameraBounds: 40,
  },
  rimLight: {
    color: 0xff00ff,
    intensity: 0.6,
    position: new THREE.Vector3(-20, 8, 15),
  },
  fillLight: {
    color: 0x00ffff,
    intensity: 0.35,
    position: new THREE.Vector3(20, 5, -15),
  },
  neonAccents: [
    { color: 0x00ffff, intensity: 2.5, position: new THREE.Vector3(0, 2.5, -26), distance: 18, decay: 1.5 },
    { color: 0xff00ff, intensity: 2.5, position: new THREE.Vector3(0, 2.5, 26), distance: 18, decay: 1.5 },
    { color: 0x00ff88, intensity: 1.8, position: new THREE.Vector3(-18, 2, 0), distance: 14, decay: 1.8 },
    { color: 0xff6600, intensity: 1.8, position: new THREE.Vector3(18, 2, 0), distance: 14, decay: 1.8 },
    { color: 0x8800ff, intensity: 1.5, position: new THREE.Vector3(0, 3, 0), distance: 12, decay: 2 },
  ],
  exposure: 1.2,
  fog: {
    color: 0x08090d,
    near: 25,
    far: 90,
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
