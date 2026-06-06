import type RAPIER from "@dimforge/rapier3d-compat";

export enum MovementState {
  Walking = 0,
  Crouching = 1,
  Sliding = 2,
  Prone = 3,
  Dashing = 4,
  WallRun = 5,
  Mantling = 6,
  Falling = 7,
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
  dashPressed: boolean;
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
  setGravityScale(scale: number): void;
}

export interface MovementCtx extends CharacterDeps {
  env: Environment;
  input: InputMsg;
  lastDashTime: number;
  flags: {
    wantsToProne: boolean;
    wallRight: boolean;
  };
  speedMultiplier: number;
}

export interface IMovementState {
  kind: MovementState;
  enter(ctx: MovementCtx, prev?: IMovementState): void;
  exit(ctx: MovementCtx, next?: IMovementState): void;
  update(ctx: MovementCtx): IMovementState | null;
  setInitialVelocity?(velocity: { x: number; z: number }): void;
}
