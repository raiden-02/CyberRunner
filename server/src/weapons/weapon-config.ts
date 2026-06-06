// Weapon configuration for server-authoritative gameplay

export type WeaponType = "hitscan" | "projectile";
export type FireMode = "semi" | "auto" | "burst";

export interface DamageFalloff {
  startRange: number;    // Full damage up to this range (meters)
  endRange: number;      // Minimum damage beyond this range
  minDamagePercent: number; // Percentage of base damage at max range (0.0-1.0)
}

export interface WeaponConfig {
  id: string;
  name: string;
  type: WeaponType;
  damage: number;
  headshotMultiplier: number;
  fireMode: FireMode;
  roundsPerMinute: number;
  range: number;
  magazineSize: number;
  reserveMax: number;
  reloadTime: number;
  equipTime: number;
  
  // Damage falloff - if undefined, no falloff (sniper, etc.)
  damageFalloff?: DamageFalloff;
  
  // Shotgun-specific
  pelletCount?: number;
  spreadAngle?: number;  // Spread cone half-angle in degrees
  
  // Projectile-specific
  projectileSpeed?: number;
  projectileRadius?: number;
  explosionRadius?: number;
  explosionMinDamage?: number; // Damage at edge of explosion radius (percentage 0-1)
}

export const WEAPON_CONFIGS: Record<string, WeaponConfig> = {
  AR_1: {
    id: "AR_1",
    name: "AR-1",
    type: "hitscan",
    damage: 28,
    headshotMultiplier: 1.4,
    fireMode: "auto",
    roundsPerMinute: 700,
    range: 80,
    magazineSize: 30,
    reserveMax: 120,
    reloadTime: 2.3,
    equipTime: 0.5,
    damageFalloff: { startRange: 30, endRange: 60, minDamagePercent: 0.7 }
  },

  SMG_1: {
    id: "SMG_1",
    name: "SMG-1",
    type: "hitscan",
    damage: 20,
    headshotMultiplier: 1.35,
    fireMode: "auto",
    roundsPerMinute: 950,
    range: 45,
    magazineSize: 32,
    reserveMax: 160,
    reloadTime: 1.9,
    equipTime: 0.35,
    damageFalloff: { startRange: 12, endRange: 25, minDamagePercent: 0.5 }
  },

  LMG_1: {
    id: "LMG_1",
    name: "LMG-1",
    type: "hitscan",
    damage: 30,
    headshotMultiplier: 1.35,
    fireMode: "auto",
    roundsPerMinute: 600,
    range: 90,
    magazineSize: 100,
    reserveMax: 200,
    reloadTime: 5.5,
    equipTime: 0.9,
    damageFalloff: { startRange: 35, endRange: 70, minDamagePercent: 0.65 }
  },

  SHOTGUN_1: {
    id: "SHOTGUN_1",
    name: "Shotgun-1",
    type: "hitscan",
    damage: 18,
    pelletCount: 8,
    spreadAngle: 5.0,
    headshotMultiplier: 1.25,
    fireMode: "semi",
    roundsPerMinute: 80,
    range: 18,
    magazineSize: 6,
    reserveMax: 30,
    reloadTime: 0.6,
    equipTime: 0.6,
    damageFalloff: { startRange: 8, endRange: 15, minDamagePercent: 0.25 }
  },

  SNIPER_1: {
    id: "SNIPER_1",
    name: "Sniper-1",
    type: "hitscan",
    damage: 85,
    headshotMultiplier: 2.0,
    fireMode: "semi",
    roundsPerMinute: 45,
    range: 250,
    magazineSize: 5,
    reserveMax: 25,
    reloadTime: 3.2,
    equipTime: 0.8
    // No damageFalloff - snipers maintain damage at range
  },

  PISTOL_1: {
    id: "PISTOL_1",
    name: "Pistol-1",
    type: "hitscan",
    damage: 30,
    headshotMultiplier: 1.5,
    fireMode: "semi",
    roundsPerMinute: 400,
    range: 30,
    magazineSize: 15,
    reserveMax: 75,
    reloadTime: 1.4,
    equipTime: 0.25,
    damageFalloff: { startRange: 15, endRange: 30, minDamagePercent: 0.6 }
  },

  ROCKET_1: {
    id: "ROCKET_1",
    name: "Rocket-1",
    type: "projectile",
    damage: 150,
    headshotMultiplier: 1.0,
    fireMode: "semi",
    roundsPerMinute: 30,
    range: 100,
    magazineSize: 1,
    reserveMax: 4,
    reloadTime: 3.8,
    equipTime: 1.0,
    projectileSpeed: 40,
    projectileRadius: 0.15,
    explosionRadius: 4.5,
    explosionMinDamage: 0.2
  },

  GL_1: {
    id: "GL_1",
    name: "GL-1",
    type: "projectile",
    damage: 110,
    headshotMultiplier: 1.0,
    fireMode: "semi",
    roundsPerMinute: 90,
    range: 70,
    magazineSize: 6,
    reserveMax: 18,
    reloadTime: 3.5,
    equipTime: 0.7,
    projectileSpeed: 25,
    projectileRadius: 0.1,
    explosionRadius: 3.5,
    explosionMinDamage: 0.22
  }
};

