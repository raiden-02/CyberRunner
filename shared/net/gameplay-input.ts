export type GameplayActivity = {
  lobbyState?: string;
  isRoundActive?: boolean;
  isGameOver?: boolean;
};

/**
 * Gameplay commands are valid only during an active playable period.
 * Waiting lobby, inter-round (playing but round not active), and match end are inactive.
 */
export function isGameplayActive(state: GameplayActivity): boolean {
  if (state.isGameOver) return false;
  if (state.lobbyState !== "playing") return false;
  if (state.isRoundActive === false) return false;
  return true;
}

export function shouldSendGameplayInput(state: GameplayActivity): boolean {
  return isGameplayActive(state);
}
