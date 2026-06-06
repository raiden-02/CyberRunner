import { BaseState } from "./base.js";
import type { MovementCtx, IMovementState } from "../types.js";
import { MovementState } from "../types.js";
import { CROUCH, PRONE, CAPSULE } from "../../physics/constants.js";

export class CrouchingState extends BaseState {
  kind = MovementState.Crouching;
  private crouchHoldStart = -1;
  private verticalVelocity = 0;
  private currentVelocity = { x: 0, z: 0 };

  setInitialVelocity(velocity: { x: number; z: number }): void {
    this.currentVelocity = { x: velocity.x, z: velocity.z };
  }

  enter(ctx: MovementCtx) {
    const input = ctx.input;
    
    ctx.setFriction(0.8);
    ctx.setGravityScale(1.0);
    ctx.setCapsuleHalfHeight(CAPSULE.HalfHeight * CROUCH.HeightScale);
    
    this.crouchHoldStart = input.crouchHeld ? ctx.env.now : -1;
  }

  update(ctx: MovementCtx): IMovementState | null {
    const input = ctx.input;
    const env = ctx.env;
    
    if (input.crouchHeld) {
      if (this.crouchHoldStart < 0) {
        this.crouchHoldStart = env.now;
      }
    } else {
      this.crouchHoldStart = -1;
    }

    if (ctx.isGrounded()) {
      this.processGroundedMovement(ctx);
    } else {
      this.processAirMovement(ctx);
    }

    if (input.jumpPressed && ctx.isGrounded()) {
      if (this.canStandUp(ctx)) {
        return this.transitionToWalking();
      }
    }

    if (input.crouchPressed) {
      if (this.canStandUp(ctx)) {
        return this.transitionToWalking();
      }
    }
    
    if (input.crouchHeld && this.crouchHoldStart >= 0) {
      const heldDuration = env.now - this.crouchHoldStart;
      const currentSpeed = Math.hypot(this.currentVelocity.x, this.currentVelocity.z);
      const inputMagnitude = Math.hypot(input.moveX, input.moveZ);
      if (heldDuration >= PRONE.EnterHold && currentSpeed < 0.2 && inputMagnitude < 0.1) {
        return this.transitionToProne();
      }
    }
    
    return null;
  }

  exit(ctx: MovementCtx) {
    ctx.setCapsuleHalfHeight(CAPSULE.HalfHeight);
    ctx.setFriction(0.7);
  }

  private processGroundedMovement(ctx: MovementCtx) {
    const input = ctx.input;
    const desired = this.desiredCrouchVelocity(ctx);
    
    const acceleration = 6.0;
    const deceleration = 12.0;
    const maxAccel = Math.abs(input.moveX) > 0.1 || Math.abs(input.moveZ) > 0.1 ? acceleration : deceleration;
    
    const maxDelta = maxAccel * ctx.env.dt;
    this.currentVelocity.x = this.moveTowards(this.currentVelocity.x, desired.x, maxDelta);
    this.currentVelocity.z = this.moveTowards(this.currentVelocity.z, desired.z, maxDelta);
    
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
    const desired = this.desiredCrouchVelocity(ctx);
    
    const airAcceleration = 1.5;
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

  private desiredCrouchVelocity(ctx: MovementCtx): { x: number; z: number } {
    const input = ctx.input;
    const maxSpeed = CROUCH.MaxSpeed * ctx.speedMultiplier;

    const forwardX = -Math.sin(input.lookYaw);
    const forwardZ = -Math.cos(input.lookYaw);
    const rightX = Math.cos(input.lookYaw);
    const rightZ = -Math.sin(input.lookYaw);
    
    return {
      x: (input.moveZ * forwardX + input.moveX * rightX) * maxSpeed,
      z: (input.moveZ * forwardZ + input.moveX * rightZ) * maxSpeed
    };
  }

  private canStandUp(_ctx: MovementCtx): boolean {
    return true;
  }

  private transitionToProne(): IMovementState {
    if (!this.factory) {
      throw new Error("StateFactory not injected into CrouchingState");
    }
    const proneState = this.factory.createProneState(false);
    if (proneState.setInitialVelocity) {
      proneState.setInitialVelocity({ x: this.currentVelocity.x, z: this.currentVelocity.z });
    }
    return proneState;
  }

  private transitionToWalking(): IMovementState {
    if (!this.factory) {
      throw new Error("StateFactory not injected into CrouchingState");
    }
    const walkingState = this.factory.createWalkingState();
    if (walkingState.setInitialVelocity) {
      walkingState.setInitialVelocity({ x: this.currentVelocity.x, z: this.currentVelocity.z });
    }
    return walkingState;
  }
}
