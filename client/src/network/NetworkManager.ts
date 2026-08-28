import { Client, Room } from "colyseus.js";
import { isGameplayActive } from "@shared/net/gameplay-input.js";
import { encodeInputCmd, encodeFireCmd } from "./BinaryCodec.js";
import type { SyncedGameState } from "./synced-state.js";

export interface HealthChangeMessage {
  playerId: string;
  newHealth: number;
  maxHealth: number;
  isDead: boolean;
  respawnTime?: number;
  bodyPart?: string;
  isHeadshot?: boolean;
  attackerId?: string;
  damage?: number;
}

export interface ShotFiredMessage {
  shooterId: string;
  weaponId: string;
  origin: { x: number; y: number; z: number };
  direction: { x: number; y: number; z: number };
}

export interface BreakableDestroyedMessage {
  id: number;
}

export interface RoomInfoMessage {
  roomId: string;
  joinCode: string;
  playerCount: number;
  maxPlayers: number;
  gameMode: string;
  hostId: string;
}

export interface RoundEndMessage {
  roundNumber: number;
  winnerId: string;
  winnerName: string;
  winnerTeam: string;
  reason: string;
}

export interface RoundStartMessage {
  roundNumber: number;
  spikeX?: number;
  spikeZ?: number;
}

export interface LobbyStateMessage {
  lobbyState: "waiting" | "starting" | "playing" | "ended";
  hostId: string;
  ghostPlayers: string[];
  sentinelPlayers: string[];
  canStart: boolean;
  ghostsRoundsWon: number;
  sentinelsRoundsWon: number;
}

export interface GameStartedMessage {
  roundNumber: number;
  spikeX: number;
  spikeZ: number;
}

export interface GameOverMessage {
  winnerId: string | null;
  winnerName: string;
  winnerTeam: string;
  gameMode: string;
  ghostsRoundsWon: number;
  sentinelsRoundsWon: number;
}

export interface HostChangedMessage {
  newHostId: string;
}

export interface ProjectileSpawnedMessage {
  id: string;
  origin: { x: number; y: number; z: number };
  direction: { x: number; y: number; z: number };
  speed: number;
  weaponId: string;
}

export interface ProjectileDestroyedMessage {
  id: string;
  reason: string;
  position?: { x: number; y: number; z: number };
}

export interface ExplosionMessage {
  position: { x: number; y: number; z: number };
  radius: number;
  weaponId: string;
}

export type SpikeAction = "upload" | "decrypt" | "pickup" | "cancel";
export type TeamId = "ghosts" | "sentinels";

export class NetworkManager {
  private client: Client;
  private room?: Room;
  private pingInterval?: number;
  private messageHandlersReady = false;
  public latencyMs = 50;
  public jitterMs = 10;

  /** Smoothed client RTT from ping/pong. One-way estimate is latencyMs. */
  public get rttMs(): number {
    return this.latencyMs * 2;
  }
  
  public onHealthChange?: (msg: HealthChangeMessage) => void;
  public onShotFired?: (msg: ShotFiredMessage) => void;
  public onBreakableDestroyed?: (msg: BreakableDestroyedMessage) => void;
  public onRoomInfo?: (msg: RoomInfoMessage) => void;
  public onConnected?: (sessionId: string) => void;
  public onError?: (error: any) => void;
  public onRoundEnd?: (msg: RoundEndMessage) => void;
  public onRoundStart?: (msg: RoundStartMessage) => void;
  public onLobbyState?: (msg: LobbyStateMessage) => void;
  public onGameStarted?: (msg: GameStartedMessage) => void;
  public onGameOver?: (msg: GameOverMessage) => void;
  public onHostChanged?: (msg: HostChangedMessage) => void;
  public onGameRestarted?: () => void;
  public onLobbyDisbanded?: () => void;
  public onProjectileSpawned?: (msg: ProjectileSpawnedMessage) => void;
  public onProjectileDestroyed?: (msg: ProjectileDestroyedMessage) => void;
  public onExplosion?: (msg: ExplosionMessage) => void;

  constructor() {
    // Configurable via Vite env vars (useful for LAN/dev overrides):
    // - VITE_WS_URL="ws://192.168.1.50:2567" (full URL, recommended)
    const explicitUrl = import.meta.env.VITE_WS_URL as string | undefined;
    if (explicitUrl) {
      this.client = new Client(explicitUrl);
      return;
    }

    // Production: use same origin (Caddy will reverse-proxy both HTTPS and WSS)
    // Dev: default to ws://<host>:2567 since client is served by Vite on a different port.
    const wsScheme = location.protocol === "https:" ? "wss://" : "ws://";
    if (!import.meta.env.DEV) {
      this.client = new Client(`${wsScheme}${location.host}`);
      return;
    }

    const host =
      (import.meta.env.VITE_SERVER_HOST as string | undefined) ||
      (location.hostname || "localhost");
    const port = (import.meta.env.VITE_SERVER_PORT as string | undefined) || "2567";
    this.client = new Client(`${wsScheme}${host}:${port}`);
  }

