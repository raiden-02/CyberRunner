import { BaseState } from "./base.js";
import type { MovementCtx, IMovementState, MovementStateSnapshot } from "../types.js";
import { MovementState } from "../types.js";
import { SLIDE, MOVE, CAPSULE } from "../../physics/constants.js";

export class WalkingState extends BaseState {
  kind = MovementState.Walking;
  private verticalVelocity = 0;
  private currentVelocity = { x: 0, z: 0 };

  setInitialVelocity(velocity: { x: number; z: number }): void {
    this.currentVelocity = { x: velocity.x, z: velocity.z };
  }

  capture(): MovementStateSnapshot {
    return {
      kind: MovementState.Walking,
      vx: this.currentVelocity.x,
      vz: this.currentVelocity.z,
      vy: this.verticalVelocity,
      crouchHoldStart: -1,
      prevCrouchHeld: false,
      slideDirX: 0,
      slideDirZ: 0,
    };
  }

  applySnapshot(data: MovementStateSnapshot): void {
    this.currentVelocity = { x: data.vx, z: data.vz };
    this.verticalVelocity = data.vy;
  }

  enter(ctx: MovementCtx) {
    ctx.setFriction(0.7);
    ctx.setCapsuleHalfHeight(CAPSULE.HalfHeight);
  }

  update(ctx: MovementCtx): IMovementState | null {
    const input = ctx.input;

    if (ctx.isGrounded()) {
      this.processGroundedMovement(ctx);
    } else {
      this.processAirMovement(ctx);
    }

    if (input.jumpPressed && ctx.isGrounded()) {
      this.performJump(ctx);
    }

    if (input.crouchPressed) {
      const currentSpeed = Math.hypot(this.currentVelocity.x, this.currentVelocity.z);
      
      if (input.sprint && !input.aiming && currentSpeed >= SLIDE.MinSlideSpeed && ctx.isGrounded()) {
        return this.transitionToSliding(ctx);
      } else if (ctx.isGrounded()) {
        return this.transitionToCrouching(ctx);
      }
      
    }
    
    return null;
  }

  private processGroundedMovement(ctx: MovementCtx) {
    const input = ctx.input;
    const desired = this.desiredGroundVelocity(ctx);
    
    const acceleration = input.aiming ? 6.0 : (input.sprint ? 12.0 : 8.0);
    const deceleration = 16.0;
    const maxAccel = Math.abs(input.moveX) > 0.1 || Math.abs(input.moveZ) > 0.1 ? acceleration : deceleration;
    
    const maxDelta = maxAccel * ctx.env.dt;
    this.currentVelocity.x = this.moveTowards(this.currentVelocity.x, desired.x, maxDelta);
    this.currentVelocity.z = this.moveTowards(this.currentVelocity.z, desired.z, maxDelta);

    const hSpeed = Math.hypot(this.currentVelocity.x, this.currentVelocity.z);
    const hardMax = MOVE.MaxSprintSpeed * 1.1;
    if (hSpeed > hardMax) {
      const scale = hardMax / hSpeed;
      this.currentVelocity.x *= scale;
      this.currentVelocity.z *= scale;
    }
    
    if (this.verticalVelocity < 0) {
      this.verticalVelocity = 0;
    }
    
    const movement = {
      x: this.currentVelocity.x * ctx.env.dt,
      y: this.verticalVelocity * ctx.env.dt,
      z: this.currentVelocity.z * ctx.env.dt
    };
    
    ctx.controller.computeColliderMovement(ctx.collider, movement);
    const correctedMovement = ctx.controller.computedMovement();
    
    const currentPos = ctx.body.translation();
    ctx.body.setNextKinematicTranslation({
      x: currentPos.x + correctedMovement.x,
      y: currentPos.y + correctedMovement.y,
      z: currentPos.z + correctedMovement.z
    });
  }

  private processAirMovement(ctx: MovementCtx) {
    const desired = this.desiredGroundVelocity(ctx);
    
    const airAcceleration = 2.0;
    const maxDelta = airAcceleration * ctx.env.dt;
    
    this.currentVelocity.x = this.moveTowards(this.currentVelocity.x, desired.x, maxDelta);
    this.currentVelocity.z = this.moveTowards(this.currentVelocity.z, desired.z, maxDelta);
    
    this.verticalVelocity -= 9.81 * ctx.env.dt;
    
    const movement = {
      x: this.currentVelocity.x * ctx.env.dt,
      y: this.verticalVelocity * ctx.env.dt,
      z: this.currentVelocity.z * ctx.env.dt
    };
    
    ctx.controller.computeColliderMovement(ctx.collider, movement);
    const correctedMovement = ctx.controller.computedMovement();
    
    const currentPos = ctx.body.translation();
    ctx.body.setNextKinematicTranslation({
      x: currentPos.x + correctedMovement.x,
      y: currentPos.y + correctedMovement.y,
      z: currentPos.z + correctedMovement.z
    });
  }

  private performJump(_ctx: MovementCtx) {
    this.verticalVelocity = MOVE.JumpImpulse;
  }

  private transitionToSliding(_ctx: MovementCtx): IMovementState {
    if (!this.factory) {
      throw new Error("StateFactory not injected into WalkingState");
    }
    const slidingState = this.factory.createSlidingState();
    if (slidingState.setInitialVelocity) {
      slidingState.setInitialVelocity({ x: this.currentVelocity.x, z: this.currentVelocity.z });
    }
    return slidingState;
  }

  private transitionToCrouching(_ctx: MovementCtx): IMovementState {
    if (!this.factory) {
      throw new Error("StateFactory not injected into WalkingState");
    }
    const crouchingState = this.factory.createCrouchingState();
    if (crouchingState.setInitialVelocity) {
      crouchingState.setInitialVelocity({ x: this.currentVelocity.x, z: this.currentVelocity.z });
    }
    return crouchingState;
  }
}
