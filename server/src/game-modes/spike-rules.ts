export type SpikePlayerAction = "upload" | "decrypt" | "pickup" | "cancel";

/** Team gate used by GameRoom before SpikeManager runs. */
export function teamMaySpikeAction(teamId: string, action: SpikePlayerAction): boolean {
  if (action === "upload" || action === "pickup") return teamId === "ghosts";
  if (action === "decrypt") return teamId === "sentinels";
  return true;
}
