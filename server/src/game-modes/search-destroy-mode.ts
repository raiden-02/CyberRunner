import { GameState } from "../GameState.js";
import { PlayerState } from "../PlayerState.js";
import { GAME_MODES } from "./game-mode-config.js";
import { BaseGameMode, RoundEndResult } from "./base-game-mode.js";
import { SpikeManager } from "./spike-manager.js";
import { TeamManager, TeamId } from "./team-manager.js";
import type { UploadTerminal } from "../world/maps/map-types.js";

export class SearchDestroyMode extends BaseGameMode {
  private spikeManager: SpikeManager;
  private teamManager: TeamManager;

  constructor(terminals: UploadTerminal[] = []) {
    super(GAME_MODES.search_destroy);
    this.spikeManager = new SpikeManager(terminals);
    this.teamManager = new TeamManager(4);
  }

  getSpikeManager(): SpikeManager {
    return this.spikeManager;
  }

  getTeamManager(): TeamManager {
    return this.teamManager;
  }

  setTerminals(terminals: UploadTerminal[]): void {
    this.spikeManager.setTerminals(terminals);
  }

  update(
    dt: number,
    gameState: GameState,
    players: Map<string, { schema: PlayerState }>
  ): RoundEndResult {
    if (!this.roundState.isRoundActive) {
      return { ended: false };
    }

    this.roundState.roundTimeRemaining -= dt;
    gameState.roundTimeRemaining = Math.max(0, Math.floor(this.roundState.roundTimeRemaining));

    const spikeResult = this.spikeManager.update(dt, gameState, players);
    if (spikeResult.ended) {
      if (spikeResult.reason === "spike_detonated") {
        return { ended: true, winnerTeam: "ghosts", reason: "spike_detonated" };
      } else if (spikeResult.reason === "spike_decrypted") {
        return { ended: true, winnerTeam: "sentinels", reason: "spike_decrypted" };
      }
    }

    const spikePlanted = gameState.spikeState === "uploaded" || 
                         gameState.spikeState === "decrypting";
    if (this.roundState.roundTimeRemaining <= 0 && !spikePlanted) {
      return { ended: true, winnerTeam: "sentinels", reason: "time" };
    }

    return { ended: false };
  }

  onPlayerDeath(
    victimId: string,
    killerId: string | null,
    gameState: GameState,
    players: Map<string, { schema: PlayerState }>
  ): { livesRemaining: number; roundEnd?: RoundEndResult } {
    const victimState = this.playerStates.get(victimId);
    if (!victimState) return { livesRemaining: 0 };

    victimState.roundDeaths++;

    if (this.config.maxLives > 0) {
      victimState.livesRemaining = Math.max(0, victimState.livesRemaining - 1);
    }

    if (killerId && killerId !== victimId) {
      const killerState = this.playerStates.get(killerId);
      if (killerState) {
        killerState.roundKills++;
      }
    }

    this.teamManager.onPlayerDeath(victimId);

    const victim = players.get(victimId);
    if (victim?.schema.hasSpike) {
      this.spikeManager.onCarrierDeath(victimId, killerId, gameState, players);
    }

    const roundEnd = this.checkElimination(gameState, players);

    return { livesRemaining: victimState.livesRemaining, roundEnd };
  }

  canRespawn(sessionId: string): boolean {
    const state = this.playerStates.get(sessionId);
    if (!state) return false;
    if (this.config.maxLives > 0 && state.livesRemaining <= 0) return false;
    return true;
  }

  onPlayerRespawn(sessionId: string): void {
    this.teamManager.onPlayerRespawn(sessionId);
  }

  private checkElimination(
    gameState: GameState,
    players: Map<string, { schema: PlayerState }>
  ): RoundEndResult | undefined {
    if (!this.roundState.isRoundActive) return undefined;

    const getPlayerLives = (sessionId: string): number => {
      const player = players.get(sessionId);
      return player ? player.schema.livesRemaining : 0;
    };

    const spikePlanted = gameState.spikeState === "uploaded" || 
                         gameState.spikeState === "decrypting";

    const ghostsEliminated = this.teamManager.isTeamEliminated("ghosts", getPlayerLives);
    const sentinelsEliminated = this.teamManager.isTeamEliminated("sentinels", getPlayerLives);

    if (sentinelsEliminated) {
      return { ended: true, winnerTeam: "ghosts", reason: "elimination" };
    }

    // Sentinels win by elimination only if spike NOT planted
    if (ghostsEliminated && !spikePlanted) {
      return { ended: true, winnerTeam: "sentinels", reason: "elimination" };
    }

    return undefined;
  }

  override startRound(): void {
    super.startRound();
    this.teamManager.startRound();
  }

  resetForNewRound(gameState: GameState): void {
    this.spikeManager.reset(gameState);
    this.startRound();
  }

  resetGame(gameState: GameState): void {
    this.teamManager.resetGame();
    this.spikeManager.reset(gameState);
    this.isGameOver = false;
    this.gameWinner = null;
  }

  spawnSpikeOnGround(gameState: GameState, spawnLocation: { x: number; z: number }): void {
    gameState.spikeState = "ground";
    gameState.spikeX = spawnLocation.x;
    gameState.spikeZ = spawnLocation.z;
    gameState.spikeCarrierId = "";
    gameState.spikeTerminalId = "";
    gameState.spikeUploadProgress = 0;
    gameState.spikeDecryptProgress = 0;
  }
}
