import { beforeAll, describe, expect, it } from "vitest";
import RAPIER from "@dimforge/rapier3d-compat";
import { buildMapColliders } from "../../shared/world/map-physics.js";
import {
  assertDeathmatchMap,
  assertSearchDestroyMap,
  getDefaultMapId,
  getGameplayMap,
  resolveRoomMapId,
} from "../../shared/world/map-registry.js";
import { SHOOT_HOUSE_NEON } from "../../shared/world/maps/shoot-house-neon.js";
import { MAP_CONTRACT_SMOKE } from "../../shared/world/maps/map-contract-smoke.js";
import type { GameplayMapDefinition } from "../../shared/world/map-types.js";
import { pickSpawnPoint, isInSpawnProtectionZone } from "../src/spawn/spawn-select.js";
import type { PlayerRuntime } from "../src/player-runtime.js";
import {
  getMapVisuals,
  resolveLevelRenderer,
} from "../../client/src/world/maps/map-registry.ts";

function aliveAt(x: number, y: number, z: number): PlayerRuntime {
  return { schema: { isDead: false, x, y, z } } as PlayerRuntime;
}

describe("canonical map contract", () => {
  beforeAll(async () => {
    await RAPIER.init();
  });

  it("registers Shoot House as default and the smoke fixture as a second map", () => {
    expect(getDefaultMapId()).toBe("shoot-house-neon");
    expect(resolveRoomMapId(undefined, undefined)).toBe("shoot-house-neon");
    expect(resolveRoomMapId("map-contract-smoke", "shoot-house-neon")).toBe("map-contract-smoke");

    const shootHouse = getGameplayMap("shoot-house-neon");
    const smoke = getGameplayMap("map-contract-smoke");

    expect(shootHouse).toBe(SHOOT_HOUSE_NEON);
    expect(smoke).toBe(MAP_CONTRACT_SMOKE);
    expect(shootHouse.boundsHalfSize).not.toBe(smoke.boundsHalfSize);
    expect(shootHouse.obstacles.length).toBeGreaterThan(0);
    expect(shootHouse.occluders.length).toBeGreaterThan(0);
    expect(shootHouse.breakables.length).toBeGreaterThan(0);
    expect(smoke.obstacles.length).toBeGreaterThan(0);
  });

  it("throws on unknown map ids", () => {
    expect(() => getGameplayMap("not-a-map")).toThrow(/Unknown map id/);
    expect(() => resolveRoomMapId("not-a-map")).toThrow(/Unknown map id/);
  });

  it("builds colliders for both maps", () => {
    for (const id of ["shoot-house-neon", "map-contract-smoke"] as const) {
      const map = getGameplayMap(id);
      const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
      const { breakableColliders } = buildMapColliders(RAPIER, world, map);
      expect(breakableColliders.length).toBe(map.breakables.length);
      const expected =
        1 + 4 + map.obstacles.length + map.occluders.length + map.breakables.length;
      expect(world.colliders.len()).toBe(expected);
      world.free();
    }
  });

  it("picks spawns and spawn protection from the map argument, not a global", () => {
    const shootHouse = getGameplayMap("shoot-house-neon");
    const smoke = getGameplayMap("map-contract-smoke");
    const players = new Map<string, PlayerRuntime>([["a", aliveAt(0, 1, 0)]]);
    const noTeam = () => undefined;

    const smokePick = pickSpawnPoint(smoke, players, undefined, noTeam);
    const shootHousePick = pickSpawnPoint(shootHouse, players, undefined, noTeam);

    expect(smoke.spawnPoints).toContainEqual(smokePick);
    expect(shootHouse.spawnPoints).toContainEqual(shootHousePick);
    expect(Math.abs(smokePick.z)).toBe(10);
    expect(Math.abs(shootHousePick.z)).toBe(26);

    expect(isInSpawnProtectionZone(smoke, 0, 2, -10)).toBe(true);
    expect(isInSpawnProtectionZone(shootHouse, 0, 2, -10)).toBe(false);
    expect(isInSpawnProtectionZone(shootHouse, 0, 2, -26)).toBe(true);
    expect(isInSpawnProtectionZone(smoke, 0, 2, -26)).toBe(false);
  });

  it("uses CoreLevel for registered maps that are not Shoot House", () => {
    expect(resolveLevelRenderer("shoot-house-neon")).toBe("bespoke");
    expect(resolveLevelRenderer("map-contract-smoke")).toBe("core");
    expect(() => resolveLevelRenderer("not-a-map")).toThrow(/Unknown map id/);
  });

  it("uses Shoot House visuals and a generic description for other maps", () => {
    const shootHouse = getMapVisuals("shoot-house-neon");
    expect(shootHouse.displayName).toBe("Shoot House Neon");
    expect(shootHouse.skyboxPath).toBe("/skybox/cyberpunk");

    const smoke = getMapVisuals("map-contract-smoke");
    expect(smoke.displayName).toBe(getGameplayMap("map-contract-smoke").name);
    expect(smoke.skyboxPath).toBeUndefined();
    expect(() => getMapVisuals("not-a-map")).toThrow(/Unknown map id/);
  });

  it("rejects Search & Destroy on a map missing terminals", () => {
    const incomplete: GameplayMapDefinition = {
      ...getGameplayMap("map-contract-smoke"),
      uploadTerminals: [{ id: "A", x: 0, y: 0, z: 0, radius: 2.5 }],
    };
    expect(() => assertSearchDestroyMap(incomplete)).toThrow(/upload terminals A and B/);
    expect(() => assertDeathmatchMap({ ...incomplete, spawnPoints: [] })).toThrow(/no spawnPoints/);
    expect(() => assertSearchDestroyMap(getGameplayMap("map-contract-smoke"))).not.toThrow();
    expect(() => assertSearchDestroyMap(getGameplayMap("shoot-house-neon"))).not.toThrow();
  });
});
