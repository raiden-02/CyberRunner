/**
 * Lag Compensation System
 * 
 * Implements server-side rewind for accurate hit detection in a networked FPS.
 * When a player shoots, we rewind all other players to where they were at the
 * moment the shooter fired (accounting for network latency and client interpolation).
 * 
 * Key concept: The client sees enemies at positions slightly in the past due to:
 *   1. Network latency (time for data to travel client -> server)
 *   2. Client interpolation (visual smoothing between server updates)
 * 
 * To hit what the player sees, the server must raycast against historical positions.
 */

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

// How far back in time we store position history (milliseconds)
const HISTORY_DURATION_MS = 600;
const MAX_SNAPSHOTS = 60;

// Base interpolation delay from client-side visual smoothing (~17-33ms with dt*50 lerp)
// Increased to account for production network conditions and processing delays
const BASE_INTERPOLATION_DELAY_MS = 50;

// Jitter multiplier - add this many times the measured jitter as extra buffer
// Higher values = more forgiving for unstable connections, but more "shot behind cover"
const JITTER_COMPENSATION_MULTIPLIER = 2.5;

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
    targetTimestamp: number,
    world?: RAPIER.World
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

    // Force collider position updates without stepping physics
    if (world) {
      world.propagateModifiedBodyPositionsToColliders();
    }

    return originalPositions;
  }

  restorePlayers(
    players: Map<string, { schema: PlayerState; ctrl: any }>,
    originalPositions: Map<string, { x: number; y: number; z: number }>,
    world?: RAPIER.World
  ): void {
    for (const [playerId, pos] of originalPositions) {
      const playerData = players.get(playerId);
      if (!playerData?.ctrl?.body) continue;

      const body = playerData.ctrl.body as RAPIER.RigidBody;
      body.setTranslation({ x: pos.x, y: pos.y, z: pos.z }, true);
    }

    // Force collider position updates
    if (world) {
      world.propagateModifiedBodyPositionsToColliders();
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

  getEstimatedJitter(client: any): number {
    if (client._lagCompensationJitter !== undefined) {
      return client._lagCompensationJitter;
    }
    return 10;
  }

  /**
   * Get the full rewind time needed for lag compensation.
   * 
   * Formula: rewind_time = network_latency + interpolation_delay + jitter_buffer
   * 
   * This is DYNAMIC - it adjusts based on each client's actual network conditions.
   * - Low latency players get minimal rewind (more responsive)
   * - High latency players get more rewind (can still hit what they see)
   * - Jitter compensation handles unstable connections
   */
  getFullCompensationTime(client: any): number {
    const networkLatency = this.getEstimatedLatency(client);
    const jitter = this.getEstimatedJitter(client);
    
    // Total compensation = latency + base interpolation + jitter buffer
    const jitterBuffer = jitter * JITTER_COMPENSATION_MULTIPLIER;
    const totalCompensation = networkLatency + BASE_INTERPOLATION_DELAY_MS + jitterBuffer;
    
    // Cap to prevent excessive rewind (shooting through cover)
    return Math.min(totalCompensation, HISTORY_DURATION_MS - 50);
  }

  setClientLatency(client: any, latencyMs: number, jitterMs?: number): void {
    client._lagCompensationLatency = Math.min(HISTORY_DURATION_MS, Math.max(0, latencyMs));
    if (jitterMs !== undefined) {
      client._lagCompensationJitter = Math.min(100, Math.max(0, jitterMs));
    }
  }
}
