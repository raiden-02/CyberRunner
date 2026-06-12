import RAPIER from "@dimforge/rapier3d-compat";
import { buildMapColliders, createPlayerPhysics } from "@shared/world/map-physics.js";
import { SHOOT_HOUSE_NEON_COLLISION } from "@shared/world/maps/shoot-house-neon.js";
import { CharacterController } from "@shared/movement/character-controller.js";
import { CAPSULE } from "@shared/physics/constants.js";
import type { CharacterControllerSnapshot, InputMsg, MovementState } from "@shared/movement/types.js";
import { FIXED_DT } from "@shared/net/fixed-tick.js";

let rapierInitialized = false;

export async function initRapier(): Promise<void> {
  if (rapierInitialized) return;
  await RAPIER.init();
  rapierInitialized = true;
}

/**
 * Client prediction world: local capsule plus static map colliders.
 * Other players are not simulated here.
 */
export class PhysicsWorld {
  private world: RAPIER.World;
  private ctrl: CharacterController;
  private body: RAPIER.RigidBody;
  private tickTime = 0;

  constructor() {
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = FIXED_DT;
    buildMapColliders(RAPIER, this.world, SHOOT_HOUSE_NEON_COLLISION);

    const { body, collider, controller } = createPlayerPhysics(
      RAPIER, this.world,
      0, CAPSULE.HalfHeight + CAPSULE.Radius, 0,
      CAPSULE.HalfHeight, CAPSULE.Radius,
    );

    this.body = body;
    this.ctrl = new CharacterController(body, collider, controller);
  }

  /** Spawn / respawn / real teleport. Resets controller state. */
  hardResetTo(x: number, y: number, z: number): void {
    this.ctrl.resetAfterTeleport();
    this.placeAt(x, y, z);
    this.world.step();
  }

  /** Move the body without touching movement-state internals. */
  placeAt(x: number, y: number, z: number): void {
    this.body.setTranslation({ x, y, z }, true);
    this.body.setNextKinematicTranslation({ x, y, z });
  }

  capture(): CharacterControllerSnapshot {
    return this.ctrl.capture();
  }

  restore(snap: CharacterControllerSnapshot): void {
    this.ctrl.applySnapshot(snap);
  }

  getPosition(): { x: number; y: number; z: number } {
    const t = this.body.translation();
    return { x: t.x, y: t.y, z: t.z };
  }

  setSpeedMultiplier(mult: number): void {
    this.ctrl.setSpeedMultiplier(mult);
  }

  simulateTick(input: InputMsg, now: number): void {
    this.ctrl.updateInput(input);
    this.ctrl.update(this.world, FIXED_DT, now);
    this.world.step();
    this.tickTime += FIXED_DT;
  }

  getTickTime(): number {
    return this.tickTime;
  }

  currentState(): MovementState {
    return this.ctrl.currentState();
  }

  capsuleHalfHeight(): number {
    return this.ctrl.collider.halfHeight();
  }

  dispose(): void {
    this.world.free();
  }
}
