import { afterEach, beforeAll, describe, expect, it } from "vitest";
import RAPIER from "@dimforge/rapier3d-compat";
import { CharacterController } from "../../shared/movement/character-controller.js";
import { MovementState } from "../../shared/movement/types.js";
import { createPlayerPhysics } from "../../shared/world/map-physics.js";
import { COLLISION_GROUPS } from "../../shared/physics/collision-groups.js";
import { CAPSULE } from "../../shared/physics/constants.js";
import { FIXED_DT } from "../../shared/net/fixed-tick.js";
import { capsuleCenterY } from "../../shared/movement/capsule.js";
import type { InputMsg } from "../../shared/movement/types.js";

function idle(seq: number, extras: Partial<InputMsg> = {}): InputMsg {
  return {
    seq,
    moveX: 0,
    moveZ: 0,
    lookYaw: 0,
    lookPitch: 0,
    sprint: false,
    aiming: false,
    crouchPressed: false,
    crouchReleased: false,
    crouchHeld: false,
    jumpPressed: false,
    ...extras,
  };
}

describe("shared CharacterController one-shots and crouch", () => {
  const worlds: RAPIER.World[] = [];

  beforeAll(async () => {
    await RAPIER.init();
  });

  afterEach(() => {
    while (worlds.length > 0) worlds.pop()!.free();
  });

  function makeCtrl() {
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    world.timestep = FIXED_DT;
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(8, 0.2, 8)
        .setTranslation(0, -0.2, 0)
        .setCollisionGroups(COLLISION_GROUPS.WORLD),
    );
    const y = capsuleCenterY(0, CAPSULE.HalfHeight);
    const { body, collider, controller } = createPlayerPhysics(
      RAPIER, world, 0, y, 0, CAPSULE.HalfHeight, CAPSULE.Radius,
    );
    worlds.push(world);
    return { world, ctrl: new CharacterController(body, collider, controller) };
  }

  it("clears jump edge after one update", () => {
    const { world, ctrl } = makeCtrl();
    ctrl.updateInput(idle(1, { jumpPressed: true }));
    expect(ctrl.input.jumpPressed).toBe(true);
    ctrl.update(world, FIXED_DT, FIXED_DT);
    expect(ctrl.input.jumpPressed).toBe(false);
  });

  it("enters crouch from walking when crouch is pressed on the ground", () => {
    const { world, ctrl } = makeCtrl();
    for (let i = 1; i <= 8; i++) {
      ctrl.updateInput(idle(i));
      ctrl.update(world, FIXED_DT, i * FIXED_DT);
      world.step();
    }
    expect(ctrl.currentState()).toBe(MovementState.Walking);
    ctrl.updateInput(idle(9, { crouchPressed: true, crouchHeld: true }));
    ctrl.update(world, FIXED_DT, 9 * FIXED_DT);
    expect(ctrl.currentState()).toBe(MovementState.Crouching);
    expect(ctrl.collider.halfHeight()).toBeLessThan(CAPSULE.HalfHeight);
  });
});
