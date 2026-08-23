import { beforeAll, describe, expect, it } from "vitest";
import RAPIER from "@dimforge/rapier3d-compat";
import { buildMapColliders } from "../../shared/world/map-physics.js";
import { getGameplayMap } from "../../shared/world/map-registry.js";
import { applyBreakableDamage, type BreakableRuntime } from "../src/systems/combat-tick.js";

describe("breakable runtime", () => {
  beforeAll(async () => {
    await RAPIER.init();
  });

  it("destroys a breakable and removes its collider without changing map data", () => {
    const map = getGameplayMap("map-contract-smoke");
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    const { breakableColliders } = buildMapColliders(RAPIER, world, map);
    expect(breakableColliders.length).toBe(1);

    const runtime: BreakableRuntime = {
      id: 0,
      hp: map.breakables[0].hp,
      collider: breakableColliders[0],
    };
    const byHandle = new Map<number, BreakableRuntime>([[runtime.collider.handle, runtime]]);
    const byId = new Map<number, BreakableRuntime>([[0, runtime]]);
    const events: unknown[] = [];
    const before = world.colliders.len();

    applyBreakableDamage(world, byHandle, byId, runtime.collider.handle, runtime.hp, (type, message) => {
      events.push({ type, message });
    });

    expect(byHandle.size).toBe(0);
    expect(byId.size).toBe(0);
    expect(world.colliders.len()).toBe(before - 1);
    expect(events).toEqual([{ type: "breakable_destroyed", message: { id: 0 } }]);
    expect(map.breakables.length).toBe(1);
    world.free();
  });
});
