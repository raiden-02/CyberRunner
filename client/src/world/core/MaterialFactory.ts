/**
 * MATERIAL FACTORY
 * Centralized material creation for all levels.
 * Provides consistent materials and caching.
 */
import * as THREE from "three";
import { NEON_PALETTE, type NeonColorKey } from "./NeonColors.js";

export interface MaterialParams {
  color: number;
  roughness: number;
  metalness: number;
  emissive?: number;
  emissiveIntensity?: number;
}

/**
 * Factory class for creating consistent materials across all levels.
 * Provides caching and common material types.
 */
export class MaterialFactory {
  private materialCache = new Map<string, THREE.MeshStandardMaterial>();

  /**
   * Create a standard PBR material
   */
  public createMaterial(params: MaterialParams): THREE.MeshStandardMaterial {
    const mat = new THREE.MeshStandardMaterial({
      color: params.color,
      roughness: params.roughness,
      metalness: params.metalness,
    });
    
    if (params.emissive !== undefined) {
      mat.emissive = new THREE.Color(params.emissive);
      mat.emissiveIntensity = params.emissiveIntensity ?? 1;
    }
    
    return mat;
  }

  /**
   * Create a neon/emissive material from the palette
   */
  public createNeonMaterial(colorKey: NeonColorKey, customIntensity?: number): THREE.MeshStandardMaterial {
    const cfg = NEON_PALETTE[colorKey];
    return new THREE.MeshStandardMaterial({
      color: cfg.color,
      emissive: cfg.emissive,
      emissiveIntensity: customIntensity ?? cfg.intensity,
      roughness: 0.2,
      metalness: 0.9,
    });
  }

  /**
   * Create a glowing material (for lights, signs, etc.)
   */
  public createGlowMaterial(color: number, intensity: number, opacity = 0.95): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      color: color,
      emissive: color,
      emissiveIntensity: intensity,
      roughness: 0.1,
      metalness: 0.95,
      transparent: opacity < 1,
      opacity: opacity,
    });
  }

  /**
   * Create a window material with interior glow
   */
  public createWindowMaterial(interiorColor: number, opacity = 0.85): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      color: 0x080a0e,
      emissive: interiorColor,
      emissiveIntensity: 0.8,
      roughness: 0.1,
      metalness: 0.8,
      transparent: true,
      opacity: opacity,
    });
  }

  /**
   * Create a holographic/transparent material
   */
  public createHologramMaterial(color: number, opacity = 0.25): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      color: color,
      emissive: color,
      emissiveIntensity: 0.8,
      transparent: true,
      opacity: opacity,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
  }

  /**
   * Get a cached material by ID, or create and cache it
   */
  public getCachedMaterial(id: string, factory: () => THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
    let mat = this.materialCache.get(id);
    if (!mat) {
      mat = factory();
      this.materialCache.set(id, mat);
    }
    return mat;
  }

  /**
   * Dispose all cached materials
   */
  public dispose(): void {
    for (const mat of this.materialCache.values()) {
      mat.dispose();
    }
    this.materialCache.clear();
  }
}

/**
 * Common material presets used across levels
 */
export const MATERIAL_PRESETS = {
  floor: { color: 0x6e7278, roughness: 0.92, metalness: 0.06 },
  floorWet: { color: 0x5c6168, roughness: 0.38, metalness: 0.22 },
  floorDark: { color: 0x5a5e64, roughness: 0.9, metalness: 0.06 },

  wall: { color: 0x8a8378, roughness: 0.88, metalness: 0.04 },
  wallDark: { color: 0x6e6860, roughness: 0.9, metalness: 0.04 },

  cover: { color: 0x4e5258, roughness: 0.75, metalness: 0.18 },
  divider: { color: 0x7a7268, roughness: 0.82, metalness: 0.08 },
  occluder: { color: 0x5c5852, roughness: 0.8, metalness: 0.1 },
  breakable: { color: 0xa07040, roughness: 0.55, metalness: 0.15, emissive: 0x5a3a18, emissiveIntensity: 0.15 },

  metal: { color: 0x3a3e44, roughness: 0.35, metalness: 0.82 },
  metalDark: { color: 0x2a2e34, roughness: 0.32, metalness: 0.88 },
  railing: { color: 0x32363c, roughness: 0.28, metalness: 0.9 },

  buildingBase: { color: 0x7a746c, roughness: 0.86, metalness: 0.05 },
  buildingAccent: { color: 0x6a5e52, roughness: 0.8, metalness: 0.08 },
  concrete: { color: 0x747880, roughness: 0.9, metalness: 0.05 },

  prop: { color: 0x4a4640, roughness: 0.6, metalness: 0.25 },
  vent: { color: 0x3e4448, roughness: 0.45, metalness: 0.4 },
} as const;