export function getWeaponConfig(weaponId: string): WeaponConfig | undefined {
  return WEAPON_CONFIGS[weaponId];
}

export function isValidWeapon(weaponId: string): boolean {
  return weaponId in WEAPON_CONFIGS;
}

/**
 * Calculate damage with range-based falloff
 * Returns multiplier (0.0 - 1.0) to apply to base damage
 */
export function calculateDamageFalloff(distance: number, falloff?: DamageFalloff): number {
  if (!falloff) return 1.0;
  
  if (distance <= falloff.startRange) {
    return 1.0;
  }
  
  if (distance >= falloff.endRange) {
    return falloff.minDamagePercent;
  }
  
  // Linear interpolation between start and end range
  const t = (distance - falloff.startRange) / (falloff.endRange - falloff.startRange);
  return 1.0 - t * (1.0 - falloff.minDamagePercent);
}

/**
 * Calculate explosion damage based on distance from center
 * Uses inverse falloff: full damage at center, min at edge
 */
export function calculateExplosionDamage(
  baseDamage: number,
  distanceFromCenter: number,
  explosionRadius: number,
  minDamagePercent: number = 0.2
): number {
  if (distanceFromCenter >= explosionRadius) {
    return 0;
  }
  
  if (distanceFromCenter <= 0) {
    return baseDamage;
  }
  
  // Linear falloff from center to edge
  const t = distanceFromCenter / explosionRadius;
  const multiplier = 1.0 - t * (1.0 - minDamagePercent);
  return Math.round(baseDamage * multiplier);
}

/**
 * Generate pellet spread directions for shotgun
 * Returns array of direction vectors
 */
export function generatePelletSpread(
  baseDirection: { x: number; y: number; z: number },
  pelletCount: number,
  spreadAngleDegrees: number
): Array<{ x: number; y: number; z: number }> {
  const pellets: Array<{ x: number; y: number; z: number }> = [];
  const spreadRad = (spreadAngleDegrees * Math.PI) / 180;
  
  // Normalize base direction
  const len = Math.sqrt(baseDirection.x ** 2 + baseDirection.y ** 2 + baseDirection.z ** 2);
  const dir = {
    x: baseDirection.x / len,
    y: baseDirection.y / len,
    z: baseDirection.z / len
  };
  
  // Generate perpendicular vectors for rotation
  let up = { x: 0, y: 1, z: 0 };
  if (Math.abs(dir.y) > 0.99) {
    up = { x: 1, y: 0, z: 0 };
  }
  
  // Cross product: right = dir × up
  const right = {
    x: dir.y * up.z - dir.z * up.y,
    y: dir.z * up.x - dir.x * up.z,
    z: dir.x * up.y - dir.y * up.x
  };
  const rightLen = Math.sqrt(right.x ** 2 + right.y ** 2 + right.z ** 2);
  right.x /= rightLen;
  right.y /= rightLen;
  right.z /= rightLen;
  
  // Cross product: up = right × dir
  const actualUp = {
    x: right.y * dir.z - right.z * dir.y,
    y: right.z * dir.x - right.x * dir.z,
    z: right.x * dir.y - right.y * dir.x
  };
  
  for (let i = 0; i < pelletCount; i++) {
    // Random angle and random distance from center (weighted toward center)
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * spreadRad;
    
    const offsetX = Math.cos(angle) * Math.sin(distance);
    const offsetY = Math.sin(angle) * Math.sin(distance);
    
    // Apply offset in the perpendicular plane
    const pelletDir = {
      x: dir.x + right.x * offsetX + actualUp.x * offsetY,
      y: dir.y + right.y * offsetX + actualUp.y * offsetY,
      z: dir.z + right.z * offsetX + actualUp.z * offsetY
    };
    
    // Normalize
    const pLen = Math.sqrt(pelletDir.x ** 2 + pelletDir.y ** 2 + pelletDir.z ** 2);
    pellets.push({
      x: pelletDir.x / pLen,
      y: pelletDir.y / pLen,
      z: pelletDir.z / pLen
    });
  }
  
  return pellets;
}
