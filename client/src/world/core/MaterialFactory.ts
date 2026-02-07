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
  // Floor materials
  floor: { color: 0x12151a, roughness: 0.92, metalness: 0.08 },
  floorWet: { color: 0x0a0c10, roughness: 0.3, metalness: 0.7 },
  floorDark: { color: 0x0a0c10, roughness: 0.85, metalness: 0.15 },
  
  // Wall materials
  wall: { color: 0x1a1e24, roughness: 0.8, metalness: 0.2 },
  wallDark: { color: 0x12151a, roughness: 0.85, metalness: 0.15 },
  
  // Cover/obstacle materials
  cover: { color: 0x1a1e24, roughness: 0.7, metalness: 0.3, emissive: 0x0a0c10, emissiveIntensity: 0.2 },
  divider: { color: 0x181c22, roughness: 0.75, metalness: 0.25 },
  occluder: { color: 0x141820, roughness: 0.7, metalness: 0.3, emissive: 0x080a0e, emissiveIntensity: 0.15 },
  breakable: { color: 0x8a5a1a, roughness: 0.5, metalness: 0.2, emissive: 0xff6600, emissiveIntensity: 0.9 },
  
  // Metal materials
  metal: { color: 0x2a2e34, roughness: 0.4, metalness: 0.8 },
  metalDark: { color: 0x1a1e24, roughness: 0.35, metalness: 0.85 },
  railing: { color: 0x222630, roughness: 0.3, metalness: 0.9 },
  
  // Building materials
  buildingBase: { color: 0x141820, roughness: 0.85, metalness: 0.15 },
  buildingAccent: { color: 0x1e2430, roughness: 0.75, metalness: 0.25 },
  concrete: { color: 0x1c2028, roughness: 0.9, metalness: 0.1 },
  
  // Prop materials
  prop: { color: 0x202428, roughness: 0.6, metalness: 0.4 },
  vent: { color: 0x1a1e22, roughness: 0.5, metalness: 0.5, emissive: 0x0a0c10, emissiveIntensity: 0.3 },
} as const;
