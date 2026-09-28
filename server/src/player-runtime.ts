import type { CharacterController } from "@shared/movement/character-controller.js";
import { ServerInputQueue } from "./net/server-input-queue.js";
import type { PlayerState } from "./PlayerState.js";
import type { HitboxSet } from "./physics/hitbox-system.js";
import { getWeaponConfig } from "@shared/weapons/weapon-config.js";

type AimDir = { x: number; y: number; z: number };
type AmmoCount = { mag: number; reserve: number };

export type PlayerRuntime = {
  ctrl: CharacterController;
  schema: PlayerState;
  hitboxes: HitboxSet;
  inputQueue: ServerInputQueue;
  aimDir: AimDir | null;
  godMode: boolean;
  unlimitedAmmo: boolean;
  /** Ammo left in loadout weapons the player is not holding. */
  holsteredAmmo: Map<string, AmmoCount>;
};

export function createPlayerRuntime(
  ctrl: CharacterController,
  schema: PlayerState,
  hitboxes: HitboxSet,
): PlayerRuntime {
  return {
    ctrl,
    schema,
    hitboxes,
    inputQueue: new ServerInputQueue(),
    aimDir: null,
    godMode: false,
    unlimitedAmmo: false,
    holsteredAmmo: new Map(),
  };
}

/** Swaps weapons without refilling: the outgoing weapon's ammo is kept for when it comes back. */
export function equipWeapon(player: PlayerRuntime, weaponId: string, slot: number): void {
  const { schema } = player;
  player.holsteredAmmo.set(schema.equippedWeapon, { mag: schema.ammoInMag, reserve: schema.ammoReserve });

  schema.activeSlot = slot;
  schema.equippedWeapon = weaponId;
  const held = player.holsteredAmmo.get(weaponId);
  const config = getWeaponConfig(weaponId);
  schema.ammoInMag = held?.mag ?? config?.magazineSize ?? 0;
  schema.ammoReserve = held?.reserve ?? config?.reserveMax ?? 0;
  player.holsteredAmmo.delete(weaponId);
}

/** Full ammo for every loadout weapon. Used on join, respawn, and round start. */
export function refillAmmo(player: PlayerRuntime): void {
  player.holsteredAmmo.clear();
  const config = getWeaponConfig(player.schema.equippedWeapon);
  player.schema.ammoInMag = config?.magazineSize ?? 0;
  player.schema.ammoReserve = config?.reserveMax ?? 0;
  player.schema.reloading = false;
  player.schema.reloadEndTime = 0;
}
