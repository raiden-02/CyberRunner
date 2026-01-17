// Network input message types
export type InputMsg = {
  // Client input sequence number (monotonic increasing).
  // Used for server->client ack so the client can reconcile via rewind+replay.
  seq: number;
  // axes in local space
  moveX: number; // strafe -1..1 (A/D keys)
  moveZ: number; // forward -1..1 (W/S keys)
  lookYaw: number; // radians/world yaw (for forward dir)
  lookPitch: number; // radians/camera pitch (up/down look)
  sprint: boolean;
  crouchPressed: boolean;
  crouchReleased: boolean;
  crouchHeld: boolean;
  jumpPressed: boolean;
  dashPressed: boolean;
};

// Weapon messages
export type WeaponSwitchMsg = {
  weaponId: string;
};

// Firing messages
export type FireInputMsg = {
  firing: boolean; // true = start firing, false = stop firing
  aimDir: { x: number; y: number; z: number }; // normalized aim direction
};

export type ReloadInputMsg = {
  weaponId: string; // Weapon to reload
};

export type ShotFiredMsg = {
  shooterId: string;
  weaponId: string;
  origin: { x: number; y: number; z: number };
  direction: { x: number; y: number; z: number };
  timestamp: number;
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
};

