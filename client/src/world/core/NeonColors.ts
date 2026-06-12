/**
 * District lighting colors — sodium, copper, muted teal.
 * Signs glow; surfaces do not.
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

export const NEON_PALETTE: Record<NeonColorKey, NeonColorConfig> = {
  cyan:    { color: 0x3d6e70, emissive: 0x4a8b8a, intensity: 1.1 },
  magenta: { color: 0x7a4a52, emissive: 0xa06068, intensity: 0.9 },
  pink:    { color: 0x8a5a52, emissive: 0xb07068, intensity: 0.9 },
  green:   { color: 0x4a6a48, emissive: 0x5a7a54, intensity: 0.8 },
  orange:  { color: 0xb07030, emissive: 0xd4893a, intensity: 1.4 },
  purple:  { color: 0x5a4a58, emissive: 0x6a5a68, intensity: 0.7 },
  teal:    { color: 0x3d6e70, emissive: 0x4a8b8a, intensity: 1.0 },
  blue:    { color: 0x4a5a68, emissive: 0x5a6a78, intensity: 0.8 },
  red:     { color: 0x8a3a2e, emissive: 0xc45c3a, intensity: 1.1 },
  yellow:  { color: 0xb08a3a, emissive: 0xd4b05a, intensity: 1.0 },
  white:   { color: 0xc8c0b4, emissive: 0xede6d9, intensity: 0.9 },
};

export function getNeonColor(key: NeonColorKey): NeonColorConfig {
  return NEON_PALETTE[key];
}

export function getNeonBaseColor(key: NeonColorKey): THREE.Color {
  return new THREE.Color(NEON_PALETTE[key].color);
}

export function getNeonEmissiveColor(key: NeonColorKey): THREE.Color {
  return new THREE.Color(NEON_PALETTE[key].emissive);
}
