import * as THREE from "three";
import { PhysicsWorld } from "../physics/PhysicsWorld.js";
import type { InputMsg } from "@shared/movement/types.js";
import { CAPSULE } from "@shared/physics/constants.js";

const CENTER_TO_FOOT = CAPSULE.HalfHeight + CAPSULE.Radius;
const EYE_HEIGHT = 1.6;
const EYE_FROM_CENTER = EYE_HEIGHT - CENTER_TO_FOOT;

const FIXED_DT = 1 / 60;

// With shared RAPIER physics, reconciliation errors are near-zero under normal
// conditions (only floating-point non-determinism). These thresholds handle
// the rare case and teleport/respawn snaps.
const SMOOTH_DECAY_RATE = 8;
const SNAP_MIN = 0.008;
const SNAP_MAX = 2.0;
const AXIS_DEAD_ZONE = 0.005;

export interface PredictionInput {
  seq: number;
  moveX: number;
  moveZ: number;
  yaw: number;
  sprint: boolean;
  aiming: boolean;
  jump: boolean;
}

/**
 * Client-side predicted local player.
 *
 * Runs the same RAPIER CharacterController as the server for prediction
 * and reconciliation. On each server ack, resets to the authoritative
 * position and replays unacknowledged inputs to re-derive the predicted state.
 */
export class LocalPlayer {
  private camera: THREE.PerspectiveCamera;
  private physics: PhysicsWorld;

  private predictedPos = new THREE.Vector3(0, CENTER_TO_FOOT, 0);
  private smoothOffset = new THREE.Vector3(0, 0, 0);
  private visualPos = new THREE.Vector3(0, EYE_HEIGHT, 0);

  private pendingInputs: PredictionInput[] = [];
  public lastAckedSeq = 0;

  public health = 100;
  public maxHealth = 100;
  public isDead = false;
  public respawnTime = 0;
  public isReloading = false;

  private accumulator = 0;
  private tickCount = 0;

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
    this.physics = new PhysicsWorld();
  }

  public setInitialPosition(x: number, y: number, z: number): void {
    this.physics.setPosition(x, y, z);
    this.predictedPos.set(x, y, z);
    this.smoothOffset.set(0, 0, 0);
    this.visualPos.set(x, y + EYE_FROM_CENTER, z);
    this.pendingInputs = [];
    this.accumulator = 0;
  }

  /**
   * Buffer the input for replay and step the RAPIER world at a fixed 60 Hz timestep.
   */
  public applyInput(dt: number, input: PredictionInput): void {
    if (this.isDead) return;

    this.pendingInputs.push(input);
    if (this.pendingInputs.length > 300) {
      this.pendingInputs.splice(0, this.pendingInputs.length - 300);
    }

    this.accumulator += dt;
    while (this.accumulator >= FIXED_DT) {
      this.accumulator -= FIXED_DT;
      this.tickCount++;
      this.physics.simulateTick(this.toInputMsg(input), this.tickCount * FIXED_DT);
    }

    const pos = this.physics.getPosition();
    this.predictedPos.set(pos.x, pos.y, pos.z);
  }

  /**
   * Reconcile the predicted state with the server's authoritative position.
   *
   * 1. Reset physics to the server position
   * 2. Discard acknowledged inputs
   * 3. Replay remaining unacked inputs through RAPIER
   * 4. Compute visual correction offset for smooth blending
   */
  public reconcileWithServer(
    serverX: number, serverY: number, serverZ: number,
    ackSeq: number, _dt: number,
  ): void {
    if (ackSeq <= this.lastAckedSeq) return;

    const oldVisX = this.predictedPos.x + this.smoothOffset.x;
    const oldVisY = this.predictedPos.y + this.smoothOffset.y;
    const oldVisZ = this.predictedPos.z + this.smoothOffset.z;

    this.physics.setPosition(serverX, serverY, serverZ);

    this.pendingInputs = this.pendingInputs.filter(cmd => cmd.seq > ackSeq);
    this.lastAckedSeq = ackSeq;

    let replayTick = this.tickCount - this.pendingInputs.length;
    for (const cmd of this.pendingInputs) {
      replayTick++;
      this.physics.simulateTick(this.toInputMsg(cmd), replayTick * FIXED_DT);
    }

    const pos = this.physics.getPosition();
    this.predictedPos.set(pos.x, pos.y, pos.z);

    this.smoothOffset.set(
      oldVisX - this.predictedPos.x,
      oldVisY - this.predictedPos.y,
      oldVisZ - this.predictedPos.z,
    );

    // Per-axis dead zone: zero out axes with sub-millimeter corrections
    // to prevent float non-determinism from creating visible oscillation.
    if (Math.abs(this.smoothOffset.x) < AXIS_DEAD_ZONE) this.smoothOffset.x = 0;
    if (Math.abs(this.smoothOffset.y) < AXIS_DEAD_ZONE) this.smoothOffset.y = 0;
    if (Math.abs(this.smoothOffset.z) < AXIS_DEAD_ZONE) this.smoothOffset.z = 0;

    const errorMag = this.smoothOffset.length();
    if (errorMag > SNAP_MAX || errorMag < SNAP_MIN) {
      this.smoothOffset.set(0, 0, 0);
    }

    this.updateVisualPos();
  }

  public updateSmoothing(dt: number): void {
    if (this.smoothOffset.lengthSq() > 0.000001) {
      this.smoothOffset.multiplyScalar(1 - Math.min(1, SMOOTH_DECAY_RATE * dt));
      if (this.smoothOffset.lengthSq() < 0.000001) {
        this.smoothOffset.set(0, 0, 0);
      }
    }
    this.updateVisualPos();
  }

  private updateVisualPos(): void {
    this.visualPos.set(
      this.predictedPos.x + this.smoothOffset.x,
      this.predictedPos.y + this.smoothOffset.y + EYE_FROM_CENTER,
      this.predictedPos.z + this.smoothOffset.z,
    );
  }

  public get position(): THREE.Vector3 { return this.visualPos.clone(); }

  public getCapsuleCenter(): { x: number; y: number; z: number } {
    return { x: this.predictedPos.x, y: this.predictedPos.y, z: this.predictedPos.z };
  }

  public getCorrectionMag(): number { return this.smoothOffset.length(); }
  public getPendingInputCount(): number { return this.pendingInputs.length; }
  public applyToCamera(): void { this.camera.position.copy(this.visualPos); }

  public updateHealth(newHealth: number, maxHealth: number, isDead: boolean, respawnTime: number): void {
    this.health = newHealth;
    this.maxHealth = maxHealth;
    this.isDead = isDead;
    this.respawnTime = respawnTime;
  }

  private toInputMsg(input: PredictionInput): InputMsg {
    return {
      seq: input.seq,
      moveX: input.moveX,
      moveZ: input.moveZ,
      lookYaw: input.yaw,
      lookPitch: 0,
      sprint: input.sprint,
      aiming: input.aiming,
      crouchPressed: false,
      crouchReleased: false,
      crouchHeld: false,
      jumpPressed: input.jump,
      dashPressed: false,
    };
  }
}
