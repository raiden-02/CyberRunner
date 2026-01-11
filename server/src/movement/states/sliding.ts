import { BaseState } from "./base.js";
import { MovementCtx, IMovementState } from "../types.js";
import { MovementState } from "../../PlayerState.js";
import { SLIDE, CAPSULE } from "../../physics/constants.js";

export class SlidingState extends BaseState {
  kind = MovementState.Sliding;
  private enteredAt = 0;
  private slideDirection = { x: 0, z: 0 };
  private currentVelocity = { x: 0, z: 0 };
  private verticalVelocity = 0;

  setInitialVelocity(velocity: { x: number; z: number }): void {
    this.currentVelocity = { x: velocity.x, z: velocity.z };
  }

  enter(ctx: MovementCtx) {
    this.enteredAt = ctx.env.now;
    
    const currentHorizontalSpeed = Math.hypot(this.currentVelocity.x, this.currentVelocity.z);
    if (currentHorizontalSpeed > 0.1) {
      this.slideDirection.x = this.currentVelocity.x / currentHorizontalSpeed;
      this.slideDirection.z = this.currentVelocity.z / currentHorizontalSpeed;
    } else {
      const forward = ctx.forward();
      this.slideDirection.x = forward.x;
      this.slideDirection.z = forward.z;
    }
    
    ctx.setFriction(0.7 * SLIDE.FrictionFactor);
    ctx.setGravityScale(1.0);
    ctx.setCapsuleHalfHeight(CAPSULE.HalfHeight * 0.4);
    
    const slideBoostSpeed = Math.max(currentHorizontalSpeed, SLIDE.MinSlideSpeed) + SLIDE.EnterImpulse;
    this.currentVelocity.x = this.slideDirection.x * slideBoostSpeed;
    this.currentVelocity.z = this.slideDirection.z * slideBoostSpeed;
  }

  update(ctx: MovementCtx): IMovementState | null {
    const input = ctx.input;
    const env = ctx.env;

    // Must be grounded to slide
    if (!ctx.isGrounded()) {
      return this.transitionToWalking();
    }

    // Process slide physics
    this.processSlideMovement(ctx);

    // Check exit conditions
    
    const currentSpeed = Math.hypot(this.currentVelocity.x, this.currentVelocity.z);
    if (currentSpeed < SLIDE.ExitThreshold) {
      if (input.crouchHeld) {
        return this.transitionToProne();
      }
      return this.transitionToCrouching();
    }


    return null; // Stay in sliding state
  }

  exit(ctx: MovementCtx) {
    ctx.setFriction(0.7);
    ctx.setCapsuleHalfHeight(CAPSULE.HalfHeight);
  }

  private processSlideMovement(ctx: MovementCtx) {
    const slideGravityForce = { x: 0, y: -SLIDE.GravityForce, z: 0 };
    
    const currentSpeed = Math.hypot(this.currentVelocity.x, this.currentVelocity.z);
    if (currentSpeed > 0) {
      const deceleration = SLIDE.Braking * ctx.env.dt;
      const newSpeed = Math.max(0, currentSpeed - deceleration);
      const speedRatio = currentSpeed > 0.001 ? newSpeed / currentSpeed : 0;
      
      this.currentVelocity.x *= speedRatio;
      this.currentVelocity.z *= speedRatio;
    }
    
    const steerInfluence = 0.2;
    const desired = this.desiredSlideVelocity(ctx);
    const steerForce = steerInfluence * ctx.env.dt;
    
    this.currentVelocity.x = this.moveTowards(this.currentVelocity.x, desired.x, steerForce);
    this.currentVelocity.z = this.moveTowards(this.currentVelocity.z, desired.z, steerForce);
    
    const finalSpeed = Math.hypot(this.currentVelocity.x, this.currentVelocity.z);
    if (finalSpeed > SLIDE.MaxSlideSpeed) {
      const scale = SLIDE.MaxSlideSpeed / finalSpeed;
      this.currentVelocity.x *= scale;
      this.currentVelocity.z *= scale;
    }

    if (this.verticalVelocity < 0) {
      this.verticalVelocity = 0;
    }
    
    const movement = {
      x: this.currentVelocity.x * ctx.env.dt,
      y: this.verticalVelocity * ctx.env.dt + slideGravityForce.y * ctx.env.dt * ctx.env.dt,
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

  private desiredSlideVelocity(ctx: MovementCtx): { x: number; z: number } {
    const input = ctx.input;
    
    // During slide, input provides very limited steering
    const maxSteerSpeed = 2.0; // Limited steering speed during slide
    
    const forwardX = -Math.sin(input.lookYaw);
    const forwardZ = -Math.cos(input.lookYaw);
    const rightX = Math.cos(input.lookYaw);
    const rightZ = -Math.sin(input.lookYaw);
    
    const desiredVelX = (input.moveZ * forwardX + input.moveX * rightX) * maxSteerSpeed;
    const desiredVelZ = (input.moveZ * forwardZ + input.moveX * rightZ) * maxSteerSpeed;

    return { x: desiredVelX, z: desiredVelZ };
  }

  private canStandUp(ctx: MovementCtx): boolean {
    // Check if there's enough clearance above to stand up
    const pos = ctx.body.translation();
    const standingHeight = CAPSULE.HalfHeight;
    const currentHeight = CAPSULE.HalfHeight * 0.4; // Slide height
    const additionalHeightNeeded = standingHeight - currentHeight;
    
    const rayStart = { x: pos.x, y: pos.y + currentHeight, z: pos.z };
    const rayDir = { x: 0, y: 1, z: 0 };
    
    const hit = ctx.env.world.castRay(
      { origin: rayStart, dir: rayDir } as any,
      additionalHeightNeeded + 0.1,
      true
    );
    
    return !hit;
  }

  private transitionToWalking(): IMovementState {
    if (!this.factory) {
      throw new Error("StateFactory not injected into SlidingState");
    }
    const walkingState = this.factory.createWalkingState();
    if (walkingState.setInitialVelocity) {
      walkingState.setInitialVelocity({ x: this.currentVelocity.x, z: this.currentVelocity.z });
    }
    return walkingState;
  }

  private transitionToProne(): IMovementState {
    if (!this.factory) {
      throw new Error("StateFactory not injected into SlidingState");
    }
    const proneState = this.factory.createProneState(true);
    if (proneState.setInitialVelocity) {
      proneState.setInitialVelocity({ x: this.currentVelocity.x, z: this.currentVelocity.z });
    }
    return proneState;
  }

  private transitionToCrouching(): IMovementState {
    if (!this.factory) {
      throw new Error("StateFactory not injected into SlidingState");
    }
    const crouchingState = this.factory.createCrouchingState();
    if (crouchingState.setInitialVelocity) {
      crouchingState.setInitialVelocity({ x: this.currentVelocity.x, z: this.currentVelocity.z });
    }
    return crouchingState;
  }
}
