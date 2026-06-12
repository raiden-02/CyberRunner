import * as THREE from "three";
import { PhysicsWorld } from "../physics/PhysicsWorld.js";
import type { CharacterControllerSnapshot, InputMsg, MovementState } from "@shared/movement/types.js";
import { CAPSULE } from "@shared/physics/constants.js";
import { discardAckedInputs, FIXED_DT } from "@shared/net/fixed-tick.js";

const CENTER_TO_FOOT = CAPSULE.HalfHeight + CAPSULE.Radius;
const EYE_HEIGHT = 1.6;
const EYE_FROM_CENTER = EYE_HEIGHT - CENTER_TO_FOOT;

const SMOOTH_DECAY_RATE = 8;
const SNAP_MIN = 0.008;
const SNAP_MAX = 2.0;
const AXIS_DEAD_ZONE = 0.005;
const MAX_PENDING = 180;

type PredictionSnapshot = {
  seq: number;
  snap: CharacterControllerSnapshot;
};

/**
 * Predicted local player.
 *
 * Each recorded tick keeps a controller snapshot so a later ack can restore
 * that tick, apply the server pose, and replay only newer commands.
 */
export class LocalPlayer {
  private camera: THREE.PerspectiveCamera;
  private physics: PhysicsWorld;

  private predictedPos = new THREE.Vector3(0, CENTER_TO_FOOT, 0);
  private smoothOffset = new THREE.Vector3(0, 0, 0);
  private visualPos = new THREE.Vector3(0, EYE_HEIGHT, 0);

  private pendingInputs: InputMsg[] = [];
  private snapshots: PredictionSnapshot[] = [];
  public lastAckedSeq = 0;

  public health = 100;
  public maxHealth = 100;
  public isDead = false;
  public respawnTime = 0;
  public isReloading = false;

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
    this.physics = new PhysicsWorld();
  }

  public setInitialPosition(x: number, y: number, z: number): void {
    this.hardResetTo(x, y, z);
  }

  /** Spawn, respawn, or a real teleport. Clears pending prediction. */
  public hardResetTo(x: number, y: number, z: number): void {
    this.physics.hardResetTo(x, y, z);
    this.predictedPos.set(x, y, z);
    this.smoothOffset.set(0, 0, 0);
    this.visualPos.set(x, y + EYE_FROM_CENTER, z);
    this.pendingInputs = [];
    this.snapshots = [];
  }

  public clearPendingInputs(): void {
    this.pendingInputs = [];
    this.snapshots = [];
  }

  public applyFixedTick(input: InputMsg, record: boolean): void {
    if (this.isDead) return;

    this.physics.simulateTick(input, input.seq * FIXED_DT);
    const pos = this.physics.getPosition();
    this.predictedPos.set(pos.x, pos.y, pos.z);

    if (record) {
      this.pendingInputs.push({ ...input });
      this.snapshots.push({ seq: input.seq, snap: this.physics.capture() });
      if (this.pendingInputs.length > MAX_PENDING) {
        const drop = this.pendingInputs.length - MAX_PENDING;
        this.pendingInputs.splice(0, drop);
        this.snapshots.splice(0, drop);
      }
    }
  }

  /**
   * Restore the ack-tick controller snapshot, apply the server pose, then
   * replay only commands newer than the ack.
   */
  public reconcileWithServer(
    serverX: number, serverY: number, serverZ: number,
    ackSeq: number, _dt: number,
  ): void {
    if (ackSeq <= this.lastAckedSeq) return;

    const oldVisX = this.predictedPos.x + this.smoothOffset.x;
    const oldVisY = this.predictedPos.y + this.smoothOffset.y;
    const oldVisZ = this.predictedPos.z + this.smoothOffset.z;

    const ackSnap = this.snapshots.find((s) => s.seq === ackSeq);
    if (!ackSnap) {
      this.hardResetTo(serverX, serverY, serverZ);
      this.lastAckedSeq = ackSeq;
      return;
    }

    this.physics.restore(ackSnap.snap);
    this.physics.placeAt(serverX, serverY, serverZ);

    this.pendingInputs = discardAckedInputs(this.pendingInputs, ackSeq);
    this.lastAckedSeq = ackSeq;

    this.snapshots = [];
    for (const cmd of this.pendingInputs) {
      this.physics.simulateTick(cmd, cmd.seq * FIXED_DT);
      this.snapshots.push({ seq: cmd.seq, snap: this.physics.capture() });
    }

    const pos = this.physics.getPosition();
    this.predictedPos.set(pos.x, pos.y, pos.z);

    this.smoothOffset.set(
      oldVisX - this.predictedPos.x,
      oldVisY - this.predictedPos.y,
      oldVisZ - this.predictedPos.z,
    );

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
  public getSnapshotCount(): number { return this.snapshots.length; }
  public getMovementState(): MovementState { return this.physics.currentState(); }
  public getCapsuleHalfHeight(): number { return this.physics.capsuleHalfHeight(); }
  public applyToCamera(): void { this.camera.position.copy(this.visualPos); }

  public updateHealth(newHealth: number, maxHealth: number, isDead: boolean, respawnTime: number): void {
    this.health = newHealth;
    this.maxHealth = maxHealth;
    this.isDead = isDead;
    this.respawnTime = respawnTime;
  }
}
