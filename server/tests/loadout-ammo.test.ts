import { describe, expect, it } from "vitest";
import { getWeaponConfig, isValidWeapon } from "../../shared/weapons/weapon-config.js";
import { PlayerState } from "../src/PlayerState.js";
import { createPlayerRuntime, equipWeapon, refillAmmo } from "../src/player-runtime.js";

function runtimeWith(primary: string, secondary: string) {
  const schema = new PlayerState();
  schema.primaryWeaponId = primary;
  schema.secondaryWeaponId = secondary;
  schema.equippedWeapon = primary;
  const runtime = createPlayerRuntime({} as never, schema, {} as never);
  refillAmmo(runtime);
  return runtime;
}

describe("loadout ammo", () => {
  it("keeps each weapon's ammo across switches instead of refilling", () => {
    const player = runtimeWith("AR_1", "PISTOL_1");
    player.schema.ammoInMag = 3;
    player.schema.ammoReserve = 0;

    equipWeapon(player, "PISTOL_1", 1);
    expect(player.schema.ammoInMag).toBe(getWeaponConfig("PISTOL_1")!.magazineSize);
    player.schema.ammoInMag = 7;

    equipWeapon(player, "AR_1", 0);
    expect(player.schema.ammoInMag).toBe(3);
    expect(player.schema.ammoReserve).toBe(0);

    equipWeapon(player, "PISTOL_1", 1);
    expect(player.schema.ammoInMag).toBe(7);
  });

  it("refills every loadout weapon on respawn", () => {
    const player = runtimeWith("AR_1", "PISTOL_1");
    player.schema.ammoInMag = 0;
    equipWeapon(player, "PISTOL_1", 1);
    player.schema.ammoInMag = 0;

    refillAmmo(player);
    expect(player.schema.ammoInMag).toBe(getWeaponConfig("PISTOL_1")!.magazineSize);
    equipWeapon(player, "AR_1", 0);
    expect(player.schema.ammoInMag).toBe(getWeaponConfig("AR_1")!.magazineSize);
  });

  it("rejects prototype keys as weapon ids", () => {
    expect(isValidWeapon("AR_1")).toBe(true);
    expect(isValidWeapon("constructor")).toBe(false);
    expect(isValidWeapon(42)).toBe(false);
    expect(getWeaponConfig("toString")).toBeUndefined();
  });
});
