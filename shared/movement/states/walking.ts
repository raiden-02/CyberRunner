import { BaseState } from "./base.js";
import type { MovementCtx, IMovementState } from "../types.js";
import { MovementState } from "../types.js";
import { SLIDE, DASH, MOVE } from "../../physics/constants.js";

export class WalkingState extends BaseState {
  kind = MovementState.Walking;
  private verticalVelocity = 0;
  private currentVelocity = { x: 0, z: 0 };

  setInitialVelocity(velocity: { x: number; z: number }): void {
    this.currentVelocity = { x: velocity.x, z: velocity.z };
  }

  enter(ctx: MovementCtx) {
    ctx.setFriction(0.7);
    ctx.setGravityScale(1.0);
  }

  update(ctx: MovementCtx): IMovementState | null {
    const input = ctx.input;
    const env = ctx.env;

    if (ctx.isGrounded()) {
      this.processGroundedMovement(ctx);
    } else {
      this.processAirMovement(ctx);
    }

    if (input.jumpPressed && ctx.isGrounded()) {
      this.performJump(ctx);
    }

    if (input.dashPressed && (env.now - ctx.lastDashTime > DASH.Cooldown)) {
      return this.tryDash(ctx);
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

  private tryDash(ctx: MovementCtx): IMovementState | null {
    const input = ctx.input;

    let dashInput = { x: input.moveX, z: input.moveZ };
    const inputMagnitude = Math.hypot(dashInput.x, dashInput.z);

    if (inputMagnitude < 0.1) {
      dashInput = { x: 0, z: 1 };
    } else {
      dashInput.x /= inputMagnitude;
      dashInput.z /= inputMagnitude;
    }

    const forwardX = -Math.sin(input.lookYaw);
    const forwardZ = -Math.cos(input.lookYaw);
    const rightX = Math.cos(input.lookYaw);
    const rightZ = -Math.sin(input.lookYaw);

    const dashDir = {
      x: dashInput.z * forwardX + dashInput.x * rightX,
      z: dashInput.z * forwardZ + dashInput.x * rightZ,
    };

    const dashDirLength = Math.hypot(dashDir.x, dashDir.z);
    if (dashDirLength > 0.001) {
      dashDir.x /= dashDirLength;
      dashDir.z /= dashDirLength;
    }

    const dashStrength = DASH.Impulse;
    this.currentVelocity.x += dashDir.x * dashStrength;
    this.currentVelocity.z += dashDir.z * dashStrength;

    const dashSpeed = Math.hypot(this.currentVelocity.x, this.currentVelocity.z);
    const maxDashSpeed = DASH.Impulse * 1.2;
    if (dashSpeed > maxDashSpeed) {
      const s = maxDashSpeed / dashSpeed;
      this.currentVelocity.x *= s;
      this.currentVelocity.z *= s;
    }

    if (DASH.UpwardBoost && DASH.UpwardBoost > 0) {
      this.verticalVelocity = Math.max(this.verticalVelocity, DASH.UpwardBoost);
    }

    ctx.lastDashTime = ctx.env.now;

    return null;
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
