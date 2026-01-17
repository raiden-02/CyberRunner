import { Client, Room } from "colyseus.js";

export interface HealthChangeMessage {
  playerId: string;
  newHealth: number;
  maxHealth: number;
  isDead: boolean;
  respawnTime?: number;
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

export class NetworkManager {
  private client: Client;
  private room?: Room;
  
  public onHealthChange?: (msg: HealthChangeMessage) => void;
  public onShotFired?: (msg: ShotFiredMessage) => void;
  public onBreakableDestroyed?: (msg: BreakableDestroyedMessage) => void;
  public onConnected?: (sessionId: string) => void;
  public onError?: (error: any) => void;

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

  public async connect(): Promise<void> {
    try {
      this.room = await this.client.joinOrCreate("game_room");
      console.log("Connected to game room");

      if (this.onConnected) {
        this.onConnected(this.sessionId);
      }

      this.setupMessageHandlers();
    } catch (e) {
      console.error("Join error", e);
      if (this.onError) {
        this.onError(e);
      }
    }
  }

  private setupMessageHandlers(): void {
    if (!this.room) return;

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
  }

  public get sessionId(): string {
    return (this.room as any)?.sessionId ?? "";
  }

  public get connected(): boolean {
    return !!this.room;
  }

  public get state(): any {
    return (this.room as any)?.state;
  }

  public sendInput(data: any): void {
    this.room?.send("input", data);
  }

  public sendFireInput(firing: boolean, aimDir: { x: number; y: number; z: number }): void {
    this.room?.send("fire_input", { firing, aimDir });
  }

  public sendWeaponSwitch(weaponId: string): void {
    this.room?.send("weapon_switch", { weaponId });
  }

  public sendReload(weaponId: string): void {
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
}
