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
  // Floor materials - dark with subtle cyan/teal tint
  floor: { color: 0x141820, roughness: 0.85, metalness: 0.15, emissive: 0x001a1a, emissiveIntensity: 0.15 },
  floorWet: { color: 0x0c1018, roughness: 0.2, metalness: 0.8, emissive: 0x002233, emissiveIntensity: 0.3 },
  floorDark: { color: 0x0a0e14, roughness: 0.85, metalness: 0.15 },
  
  // Wall materials - dark blue-purple cyberpunk tint
  wall: { color: 0x1a1824, roughness: 0.75, metalness: 0.25, emissive: 0x0a0812, emissiveIntensity: 0.2 },
  wallDark: { color: 0x12101a, roughness: 0.8, metalness: 0.2, emissive: 0x080610, emissiveIntensity: 0.15 },
  
  // Cover/obstacle materials - teal accent
  cover: { color: 0x141a20, roughness: 0.6, metalness: 0.4, emissive: 0x003344, emissiveIntensity: 0.25 },
  divider: { color: 0x18161e, roughness: 0.7, metalness: 0.3, emissive: 0x220033, emissiveIntensity: 0.2 },
  occluder: { color: 0x161420, roughness: 0.65, metalness: 0.35, emissive: 0x110022, emissiveIntensity: 0.2 },
  breakable: { color: 0x8a5a1a, roughness: 0.45, metalness: 0.25, emissive: 0xff6600, emissiveIntensity: 1.0 },
  
  // Metal materials - cool metallic with cyan reflection
  metal: { color: 0x1e2228, roughness: 0.3, metalness: 0.9, emissive: 0x002a3a, emissiveIntensity: 0.2 },
  metalDark: { color: 0x161a20, roughness: 0.25, metalness: 0.92, emissive: 0x001a2a, emissiveIntensity: 0.15 },
  railing: { color: 0x1a1e26, roughness: 0.2, metalness: 0.95, emissive: 0x003355, emissiveIntensity: 0.25 },
  
  // Building materials - purple/magenta undertones
  buildingBase: { color: 0x14121a, roughness: 0.8, metalness: 0.2, emissive: 0x110018, emissiveIntensity: 0.2 },
  buildingAccent: { color: 0x1c1828, roughness: 0.7, metalness: 0.3, emissive: 0x220033, emissiveIntensity: 0.25 },
  concrete: { color: 0x181620, roughness: 0.85, metalness: 0.15, emissive: 0x0a0810, emissiveIntensity: 0.1 },
  
  // Prop materials - mixed neon hints
  prop: { color: 0x1a1820, roughness: 0.5, metalness: 0.5, emissive: 0x112233, emissiveIntensity: 0.2 },
  vent: { color: 0x161820, roughness: 0.4, metalness: 0.6, emissive: 0x004455, emissiveIntensity: 0.35 },
} as const;
