// Weapon configuration for server-authoritative gameplay
// All values are AAA-balanced for competitive multiplayer

export type WeaponType = "hitscan" | "projectile";
export type FireMode = "semi" | "auto" | "burst";

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
  
  // Shotgun-specific
  pelletCount?: number;
  
  // Projectile-specific
  projectileSpeed?: number;
  projectileRadius?: number;
  explosionRadius?: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// WEAPON DATABASE - Server authoritative stats
// ═══════════════════════════════════════════════════════════════════════════

export const WEAPON_CONFIGS: Record<string, WeaponConfig> = {
  // ─────────────────────────────────────────────────────────────────────────
  // ASSAULT RIFLE - Balanced all-rounder
  // TTK: ~400ms (4 body shots at 700 RPM)
  // ─────────────────────────────────────────────────────────────────────────
  AR_1: {
    id: "AR_1",
    name: "Axiom AR-7",
    type: "hitscan",
    damage: 26,
    headshotMultiplier: 2.0,
    fireMode: "auto",
    roundsPerMinute: 700,
    range: 80,
    magazineSize: 30,
    reserveMax: 120,
    reloadTime: 2.3,
    equipTime: 0.5
  },

  // ─────────────────────────────────────────────────────────────────────────
  // SMG - High ROF, close quarters
  // TTK: ~380ms (6 body shots at 950 RPM)
  // ─────────────────────────────────────────────────────────────────────────
  SMG_1: {
    id: "SMG_1",
    name: "Viper MK-9",
    type: "hitscan",
    damage: 17,
    headshotMultiplier: 1.8,
    fireMode: "auto",
    roundsPerMinute: 950,
    range: 45,
    magazineSize: 32,
    reserveMax: 160,
    reloadTime: 1.9,
    equipTime: 0.35
  },

  // ─────────────────────────────────────────────────────────────────────────
  // LMG - Suppressive fire, sustained damage
  // TTK: ~500ms (4 body shots at 600 RPM)
  // ─────────────────────────────────────────────────────────────────────────
  LMG_1: {
    id: "LMG_1",
    name: "Thunderclap T-200",
    type: "hitscan",
    damage: 28,
    headshotMultiplier: 1.8,
    fireMode: "auto",
    roundsPerMinute: 600,
    range: 90,
    magazineSize: 100,
    reserveMax: 200,
    reloadTime: 5.5,
    equipTime: 0.9
  },

  // ─────────────────────────────────────────────────────────────────────────
  // SHOTGUN - Devastating close range
  // TTK: Instant if 5+ pellets hit (8 pellets × 15 = 120 max)
  // ─────────────────────────────────────────────────────────────────────────
  SHOTGUN_1: {
    id: "SHOTGUN_1",
    name: "Havoc S-12",
    type: "hitscan",
    damage: 15,
    pelletCount: 8,
    headshotMultiplier: 1.5,
    fireMode: "semi",
    roundsPerMinute: 80,
    range: 18,
    magazineSize: 6,
    reserveMax: 30,
    reloadTime: 0.6, // per shell
    equipTime: 0.6
  },

  // ─────────────────────────────────────────────────────────────────────────
  // SNIPER - One shot potential
  // TTK: Instant on headshot, 2-shot body
  // ─────────────────────────────────────────────────────────────────────────
  SNIPER_1: {
    id: "SNIPER_1",
    name: "Specter SR-X",
    type: "hitscan",
    damage: 95,
    headshotMultiplier: 2.5,
    fireMode: "semi",
    roundsPerMinute: 45,
    range: 250,
    magazineSize: 5,
    reserveMax: 25,
    reloadTime: 3.2,
    equipTime: 0.8
  },

  // ─────────────────────────────────────────────────────────────────────────
  // PISTOL - Reliable sidearm
  // TTK: ~450ms (4 body shots at 400 RPM)
  // ─────────────────────────────────────────────────────────────────────────
  PISTOL_1: {
    id: "PISTOL_1",
    name: "Phantom P-45",
    type: "hitscan",
    damage: 28,
    headshotMultiplier: 2.2,
    fireMode: "semi",
    roundsPerMinute: 400,
    range: 30,
    magazineSize: 15,
    reserveMax: 75,
    reloadTime: 1.4,
    equipTime: 0.25
  },

  // ─────────────────────────────────────────────────────────────────────────
  // ROCKET LAUNCHER - Area denial, vehicle killer
  // Direct hit = instant kill, splash damage scales with distance
  // ─────────────────────────────────────────────────────────────────────────
  ROCKET_1: {
    id: "ROCKET_1",
    name: "Oblivion RL-X",
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
    projectileRadius: 0.1,
    explosionRadius: 4.0
  },

  // ─────────────────────────────────────────────────────────────────────────
  // GRENADE LAUNCHER - Explosive utility
  // Indirect fire, area denial
  // ─────────────────────────────────────────────────────────────────────────
  GL_1: {
    id: "GL_1",
    name: "Rift GL-6",
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
    projectileRadius: 0.08,
    explosionRadius: 3.0
  }
};

export function getWeaponConfig(weaponId: string): WeaponConfig | undefined {
  return WEAPON_CONFIGS[weaponId];
}

export function isValidWeapon(weaponId: string): boolean {
  return weaponId in WEAPON_CONFIGS;
}