  public async connect(options: {
    roomId?: string;
    forceCreate?: boolean;
    displayName?: string;
    primaryWeaponId?: string;
    secondaryWeaponId?: string;
    gameMode?: string;
    mapId?: string;
    forgeMapId?: string;
  } = {}): Promise<void> {
    try {
      const roomOptions: Record<string, any> = {};
      if (options.displayName) roomOptions.displayName = options.displayName;
      if (options.primaryWeaponId) roomOptions.primaryWeaponId = options.primaryWeaponId;
      if (options.secondaryWeaponId) roomOptions.secondaryWeaponId = options.secondaryWeaponId;
      if (options.gameMode) roomOptions.gameMode = options.gameMode;
      if (options.mapId) roomOptions.mapId = options.mapId;
      if (options.forgeMapId) roomOptions.forgeMapId = options.forgeMapId;
      
      if (options.roomId) {
        this.room = await this.client.joinById(options.roomId, roomOptions);
      } else if (options.forceCreate) {
        this.room = await this.client.create("game_room", roomOptions);
      } else {
        this.room = await this.client.joinOrCreate("game_room", roomOptions);
      }

      this.setupMessageHandlers();

      this.room.onLeave((code) => {
        console.warn(`[Network] Room left (code: ${code})`);
        this.stopPingInterval();
        this.messageHandlersReady = false;
        this.room = undefined;
      });

      this.room.onError((code, message) => {
        console.error(`[Network] Room error ${code}: ${message}`);
      });

      await this.waitForMapId();

      if (this.onConnected) {
        this.onConnected(this.sessionId);
      }
    } catch (e) {
      console.error("Join error", e);
      if (this.onError) {
        this.onError(e);
      }
      throw e; // Re-throw to allow caller to handle
    }
  }

  /** Join can resolve before the first schema patch. Map apply needs mapId. */
  private waitForMapId(timeoutMs = 8000): Promise<void> {
    const room = this.room;
    if (!room) {
      return Promise.reject(new Error("Not in a room"));
    }

    const existing = (room.state as SyncedGameState | undefined)?.mapId;
    if (existing) return Promise.resolve();

    return new Promise((resolve, reject) => {
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;

      const onState = () => {
        const mapId = (room.state as SyncedGameState | undefined)?.mapId;
        if (mapId) finish();
      };
      const onLeave = () => {
        finish(new Error("Disconnected while waiting for room mapId"));
      };

      const finish = (err?: Error) => {
        if (settled) return;
        settled = true;
        if (timer !== undefined) clearTimeout(timer);
        room.onStateChange.remove(onState);
        room.onLeave.remove(onLeave);
        if (err) reject(err);
        else resolve();
      };

      timer = setTimeout(() => {
        finish(new Error("Timed out waiting for room mapId"));
      }, timeoutMs);
      room.onStateChange(onState);
      room.onLeave(onLeave);
      onState();
    });
  }

