import RAPIER from "@dimforge/rapier3d-compat";
import { CAPSULE, CROUCH } from "../physics/constants.js";
import { COLLISION_GROUPS } from "../physics/collision-groups.js";

/** Cylinder half-height used by CrouchingState.enter. */
export const CROUCH_CAPSULE_HALF = CAPSULE.HalfHeight * CROUCH.HeightScale;

/** Cylinder half-height used by SlidingState.enter. */
export const SLIDE_CAPSULE_HALF = CAPSULE.HalfHeight * 0.4;

const IDENTITY_ROT = { x: 0, y: 0, z: 0, w: 1 };
const HEIGHT_EPS = 1e-6;
/** Lift the probe so the taller capsule does not report the floor as a block. */
const CLEARANCE_FLOOR_SKIN = 0.05;

export function capsuleFootY(
  centerY: number,
  halfHeight: number,
  radius = CAPSULE.Radius,
): number {
  return centerY - halfHeight - radius;
}

export function capsuleCenterY(
  footY: number,
  halfHeight: number,
  radius = CAPSULE.Radius,
): number {
  return footY + halfHeight + radius;
}

/**
 * Resize a standing capsule while keeping the lowest point (feet) fixed.
 * Rapier capsules grow along +Y and -Y from the body center, so a raw
 * `setHalfHeight` would sink the feet or lift the player.
 */
export function resizeCapsuleKeepFeet(
  body: RAPIER.RigidBody,
  collider: RAPIER.Collider,
  newHalfHeight: number,
): void {
  const oldHalf = collider.halfHeight();
  if (Math.abs(newHalfHeight - oldHalf) < HEIGHT_EPS) return;

  const radius = collider.radius();
  const pos = body.translation();
  const footY = capsuleFootY(pos.y, oldHalf, radius);
  const next = { x: pos.x, y: capsuleCenterY(footY, newHalfHeight, radius), z: pos.z };

  collider.setHalfHeight(newHalfHeight);
  body.setTranslation(next, true);
  body.setNextKinematicTranslation(next);
}

/**
 * True if a taller capsule at the same feet would not overlap world geometry.
 * Excludes the player's own collider and rigid body (movement + hitbox sensors).
 * Query groups match PLAYER vs WORLD, same as movement collision.
 */
export function hasCapsuleClearance(
  world: RAPIER.World,
  body: RAPIER.RigidBody,
  collider: RAPIER.Collider,
  targetHalfHeight: number,
): boolean {
  const currentHalf = collider.halfHeight();
  if (targetHalfHeight <= currentHalf + HEIGHT_EPS) return true;

  const radius = collider.radius();
  const pos = body.translation();
  const footY = capsuleFootY(pos.y, currentHalf, radius);
  const targetPos = {
    x: pos.x,
    y: capsuleCenterY(footY, targetHalfHeight, radius) + CLEARANCE_FLOOR_SKIN,
    z: pos.z,
  };

  const hit = world.intersectionWithShape(
    targetPos,
    IDENTITY_ROT,
    new RAPIER.Capsule(targetHalfHeight, radius),
    RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
    COLLISION_GROUPS.PLAYER,
    collider,
    body,
  );
  return hit === null;
}
