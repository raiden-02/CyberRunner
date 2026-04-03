// Network input message types
export type InputMsg = {
  seq: number;
  moveX: number;
  moveZ: number;
  lookYaw: number;
  lookPitch: number;
  sprint: boolean;
  aiming: boolean;
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
};

export type BreakableDestroyedMsg = {
  id: number;
};

// Spike interaction messages (S&D mode)
export type SpikeActionMsg = {
  action: "upload" | "decrypt" | "pickup" | "cancel";
};

export type SpikeUpdateMsg = {
  state: string;
  carrierId: string;
  terminalId: string;
  uploadProgress: number;
  decryptProgress: number;
  detonationTime: number;
  x: number;
  z: number;
};

export type RoundEndMsg = {
  roundNumber: number;
  winnerId: string;
  winnerName: string;
  winnerTeam: string;
  reason: string; // "elimination" | "spike_detonated" | "spike_decrypted" | "time"
};

// Team selection message
export type TeamSelectMsg = {
  teamId: "ghosts" | "sentinels";
};

// Host control messages
export type StartGameMsg = {};

export type RestartGameMsg = {};

export type DisbandLobbyMsg = {};

// Lobby state update (sent to clients)
export type LobbyStateMsg = {
  lobbyState: "waiting" | "starting" | "playing" | "ended";
  hostId: string;
  ghostPlayers: string[];
  sentinelPlayers: string[];
  canStart: boolean;
};

// Game over with team info
export type GameOverMsg = {
  winnerId: string | null;
  winnerName: string;
  winnerTeam: string;
  gameMode: string;
  ghostsRoundsWon: number;
  sentinelsRoundsWon: number;
};
