import type RAPIER from "@dimforge/rapier3d-compat";

export enum MovementState {
  Walking = 0,
  Crouching = 1,
  Sliding = 2,
  Prone = 3,
}

export type InputMsg = {
  seq: number;
  moveX: number;
  moveZ: number;
  lookYaw: number;
  lookPitch: number;
  sprint: boolean;
  aiming: boolean;
  crouchPressed: boolean;
  crouchReleased: boolean;
  crouchHeld: boolean;
  jumpPressed: boolean;
};

export interface Environment {
  world: RAPIER.World;
  dt: number;
  now: number;
}

export interface CharacterDeps {
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  controller: RAPIER.KinematicCharacterController;
  isGrounded(): boolean;
  forward(): { x: number; y: number; z: number };
  right(): { x: number; y: number; z: number };
  up(): { x: number; y: number; z: number };
  setCapsuleHalfHeight(h: number): void;
  setFriction(f: number): void;
  hasCapsuleClearance(halfHeight: number): boolean;
}

export interface MovementCtx extends CharacterDeps {
  env: Environment;
  input: InputMsg;
  speedMultiplier: number;
}

export type MovementStateSnapshot = {
  kind: MovementState;
  vx: number;
  vz: number;
  vy: number;
  crouchHoldStart: number;
  prevCrouchHeld: boolean;
  slideDirX: number;
  slideDirZ: number;
};

export type CharacterControllerSnapshot = {
  speedMultiplier: number;
  lookYaw: number;
  lookPitch: number;
  capsuleHalfHeight: number;
  friction: number;
  state: MovementStateSnapshot;
};

export interface IMovementState {
  kind: MovementState;
  enter(ctx: MovementCtx, prev?: IMovementState): void;
  exit(ctx: MovementCtx, next?: IMovementState): void;
  update(ctx: MovementCtx): IMovementState | null;
  setInitialVelocity?(velocity: { x: number; z: number }): void;
  capture(): MovementStateSnapshot;
  applySnapshot(data: MovementStateSnapshot): void;
}
