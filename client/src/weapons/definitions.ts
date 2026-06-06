export type FireMode = "semi" | "auto" | "burst";

export type WeaponFamily =
  | "AssaultRifle"
  | "SMG"
  | "LMG"
  | "Shotgun"
  | "DMR"
  | "Sniper"
  | "Pistol"
  | "MachinePistol"
  | "Launcher"
  | "RocketLauncher"
  | "GrenadeLauncher"
  | "Melee"
  | "Energy"
  | "Charge"
  | "Beam"
  | "Bow";

export type SocketName =
  | "rail_top"
  | "muzzle"
  | "underbarrel"
  | "magwell"
  | "stock"
  | "grip"
  | "side_left"
  | "side_right";

export interface WeaponStats {
  rpm: number;
  damage: number;
  range: number;
  magSize: number;
  reserveMax: number;
  reloadTime: number;
  fireMode: FireMode;
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
  // Shotgun-specific
  pelletCount?: number;
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
    stats: {
      rpm: 700,
      damage: 26,
      range: 80,
      magSize: 30,
      reserveMax: 120,
      reloadTime: 2.3,
      fireMode: "auto",
      spreadHip: 2.2,
      spreadAds: 0.6,
      recoil: { kick: 0.14, climb: 0.9, returnSpeed: 11 },
      ads: { speed: 10, fov: 55 }
    }
  },

  SMG_1: {
    id: "SMG_1",
    name: "SMG-1",
    family: "SMG",
    colorVariant: "magenta",
    attachments: ["REFLEX_SIGHT", "SUPPRESSOR"],
    stats: {
      rpm: 950,
      damage: 17,
      range: 45,
      magSize: 32,
      reserveMax: 160,
      reloadTime: 1.9,
      fireMode: "auto",
      spreadHip: 2.8,
      spreadAds: 1.0,
      recoil: { kick: 0.09, climb: 0.55, returnSpeed: 15 },
      ads: { speed: 14, fov: 60 }
    }
  },

  LMG_1: {
    id: "LMG_1",
    name: "LMG-1",
    family: "LMG",
    colorVariant: "orange",
    attachments: ["HOLO_SIGHT"],
    stats: {
      rpm: 600,
      damage: 28,
      range: 90,
      magSize: 100,
      reserveMax: 200,
      reloadTime: 5.5,
      fireMode: "auto",
      spreadHip: 3.5,
      spreadAds: 1.2,
      recoil: { kick: 0.18, climb: 1.1, returnSpeed: 7 },
      ads: { speed: 6, fov: 58 }
    }
  },

  SHOTGUN_1: {
    id: "SHOTGUN_1",
    name: "Shotgun-1",
    family: "Shotgun",
    colorVariant: "red",
    attachments: [],
    stats: {
      rpm: 80,
      damage: 15, // per pellet
      pelletCount: 8,
      range: 18,
      magSize: 6,
      reserveMax: 30,
      reloadTime: 0.6, // per shell
      fireMode: "semi",
      spreadHip: 6.0,
      spreadAds: 4.5,
      recoil: { kick: 0.4, climb: 1.5, returnSpeed: 6 },
      ads: { speed: 12, fov: 62 }
    }
  },

  SNIPER_1: {
    id: "SNIPER_1",
    name: "Sniper-1",
    family: "Sniper",
    colorVariant: "green",
    attachments: ["SCOPE_4X"],
    stats: {
      rpm: 45,
      damage: 95,
      range: 250,
      magSize: 5,
      reserveMax: 25,
      reloadTime: 3.2,
      fireMode: "semi",
      spreadHip: 5.0,
      spreadAds: 0.15,
      recoil: { kick: 0.5, climb: 1.8, returnSpeed: 5 },
      ads: { speed: 5, fov: 25 }
    }
  },

  PISTOL_1: {
    id: "PISTOL_1",
    name: "Phantom P-45",
    family: "Pistol",
    colorVariant: "cyan",
    attachments: [],
    stats: {
      rpm: 400,
      damage: 28,
      range: 30,
      magSize: 15,
      reserveMax: 75,
      reloadTime: 1.4,
      fireMode: "semi",
      spreadHip: 1.8,
      spreadAds: 0.5,
      recoil: { kick: 0.2, climb: 0.6, returnSpeed: 14 },
      ads: { speed: 18, fov: 65 }
    }
  },

  ROCKET_1: {
    id: "ROCKET_1",
    name: "Rocket-1",
    family: "RocketLauncher",
    colorVariant: "red",
    attachments: [],
    stats: {
      rpm: 30,
      damage: 150,
      range: 100,
      magSize: 1,
      reserveMax: 4,
      reloadTime: 3.8,
      fireMode: "semi",
      spreadHip: 1.5,
      spreadAds: 0.8,
      recoil: { kick: 0.6, climb: 2.0, returnSpeed: 4 },
      ads: { speed: 6, fov: 50 }
    }
  },

  GL_1: {
    id: "GL_1",
    name: "GL-1",
    family: "GrenadeLauncher",
    colorVariant: "orange",
    attachments: ["REFLEX_SIGHT"],
    stats: {
      rpm: 90,
      damage: 110,
      range: 70,
      magSize: 6,
      reserveMax: 18,
      reloadTime: 3.5,
      fireMode: "semi",
      spreadHip: 2.5,
      spreadAds: 1.5,
      recoil: { kick: 0.35, climb: 1.0, returnSpeed: 6 },
      ads: { speed: 8, fov: 55 }
    }
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
    statMods: {
      range: 40
    }
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
