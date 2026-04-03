import { GameState } from "../GameState.js";
import { PlayerState } from "../PlayerState.js";
import { GAME_MODES } from "./game-mode-config.js";
import { BaseGameMode, RoundEndResult } from "./base-game-mode.js";

export class DeathmatchMode extends BaseGameMode {
  constructor() {
    super(GAME_MODES.deathmatch);
  }

  update(
    dt: number,
    gameState: GameState,
    _players: Map<string, { schema: PlayerState }>
  ): RoundEndResult {
    if (this.config.timeLimit > 0 && !this.isGameOver) {
      this.gameTimeRemaining -= dt;
      gameState.timeRemaining = Math.max(0, Math.floor(this.gameTimeRemaining));
      
      if (this.gameTimeRemaining <= 0) {
        this.gameTimeRemaining = 0;
        return this.endByTime(_players);
      }
    }

    return { ended: false };
  }

  onPlayerDeath(
    victimId: string,
    killerId: string | null,
    _gameState: GameState,
    _players: Map<string, { schema: PlayerState }>
  ): { livesRemaining: number; roundEnd?: RoundEndResult } {
    const victimState = this.playerStates.get(victimId);
    if (!victimState) return { livesRemaining: 0 };

    victimState.roundDeaths++;

    if (killerId && killerId !== victimId) {
      const killerState = this.playerStates.get(killerId);
      if (killerState) {
        killerState.roundKills++;
      }
    }

    return { livesRemaining: 999 };
  }

  canRespawn(_sessionId: string): boolean {
    return true;
  }

  private endByTime(
    players: Map<string, { schema: PlayerState }>
  ): RoundEndResult {
    let topKiller: string | null = null;
    let topKills = -1;

    for (const [sessionId, player] of players) {
      if (player.schema.kills > topKills) {
        topKills = player.schema.kills;
        topKiller = sessionId;
      }
    }

    if (topKiller) {
      this.endGame(topKiller);
      return { ended: true, winnerId: topKiller, reason: "time" };
    }

    return { ended: false };
  }
}
