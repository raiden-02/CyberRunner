/**
 * Lag Compensation System (tick-based position rewind).
 *
 * Records all player positions each server tick. When a player fires, the server
 * calculates how many ticks behind that player is (based on smoothed RTT), then
 * rewinds all other players to that historical tick and interpolates between the
 * two surrounding records for sub-tick accuracy.
 */

import * as RAPIER from "@dimforge/rapier3d-compat";
import type { PlayerState } from "../PlayerState.js";

// ── Constants ──────────────────────────────────────────────────────────
const TICK_TIME_MS = 1000 / 60;          // 60 Hz server tick = ~16.67ms
const LAG_HISTORY_MAX = 20;              // Samples for averaging tick lag
const MAX_HISTORY_TICKS = 60;            // ~1 second of history at 60Hz

// Client interpolation delay in ticks.
// With lerp alpha = dt*50 at 60fps, remote players catch up in ~1-2 frames.
// The rewind formula must account for this visual delay:
//   targetTick = currentTick - networkTickLag - interpDelay
// ~25ms / 16.67ms ≈ 1.5 ticks
const CLIENT_INTERP_DELAY_TICKS = 1.5;

// ── Tick-based history record (all players at one tick) ────────────────
interface TickRecord {
  tick: number;
  players: Map<string, { x: number; y: number; z: number }>;
}

export class LagCompensation {
  private records: TickRecord[] = [];
  private currentTick = 0;

  // Per-client tick lag tracking (smoothed average)
  private clientTickLagHistory = new Map<string, number[]>();
  private clientAccumulatedLag = new Map<string, number>();

  // ── Recording ──────────────────────────────────────────────────────

  /** Call once per server tick BEFORE processing shots */
  recordTick(
    tick: number,
    players: Map<string, { schema: PlayerState; ctrl: any }>
  ): void {
    this.currentTick = tick;

    const playerPositions = new Map<string, { x: number; y: number; z: number }>();
    for (const [playerId, playerData] of players) {
      if (playerData.schema.isDead) continue;
      if (!playerData.ctrl?.body) continue;
      const pos = playerData.ctrl.body.translation();
      playerPositions.set(playerId, { x: pos.x, y: pos.y, z: pos.z });
    }

    this.records.push({ tick, players: playerPositions });

    // Trim old records
    while (this.records.length > MAX_HISTORY_TICKS) {
      this.records.shift();
    }
  }

  // ── Tick lag tracking (per-client, smoothed average) ────────────────

  /**
   * Update a client's measured latency. Converts to tick lag internally.
   * Called when the client sends a ping with its measured RTT/2.
   */
  setClientLatency(client: any, latencyMs: number, _jitterMs?: number): void {
    const clientId = client.sessionId || "unknown";

    // Convert one-way latency to tick lag
    // The client sees enemies ~latency behind, so the server needs to rewind
    // by that many ticks. We also add 1 tick buffer for processing delay.
    const tickLag = latencyMs / TICK_TIME_MS;

    // Smoothed average over the last LAG_HISTORY_MAX samples
    let history = this.clientTickLagHistory.get(clientId);
    let accumulated = this.clientAccumulatedLag.get(clientId) || 0;

    if (!history) {
      history = [];
      this.clientTickLagHistory.set(clientId, history);
    }

    history.push(tickLag);
    accumulated += tickLag;

    if (history.length > LAG_HISTORY_MAX) {
      accumulated -= history[0];
      history.shift();
    }

    this.clientAccumulatedLag.set(clientId, accumulated);
  }

  /**
   * Get the smoothed average tick lag for a client (how many ticks behind they are).
   */
  getAverageTickLag(client: any): number {
    const clientId = client.sessionId || "unknown";
    const history = this.clientTickLagHistory.get(clientId);
    const accumulated = this.clientAccumulatedLag.get(clientId);

    if (!history || history.length < 1 || accumulated === undefined) {
      // Use a default estimate until we have real measurements
      return 3; // ~50ms at 60Hz
    }

    return accumulated / history.length;
  }

