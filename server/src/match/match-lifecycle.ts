import type { GameState } from "../GameState.js";
import { refillAmmo, type PlayerRuntime } from "../player-runtime.js";
import { startingLives } from "../game-modes/game-mode-config.js";
import {
  BaseGameMode,
  SearchDestroyMode,
  type TeamId,
} from "../game-modes/index.js";
import { calculateSpawnFacing } from "@shared/world/map-types.js";
import type { GameplayMapDefinition } from "@shared/world/map-types.js";

export type MatchBroadcast = (type: string, message?: unknown) => void;

export type MatchRoomAccess = {
  state: GameState;
  players: Map<string, PlayerRuntime>;
  clients: Array<{ sessionId: string }>;
  hostId: string;
  gameMode: BaseGameMode;
  getSDMode: () => SearchDestroyMode | null;
  broadcast: MatchBroadcast;
  setHostId: (id: string) => void;
  schedule: (fn: () => void, ms: number) => void;
  placePlayerAt: (player: PlayerRuntime, x: number, y: number, z: number) => void;
  pickSpawnPoint: (sessionId?: string) => { x: number; y: number; z: number };
  map: GameplayMapDefinition;
};

export class MatchLifecycle {
  constructor(private readonly room: MatchRoomAccess) {}

  broadcastLobbyState(): void {
    const sdMode = this.room.getSDMode();
    if (!sdMode) return;

    const teamManager = sdMode.getTeamManager();
    this.room.broadcast("lobby_state", {
      lobbyState: this.room.state.lobbyState,
      hostId: this.room.hostId,
      ghostPlayers: teamManager.getTeamPlayers("ghosts"),
      sentinelPlayers: teamManager.getTeamPlayers("sentinels"),
      canStart: teamManager.canStartGame(),
      ghostsRoundsWon: this.room.state.ghostsRoundsWon,
      sentinelsRoundsWon: this.room.state.sentinelsRoundsWon,
    });
  }

  transferHost(): void {
    const remainingClients = this.room.clients.filter((c) => c.sessionId !== this.room.hostId);
    if (remainingClients.length > 0) {
      const newHostId = remainingClients[0].sessionId;
      this.room.setHostId(newHostId);
      this.room.broadcast("host_changed", { newHostId });
    }
  }

  startTeamGame(): void {
    const sdMode = this.room.getSDMode();
    if (!sdMode) return;

    this.room.state.lobbyState = "playing";
    this.room.state.isRoundActive = true;
    this.room.state.currentRound = 1;
    this.room.state.ghostsRoundsWon = 0;
    this.room.state.sentinelsRoundsWon = 0;

    sdMode.resetGame(this.room.state);
    sdMode.startRound();
    this.room.gameMode.startGame();
    this.spawnSpikeOnGround();

    for (const [sessionId, player] of this.room.players) {
      this.respawnForMatch(sessionId, player);
    }

    this.room.broadcast("game_started", {
      roundNumber: 1,
      spikeX: this.room.state.spikeX,
      spikeZ: this.room.state.spikeZ,
    });

    this.broadcastLobbyState();
  }

  restartGame(): void {
    this.room.state.isGameOver = false;
    this.room.state.winnerId = "";
    this.room.state.gameWinnerTeam = "";
    this.room.state.currentRound = 1;
    this.room.state.ghostsRoundsWon = 0;
    this.room.state.sentinelsRoundsWon = 0;

    const sdMode = this.room.getSDMode();
    if (sdMode) {
      this.room.state.lobbyState = "waiting";
      this.room.state.isRoundActive = false;
      sdMode.resetGame(this.room.state);
    } else {
      this.room.state.lobbyState = "playing";
      this.room.state.isRoundActive = true;
      this.room.gameMode.startGame();
    }

    for (const [sessionId, player] of this.room.players) {
      player.schema.kills = 0;
      player.schema.deaths = 0;
      player.schema.score = 0;
      player.schema.roundsWon = 0;
      this.respawnForMatch(sessionId, player);
      this.room.gameMode.addPlayer(sessionId);
    }

    this.room.broadcast("game_restarted", {});

    if (sdMode) {
      this.broadcastLobbyState();
    }
  }

  spawnSpikeOnGround(): void {
    const map = this.room.map;
    if (map.spikeSpawnLocation) {
      this.room.state.spikeX = map.spikeSpawnLocation.x;
      this.room.state.spikeZ = map.spikeSpawnLocation.z;
    } else if (map.ghostSpawnPoints && map.ghostSpawnPoints.length > 0) {
      const spawnIdx = Math.floor(Math.random() * map.ghostSpawnPoints.length);
      const spawnPoint = map.ghostSpawnPoints[spawnIdx];
      this.room.state.spikeX = spawnPoint.x;
      this.room.state.spikeZ = spawnPoint.z;
    } else {
      this.room.state.spikeX = 0;
      this.room.state.spikeZ = -15;
    }
    this.room.state.spikeState = "ground";
    this.room.state.spikeCarrierId = "";
  }

