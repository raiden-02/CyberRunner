import type RAPIER from "@dimforge/rapier3d-compat";
import { StateMachine } from "./movement-state.js";
import type { MovementCtx, CharacterDeps, InputMsg } from "./types.js";
import { MovementState } from "./types.js";
import { stateFactory } from "./state-factory.js";

/**
 * RAPIER-based kinematic character controller with a movement state machine.
 *
 * Shared between client (prediction) and server (authoritative simulation)
 * to guarantee identical physics outcomes and near-zero reconciliation error.
 */
export class CharacterController implements CharacterDeps {
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
    jumpPressed: false, dashPressed: false,
  };
  public lastDashTime = -999;
  public flags = { wantsToProne: false, wallRight: false };

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

  setCapsuleHalfHeight(_h: number): void {
    // TODO: implement collider resizing for crouch/prone capsule changes
  }

  setFriction(_f: number): void {}
  setGravityScale(_scale: number): void {}

  setSpeedMultiplier(mult: number): void {
    this._speedMultiplier = Math.max(0, Math.min(1, mult));
  }

  /**
   * Advance the movement state machine by one fixed timestep.
   * Builds a MovementCtx from current state and delegates to the active state.
   */
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
      setGravityScale: (s) => this.setGravityScale(s),

      env: { world, dt, now },
      input: this.input,
      lastDashTime: this.lastDashTime,
      flags: this.flags,
      speedMultiplier: this._speedMultiplier,
    };

    this.sm.update(ctx);
    this.lastDashTime = ctx.lastDashTime;

    // Clear one-shot input flags after processing
    this.input.crouchPressed = false;
    this.input.crouchReleased = false;
    this.input.jumpPressed = false;
    this.input.dashPressed = false;
  }

  currentState(): MovementState {
    return this.sm.snapshot().kind;
  }

  updateInput(input: InputMsg) {
    this.input = { ...input };
  }
}