  private setupMessageHandlers(): void {
    if (!this.room || this.messageHandlersReady) return;
    this.messageHandlersReady = true;

    this.room.onMessage("health_change", (msg: HealthChangeMessage) => {
      if (this.onHealthChange) {
        this.onHealthChange(msg);
      }
    });

    this.room.onMessage("shot_fired", (msg: ShotFiredMessage) => {
      if (this.onShotFired) {
        this.onShotFired(msg);
      }
    });

    this.room.onMessage("breakable_destroyed", (msg: BreakableDestroyedMessage) => {
      if (this.onBreakableDestroyed) {
        this.onBreakableDestroyed(msg);
      }
    });

    this.room.onMessage("room_info", (msg: RoomInfoMessage) => {
      if (this.onRoomInfo) {
        this.onRoomInfo(msg);
      }
    });

    this.room.onMessage("round_end", (msg: RoundEndMessage) => {
      if (this.onRoundEnd) {
        this.onRoundEnd(msg);
      }
    });

    this.room.onMessage("round_start", (msg: RoundStartMessage) => {
      if (this.onRoundStart) {
        this.onRoundStart(msg);
      }
    });

    this.room.onMessage("lobby_state", (msg: LobbyStateMessage) => {
      if (this.onLobbyState) {
        this.onLobbyState(msg);
      }
    });

    this.room.onMessage("game_started", (msg: GameStartedMessage) => {
      if (this.onGameStarted) {
        this.onGameStarted(msg);
      }
    });

    this.room.onMessage("game_over", (msg: GameOverMessage) => {
      if (this.onGameOver) {
        this.onGameOver(msg);
      }
    });

    this.room.onMessage("game_restarted", () => {
      if (this.onGameRestarted) {
        this.onGameRestarted();
      }
    });

    this.room.onMessage("host_changed", (msg: HostChangedMessage) => {
      if (this.onHostChanged) {
        this.onHostChanged(msg);
      }
    });

    this.room.onMessage("lobby_disbanded", () => {
      if (this.onLobbyDisbanded) {
        this.onLobbyDisbanded();
      }
    });
    
    this.room.onMessage("projectile_spawned", (msg: ProjectileSpawnedMessage) => {
      if (this.onProjectileSpawned) {
        this.onProjectileSpawned(msg);
      }
    });
    
    this.room.onMessage("projectile_destroyed", (msg: ProjectileDestroyedMessage) => {
      if (this.onProjectileDestroyed) {
        this.onProjectileDestroyed(msg);
      }
    });
    
    this.room.onMessage("explosion", (msg: ExplosionMessage) => {
      if (this.onExplosion) {
        this.onExplosion(msg);
      }
    });
    
    this.room.onMessage("pong", (msg: { clientTime: number; challengeId?: number }) => {
      const now = Date.now();
      const rtt = now - msg.clientTime;
      const newLatency = Math.max(0, rtt / 2);

      const alpha = 0.3;
      this.latencyMs = this.latencyMs * (1 - alpha) + newLatency * alpha;
      const jitterSample = Math.abs(newLatency - this.latencyMs);
      this.jitterMs = this.jitterMs * (1 - alpha) + jitterSample * alpha;

      if (Number.isFinite(msg.challengeId)) {
        this.room?.send("rtt_echo", { challengeId: msg.challengeId });
      }
    });
    
    this.startPingInterval();
  }
  
  private startPingInterval(): void {
    this.stopPingInterval();
    // Ping every 500ms for more responsive latency tracking
    this.pingInterval = window.setInterval(() => {
      // Send latency + jitter for dynamic server-side compensation
      this.room?.send("ping", { clientTime: Date.now() });
    }, 500);
  }
  
  private stopPingInterval(): void {
    if (this.pingInterval !== undefined) {
      clearInterval(this.pingInterval);
      this.pingInterval = undefined;
    }
  }

  public get sessionId(): string {
    return (this.room as any)?.sessionId ?? "";
  }

  public get connected(): boolean {
    return !!this.room && (this.room.connection as any)?.isOpen !== false;
  }

  public get state(): SyncedGameState | undefined {
    return this.room?.state as SyncedGameState | undefined;
  }

  private gameplaySendable(): boolean {
    return isGameplayActive({
      lobbyState: this.state?.lobbyState,
      isRoundActive: this.state?.isRoundActive,
      isGameOver: this.state?.isGameOver,
    });
  }

  public sendInput(data: any): void {
    if (!this.connected || !this.gameplaySendable()) return;
    this.room!.send("input_bin", encodeInputCmd(data));
  }

  public sendFireInput(
    firing: boolean,
    aimDir: { x: number; y: number; z: number },
  ): void {
    if (!this.connected || !this.gameplaySendable()) return;
    this.room!.send("fire_bin", encodeFireCmd({ firing, aimDir }));
  }

  public sendWeaponSwitch(weaponId: string): void {
    if (!this.gameplaySendable()) return;
    this.room?.send("weapon_switch", { weaponId });
  }

  public sendReload(weaponId: string): void {
    if (!this.gameplaySendable()) return;
    this.room?.send("reload_input", { weaponId });
  }

  public sendDebugDamage(targetId: string): void {
    this.room?.send("apply_damage", {
      targetId,
      amount: 25,
      damageType: "hitscan",
      sourceId: "test",
      weaponId: "debug"
    });
  }

  public sendToggleGodMode(): void {
    this.room?.send("toggle_god_mode", {});
  }

  public sendToggleUnlimitedAmmo(): void {
    this.room?.send("toggle_unlimited_ammo", {});
  }

  public sendSpikeAction(action: SpikeAction): void {
    if (!this.gameplaySendable()) return;
    this.room?.send("spike_action", { action });
  }

  public sendTeamSelect(teamId: TeamId): void {
    this.room?.send("team_select", { teamId });
  }

  public sendStartGame(): void {
    this.room?.send("start_game", {});
  }

  public sendRestartGame(): void {
    this.room?.send("restart_game", {});
  }

  public sendDisbandLobby(): void {
    this.room?.send("disband_lobby", {});
  }
  
  public disconnect(): void {
    this.stopPingInterval();
    this.room?.leave();
    this.room = undefined;
  }
}
