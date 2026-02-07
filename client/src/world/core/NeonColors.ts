/**
 * SHARED NEON COLOR DEFINITIONS
 * Centralized color palette for all cyberpunk maps.
 */
import * as THREE from "three";

export interface NeonColorConfig {
  color: number;
  emissive: number;
  intensity: number;
}

export type NeonColorKey = 
  | "cyan" 
  | "magenta" 
  | "pink" 
  | "green" 
  | "orange" 
  | "purple" 
  | "teal" 
  | "blue"
  | "red"
  | "yellow"
  | "white";

/**
 * Centralized neon color palette.
 * All maps should use these colors for consistency.
 */
export const NEON_PALETTE: Record<NeonColorKey, NeonColorConfig> = {
  cyan:    { color: 0x00aaaa, emissive: 0x00ffff, intensity: 3.0 },
  magenta: { color: 0xaa00aa, emissive: 0xff00ff, intensity: 3.0 },
  pink:    { color: 0xcc4488, emissive: 0xff6699, intensity: 2.8 },
  green:   { color: 0x00aa66, emissive: 0x00ff88, intensity: 2.5 },
  orange:  { color: 0xcc6600, emissive: 0xff8800, intensity: 2.5 },
  purple:  { color: 0x6600aa, emissive: 0x9900ff, intensity: 2.8 },
  teal:    { color: 0x008888, emissive: 0x00cccc, intensity: 2.6 },
  blue:    { color: 0x0066aa, emissive: 0x0088ff, intensity: 2.6 },
  red:     { color: 0xaa2222, emissive: 0xff3333, intensity: 2.8 },
  yellow:  { color: 0xaaaa00, emissive: 0xffff00, intensity: 2.4 },
  white:   { color: 0xaaaaaa, emissive: 0xffffff, intensity: 2.0 },
};

/**
 * Get a neon color config by key
 */
export function getNeonColor(key: NeonColorKey): NeonColorConfig {
  return NEON_PALETTE[key];
}

/**
 * Create a THREE.Color from a neon color key (base color)
 */
export function getNeonBaseColor(key: NeonColorKey): THREE.Color {
  return new THREE.Color(NEON_PALETTE[key].color);
}

/**
 * Create a THREE.Color from a neon color key (emissive color)
 */
export function getNeonEmissiveColor(key: NeonColorKey): THREE.Color {
  return new THREE.Color(NEON_PALETTE[key].emissive);
}
