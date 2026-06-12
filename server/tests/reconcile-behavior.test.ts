import { beforeAll, describe, expect, it } from "vitest";
import { LocalPlayer } from "../../client/src/player/LocalPlayer.ts";
import { initRapier, PhysicsWorld } from "../../client/src/physics/PhysicsWorld.ts";
import { FIXED_DT } from "../../shared/net/fixed-tick.js";
import { CAPSULE } from "../../shared/physics/constants.js";
import { MovementState, type InputMsg } from "../../shared/movement/types.js";
import { CROUCH_CAPSULE_HALF, SLIDE_CAPSULE_HALF } from "../../shared/movement/capsule.js";

const SPAWN_Y = CAPSULE.HalfHeight + CAPSULE.Radius;
const POSE_EPS = 0.001;

function cmd(seq: number, extras: Partial<InputMsg> = {}): InputMsg {
  return {
    seq,
    moveX: 0,
    moveZ: 0,
    lookYaw: 0,
    lookPitch: 0,
    sprint: false,
    aiming: false,
    crouchPressed: false,
    crouchReleased: false,
    crouchHeld: false,
    jumpPressed: false,
    ...extras,
  };
}

function dist(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function makePlayer(): LocalPlayer {
  return new LocalPlayer({} as ConstructorParameters<typeof LocalPlayer>[0]);
}

describe("reconciliation behavior", () => {
  beforeAll(async () => {
    await initRapier();
  });

  it("keeps identical 0-latency worlds within 1 mm after warmup", () => {
    const server = new PhysicsWorld();
    const client = makePlayer();
    server.hardResetTo(0, SPAWN_Y, 0);
    client.hardResetTo(0, SPAWN_Y, 0);

    const errors: number[] = [];
    for (let seq = 1; seq <= 90; seq++) {
      const input = cmd(seq, { moveZ: 1, sprint: true, lookYaw: 0.3 });
      client.applyFixedTick(input, true);
      server.simulateTick(input, seq * FIXED_DT);
      const auth = server.getPosition();
      client.reconcileWithServer(auth.x, auth.y, auth.z, seq, FIXED_DT);
      if (seq > 20) {
        errors.push(dist(client.getCapsuleCenter(), auth));
      }
    }

    expect(Math.max(...errors)).toBeLessThan(POSE_EPS);
    server.dispose();
  });

  it("does not reset sprint acceleration on every ack", () => {
    const server = new PhysicsWorld();
    const client = makePlayer();
    const reference = new PhysicsWorld();
    server.hardResetTo(0, SPAWN_Y, 0);
    client.hardResetTo(0, SPAWN_Y, 0);
    reference.hardResetTo(0, SPAWN_Y, 0);

    for (let seq = 1; seq <= 60; seq++) {
      const input = cmd(seq, { moveZ: 1, sprint: true });
      client.applyFixedTick(input, true);
      server.simulateTick(input, seq * FIXED_DT);
      reference.simulateTick(input, seq * FIXED_DT);
      const auth = server.getPosition();
      client.reconcileWithServer(auth.x, auth.y, auth.z, seq, FIXED_DT);
    }

    const pred = client.getCapsuleCenter();
    const ref = reference.getPosition();
    expect(dist(pred, ref)).toBeLessThan(POSE_EPS);
    expect(Math.abs(pred.z)).toBeGreaterThan(2);
    server.dispose();
    reference.dispose();
  });

  it("preserves jump / air velocity across reconcile", () => {
    const server = new PhysicsWorld();
    const client = makePlayer();
    const reference = new PhysicsWorld();
    server.hardResetTo(0, SPAWN_Y, 0);
    client.hardResetTo(0, SPAWN_Y, 0);
    reference.hardResetTo(0, SPAWN_Y, 0);

    for (let seq = 1; seq <= 12; seq++) {
      const input = cmd(seq, { jumpPressed: seq === 8 });
      client.applyFixedTick(input, true);
      server.simulateTick(input, seq * FIXED_DT);
      reference.simulateTick(input, seq * FIXED_DT);
      const auth = server.getPosition();
      client.reconcileWithServer(auth.x, auth.y, auth.z, seq, FIXED_DT);
    }

    const afterJump = client.getCapsuleCenter();
    expect(afterJump.y).toBeGreaterThan(SPAWN_Y + 0.05);

    for (let seq = 13; seq <= 24; seq++) {
      const input = cmd(seq);
      client.applyFixedTick(input, true);
      server.simulateTick(input, seq * FIXED_DT);
      reference.simulateTick(input, seq * FIXED_DT);
      const auth = server.getPosition();
      client.reconcileWithServer(auth.x, auth.y, auth.z, seq, FIXED_DT);
    }

    expect(dist(client.getCapsuleCenter(), reference.getPosition())).toBeLessThan(POSE_EPS);
    expect(client.getCapsuleCenter().y).toBeGreaterThan(SPAWN_Y);
    server.dispose();
    reference.dispose();
  });

  it("keeps crouch, prone, and slide across reconcile", () => {
    const client = makePlayer();
    const server = new PhysicsWorld();
    client.hardResetTo(0, SPAWN_Y, 0);
    server.hardResetTo(0, SPAWN_Y, 0);

    for (let seq = 1; seq <= 8; seq++) {
      const input = cmd(seq);
      client.applyFixedTick(input, true);
      server.simulateTick(input, seq * FIXED_DT);
      const auth = server.getPosition();
      client.reconcileWithServer(auth.x, auth.y, auth.z, seq, FIXED_DT);
    }

    const crouch = cmd(9, { crouchPressed: true, crouchHeld: true });
    client.applyFixedTick(crouch, true);
    server.simulateTick(crouch, 9 * FIXED_DT);
    client.reconcileWithServer(
      server.getPosition().x, server.getPosition().y, server.getPosition().z, 9, FIXED_DT,
    );
    expect(client.getMovementState()).toBe(MovementState.Crouching);
    expect(server.currentState()).toBe(MovementState.Crouching);
    expect(client.getCapsuleHalfHeight()).toBeCloseTo(CROUCH_CAPSULE_HALF, 4);

    const client2 = makePlayer();
    const server2 = new PhysicsWorld();
    client2.hardResetTo(0, SPAWN_Y, 0);
    server2.hardResetTo(0, SPAWN_Y, 0);
    for (let seq = 1; seq <= 20; seq++) {
      const input = cmd(seq, { moveZ: 1, sprint: true });
      client2.applyFixedTick(input, true);
      server2.simulateTick(input, seq * FIXED_DT);
      const auth = server2.getPosition();
      client2.reconcileWithServer(auth.x, auth.y, auth.z, seq, FIXED_DT);
    }
    const slide = cmd(21, { moveZ: 1, sprint: true, crouchPressed: true, crouchHeld: true });
    client2.applyFixedTick(slide, true);
    server2.simulateTick(slide, 21 * FIXED_DT);
    const slidePos = server2.getPosition();
    client2.reconcileWithServer(slidePos.x, slidePos.y, slidePos.z, 21, FIXED_DT);
    expect(client2.getMovementState()).toBe(MovementState.Sliding);
    expect(server2.currentState()).toBe(MovementState.Sliding);
    expect(client2.getCapsuleHalfHeight()).toBeCloseTo(SLIDE_CAPSULE_HALF, 4);

    const client3 = makePlayer();
    const server3 = new PhysicsWorld();
    client3.hardResetTo(0, SPAWN_Y, 0);
    server3.hardResetTo(0, SPAWN_Y, 0);
    let seq = 1;
    for (; seq <= 8; seq++) {
      const input = cmd(seq, { crouchPressed: seq === 5, crouchHeld: seq >= 5 });
      client3.applyFixedTick(input, true);
      server3.simulateTick(input, seq * FIXED_DT);
      const auth = server3.getPosition();
      client3.reconcileWithServer(auth.x, auth.y, auth.z, seq, FIXED_DT);
    }
    for (; seq <= 40; seq++) {
      const input = cmd(seq, { crouchHeld: true });
      client3.applyFixedTick(input, true);
      server3.simulateTick(input, seq * FIXED_DT);
      const auth = server3.getPosition();
      client3.reconcileWithServer(auth.x, auth.y, auth.z, seq, FIXED_DT);
    }
    expect(client3.getMovementState()).toBe(MovementState.Prone);
    expect(server3.currentState()).toBe(MovementState.Prone);
    expect(client3.getCapsuleHalfHeight()).toBeCloseTo(CAPSULE.ProneHalf, 4);

    server.dispose();
    server2.dispose();
    server3.dispose();
  });

  it("restores ack state and replays newer commands once", () => {
    const reference = new PhysicsWorld();
    const server = new PhysicsWorld();
    const client = makePlayer();
    reference.hardResetTo(0, SPAWN_Y, 0);
    server.hardResetTo(0, SPAWN_Y, 0);
    client.hardResetTo(0, SPAWN_Y, 0);

    const ack = 18;
    const end = 30;
    for (let seq = 1; seq <= end; seq++) {
      const input = cmd(seq, { moveZ: 1, sprint: true, lookYaw: 0.2 });
      reference.simulateTick(input, seq * FIXED_DT);
      client.applyFixedTick(input, true);
      if (seq <= ack) {
        server.simulateTick(input, seq * FIXED_DT);
      }
    }

    const auth = server.getPosition();
    client.reconcileWithServer(auth.x, auth.y, auth.z, ack, FIXED_DT);
    expect(client.getPendingInputCount()).toBe(end - ack);
    expect(dist(client.getCapsuleCenter(), reference.getPosition())).toBeLessThan(POSE_EPS);
    expect(client.getMovementState()).toBe(reference.currentState());

    reference.dispose();
    server.dispose();
  });

  it("hard reset restores standing walk and clears stale prediction", () => {
    const client = makePlayer();
    client.hardResetTo(0, SPAWN_Y, 0);
    for (let seq = 1; seq <= 16; seq++) {
      client.applyFixedTick(cmd(seq, { moveZ: 1, sprint: true, crouchPressed: seq === 12, crouchHeld: seq >= 12 }), true);
    }
    expect(client.getPendingInputCount()).toBeGreaterThan(0);
    expect(client.getSnapshotCount()).toBeGreaterThan(0);

    client.hardResetTo(4, SPAWN_Y, -6);
    expect(client.getPendingInputCount()).toBe(0);
    expect(client.getSnapshotCount()).toBe(0);
    expect(client.getMovementState()).toBe(MovementState.Walking);
    expect(client.getCapsuleHalfHeight()).toBeCloseTo(CAPSULE.HalfHeight, 4);
    expect(client.getCapsuleCenter()).toEqual({ x: 4, y: SPAWN_Y, z: -6 });
    expect(client.getCorrectionMag()).toBe(0);
  });
});
