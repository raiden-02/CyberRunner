import type RAPIER from "@dimforge/rapier3d-compat";
import { StateMachine } from "./movement-state.js";
import type { MovementCtx, InputMsg, CharacterControllerSnapshot } from "./types.js";
import { MovementState } from "./types.js";
import { stateFactory } from "./state-factory.js";
import { hasCapsuleClearance, resizeCapsuleKeepFeet } from "./capsule.js";
import { CAPSULE } from "../physics/constants.js";

/**
 * Shared kinematic controller used by client prediction and the server tick.
 */
export class CharacterController {
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  controller: RAPIER.KinematicCharacterController;

  private sm: StateMachine;
  private _speedMultiplier = 1.0;

  public input: InputMsg = {
    seq: 0, moveX: 0, moveZ: 0,
    lookYaw: 0, lookPitch: 0,
    sprint: false, aiming: false,
    crouchPressed: false, crouchReleased: false, crouchHeld: false,
    jumpPressed: false,
  };

  constructor(body: RAPIER.RigidBody, collider: RAPIER.Collider, controller: RAPIER.KinematicCharacterController) {
    this.body = body;
    this.collider = collider;
    this.controller = controller;
    this.sm = new StateMachine(stateFactory.createWalkingState());
  }

  isGrounded(): boolean {
    return this.controller.computedGrounded();
  }

  forward(): { x: number; y: number; z: number } {
    return { x: -Math.sin(this.input.lookYaw), y: 0, z: -Math.cos(this.input.lookYaw) };
  }

  right(): { x: number; y: number; z: number } {
    return { x: Math.cos(this.input.lookYaw), y: 0, z: -Math.sin(this.input.lookYaw) };
  }

  up(): { x: number; y: number; z: number } {
    return { x: 0, y: 1, z: 0 };
  }

  setCapsuleHalfHeight(h: number): void {
    resizeCapsuleKeepFeet(this.body, this.collider, h);
  }

  setFriction(f: number): void {
    this.collider.setFriction(Math.max(0, f));
  }

  setSpeedMultiplier(mult: number): void {
    this._speedMultiplier = Math.max(0, Math.min(1, mult));
  }

  /** Spawn, respawn, or a true teleport. Drops walk velocity and stands up. */
  resetAfterTeleport(): void {
    this.sm = new StateMachine(stateFactory.createWalkingState());
    this._speedMultiplier = 1;
    this.setCapsuleHalfHeight(CAPSULE.HalfHeight);
    this.setFriction(0.7);
  }

  capture(): CharacterControllerSnapshot {
    return {
      speedMultiplier: this._speedMultiplier,
      lookYaw: this.input.lookYaw,
      lookPitch: this.input.lookPitch,
      capsuleHalfHeight: this.collider.halfHeight(),
      friction: this.collider.friction(),
      state: this.sm.snapshot().capture(),
    };
  }

  /**
   * Restore controller internals for an earlier tick.
   * Does not call state enter(), which would re-apply slide boost and similar.
   */
  applySnapshot(snap: CharacterControllerSnapshot): void {
    this._speedMultiplier = snap.speedMultiplier;
    this.input.lookYaw = snap.lookYaw;
    this.input.lookPitch = snap.lookPitch;
    this.setCapsuleHalfHeight(snap.capsuleHalfHeight);
    this.setFriction(snap.friction);
    this.sm.replaceSilent(stateFactory.createFromSnapshot(snap.state));
  }

  update(world: RAPIER.World, dt: number, now: number) {
    const ctx: MovementCtx = {
      body: this.body,
      collider: this.collider,
      controller: this.controller,
      isGrounded: () => this.isGrounded(),
      forward: () => this.forward(),
      right: () => this.right(),
      up: () => this.up(),
      setCapsuleHalfHeight: (h) => this.setCapsuleHalfHeight(h),
      setFriction: (f) => this.setFriction(f),
      hasCapsuleClearance: (h) => hasCapsuleClearance(world, this.body, this.collider, h),

      env: { world, dt, now },
      input: this.input,
      speedMultiplier: this._speedMultiplier,
    };

    this.sm.update(ctx);

    this.input.crouchPressed = false;
    this.input.crouchReleased = false;
    this.input.jumpPressed = false;
  }

  currentState(): MovementState {
    return this.sm.snapshot().kind;
  }

  updateInput(input: InputMsg) {
    this.input = { ...input };
  }
}
