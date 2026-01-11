import RAPIER from "@dimforge/rapier3d-compat";
import { InputMsg } from "../net/messages.js";
import { MovementState } from "../PlayerState.js";

export interface Environment {
  world: RAPIER.World;
  dt: number;                // seconds
  now: number;               // seconds
}

export interface CharacterDeps {
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  controller: RAPIER.KinematicCharacterController;
  // helpers
  isGrounded(): boolean;
  forward(): { x: number; y: number; z: number };
  right(): { x: number; y: number; z: number };
  up(): { x: number; y: number; z: number };
  setCapsuleHalfHeight(h: number): void;  // swap collider or rebuild
  setFriction(f: number): void;           // collider material friction
  setGravityScale(scale: number): void;   // implement via per-body gravity hack
}

export interface MovementCtx extends CharacterDeps {
  env: Environment;
  input: InputMsg;
  lastDashTime: number;
  flags: {
    wantsToProne: boolean;
    wallRight: boolean;
  }
}

export interface IMovementState {
  kind: MovementState;
  enter(ctx: MovementCtx, prev?: IMovementState): void;
  exit(ctx: MovementCtx, next?: IMovementState): void;
  update(ctx: MovementCtx): IMovementState | null; // return next state or null to keep
  setInitialVelocity?(velocity: { x: number; z: number }): void; // Optional velocity initialization
}
