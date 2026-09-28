// Weapon messages
export type WeaponSwitchMsg = {
  weaponId: string;
};

export type ReloadInputMsg = {
  weaponId: string; // Weapon to reload
};

export type BodyPartHit = "head" | "upperTorso" | "lowerTorso" | "leftArm" | "rightArm" | "leftLeg" | "rightLeg";

export type ShotFiredMsg = {
  shooterId: string;
  weaponId: string;
  origin: { x: number; y: number; z: number };
  direction: { x: number; y: number; z: number };
  timestamp: number;
  bodyPart?: BodyPartHit;
};

// Damage and health messages
export type DamageMsg = {
  targetId: string;
  amount: number;
  damageType: "projectile" | "hitscan" | "explosion";
  sourceId?: string; // Optional attacker ID
  weaponId?: string; // Optional weapon used
};

export type HealthChangeMsg = {
  playerId: string;
  newHealth: number;
  maxHealth: number;
  isDead: boolean;
  respawnTime?: number;
  bodyPart?: BodyPartHit;
  isHeadshot?: boolean;
  attackerId?: string;
  damage?: number;
};

// Spike interaction messages (S&D mode)
export type SpikeActionMsg = {
  action: "upload" | "decrypt" | "pickup" | "cancel";
};

// Team selection message
export type TeamSelectMsg = {
  teamId: "ghosts" | "sentinels";
};
