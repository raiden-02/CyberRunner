// Weapon configuration for server-authoritative gameplay

export type WeaponType = "hitscan" | "projectile";
export type FireMode = "semi" | "auto" | "burst";

export interface WeaponConfig {
  id: string;
  name: string;
  type: WeaponType;
  damage: number;
  headshotMultiplier: number;
  fireMode: FireMode;
  roundsPerMinute: number; // Rate of fire
  range: number; // Maximum effective range in meters
  magazineSize: number;
  reserveMax: number;
  reloadTime: number; // seconds
  equipTime: number; // seconds
  
  // Optional projectile-specific properties
  projectileSpeed?: number;
  projectileRadius?: number;
  projectileLength?: number;
  explosionRadius?: number;
}

// Weapon database
export const WEAPON_CONFIGS: Record<string, WeaponConfig> = {
  AR_1: {
    id: "AR_1",
    name: "SMG",
    type: "hitscan",
    damage: 18,
    headshotMultiplier: 2.0,
    fireMode: "auto",
    roundsPerMinute: 720, // 12 shots/sec
    range: 50,
    magazineSize: 25,
    reserveMax: 100,
    reloadTime: 2.0,
    equipTime: 0.5
  },
  
  Pistol_1: {
    id: "Pistol_1",
    name: "Pistol",
    type: "hitscan",
    damage: 25,
    headshotMultiplier: 2.5,
    fireMode: "semi",
    roundsPerMinute: 300, // 5 shots/sec
    range: 30,
    magazineSize: 12,
    reserveMax: 60,
    reloadTime: 1.5,
    equipTime: 0.3
  },
  
  AR_2: {
    id: "AR_2",
    name: "Assault Rifle",
    type: "hitscan",
    damage: 22,
    headshotMultiplier: 2.0,
    fireMode: "auto",
    roundsPerMinute: 600, // 10 shots/sec
    range: 75,
    magazineSize: 30,
    reserveMax: 120,
    reloadTime: 2.5,
    equipTime: 0.6
  },
  
  Sniper_1: {
    id: "Sniper_1",
    name: "Sniper Rifle",
    type: "hitscan",
    damage: 90,
    headshotMultiplier: 3.0,
    fireMode: "semi",
    roundsPerMinute: 60, // 1 shot/sec
    range: 200,
    magazineSize: 10,
    reserveMax: 40,
    reloadTime: 3.5,
    equipTime: 1.0
  }
};

export function getWeaponConfig(weaponId: string): WeaponConfig | undefined {
  return WEAPON_CONFIGS[weaponId];
}

export function isValidWeapon(weaponId: string): boolean {
  return weaponId in WEAPON_CONFIGS;
}
