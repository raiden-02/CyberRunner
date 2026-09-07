import { GameState } from "../GameState.js";
import { PlayerState } from "../PlayerState.js";
import { GAME_MODES } from "./game-mode-config.js";
import { BaseGameMode, RoundEndResult } from "./base-game-mode.js";

/** Walk a map. No score, rounds, lobby, or victory. */
export class ExploreMode extends BaseGameMode {
  constructor() {
    super(GAME_MODES.explore);
  }

  override startGame(): void {
    super.startGame();
    this.roundState.isRoundActive = true;
    this.isGameOver = false;
    this.gameWinner = null;
  }

  update(
    _dt: number,
    gameState: GameState,
    _players: Map<string, { schema: PlayerState }>,
  ): RoundEndResult {
    gameState.timeRemaining = 0;
    gameState.isGameOver = false;
    gameState.winnerId = "";
    return { ended: false };
  }

  onPlayerDeath(
    victimId: string,
    _killerId: string | null,
    _gameState: GameState,
    _players: Map<string, { schema: PlayerState }>,
  ): { livesRemaining: number; roundEnd?: RoundEndResult } {
    const victimState = this.playerStates.get(victimId);
    if (!victimState) return { livesRemaining: 0 };
    return { livesRemaining: 999 };
  }

  canRespawn(_sessionId: string): boolean {
    return true;
  }
}
