import { WEAPON_CONFIGS, type FireMode } from "@shared/weapons/weapon-config.js";

export type WeaponFamily =
  | "AssaultRifle"
  | "SMG"
  | "LMG"
  | "Shotgun"
  | "Sniper"
  | "Pistol"
  | "RocketLauncher"
  | "GrenadeLauncher";

export type SocketName =
  | "rail_top"
  | "muzzle"
  | "underbarrel"
  | "magwell"
  | "stock"
  | "grip"
  | "side_left"
  | "side_right";

/** Client-only handling. Gameplay numbers come from the shared server config. */
type HandlingStats = {
  burstCount?: number;
  burstInterval?: number;
  spreadHip: number;
  spreadAds: number;
  recoil: {
    kick: number;
    climb: number;
    returnSpeed: number;
  };
  ads: {
    speed: number;
    fov: number;
  };
};

export type WeaponStats = HandlingStats & {
  rpm: number;
  magSize: number;
  reserveMax: number;
  reloadTime: number;
  fireMode: FireMode;
};

function withServerStats(id: string, handling: HandlingStats): WeaponStats {
  const c = WEAPON_CONFIGS[id]!;
  return {
    ...handling,
    rpm: c.roundsPerMinute,
    magSize: c.magazineSize,
    reserveMax: c.reserveMax,
    reloadTime: c.reloadTime,
    fireMode: c.fireMode,
  };
}

export interface WeaponDefinition {
  id: string;
  name: string;
  family: WeaponFamily;
  stats: WeaponStats;
  attachments: string[];
  colorVariant: "cyan" | "magenta" | "green" | "orange" | "red";
}

export interface AttachmentDefinition {
  id: string;
  name: string;
  mountSocket: SocketName;
  type: "optic" | "muzzle" | "underbarrel" | "magazine" | "stock";
  statMods?: Partial<WeaponStats>;
}

export const WEAPON_DEFINITIONS: Record<string, WeaponDefinition> = {
  AR_1: {
    id: "AR_1",
    name: "AR-1",
    family: "AssaultRifle",
    colorVariant: "cyan",
    attachments: ["HOLO_SIGHT", "COMPENSATOR"],
    stats: withServerStats("AR_1", {
      spreadHip: 2.2,
      spreadAds: 0.6,
      recoil: { kick: 0.14, climb: 0.9, returnSpeed: 11 },
      ads: { speed: 10, fov: 55 }
    })
  },

  SMG_1: {
    id: "SMG_1",
    name: "SMG-1",
    family: "SMG",
    colorVariant: "magenta",
    attachments: ["REFLEX_SIGHT", "SUPPRESSOR"],
    stats: withServerStats("SMG_1", {
      spreadHip: 2.8,
      spreadAds: 1.0,
      recoil: { kick: 0.09, climb: 0.55, returnSpeed: 15 },
      ads: { speed: 14, fov: 60 }
    })
  },

  LMG_1: {
    id: "LMG_1",
    name: "LMG-1",
    family: "LMG",
    colorVariant: "orange",
    attachments: ["HOLO_SIGHT"],
    stats: withServerStats("LMG_1", {
      spreadHip: 3.5,
      spreadAds: 1.2,
      recoil: { kick: 0.18, climb: 1.1, returnSpeed: 7 },
      ads: { speed: 6, fov: 58 }
    })
  },

  SHOTGUN_1: {
    id: "SHOTGUN_1",
    name: "Shotgun-1",
    family: "Shotgun",
    colorVariant: "red",
    attachments: [],
    stats: withServerStats("SHOTGUN_1", {
      spreadHip: 6.0,
      spreadAds: 4.5,
      recoil: { kick: 0.4, climb: 1.5, returnSpeed: 6 },
      ads: { speed: 12, fov: 62 }
    })
  },

  SNIPER_1: {
    id: "SNIPER_1",
    name: "Sniper-1",
    family: "Sniper",
    colorVariant: "green",
    attachments: ["SCOPE_4X"],
    stats: withServerStats("SNIPER_1", {
      spreadHip: 5.0,
      spreadAds: 0.15,
      recoil: { kick: 0.5, climb: 1.8, returnSpeed: 5 },
      ads: { speed: 5, fov: 25 }
    })
  },

  PISTOL_1: {
    id: "PISTOL_1",
    name: "Phantom P-45",
    family: "Pistol",
    colorVariant: "cyan",
    attachments: [],
    stats: withServerStats("PISTOL_1", {
      spreadHip: 1.8,
      spreadAds: 0.5,
      recoil: { kick: 0.2, climb: 0.6, returnSpeed: 14 },
      ads: { speed: 18, fov: 65 }
    })
  },

  ROCKET_1: {
    id: "ROCKET_1",
    name: "Rocket-1",
    family: "RocketLauncher",
    colorVariant: "red",
    attachments: [],
    stats: withServerStats("ROCKET_1", {
      spreadHip: 1.5,
      spreadAds: 0.8,
      recoil: { kick: 0.6, climb: 2.0, returnSpeed: 4 },
      ads: { speed: 6, fov: 50 }
    })
  },

  GL_1: {
    id: "GL_1",
    name: "GL-1",
    family: "GrenadeLauncher",
    colorVariant: "orange",
    attachments: ["REFLEX_SIGHT"],
    stats: withServerStats("GL_1", {
      spreadHip: 2.5,
      spreadAds: 1.5,
      recoil: { kick: 0.35, climb: 1.0, returnSpeed: 6 },
      ads: { speed: 8, fov: 55 }
    })
  }
};

export function resolveWeaponDefinition(weaponId: string): WeaponDefinition | undefined {
  if (WEAPON_DEFINITIONS[weaponId]) return WEAPON_DEFINITIONS[weaponId];
  return undefined;
}

export const ATTACHMENT_DEFINITIONS: Record<string, AttachmentDefinition> = {
  HOLO_SIGHT: {
    id: "HOLO_SIGHT",
    name: "Holo Sight",
    mountSocket: "rail_top",
    type: "optic",
    statMods: {
      spreadAds: 0.5
    }
  },
  
  REFLEX_SIGHT: {
    id: "REFLEX_SIGHT",
    name: "Reflex Sight",
    mountSocket: "rail_top",
    type: "optic",
    statMods: {
      spreadAds: 0.6
    }
  },
  
  SCOPE_4X: {
    id: "SCOPE_4X",
    name: "4x Scope",
    mountSocket: "rail_top",
    type: "optic",
    statMods: {
      spreadAds: 0.2
    }
  },
  
  COMPENSATOR: {
    id: "COMPENSATOR",
    name: "Compensator",
    mountSocket: "muzzle",
    type: "muzzle",
    statMods: {
      recoil: { kick: 0.08, climb: 0.5, returnSpeed: 14 }
    }
  },
  
  SUPPRESSOR: {
    id: "SUPPRESSOR",
    name: "Suppressor",
    mountSocket: "muzzle",
    type: "muzzle",
  },
  
  IRON_SIGHT: {
    id: "IRON_SIGHT",
    name: "Iron Sight",
    mountSocket: "rail_top",
    type: "optic",
    statMods: {
      spreadAds: 0.7
    }
  }
};
