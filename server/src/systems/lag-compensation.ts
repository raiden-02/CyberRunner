import * as RAPIER from "@dimforge/rapier3d-compat";
import type { PlayerState } from "../PlayerState.js";

interface PositionSnapshot {
  timestamp: number;
  x: number;
  y: number;
  z: number;
}

interface PlayerHistory {
  snapshots: PositionSnapshot[];
}

const HISTORY_DURATION_MS = 200;
const MAX_SNAPSHOTS = 20;

export class LagCompensation {
  private history = new Map<string, PlayerHistory>();

  recordPosition(playerId: string, timestamp: number, x: number, y: number, z: number): void {
    let playerHistory = this.history.get(playerId);
    if (!playerHistory) {
      playerHistory = { snapshots: [] };
      this.history.set(playerId, playerHistory);
    }

    playerHistory.snapshots.push({ timestamp, x, y, z });

    while (playerHistory.snapshots.length > MAX_SNAPSHOTS) {
      playerHistory.snapshots.shift();
    }

    const cutoff = timestamp - HISTORY_DURATION_MS;
    while (playerHistory.snapshots.length > 1 && playerHistory.snapshots[0].timestamp < cutoff) {
      playerHistory.snapshots.shift();
    }
  }

  getPositionAtTime(playerId: string, timestamp: number): { x: number; y: number; z: number } | null {
    const playerHistory = this.history.get(playerId);
    if (!playerHistory || playerHistory.snapshots.length === 0) {
      return null;
    }

    const snapshots = playerHistory.snapshots;

    if (timestamp <= snapshots[0].timestamp) {
      return { x: snapshots[0].x, y: snapshots[0].y, z: snapshots[0].z };
    }

    if (timestamp >= snapshots[snapshots.length - 1].timestamp) {
      const last = snapshots[snapshots.length - 1];
      return { x: last.x, y: last.y, z: last.z };
    }

    for (let i = 0; i < snapshots.length - 1; i++) {
      const a = snapshots[i];
      const b = snapshots[i + 1];

      if (timestamp >= a.timestamp && timestamp <= b.timestamp) {
        const t = (timestamp - a.timestamp) / (b.timestamp - a.timestamp);
        return {
          x: a.x + (b.x - a.x) * t,
          y: a.y + (b.y - a.y) * t,
          z: a.z + (b.z - a.z) * t,
        };
      }
    }

    return null;
  }

  rewindPlayers(
    players: Map<string, { schema: PlayerState; ctrl: any }>,
    excludePlayerId: string,
    targetTimestamp: number
  ): Map<string, { x: number; y: number; z: number }> {
    const originalPositions = new Map<string, { x: number; y: number; z: number }>();

    for (const [playerId, playerData] of players) {
      if (playerId === excludePlayerId) continue;
      if (playerData.schema.isDead) continue;
      if (!playerData.ctrl?.body) continue;

      const body = playerData.ctrl.body as RAPIER.RigidBody;
      const currentPos = body.translation();
      originalPositions.set(playerId, { x: currentPos.x, y: currentPos.y, z: currentPos.z });

      const historicalPos = this.getPositionAtTime(playerId, targetTimestamp);
      if (historicalPos) {
        body.setTranslation({ x: historicalPos.x, y: historicalPos.y, z: historicalPos.z }, true);
      }
    }

    return originalPositions;
  }

  restorePlayers(
    players: Map<string, { schema: PlayerState; ctrl: any }>,
    originalPositions: Map<string, { x: number; y: number; z: number }>
  ): void {
    for (const [playerId, pos] of originalPositions) {
      const playerData = players.get(playerId);
      if (!playerData?.ctrl?.body) continue;

      const body = playerData.ctrl.body as RAPIER.RigidBody;
      body.setTranslation({ x: pos.x, y: pos.y, z: pos.z }, true);
    }
  }

  removePlayer(playerId: string): void {
    this.history.delete(playerId);
  }

  clear(): void {
    this.history.clear();
  }

  getEstimatedLatency(client: any): number {
    if (client._lagCompensationLatency !== undefined) {
      return client._lagCompensationLatency;
    }
    return 50;
  }

  setClientLatency(client: any, latencyMs: number): void {
    client._lagCompensationLatency = Math.min(HISTORY_DURATION_MS, Math.max(0, latencyMs));
  }
}
