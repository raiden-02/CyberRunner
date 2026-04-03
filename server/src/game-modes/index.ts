export { BaseGameMode, type RoundEndResult, type PlayerModeState, type RoundState } from "./base-game-mode.js";
export { DeathmatchMode } from "./deathmatch-mode.js";
export { SearchDestroyMode } from "./search-destroy-mode.js";
export { TeamManager, type TeamId, type TeamState } from "./team-manager.js";
export { SpikeManager, type SpikeState } from "./spike-manager.js";
export { 
  type GameModeConfig, 
  type GameModeId, 
  GAME_MODES, 
  getGameModeConfig, 
  isValidGameMode 
} from "./game-mode-config.js";

import { BaseGameMode } from "./base-game-mode.js";
import { DeathmatchMode } from "./deathmatch-mode.js";
import { SearchDestroyMode } from "./search-destroy-mode.js";
import { GameModeId, isValidGameMode } from "./game-mode-config.js";
import type { UploadTerminal } from "../world/maps/map-types.js";

export function createGameMode(
  modeId: string,
  terminals?: UploadTerminal[]
): BaseGameMode {
  const validModeId: GameModeId = isValidGameMode(modeId) ? modeId : "deathmatch";
  
  switch (validModeId) {
    case "search_destroy":
      return new SearchDestroyMode(terminals);
    case "deathmatch":
    default:
      return new DeathmatchMode();
  }
}
