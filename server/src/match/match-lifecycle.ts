import type { GameState } from "../GameState.js";
import type { PlayerRuntime } from "../player-runtime.js";
import {
  BaseGameMode,
  SearchDestroyMode,
  type TeamId,
} from "../game-modes/index.js";
import { calculateSpawnFacing, getCurrentMap } from "../world/maps/map-registry.js";

export type MatchBroadcast = (type: string, message?: unknown) => void;

export type MatchRoomAccess = {
  state: GameState;
  players: Map<string, PlayerRuntime>;
  clients: Array<{ sessionId: string }>;
  hostId: string;
  gameMode: BaseGameMode;
  getSDMode: () => SearchDestroyMode | null;
  isSearchDestroyMode: () => boolean;
  broadcast: MatchBroadcast;
  setHostId: (id: string) => void;
  schedule: (fn: () => void, ms: number) => void;
  placePlayerAt: (player: PlayerRuntime, x: number, y: number, z: number) => void;
  pickSpawnPoint: (sessionId?: string) => { x: number; y: number; z: number };
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
      const spawn = this.room.pickSpawnPoint(sessionId);
      player.schema.isDead = false;
      player.schema.health = player.schema.maxHealth;
      player.schema.x = spawn.x;
      player.schema.y = spawn.y;
      player.schema.z = spawn.z;
      player.schema.rotationY = calculateSpawnFacing(spawn.x, spawn.z);
      player.schema.livesRemaining = this.room.gameMode.getConfig().maxLives || 1;
      player.schema.hasSpike = false;
      player.schema.isUploading = false;
      player.schema.isDecrypting = false;

      this.room.placePlayerAt(player, spawn.x, spawn.y, spawn.z);
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
      const spawn = this.room.pickSpawnPoint(sessionId);
      player.schema.isDead = false;
      player.schema.health = player.schema.maxHealth;
      player.schema.kills = 0;
      player.schema.deaths = 0;
      player.schema.score = 0;
      player.schema.roundsWon = 0;
      player.schema.hasSpike = false;
      player.schema.x = spawn.x;
      player.schema.y = spawn.y;
      player.schema.z = spawn.z;
      player.schema.livesRemaining = this.room.gameMode.getConfig().maxLives || 99;

      this.room.placePlayerAt(player, spawn.x, spawn.y, spawn.z);

      this.room.gameMode.addPlayer(sessionId);
    }

    this.room.broadcast("game_restarted", {});

    if (sdMode) {
      this.broadcastLobbyState();
    }
  }

  spawnSpikeOnGround(): void {
    const currentMap = getCurrentMap();
    if (currentMap.spikeSpawnLocation) {
      this.room.state.spikeX = currentMap.spikeSpawnLocation.x;
      this.room.state.spikeZ = currentMap.spikeSpawnLocation.z;
    } else if (currentMap.ghostSpawnPoints && currentMap.ghostSpawnPoints.length > 0) {
      const spawnIdx = Math.floor(Math.random() * currentMap.ghostSpawnPoints.length);
      const spawnPoint = currentMap.ghostSpawnPoints[spawnIdx];
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

    const sdMode = this.room.getSDMode();
    if (sdMode && this.room.state.isRoundActive) {
      this.checkEliminationRoundEnd();
    }
  }

  checkEliminationRoundEnd(): void {
    if (!this.room.state.isRoundActive) return;

    const sdMode = this.room.getSDMode();
    if (!sdMode) return;

    const teamManager = sdMode.getTeamManager();

    const getPlayerLives = (sessionId: string): number => {
      const player = this.room.players.get(sessionId);
      return player ? player.schema.livesRemaining : 0;
    };

    const spikePlanted = this.room.state.spikeState === "uploaded" ||
      this.room.state.spikeState === "decrypting";

    const ghostsEliminated = teamManager.isTeamEliminated("ghosts", getPlayerLives);
    const sentinelsEliminated = teamManager.isTeamEliminated("sentinels", getPlayerLives);

    if (sentinelsEliminated) {
      this.handleTeamRoundEnd("ghosts", "elimination");
      return;
    }

    if (ghostsEliminated && !spikePlanted) {
      this.handleTeamRoundEnd("sentinels", "elimination");
      return;
    }
  }

  checkFFAElimination(): void {
    if (!this.room.state.isRoundActive) return;

    const alivePlayers: string[] = [];
    for (const [sessionId, player] of this.room.players) {
      if (!player.schema.isDead && player.schema.livesRemaining > 0) {
        alivePlayers.push(sessionId);
      }
    }

    if (alivePlayers.length <= 1) {
      this.handleRoundEnd(alivePlayers[0] || null, "elimination");
    }
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

  handleRoundEnd(winnerId: string | null, reason: string): void {
    this.room.state.isRoundActive = false;
    this.room.state.roundWinnerId = winnerId || "";

    const winner = winnerId ? this.room.players.get(winnerId) : null;
    if (winner) {
      winner.schema.roundsWon++;
    }

    const winnerName = winner?.schema.displayName || "Unknown";

    this.room.broadcast("round_end", {
      roundNumber: this.room.state.currentRound,
      winnerId,
      winnerName,
      reason,
    });

    if (winner && winner.schema.roundsWon >= this.room.state.roundsToWin) {
      this.handleGameOver(winnerId);
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
      const spawn = this.room.pickSpawnPoint(sessionId);
      player.schema.isDead = false;
      player.schema.health = player.schema.maxHealth;
      player.schema.x = spawn.x;
      player.schema.y = spawn.y;
      player.schema.z = spawn.z;
      player.schema.rotationY = calculateSpawnFacing(spawn.x, spawn.z);
      player.schema.livesRemaining = this.room.gameMode.getConfig().maxLives || 1;
      player.schema.hasSpike = false;
      player.schema.isUploading = false;
      player.schema.isDecrypting = false;

      this.room.placePlayerAt(player, spawn.x, spawn.y, spawn.z);

      this.room.gameMode.addPlayer(sessionId);
    }

    if (this.room.isSearchDestroyMode()) {
      this.spawnSpikeOnGround();
    }

    this.room.broadcast("round_start", {
      roundNumber: this.room.state.currentRound,
      spikeX: this.room.state.spikeX,
      spikeZ: this.room.state.spikeZ,
    });
  }
}
