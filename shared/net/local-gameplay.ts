import { isGameplayActive, type GameplayActivity } from "./gameplay-input.js";

export function shouldSimulateLocalFire(args: {
  gameplayActive: boolean;
  inputFiring: boolean;
  canFire: boolean;
}): boolean {
  return args.gameplayActive && args.inputFiring && args.canFire;
}

export function shouldApplyLocalWeaponSwitch(gameplayActive: boolean): boolean {
  return gameplayActive;
}

export function shouldSendSpikeClientAction(activity: GameplayActivity): boolean {
  return isGameplayActive(activity);
}