  handlePlayerKill(victimId: string, killerId: string): void {
    const victim = this.room.players.get(victimId);
    const killer = this.room.players.get(killerId);

    if (victim) {
      victim.schema.deaths += 1;
      victim.schema.score = Math.max(0, victim.schema.score - 50);

      const sdMode = this.room.getSDMode();
      if (sdMode) {
        const result = sdMode.onPlayerDeath(victimId, killerId, this.room.state, this.room.players);
        victim.schema.livesRemaining = result.livesRemaining;

        if (result.roundEnd?.ended && result.roundEnd.winnerTeam) {
          this.handleTeamRoundEnd(result.roundEnd.winnerTeam as TeamId, result.roundEnd.reason || "");
        }
      } else {
        const result = this.room.gameMode.onPlayerDeath(victimId, killerId, this.room.state, this.room.players);
        victim.schema.livesRemaining = result.livesRemaining;
      }
    }

    if (killer && killerId !== victimId) {
      killer.schema.kills += 1;
      killer.schema.score += 100;

      if (this.room.gameMode.checkScoreWin(killerId, killer.schema.kills)) {
        this.handleGameOver(killerId);
      }
    }

    this.room.broadcast("player_killed", {
      victimId,
      killerId: killerId !== victimId ? killerId : null,
      victimLivesRemaining: victim?.schema.livesRemaining ?? 0,
    });
  }

  handleGameOver(winnerId: string | null, winnerTeam?: TeamId): void {
    this.room.state.isGameOver = true;
    this.room.state.winnerId = winnerId || "";
    this.room.state.lobbyState = "ended";

    const winner = winnerId ? this.room.players.get(winnerId) : null;
    const winnerName = winner?.schema.displayName || (winnerTeam ? winnerTeam.toUpperCase() : "Unknown");

    if (winnerTeam) {
      this.room.state.gameWinnerTeam = winnerTeam;
    }

    this.room.broadcast("game_over", {
      winnerId,
      winnerName,
      winnerTeam: winnerTeam || "",
      gameMode: this.room.state.gameMode,
      ghostsRoundsWon: this.room.state.ghostsRoundsWon,
      sentinelsRoundsWon: this.room.state.sentinelsRoundsWon,
    });

    this.broadcastLobbyState();
  }

  handleTeamRoundEnd(winnerTeam: TeamId, reason: string): void {
    if (!this.room.state.isRoundActive) return;

    const sdMode = this.room.getSDMode();
    if (!sdMode) return;

    this.room.state.isRoundActive = false;
    this.room.state.roundWinnerTeam = winnerTeam;
    sdMode.stopRound();

    const teamManager = sdMode.getTeamManager();
    const roundsWon = teamManager.awardRoundWin(winnerTeam);

    if (winnerTeam === "ghosts") {
      this.room.state.ghostsRoundsWon = roundsWon;
    } else {
      this.room.state.sentinelsRoundsWon = roundsWon;
    }

    this.room.broadcast("round_end", {
      roundNumber: this.room.state.currentRound,
      winnerId: null,
      winnerName: winnerTeam === "ghosts" ? "GHOSTS" : "SENTINELS",
      winnerTeam,
      reason,
    });

    if (roundsWon >= this.room.state.roundsToWin) {
      this.handleGameOver(null, winnerTeam);
      return;
    }

    this.room.schedule(() => this.startNewRound(), 5000);
  }

  startNewRound(): void {
    this.room.state.currentRound++;
    this.room.state.isRoundActive = true;
    this.room.state.roundWinnerId = "";
    this.room.state.roundWinnerTeam = "";

    const sdMode = this.room.getSDMode();
    if (sdMode) {
      sdMode.resetForNewRound(this.room.state);
    } else {
      this.room.gameMode.startRound();
    }

    for (const [sessionId, player] of this.room.players) {
      this.respawnForMatch(sessionId, player);
      this.room.gameMode.addPlayer(sessionId);
    }

    if (sdMode) {
      this.spawnSpikeOnGround();
    }

    this.room.broadcast("round_start", {
      roundNumber: this.room.state.currentRound,
      spikeX: this.room.state.spikeX,
      spikeZ: this.room.state.spikeZ,
    });
  }

  /** Full health, full ammo, fresh lives, at a new spawn. */
  private respawnForMatch(sessionId: string, player: PlayerRuntime): void {
    const spawn = this.room.pickSpawnPoint(sessionId);
    const s = player.schema;
    s.isDead = false;
    s.health = s.maxHealth;
    s.x = spawn.x;
    s.y = spawn.y;
    s.z = spawn.z;
    s.rotationY = calculateSpawnFacing(spawn.x, spawn.z);
    s.livesRemaining = startingLives(this.room.gameMode.getConfig().maxLives);
    s.hasSpike = false;
    s.isUploading = false;
    s.isDecrypting = false;
    refillAmmo(player);
    this.room.placePlayerAt(player, spawn.x, spawn.y, spawn.z);
  }
}
