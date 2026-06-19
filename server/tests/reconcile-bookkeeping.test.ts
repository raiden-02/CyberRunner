import { beforeAll, describe, expect, it } from "vitest";
import { LocalPlayer } from "../../client/src/player/LocalPlayer.ts";
import { initRapier } from "../../client/src/physics/PhysicsWorld.ts";
import { FIXED_DT, seqsAreUniqueAndIncreasing } from "../../shared/net/fixed-tick.js";
import type { InputMsg } from "../../shared/movement/types.js";
import { getGameplayMap } from "../../shared/world/map-registry.js";

const MAP = getGameplayMap("shoot-house-neon");

function makePlayer(): LocalPlayer {
  const player = new LocalPlayer({} as ConstructorParameters<typeof LocalPlayer>[0]);
  player.configureMap(MAP);
  return player;
}

function holdForward(seq: number): InputMsg {
  return {
    seq,
    moveX: 0,
    moveZ: 1,
    lookYaw: 0,
    lookPitch: 0,
    sprint: false,
    aiming: false,
    crouchPressed: false,
    crouchReleased: false,
    crouchHeld: false,
    jumpPressed: false,
  };
}

describe("prediction / reconcile bookkeeping", () => {
  beforeAll(async () => {
    await initRapier();
  });

  it("stores one unique seq per recorded tick", () => {
    const player = makePlayer();
    player.setInitialPosition(0, 1.25, 0);
    const seqs: number[] = [];
    for (let seq = 1; seq <= 12; seq++) {
      player.applyFixedTick(holdForward(seq), true);
      seqs.push(seq);
    }
    expect(player.getPendingInputCount()).toBe(12);
    expect(seqsAreUniqueAndIncreasing(seqs)).toBe(true);
  });

  it("drops acked commands and keeps newer ones for a single replay", () => {
    const player = makePlayer();
    player.setInitialPosition(0, 1.25, 0);
    for (let seq = 1; seq <= 6; seq++) {
      player.applyFixedTick(holdForward(seq), true);
    }
    const before = player.getCapsuleCenter();
    player.reconcileWithServer(before.x, before.y, before.z, 4, FIXED_DT);
    expect(player.getPendingInputCount()).toBe(2);
    expect(player.lastAckedSeq).toBe(4);

    player.reconcileWithServer(before.x, before.y, before.z, 4, FIXED_DT);
    expect(player.getPendingInputCount()).toBe(2);
    expect(player.lastAckedSeq).toBe(4);
  });

  it("snaps a large correction and keeps a mid-size offset for smoothing", () => {
    const snap = makePlayer();
    snap.setInitialPosition(0, 1.25, 0);
    for (let seq = 1; seq <= 8; seq++) {
      snap.applyFixedTick(holdForward(seq), true);
    }
    snap.reconcileWithServer(12, 1.25, 0, 8, FIXED_DT);
    expect(snap.getPendingInputCount()).toBe(0);
    expect(snap.getCorrectionMag()).toBe(0);
    expect(snap.getCapsuleCenter().x).toBeCloseTo(12, 3);

    const smooth = makePlayer();
    smooth.setInitialPosition(0, 1.25, 0);
    for (let seq = 1; seq <= 8; seq++) {
      smooth.applyFixedTick(holdForward(seq), true);
    }
    const pred = smooth.getCapsuleCenter();
    smooth.reconcileWithServer(pred.x, pred.y, pred.z + 0.04, 8, FIXED_DT);
    expect(smooth.getCorrectionMag()).toBeGreaterThan(0.01);
    expect(smooth.getCorrectionMag()).toBeLessThan(0.08);
  });

  it("dead-zones a tiny correction", () => {
    const player = makePlayer();
    player.setInitialPosition(0, 1.25, 0);
    player.applyFixedTick(holdForward(1), true);
    const pred = player.getCapsuleCenter();
    player.reconcileWithServer(pred.x, pred.y, pred.z + 0.002, 1, FIXED_DT);
    expect(player.getCorrectionMag()).toBe(0);
  });
});
