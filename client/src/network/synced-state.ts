export type SyncedPlayer = {
  x: number;
  y: number;
  z: number;
  rotationY: number;
  pitch?: number;
  lastProcessedInputSeq?: number;
  health: number;
  maxHealth: number;
  isDead: boolean;
  respawnTime?: number;
  ammoInMag: number;
  ammoReserve: number;
  reloading?: boolean;
  displayName?: string;
  equippedWeapon?: string;
  teamId?: string;
  movementState?: number;
  isSprinting?: boolean;
  isCrouching?: boolean;
  livesRemaining?: number;
  hasSpike?: boolean;
  isUploading?: boolean;
  isDecrypting?: boolean;
};

export type SyncedPlayerMap = {
  get(id: string): SyncedPlayer | undefined;
  forEach(fn: (player: SyncedPlayer, id: string) => void): void;
};

export type SyncedGameState = {
  gameMode?: string;
  scoreLimit?: number;
  timeRemaining?: number;
  isGameOver?: boolean;
  winnerId?: string;
  currentRound?: number;
  roundsToWin?: number;
  roundTimeRemaining?: number;
  isRoundActive?: boolean;
  lobbyState?: string;
  ghostsRoundsWon?: number;
  sentinelsRoundsWon?: number;
  spikeCarrierId?: string;
  spikeState?: string;
  spikeTerminalId?: string;
  spikeUploadProgress?: number;
  spikeDecryptProgress?: number;
  spikeDetonationTimer?: number;
  spikeX?: number;
  spikeZ?: number;
  players?: SyncedPlayerMap;
};
