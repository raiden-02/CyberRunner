import RAPIER from "@dimforge/rapier3d-compat";
import { StateMachine } from "./movement-state.js";
import { MovementCtx, CharacterDeps } from "./types.js";
import { stateFactory } from "./state-factory.js";
import { MovementState } from "../PlayerState.js";
import { CAPSULE } from "../physics/constants.js";
import { InputMsg } from "../net/messages.js";

export class CharacterController implements CharacterDeps {
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  controller: RAPIER.KinematicCharacterController;

  private sm: StateMachine;
  private _isGrounded = false;
  private _gravityScale = 1;
  private _friction = 0.5;
  private _speedMultiplier = 1.0;

  public input: InputMsg = {
    seq: 0,
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
    dashPressed: false
  };
  public lastDashTime = -999;
  public flags = { wantsToProne: false, wallRight: false };

  constructor(body: RAPIER.RigidBody, collider: RAPIER.Collider, controller: RAPIER.KinematicCharacterController) {
    this.body = body;
    this.collider = collider;
    this.controller = controller;
    
    // Create initial walking state using factory (factory reference already injected)
    const initialState = stateFactory.createWalkingState();
    this.sm = new StateMachine(initialState);
  }

  // ==== CharacterDeps implementation
  isGrounded(): boolean { 
    return this.controller.computedGrounded();
  }

  forward(): { x: number; y: number; z: number } {
    return {
      x: -Math.sin(this.input.lookYaw),
      y: 0,
      z: -Math.cos(this.input.lookYaw)
    };
  }

  right(): { x: number; y: number; z: number } {
    return {
      x: Math.cos(this.input.lookYaw),
      y: 0,
      z: -Math.sin(this.input.lookYaw)
    };
  }

  up(): { x: number; y: number; z: number } { 
    return { x: 0, y: 1, z: 0 }; 
  }

  setCapsuleHalfHeight(_h: number): void {
    // Collider resizing not implemented - would require world access
  }

  setFriction(f: number): void {
    this._friction = f;
  }

  setGravityScale(scale: number): void {
    this._gravityScale = scale;
  }

  setSpeedMultiplier(mult: number): void {
    this._speedMultiplier = Math.max(0, Math.min(1, mult));
  }

  update(world: RAPIER.World, dt: number, now: number) {
    const ctx: MovementCtx = {
      // CharacterDeps
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
      
      // Context
      env: { world, dt, now },
      input: this.input,
      lastDashTime: this.lastDashTime,
      flags: this.flags,
      speedMultiplier: this._speedMultiplier
    };

    // Update state machine - this handles all movement computation
    this.sm.update(ctx);

    this.lastDashTime = ctx.lastDashTime;

    // Consume one-shot input flags so they only affect a single tick

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

