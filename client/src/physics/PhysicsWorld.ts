import type { MapCollisionData } from "@shared/world/map-types.js";
import { buildMapColliders, createPlayerPhysics } from "@shared/world/map-physics.js";
import { CharacterController } from "@shared/movement/character-controller.js";
import { CAPSULE } from "@shared/physics/constants.js";
import type { CharacterControllerSnapshot, InputMsg, MovementState } from "@shared/movement/types.js";
import { FIXED_DT } from "@shared/net/fixed-tick.js";
import RAPIER from "@dimforge/rapier3d-compat";

let rapierInitialized = false;

export async function initRapier(): Promise<void> {
  if (rapierInitialized) return;
  await RAPIER.init();
  rapierInitialized = true;
}

/**
 * Client prediction world. Collision must come from the same canonical
 * GameplayMapDefinition the server used for this room.
 */
export class PhysicsWorld {
  private world: RAPIER.World;
  private ctrl: CharacterController;
  private body: RAPIER.RigidBody;
  private tickTime = 0;

  constructor(map: MapCollisionData) {
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = FIXED_DT;
    buildMapColliders(RAPIER, this.world, map);

    const { body, collider, controller } = createPlayerPhysics(
      RAPIER, this.world,
      0, CAPSULE.HalfHeight + CAPSULE.Radius, 0,
      CAPSULE.HalfHeight, CAPSULE.Radius,
    );

    this.body = body;
    this.ctrl = new CharacterController(body, collider, controller);
  }

  hardResetTo(x: number, y: number, z: number): void {
    this.ctrl.resetAfterTeleport();
    this.placeAt(x, y, z);
    this.world.step();
  }

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
