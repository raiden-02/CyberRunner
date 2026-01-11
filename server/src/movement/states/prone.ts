import { BaseState } from "./base.js";
import { MovementCtx, IMovementState } from "../types.js";
import { MovementState } from "../../PlayerState.js";
import { PRONE, CAPSULE } from "../../physics/constants.js";

export class ProneState extends BaseState {
  kind = MovementState.Prone;
  private currentVelocity = { x: 0, z: 0 };
  private verticalVelocity = 0;
  private prevCrouchHeld = true;

  constructor(private fromSlide: boolean) {
    super();
  }

  setInitialVelocity(velocity: { x: number; z: number }): void {
    this.currentVelocity = { x: velocity.x, z: velocity.z };
  }

  enter(ctx: MovementCtx) {
    const input = ctx.input;

    ctx.setCapsuleHalfHeight(CAPSULE.ProneHalf);
    ctx.setFriction(1.0);
    ctx.setGravityScale(1.0);

    this.prevCrouchHeld = input.crouchHeld;
  }

  update(ctx: MovementCtx): IMovementState | null {
    const input = ctx.input;
    if (ctx.isGrounded()) {
      this.processGroundedMovement(ctx);
    } else {
      this.processAirMovement(ctx);
    }

    if (input.crouchPressed) {
      const exitState = this.tryExitProne(ctx, true);
      if (exitState) {
        return exitState;
      }
    }

    if (!input.crouchHeld && this.prevCrouchHeld) {
      const exitState = this.tryExitProne(ctx);
      if (exitState) {
        return exitState;
      }
    }

    this.prevCrouchHeld = input.crouchHeld;

    return null;
  }

  exit(ctx: MovementCtx, next?: IMovementState) {
    const nextKind = next?.kind;
    if (nextKind === MovementState.Crouching) {
      ctx.setCapsuleHalfHeight(CAPSULE.CrouchHalf);
    } else {
      ctx.setCapsuleHalfHeight(CAPSULE.HalfHeight);
    }
    ctx.setFriction(0.7);
  }

  private processGroundedMovement(ctx: MovementCtx) {
    const input = ctx.input;
    const desired = this.desiredProneVelocity(ctx);

    const hasInput = Math.abs(input.moveX) > 0.1 || Math.abs(input.moveZ) > 0.1;
    const acceleration = hasInput ? 3.0 : PRONE.Braking;
    const maxDelta = acceleration * ctx.env.dt;

    this.currentVelocity.x = this.moveTowards(this.currentVelocity.x, desired.x, maxDelta);
    this.currentVelocity.z = this.moveTowards(this.currentVelocity.z, desired.z, maxDelta);

    if (this.verticalVelocity < 0) {
      this.verticalVelocity = 0;
    }

    const movement = {
      x: this.currentVelocity.x * ctx.env.dt,
      y: this.verticalVelocity * ctx.env.dt,
      z: this.currentVelocity.z * ctx.env.dt,
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
    const desired = this.desiredProneVelocity(ctx);

    const airAcceleration = 1.0;
    const maxDelta = airAcceleration * ctx.env.dt;

    this.currentVelocity.x = this.moveTowards(this.currentVelocity.x, desired.x, maxDelta);
    this.currentVelocity.z = this.moveTowards(this.currentVelocity.z, desired.z, maxDelta);

    this.verticalVelocity -= 9.81 * ctx.env.dt;

    const movement = {
      x: this.currentVelocity.x * ctx.env.dt,
      y: this.verticalVelocity * ctx.env.dt,
      z: this.currentVelocity.z * ctx.env.dt,
    };

    ctx.controller.computeColliderMovement(ctx.collider, movement);
    const correctedMovement = ctx.controller.computedMovement();

    const currentPos = ctx.body.translation();
    ctx.body.setNextKinematicTranslation({
      x: currentPos.x + correctedMovement.x,
      y: currentPos.y + correctedMovement.y,
      z: currentPos.z + correctedMovement.z,
    });
  }

  private desiredProneVelocity(ctx: MovementCtx): { x: number; z: number } {
    const input = ctx.input;

    const forwardX = -Math.sin(input.lookYaw);
    const forwardZ = -Math.cos(input.lookYaw);
    const rightX = Math.cos(input.lookYaw);
    const rightZ = -Math.sin(input.lookYaw);

    const desiredVelX = (input.moveZ * forwardX + input.moveX * rightX) * PRONE.MaxProneSpeed;
    const desiredVelZ = (input.moveZ * forwardZ + input.moveX * rightZ) * PRONE.MaxProneSpeed;

    return { x: desiredVelX, z: desiredVelZ };
  }

  private tryExitProne(ctx: MovementCtx, preferCrouch = false): IMovementState | null {
    if (preferCrouch) {
      if (this.hasClearance(ctx, CAPSULE.CrouchHalf)) {
        return this.transitionToCrouching();
      }
      if (this.hasClearance(ctx, CAPSULE.HalfHeight)) {
        return this.transitionToWalking();
      }
      return null;
    }

    if (this.hasClearance(ctx, CAPSULE.HalfHeight)) {
      return this.transitionToWalking();
    }
    if (this.hasClearance(ctx, CAPSULE.CrouchHalf)) {
      return this.transitionToCrouching();
    }
    return null;
  }

  private hasClearance(ctx: MovementCtx, targetHalfHeight: number): boolean {
    return true;
  }

  private transitionToWalking(): IMovementState {
    if (!this.factory) {
      throw new Error("StateFactory not injected into ProneState");
    }
    const walkingState = this.factory.createWalkingState();
    if (walkingState.setInitialVelocity) {
      walkingState.setInitialVelocity({ x: this.currentVelocity.x, z: this.currentVelocity.z });
    }
    return walkingState;
  }

  private transitionToCrouching(): IMovementState {
    if (!this.factory) {
      throw new Error("StateFactory not injected into ProneState");
    }
    const crouchingState = this.factory.createCrouchingState();
    if (crouchingState.setInitialVelocity) {
      crouchingState.setInitialVelocity({ x: this.currentVelocity.x, z: this.currentVelocity.z });
    }
    return crouchingState;
  }
}