  // ── Rewind / Restore ───────────────────────────────────────────────

  /**
   * Rewind all players (except shooter) to the tick the shooter was at
   * when they fired. Uses interpolation between the two surrounding
   * records for sub-tick accuracy.
   *
   * Computes the target tick from the client's smoothed latency and interpolation
   * delay, then linearly interpolates between the two surrounding tick records.
   */
  rewindPlayers(
    players: Map<string, { schema: PlayerState; ctrl: any }>,
    excludePlayerId: string,
    client: any,
    world?: RAPIER.World
  ): Map<string, { x: number; y: number; z: number }> {
    const originalPositions = new Map<string, { x: number; y: number; z: number }>();

    if (this.records.length === 0) return originalPositions;

    // Calculate the fractional tick the shooter was seeing when they fired.
    // targetTick = currentTick - networkTickLag - clientInterpDelay
    const avgTickLag = this.getAverageTickLag(client);
    const targetTick = this.currentTick - avgTickLag - CLIENT_INTERP_DELAY_TICKS;

    // Find the two records surrounding the target tick
    let recordOld: TickRecord | null = null;
    let recordRecent: TickRecord | null = null;

    for (let i = 0; i < this.records.length; i++) {
      if (this.records[i].tick <= targetTick) {
        recordOld = this.records[i];
      }
      if (this.records[i].tick > targetTick && !recordRecent) {
        recordRecent = this.records[i];
      }
    }

    // If we couldn't find surrounding records, use the closest available
    if (!recordOld && !recordRecent) {
      return originalPositions;
    }
    if (!recordOld) recordOld = recordRecent;
    if (!recordRecent) recordRecent = recordOld;

    // Calculate interpolation factor between the two records
    // (mirrors: interpolation = 1 - (tick - floor(tick)))
    const tickRange = recordRecent!.tick - recordOld!.tick;
    const t = tickRange > 0
      ? (targetTick - recordOld!.tick) / tickRange
      : 0;
    const clampedT = Math.max(0, Math.min(1, t));

    // Rewind each player to their interpolated historical position
    for (const [playerId, playerData] of players) {
      if (playerId === excludePlayerId) continue;
      if (playerData.schema.isDead) continue;
      if (!playerData.ctrl?.body) continue;

      const body = playerData.ctrl.body as RAPIER.RigidBody;
      const currentPos = body.translation();
      originalPositions.set(playerId, { x: currentPos.x, y: currentPos.y, z: currentPos.z });

      const posOld = recordOld!.players.get(playerId);
      const posRecent = recordRecent!.players.get(playerId);

      if (posOld && posRecent) {
        // Linearly interpolate between the two surrounding records
        body.setTranslation({
          x: posOld.x + (posRecent.x - posOld.x) * clampedT,
          y: posOld.y + (posRecent.y - posOld.y) * clampedT,
          z: posOld.z + (posRecent.z - posOld.z) * clampedT,
        }, true);
      } else if (posOld) {
        body.setTranslation({ x: posOld.x, y: posOld.y, z: posOld.z }, true);
      } else if (posRecent) {
        body.setTranslation({ x: posRecent.x, y: posRecent.y, z: posRecent.z }, true);
      }
    }

    // Force hitbox colliders to update positions
    if (world) {
      world.propagateModifiedBodyPositionsToColliders();
    }

    return originalPositions;
  }

  /** Restore all players to their current positions after raycast */
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

    if (world) {
      world.propagateModifiedBodyPositionsToColliders();
    }
  }

  // ── Cleanup ────────────────────────────────────────────────────────

  removePlayer(playerId: string): void {
    this.clientTickLagHistory.delete(playerId);
    this.clientAccumulatedLag.delete(playerId);
  }

  clear(): void {
    this.records = [];
    this.clientTickLagHistory.clear();
    this.clientAccumulatedLag.clear();
  }
}
