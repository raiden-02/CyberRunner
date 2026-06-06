import type { IMovementState, MovementCtx } from "../types.js";
import { MovementState } from "../types.js";
import { MOVE } from "../../physics/constants.js";

export interface StateFactory {
  createWalkingState(): IMovementState;
  createCrouchingState(): IMovementState;
  createSlidingState(): IMovementState;
  createProneState(fromSlide?: boolean): IMovementState;
}

export abstract class BaseState implements IMovementState {
  kind: MovementState = MovementState.Walking;
  protected factory?: StateFactory;

  enter(_ctx: MovementCtx, _prev?: IMovementState) {}
  exit(_ctx: MovementCtx, _next?: IMovementState) {}
  abstract update(ctx: MovementCtx): IMovementState | null;

  setInitialVelocity?(_velocity: { x: number; z: number }): void;

  protected desiredGroundVelocity(ctx: MovementCtx): { x: number; z: number } {
    const input = ctx.input;

    let maxSpeed = MOVE.WalkMaxSpeed;
    if (input.aiming) {
      maxSpeed = MOVE.AdsMaxSpeed;
    } else if (input.sprint) {
      maxSpeed = MOVE.MaxSprintSpeed;
    }

    maxSpeed *= ctx.speedMultiplier;

    const forwardX = -Math.sin(input.lookYaw);
    const forwardZ = -Math.cos(input.lookYaw);
    const rightX = Math.cos(input.lookYaw);
    const rightZ = -Math.sin(input.lookYaw);

    return {
      x: (input.moveZ * forwardX + input.moveX * rightX) * maxSpeed,
      z: (input.moveZ * forwardZ + input.moveX * rightZ) * maxSpeed,
    };
  }

  protected moveTowards(current: number, target: number, maxDelta: number): number {
    const diff = target - current;
    if (Math.abs(diff) <= maxDelta) return target;
    return current + Math.sign(diff) * maxDelta;
  }
}
