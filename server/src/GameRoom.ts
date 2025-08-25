import { Room, Client } from "colyseus";
import { GameState } from "./GameState.js";
import { PlayerState } from "./PlayerState.js";

const TICK_RATE = 60; // Hz
const MOVE_SPEED = 5; // units/sec

export class GameRoom extends Room<GameState> {
  private running = false;

  onCreate(options: any) {
    this.setState(new GameState());
    console.log("GameRoom created!", options);

    this.running = true;
    this.setSimulationInterval((deltaTime) => {
      if (!this.running) return;
      const dt = Math.min(100, Math.max(0, deltaTime)) / 1000; // clamp and convert ms->s
      this.updateGame(dt);
    }, 1000 / TICK_RATE);

    this.onMessage("move", (client, data: { x: number; z: number; rotate?: number }) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      // clamp inputs to [-1,1]
      const clamp = (v: number) => Math.max(-1, Math.min(1, v || 0));
      let x = clamp(data.x);
      let z = clamp(data.z);
      const len = Math.hypot(x, z);
      if (len > 1e-5) { x /= len; z /= len; } else { x = 0; z = 0; }
      player.velX = x;
      player.velZ = z;
      if (typeof data.rotate === "number") player.rotationY = data.rotate;
    });
  }

  onJoin(client: Client) {
    const p = new PlayerState();
    // spawn position
    p.x = (Math.random() - 0.5) * 4;
    p.y = 0;
    p.z = (Math.random() - 0.5) * 4;
    this.state.players.set(client.sessionId, p);
    console.log(`Player ${client.sessionId} joined at (${p.x.toFixed(1)}, ${p.y}, ${p.z.toFixed(1)})`);
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
    console.log(`Player ${client.sessionId} left.`);
  }

  onDispose() {
    this.running = false;
    console.log("GameRoom disposed.");
  }

  private updateGame(dt: number) {
    this.state.players.forEach((p) => {
      p.x += p.velX * MOVE_SPEED * dt;
      p.z += p.velZ * MOVE_SPEED * dt;
    });
  }
}
