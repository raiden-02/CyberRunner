export type GameModeId = "deathmatch" | "search_destroy";

export interface GameModeConfig {
  id: GameModeId;
  name: string;
  description: string;
  maxLives: number;
  respawnDelay: number;
  scoreLimit: number;
  timeLimit: number;
  roundsToWin: number;
  roundBased: boolean;
  roundTimeLimit: number;
  teamBased: boolean;
}

export const GAME_MODES: Record<GameModeId, GameModeConfig> = {
  deathmatch: {
    id: "deathmatch",
    name: "Deathmatch",
    description: "Free-for-all. First to 5 kills wins.",
    maxLives: 0,
    respawnDelay: 3,
    scoreLimit: 5,
    timeLimit: 600,
    roundsToWin: 0,
    roundBased: false,
    roundTimeLimit: 0,
    teamBased: false,
  },
  search_destroy: {
    id: "search_destroy",
    name: "Search & Destroy",
    description: "Team-based. Ghosts upload the spike, Sentinels decrypt it. First to 3 rounds wins.",
    maxLives: 3,
    respawnDelay: 3,
    scoreLimit: 0,
    timeLimit: 0,
    roundsToWin: 3,
    roundBased: true,
    roundTimeLimit: 90,
    teamBased: true,
  },
};

export function getGameModeConfig(modeId: GameModeId): GameModeConfig {
  return GAME_MODES[modeId] || GAME_MODES.deathmatch;
}

export function isValidGameMode(modeId: string): modeId is GameModeId {
  return modeId in GAME_MODES;
}
