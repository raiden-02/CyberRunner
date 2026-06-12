/**
 * Tick-based position rewind for hitscan.
 *
 * Records capsule centers each server tick. On fire, rewinds other players to
 * the tick the shooter was seeing, raycasts, then restores. RTT comes from
 * server-owned pong echo timing, not a client-reported latency number.
 */

import * as RAPIER from "@dimforge/rapier3d-compat";
import type { PlayerState } from "../PlayerState.js";

export const TICK_TIME_MS = 1000 / 60;
const LAG_HISTORY_MAX = 20;
export const MAX_HISTORY_TICKS = 60;
export const MAX_REWIND_MS = 250;
export const MAX_REWIND_TICKS = MAX_REWIND_MS / TICK_TIME_MS;
export const DEFAULT_TICK_LAG = 3;
export const CLIENT_INTERP_DELAY_TICKS = 1.5;
const MAX_RTT_MS = 2000;

interface TickRecord {
  tick: number;
  players: Map<string, { x: number; y: number; z: number }>;
}

export class LagCompensation {
  private records: TickRecord[] = [];
  private currentTick = 0;
  private clientTickLagHistory = new Map<string, number[]>();
  private clientAccumulatedLag = new Map<string, number>();

  recordTick(
    tick: number,
    players: Map<string, { schema: PlayerState; ctrl: any }>,
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
    while (this.records.length > MAX_HISTORY_TICKS) {
      this.records.shift();
    }
  }

  /** Server-owned full RTT from pong echo. Converted to one-way tick lag. */
  recordRtt(client: { sessionId?: string }, rttMs: number): void {
    if (!Number.isFinite(rttMs) || rttMs < 0 || rttMs > MAX_RTT_MS) return;
    this.setClientLatency(client, rttMs / 2);
  }

  /** One-way latency in ms. Used by tests and `recordRtt`. */
  setClientLatency(client: { sessionId?: string }, latencyMs: number): void {
    if (!Number.isFinite(latencyMs) || latencyMs < 0) return;
    const clientId = client.sessionId || "unknown";
    const tickLag = latencyMs / TICK_TIME_MS;

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

  getAverageTickLag(client: { sessionId?: string }): number {
    const clientId = client.sessionId || "unknown";
    const history = this.clientTickLagHistory.get(clientId);
    const accumulated = this.clientAccumulatedLag.get(clientId);
    if (!history || history.length < 1 || accumulated === undefined) {
      return DEFAULT_TICK_LAG;
    }
    return accumulated / history.length;
  }

  /**
   * Fractional tick used for rewind and shooter origin.
   * Caps lag at 250 ms, then clamps to stored history (no extrapolation).
   */
  getRewindTick(client: { sessionId?: string }): number {
    const rawLag = this.getAverageTickLag(client);
    const tickLag = Math.min(Math.max(0, rawLag), MAX_REWIND_TICKS);
    let targetTick = this.currentTick - tickLag - CLIENT_INTERP_DELAY_TICKS;
    if (this.records.length === 0) return targetTick;
    const oldest = this.records[0].tick;
    const newest = this.records[this.records.length - 1].tick;
    return Math.max(oldest, Math.min(newest, targetTick));
  }

  getInterpolatedPosition(
    playerId: string,
    targetTick: number,
  ): { x: number; y: number; z: number } | null {
    const pair = this.surroundingRecords(targetTick);
    if (!pair) return null;
    const posOld = pair.old.players.get(playerId);
    const posRecent = pair.recent.players.get(playerId);
    if (posOld && posRecent) {
      const t = pair.t;
      return {
        x: posOld.x + (posRecent.x - posOld.x) * t,
        y: posOld.y + (posRecent.y - posOld.y) * t,
        z: posOld.z + (posRecent.z - posOld.z) * t,
      };
    }
    return posOld ?? posRecent ?? null;
  }

  rewindPlayers(
    players: Map<string, { schema: PlayerState; ctrl: any }>,
    excludePlayerId: string,
    client: { sessionId?: string },
    world?: RAPIER.World,
  ): Map<string, { x: number; y: number; z: number }> {
    const originalPositions = new Map<string, { x: number; y: number; z: number }>();
    if (this.records.length === 0) return originalPositions;

    const targetTick = this.getRewindTick(client);

    for (const [playerId, playerData] of players) {
      if (playerId === excludePlayerId) continue;
      if (playerData.schema.isDead) continue;
      if (!playerData.ctrl?.body) continue;

      const body = playerData.ctrl.body as RAPIER.RigidBody;
      const currentPos = body.translation();
      originalPositions.set(playerId, { x: currentPos.x, y: currentPos.y, z: currentPos.z });

      const hist = this.getInterpolatedPosition(playerId, targetTick);
      if (hist) {
        body.setTranslation(hist, true);
      }
    }

    if (world) {
      world.propagateModifiedBodyPositionsToColliders();
    }
    return originalPositions;
  }

  restorePlayers(
    players: Map<string, { schema: PlayerState; ctrl: any }>,
    originalPositions: Map<string, { x: number; y: number; z: number }>,
    world?: RAPIER.World,
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

  withRewoundWorld<T>(
    players: Map<string, { schema: PlayerState; ctrl: any }>,
    excludePlayerId: string,
    client: { sessionId?: string },
    world: RAPIER.World | undefined,
    fn: () => T,
  ): T {
    const original = this.rewindPlayers(players, excludePlayerId, client, world);
    try {
      return fn();
    } finally {
      this.restorePlayers(players, original, world);
    }
  }

  removePlayer(playerId: string): void {
    this.clientTickLagHistory.delete(playerId);
    this.clientAccumulatedLag.delete(playerId);
  }

  clear(): void {
    this.records = [];
    this.clientTickLagHistory.clear();
    this.clientAccumulatedLag.clear();
  }

  private surroundingRecords(targetTick: number): {
    old: TickRecord;
    recent: TickRecord;
    t: number;
  } | null {
    if (this.records.length === 0) return null;

    let recordOld: TickRecord | null = null;
    let recordRecent: TickRecord | null = null;
    for (const rec of this.records) {
      if (rec.tick <= targetTick) recordOld = rec;
      if (rec.tick > targetTick && !recordRecent) recordRecent = rec;
    }
    if (!recordOld && !recordRecent) return null;
    if (!recordOld) recordOld = recordRecent;
    if (!recordRecent) recordRecent = recordOld;
    const tickRange = recordRecent!.tick - recordOld!.tick;
    const t = tickRange > 0
      ? (targetTick - recordOld!.tick) / tickRange
      : 0;
    return { old: recordOld!, recent: recordRecent!, t: Math.max(0, Math.min(1, t)) };
  }
}
