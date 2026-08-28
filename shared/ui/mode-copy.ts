export type PublicGameModeId = "deathmatch" | "search_destroy";

export function lobbyModeCopy(mode: PublicGameModeId): { title: string; detail: string } {
  if (mode === "deathmatch") {
    return { title: "Deathmatch", detail: "First to 5 kills" };
  }
  return { title: "Search & Destroy", detail: "3 lives · First to 3 rounds" };
}

export function overlayOutcomeTitle(args: {
  gameMode: string;
  localWon: boolean;
  winnerTeam?: string;
  hasLocalTeam?: boolean;
}): string {
  if (args.gameMode === "deathmatch" || args.hasLocalTeam) {
    return args.localWon ? "VICTORY" : "DEFEAT";
  }
  const team = args.winnerTeam === "ghosts" ? "GHOSTS" : "SENTINELS";
  return `${team} WIN`;
}
