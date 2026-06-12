import { afterEach, beforeAll, describe, expect, it } from "vitest";
import RAPIER from "@dimforge/rapier3d-compat";
import { CAPSULE } from "../../shared/physics/constants.js";
import { COLLISION_GROUPS } from "../../shared/physics/collision-groups.js";
import {
  CROUCH_CAPSULE_HALF,
  capsuleCenterY,
  capsuleFootY,
  hasCapsuleClearance,
  resizeCapsuleKeepFeet,
} from "../../shared/movement/capsule.js";
import { CharacterController } from "../../shared/movement/character-controller.js";
import { createPlayerPhysics } from "../../shared/world/map-physics.js";

let rapierReady = false;

beforeAll(async () => {
  if (!rapierReady) {
    await RAPIER.init();
    rapierReady = true;
  }
});

describe("capsule foot math", () => {
  it("keeps standing / crouch / prone feet on the same plane when the center moves", () => {
    const foot = 0;
    const standY = capsuleCenterY(foot, CAPSULE.HalfHeight);
    const crouchY = capsuleCenterY(foot, CROUCH_CAPSULE_HALF);
    const proneY = capsuleCenterY(foot, CAPSULE.ProneHalf);

    expect(capsuleFootY(standY, CAPSULE.HalfHeight)).toBeCloseTo(foot, 6);
    expect(capsuleFootY(crouchY, CROUCH_CAPSULE_HALF)).toBeCloseTo(foot, 6);
    expect(capsuleFootY(proneY, CAPSULE.ProneHalf)).toBeCloseTo(foot, 6);
    expect(standY).toBeGreaterThan(crouchY);
    expect(crouchY).toBeGreaterThan(proneY);
  });
});

function makeWorld() {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(8, 0.2, 8)
      .setTranslation(0, -0.2, 0)
      .setCollisionGroups(COLLISION_GROUPS.WORLD),
  );
  const spawnY = capsuleCenterY(0, CAPSULE.HalfHeight);
  const { body, collider, controller } = createPlayerPhysics(
    RAPIER, world, 0, spawnY, 0, CAPSULE.HalfHeight, CAPSULE.Radius,
  );
  return { world, body, collider, controller };
}

describe("RAPIER capsule resize and clearance", () => {
  const worlds: RAPIER.World[] = [];

  afterEach(() => {
    while (worlds.length > 0) {
      worlds.pop()!.free();
    }
  });

  it("resizes the live collider and keeps the foot Y unchanged", () => {
    const { world, body, collider } = makeWorld();
    worlds.push(world);

    const footBefore = capsuleFootY(body.translation().y, collider.halfHeight(), collider.radius());
    expect(collider.halfHeight()).toBeCloseTo(CAPSULE.HalfHeight, 5);

    resizeCapsuleKeepFeet(body, collider, CROUCH_CAPSULE_HALF);

    expect(collider.halfHeight()).toBeCloseTo(CROUCH_CAPSULE_HALF, 5);
    const footAfter = capsuleFootY(body.translation().y, collider.halfHeight(), collider.radius());
    expect(footAfter).toBeCloseTo(footBefore, 5);
  });

  it("blocks standing when a world slab sits over the crouched capsule", () => {
    const { world, body, collider } = makeWorld();
    worlds.push(world);
    resizeCapsuleKeepFeet(body, collider, CROUCH_CAPSULE_HALF);

    const crouchTop = capsuleCenterY(0, CROUCH_CAPSULE_HALF) + CROUCH_CAPSULE_HALF + CAPSULE.Radius;
    const standTop = capsuleCenterY(0, CAPSULE.HalfHeight) + CAPSULE.HalfHeight + CAPSULE.Radius;
    const slabY = (crouchTop + standTop) / 2;
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(2, 0.15, 2)
        .setTranslation(0, slabY, 0)
        .setCollisionGroups(COLLISION_GROUPS.WORLD),
    );
    world.step();

    expect(hasCapsuleClearance(world, body, collider, CAPSULE.HalfHeight)).toBe(false);
  });

  it("allows standing when nothing is overhead", () => {
    const { world, body, collider } = makeWorld();
    worlds.push(world);
    resizeCapsuleKeepFeet(body, collider, CROUCH_CAPSULE_HALF);

    expect(hasCapsuleClearance(world, body, collider, CAPSULE.HalfHeight)).toBe(true);
  });

  it("uses the shared CharacterController for client and server", () => {
    const { world, body, collider, controller } = makeWorld();
    worlds.push(world);
    const ctrl = new CharacterController(body, collider, controller);
    ctrl.setCapsuleHalfHeight(CROUCH_CAPSULE_HALF);
    expect(collider.halfHeight()).toBeCloseTo(CROUCH_CAPSULE_HALF, 5);
    expect(ctrl.currentState()).toBe(0);
  });
});
