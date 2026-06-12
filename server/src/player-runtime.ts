import type { CharacterController } from "@shared/movement/character-controller.js";
import { ServerInputQueue } from "./net/server-input-queue.js";
import type { PlayerState } from "./PlayerState.js";
import type { HitboxSet } from "./physics/hitbox-system.js";

export type AimDir = { x: number; y: number; z: number };

export type PlayerRuntime = {
  ctrl: CharacterController;
  schema: PlayerState;
  hitboxes: HitboxSet;
  inputQueue: ServerInputQueue;
  aimDir: AimDir | null;
  godMode: boolean;
  unlimitedAmmo: boolean;
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
  };
}
