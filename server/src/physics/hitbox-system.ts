import * as RAPIER from "@dimforge/rapier3d-compat";
import { HITBOX, DAMAGE_MULTIPLIERS } from "./constants.js";
import type { BodyPartHit } from "../net/messages.js";

export type BodyPart = BodyPartHit;

export interface HitboxSet {
  bodyHandle: number;
  colliders: Map<number, BodyPart>;
}

const hitboxRegistry = new Map<number, { playerId: string; bodyPart: BodyPart }>();

export function getHitboxInfo(colliderHandle: number): { playerId: string; bodyPart: BodyPart } | undefined {
  return hitboxRegistry.get(colliderHandle);
}

export function getDamageMultiplier(bodyPart: BodyPart): number {
  switch (bodyPart) {
    case "head": return DAMAGE_MULTIPLIERS.head;
    case "upperTorso": return DAMAGE_MULTIPLIERS.upperTorso;
    case "lowerTorso": return DAMAGE_MULTIPLIERS.lowerTorso;
    case "leftArm":
    case "rightArm": return DAMAGE_MULTIPLIERS.arm;
    case "leftLeg":
    case "rightLeg": return DAMAGE_MULTIPLIERS.leg;
    default: return 1.0;
  }
}

function createSensorCollider(
  world: RAPIER.World,
  parentBody: RAPIER.RigidBody,
  desc: RAPIER.ColliderDesc
): RAPIER.Collider {
  desc.setSensor(true).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
  return world.createCollider(desc, parentBody);
}

export function createHitboxes(
  world: RAPIER.World,
  parentBody: RAPIER.RigidBody,
  playerId: string
): HitboxSet {
  const colliders = new Map<number, BodyPart>();
  const bodyHandle = parentBody.handle;

  const parts: Array<{ desc: RAPIER.ColliderDesc; part: BodyPart }> = [
    { desc: RAPIER.ColliderDesc.ball(HITBOX.Head.radius).setTranslation(0, HITBOX.Head.offsetY, 0), part: "head" },
    { desc: RAPIER.ColliderDesc.cuboid(HITBOX.UpperTorso.halfExtents.x, HITBOX.UpperTorso.halfExtents.y, HITBOX.UpperTorso.halfExtents.z).setTranslation(0, HITBOX.UpperTorso.offsetY, 0), part: "upperTorso" },
    { desc: RAPIER.ColliderDesc.cuboid(HITBOX.LowerTorso.halfExtents.x, HITBOX.LowerTorso.halfExtents.y, HITBOX.LowerTorso.halfExtents.z).setTranslation(0, HITBOX.LowerTorso.offsetY, 0), part: "lowerTorso" },
    { desc: RAPIER.ColliderDesc.capsule(HITBOX.Arm.halfHeight, HITBOX.Arm.radius).setTranslation(-HITBOX.Arm.offsetX, HITBOX.Arm.offsetY, 0), part: "leftArm" },
    { desc: RAPIER.ColliderDesc.capsule(HITBOX.Arm.halfHeight, HITBOX.Arm.radius).setTranslation(HITBOX.Arm.offsetX, HITBOX.Arm.offsetY, 0), part: "rightArm" },
    { desc: RAPIER.ColliderDesc.capsule(HITBOX.Leg.halfHeight, HITBOX.Leg.radius).setTranslation(-HITBOX.Leg.offsetX, HITBOX.Leg.offsetY, 0), part: "leftLeg" },
    { desc: RAPIER.ColliderDesc.capsule(HITBOX.Leg.halfHeight, HITBOX.Leg.radius).setTranslation(HITBOX.Leg.offsetX, HITBOX.Leg.offsetY, 0), part: "rightLeg" },
  ];

  for (const { desc, part } of parts) {
    const collider = createSensorCollider(world, parentBody, desc);
    colliders.set(collider.handle, part);
    hitboxRegistry.set(collider.handle, { playerId, bodyPart: part });
  }

  return { bodyHandle, colliders };
}

export function removeHitboxes(hitboxSet: HitboxSet): void {
  for (const handle of hitboxSet.colliders.keys()) {
    hitboxRegistry.delete(handle);
  }
}
