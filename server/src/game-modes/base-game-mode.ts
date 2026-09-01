import { GameState } from "../GameState.js";
import { PlayerState } from "../PlayerState.js";
import { GameModeConfig, GameModeId } from "./game-mode-config.js";

export interface PlayerModeState {
  livesRemaining: number;
  roundKills: number;
  roundDeaths: number;
  roundsWon: number;
}

export interface RoundState {
  roundNumber: number;
  roundStartTime: number;
  roundTimeRemaining: number;
  isRoundActive: boolean;
  roundWinner: string | null;
}

export interface RoundEndResult {
  ended: boolean;
  winnerId?: string | null;
  winnerTeam?: string;
  reason?: string;
}

export abstract class BaseGameMode {
  protected config: GameModeConfig;
  protected playerStates = new Map<string, PlayerModeState>();
  protected roundState: RoundState;
  protected gameStartTime: number = 0;
  protected gameTimeRemaining: number = 0;
  protected isGameOver: boolean = false;
  protected gameWinner: string | null = null;

  constructor(config: GameModeConfig) {
    this.config = config;
    this.roundState = {
      roundNumber: 1,
      roundStartTime: 0,
      roundTimeRemaining: config.roundTimeLimit,
      isRoundActive: false,
      roundWinner: null,
    };
    this.gameTimeRemaining = config.timeLimit;
  }

  getModeId(): GameModeId {
    return this.config.id;
  }

  getConfig(): GameModeConfig {
    return this.config;
  }

  addPlayer(sessionId: string): void {
    this.playerStates.set(sessionId, {
      livesRemaining: this.config.maxLives || 999,
      roundKills: 0,
      roundDeaths: 0,
      roundsWon: 0,
    });
  }

  removePlayer(sessionId: string): void {
    this.playerStates.delete(sessionId);
  }

  startGame(): void {
    this.gameStartTime = Date.now();
    this.gameTimeRemaining = this.config.timeLimit;
    this.isGameOver = false;
    this.gameWinner = null;

    if (this.config.roundBased) {
      this.startRound();
    } else {
      // Deathmatch has no inter-round. The room copies this flag every tick.
      this.roundState.isRoundActive = true;
    }
  }

  startRound(): void {
    this.roundState.roundStartTime = Date.now();
    this.roundState.roundTimeRemaining = this.config.roundTimeLimit;
    this.roundState.isRoundActive = true;
    this.roundState.roundWinner = null;

    for (const [_, state] of this.playerStates) {
      state.livesRemaining = this.config.maxLives || 999;
      state.roundKills = 0;
      state.roundDeaths = 0;
    }
  }

  stopRound(): void {
    this.roundState.isRoundActive = false;
  }

  abstract update(
    dt: number,
    gameState: GameState,
    players: Map<string, { schema: PlayerState }>
  ): RoundEndResult;

  abstract onPlayerDeath(
    victimId: string,
    killerId: string | null,
    gameState: GameState,
    players: Map<string, { schema: PlayerState }>
  ): { livesRemaining: number; roundEnd?: RoundEndResult };

  abstract canRespawn(sessionId: string): boolean;

  getRoundState(): RoundState {
    return this.roundState;
  }

  isGameEnded(): boolean {
    return this.isGameOver;
  }

  getWinner(): string | null {
    return this.gameWinner;
  }

  endGame(winnerId: string | null): void {
    this.isGameOver = true;
    this.gameWinner = winnerId;
  }

  checkScoreWin(sessionId: string, kills: number): boolean {
    if (this.config.scoreLimit > 0 && kills >= this.config.scoreLimit) {
      this.endGame(sessionId);
      return true;
    }
    return false;
  }

  protected getPlayerState(sessionId: string): PlayerModeState | undefined {
    return this.playerStates.get(sessionId);
  }
}
