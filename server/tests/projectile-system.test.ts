import { beforeAll, describe, expect, it } from "vitest";
import RAPIER from "@dimforge/rapier3d-compat";
import { COLLISION_GROUPS } from "../../shared/physics/collision-groups.js";
import { ProjectileManager } from "../src/systems/projectile-system.js";

const DT = 1 / 60;
const config = { speed: 40, lifetime: 2.5, ownerId: "owner", weaponId: "ROCKET_1" };

function worldWithWallAt(x: number): RAPIER.World {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(0.5, 5, 5).setTranslation(x, 0, 0).setCollisionGroups(COLLISION_GROUPS.WORLD),
  );
  world.step();
  return world;
}

function stepUntilImpact(pm: ProjectileManager, world: RAPIER.World, players: Array<[string, { x: number; y: number; z: number; isDead: boolean }]> = []) {
  for (let tick = 1; tick < 600; tick++) {
    const { impacts, expired } = pm.step(DT, world, players);
    if (impacts.length || expired.length) return { tick, impacts, expired };
  }
  throw new Error("projectile never resolved");
}

describe("ProjectileManager", () => {
  beforeAll(async () => {
    await RAPIER.init();
  });

  it("flies at the configured speed and detonates on the wall face", () => {
    const world = worldWithWallAt(20);
    const pm = new ProjectileManager();
    pm.spawnProjectile({ x: 0, y: 1, z: 0 }, { x: 1, y: 0, z: 0 }, config);

    const { tick, impacts } = stepUntilImpact(pm, world);
    expect(impacts).toHaveLength(1);
    expect(impacts[0]!.position.x).toBeCloseTo(19.5, 3);
    expect(tick).toBe(Math.ceil(19.5 / (config.speed * DT)));
  });

  it("fuses near a live enemy but ignores its owner and the dead", () => {
    const world = worldWithWallAt(50);
    const pm = new ProjectileManager();
    pm.spawnProjectile({ x: 0, y: 1, z: 0 }, { x: 1, y: 0, z: 0 }, config);

    const { impacts } = stepUntilImpact(pm, world, [
      ["owner", { x: 0.5, y: 1, z: 0, isDead: false }],
      ["corpse", { x: 5, y: 1, z: 0, isDead: true }],
      ["enemy", { x: 10, y: 1, z: 1, isDead: false }],
    ]);
    expect(impacts[0]!.position.x).toBeLessThan(10);
    expect(impacts[0]!.position.x).toBeGreaterThan(8);
  });

  it("expires after its lifetime", () => {
    const world = worldWithWallAt(1000);
    const pm = new ProjectileManager();
    pm.spawnProjectile({ x: 0, y: 1, z: 0 }, { x: 1, y: 0, z: 0 }, { ...config, lifetime: 0.5 });
    const { expired, tick } = stepUntilImpact(pm, world);
    expect(expired).toHaveLength(1);
    expect(tick).toBe(31);
  });
});
