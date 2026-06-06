import RAPIER from "@dimforge/rapier3d-compat";
import { buildMapColliders, createPlayerPhysics } from "@shared/world/map-physics.js";
import { SHOOT_HOUSE_NEON_COLLISION } from "@shared/world/maps/shoot-house-neon.js";
import { CharacterController } from "@shared/movement/character-controller.js";
import { CAPSULE } from "@shared/physics/constants.js";
import type { InputMsg } from "@shared/movement/types.js";

const FIXED_DT = 1 / 60;

let rapierInitialized = false;

export async function initRapier(): Promise<void> {
  if (rapierInitialized) return;
  await RAPIER.init();
  rapierInitialized = true;
}

/**
 * Client-side RAPIER physics world for prediction.
 * Uses the same map geometry, player capsule, and CharacterController as the server
 * to guarantee identical simulation outcomes.
 */
export class PhysicsWorld {
  private world: RAPIER.World;
  private ctrl: CharacterController;
  private body: RAPIER.RigidBody;
  private tickTime = 0;

  constructor() {
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    buildMapColliders(RAPIER, this.world, SHOOT_HOUSE_NEON_COLLISION);

    const { body, collider, controller } = createPlayerPhysics(
      RAPIER, this.world,
      0, CAPSULE.HalfHeight + CAPSULE.Radius, 0,
      CAPSULE.HalfHeight, CAPSULE.Radius,
    );

    this.body = body;
    this.ctrl = new CharacterController(body, collider, controller);
  }

  setPosition(x: number, y: number, z: number): void {
    this.body.setNextKinematicTranslation({ x, y, z });
    this.world.step();
  }

  getPosition(): { x: number; y: number; z: number } {
    const t = this.body.translation();
    return { x: t.x, y: t.y, z: t.z };
  }

  setSpeedMultiplier(mult: number): void {
    this.ctrl.setSpeedMultiplier(mult);
  }

  /**
   * Simulate one fixed-timestep tick: feed input -> advance controller -> step world.
   * Mirrors the exact sequence the server runs per authoritative tick.
   */
  simulateTick(input: InputMsg, now: number): void {
    this.ctrl.updateInput(input);
    this.ctrl.update(this.world, FIXED_DT, now);
    this.world.step();
    this.tickTime += FIXED_DT;
  }

  getTickTime(): number {
    return this.tickTime;
  }

  dispose(): void {
    this.world.free();
  }
}
