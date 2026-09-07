import type { SpawnPoint } from "@shared/world/map-types.js";
import { BaseGameMode } from "../game-modes/base-game-mode.js";
import { SearchDestroyMode } from "../game-modes/search-destroy-mode.js";
import type { TeamId } from "../game-modes/team-manager.js";

/**
 * Search & Destroy must know the player's team before the first world spawn.
 * Deathmatch / Explore add the player and then pick without a team.
 */
export function beginRoomJoin(args: {
  sessionId: string;
  gameMode: BaseGameMode;
  pickSpawn: (sessionId: string) => SpawnPoint;
}): { spawn: SpawnPoint; teamId?: TeamId } {
  args.gameMode.addPlayer(args.sessionId);
  const sdMode = args.gameMode instanceof SearchDestroyMode ? args.gameMode : null;
  try {
    const teamId = sdMode ? sdMode.getTeamManager().autoAssignTeam(args.sessionId) : undefined;
    const spawn = args.pickSpawn(args.sessionId);
    return { spawn, teamId };
  } catch (err) {
    rollbackRoomJoin(args.gameMode, args.sessionId);
    throw err;
  }
}

export function rollbackRoomJoin(gameMode: BaseGameMode, sessionId: string): void {
  gameMode.removePlayer(sessionId);
  if (gameMode instanceof SearchDestroyMode) {
    gameMode.getTeamManager().removePlayer(sessionId);
  }
}
