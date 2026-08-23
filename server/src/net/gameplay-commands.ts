import { isGameplayActive, type GameplayActivity } from "@shared/net/gameplay-input.js";
import { ServerInputQueue, type EnqueueResult } from "./server-input-queue.js";
import type { InputMsg } from "@shared/movement/types.js";

export type MovementAdmit = EnqueueResult | "inactive";

/** Enqueue movement only while gameplay is active. Inactive commands are dropped. */
export function enqueueIfGameplayActive(
  queue: ServerInputQueue,
  cmd: InputMsg,
  activity: GameplayActivity,
): MovementAdmit {
  if (!isGameplayActive(activity)) return "inactive";
  return queue.enqueue(cmd);
}

export function shouldAcceptGameplayCommand(activity: GameplayActivity): boolean {
  return isGameplayActive(activity);
}

export function applyFireCommand(
  player: { firing: boolean },
  firing: boolean,
  activity: GameplayActivity,
): boolean {
  if (!isGameplayActive(activity)) {
    player.firing = false;
    return false;
  }
  player.firing = firing;
  return true;
}

export function shouldAcceptSpikeAction(activity: GameplayActivity, gameMode: string): boolean {
  return gameMode === "search_destroy" && isGameplayActive(activity);
}
