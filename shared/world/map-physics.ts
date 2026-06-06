import type RAPIER from "@dimforge/rapier3d-compat";
import type { MapCollisionData } from "./map-types.js";
import { COLLISION_GROUPS } from "../physics/collision-groups.js";

/**
 * Build all static collision geometry into a RAPIER world.
 * Called identically by server and client to guarantee matching worlds.
 *
 * Breakable colliders are returned so the server can track HP/destruction;
 * the client can ignore them for prediction purposes.
 */
export function buildMapColliders(
  RAPIER_NS: typeof RAPIER,
  world: RAPIER.World,
  map: MapCollisionData,
): { breakableColliders: RAPIER.Collider[] } {
  // Ground plane
  world.createCollider(
    RAPIER_NS.ColliderDesc.cuboid(map.boundsHalfSize, map.groundThickness, map.boundsHalfSize)
      .setTranslation(0, -map.groundThickness, 0)
      .setFriction(1.0)
      .setCollisionGroups(COLLISION_GROUPS.WORLD),
  );

  // Boundary walls (4 sides)
  const wt = map.wallThickness;
  const wh = map.wallHeight / 2;
  const hs = map.boundsHalfSize;
  for (const [tx, tz, hx, hz] of [
    [hs + wt, 0, wt, hs],
    [-hs - wt, 0, wt, hs],
    [0, hs + wt, hs, wt],
    [0, -hs - wt, hs, wt],
  ] as [number, number, number, number][]) {
    world.createCollider(
      RAPIER_NS.ColliderDesc.cuboid(hx, wh, hz)
        .setTranslation(tx, wh, tz)
        .setFriction(0.8)
        .setCollisionGroups(COLLISION_GROUPS.WORLD),
    );
  }

  for (const obs of map.obstacles) {
    world.createCollider(
      RAPIER_NS.ColliderDesc.cuboid(obs.hx, obs.hy, obs.hz)
        .setTranslation(obs.x, obs.y, obs.z)
        .setFriction(0.9)
        .setCollisionGroups(COLLISION_GROUPS.WORLD),
    );
  }

  for (const occ of map.occluders) {
    world.createCollider(
      RAPIER_NS.ColliderDesc.cuboid(occ.hx, occ.hy, occ.hz)
        .setTranslation(occ.x, occ.y, occ.z)
        .setFriction(0.9)
        .setCollisionGroups(COLLISION_GROUPS.WORLD),
    );
  }

  const breakableColliders: RAPIER.Collider[] = [];
  for (const b of map.breakables) {
    breakableColliders.push(world.createCollider(
      RAPIER_NS.ColliderDesc.cuboid(b.hx, b.hy, b.hz)
        .setTranslation(b.x, b.y, b.z)
        .setFriction(0.9)
        .setCollisionGroups(COLLISION_GROUPS.WORLD),
    ));
  }

  return { breakableColliders };
}

/**
 * Create a player kinematic body + capsule collider + character controller
 * with identical parameters on both server and client.
 */
export function createPlayerPhysics(
  RAPIER_NS: typeof RAPIER,
  world: RAPIER.World,
  x: number, y: number, z: number,
  capsuleHalfHeight: number,
  capsuleRadius: number,
): {
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  controller: RAPIER.KinematicCharacterController;
} {
  const body = world.createRigidBody(
    RAPIER_NS.RigidBodyDesc.kinematicPositionBased().setTranslation(x, y, z),
  );

  const collider = world.createCollider(
    RAPIER_NS.ColliderDesc.capsule(capsuleHalfHeight, capsuleRadius)
      .setFriction(0.7)
      .setRestitution(0.0)
      .setActiveCollisionTypes(RAPIER_NS.ActiveCollisionTypes.DEFAULT)
      .setActiveEvents(RAPIER_NS.ActiveEvents.COLLISION_EVENTS)
      .setCollisionGroups(COLLISION_GROUPS.PLAYER),
    body,
  );

  const controller = world.createCharacterController(0.1);
  controller.enableAutostep(0.3, 0.2, true);
  controller.enableSnapToGround(0.2);
  controller.setApplyImpulsesToDynamicBodies(true);

  return { body, collider, controller };
}
