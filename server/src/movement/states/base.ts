import { IMovementState, MovementCtx } from "../types.js";
import { MovementState } from "../../PlayerState.js";
import { MOVE } from "../../physics/constants.js";

// Forward declaration to avoid circular dependency
export interface StateFactory {
  createWalkingState(): IMovementState;
  createCrouchingState(): IMovementState;
  createSlidingState(): IMovementState;
  createProneState(fromSlide?: boolean): IMovementState;
}

export abstract class BaseState implements IMovementState {
  kind: MovementState = MovementState.Walking;
  protected factory?: StateFactory; // Factory reference for state transitions
  
  enter(_ctx: MovementCtx, _prev?: IMovementState) {}
  exit(_ctx: MovementCtx, _next?: IMovementState) {}
  abstract update(ctx: MovementCtx): IMovementState | null;
  
  // Method to set initial velocity before entering the state
  setInitialVelocity?(velocity: { x: number; z: number }): void;

  protected desiredGroundVelocity(ctx: MovementCtx): { x: number; z: number } {
    const input = ctx.input;
    
    // ADS prevents sprinting and slows movement
    let maxSpeed = MOVE.WalkMaxSpeed;
    if (input.aiming) {
      maxSpeed = MOVE.AdsMaxSpeed;
    } else if (input.sprint) {
      maxSpeed = MOVE.MaxSprintSpeed;
    }

    // Calculate desired velocity (Three.js coordinate system)
    // Three.js: +X = right, +Z = towards camera (backward), -Z = away from camera (forward)
    // rotationY = 0 means facing -Z (forward)
    const forwardX = -Math.sin(input.lookYaw); // Forward component in X
    const forwardZ = -Math.cos(input.lookYaw); // Forward component in Z
    const rightX = Math.cos(input.lookYaw);    // Right component in X  
    const rightZ = -Math.sin(input.lookYaw);   // Right component in Z
    
    const desiredVelX = (input.moveZ * forwardX + input.moveX * rightX) * maxSpeed;
    const desiredVelZ = (input.moveZ * forwardZ + input.moveX * rightZ) * maxSpeed;

    return { x: desiredVelX, z: desiredVelZ };
  }

  protected setHorizontalVelocity(ctx: MovementCtx, target: { x: number; z: number }) {
    const currentVel = ctx.controller.computedMovement();
    const desiredDelta = {
      x: target.x * ctx.env.dt,
      y: currentVel.y,
      z: target.z * ctx.env.dt,
    };
    
    ctx.controller.computeColliderMovement(ctx.collider, desiredDelta);
  }

  protected moveTowards(current: number, target: number, maxDelta: number): number {
    const diff = target - current;
    if (Math.abs(diff) <= maxDelta) {
      return target;
    }
    return current + Math.sign(diff) * maxDelta;
  }
}
