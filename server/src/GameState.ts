import { Schema, MapSchema, type } from "@colyseus/schema";
import { PlayerState } from "./PlayerState.js";

export class GameState extends Schema {
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  
  // Game mode state
  @type("string") mapId: string = "";

  @type("string") gameMode: string = "deathmatch";
  @type("uint8") scoreLimit: number = 30;
  @type("uint16") timeRemaining: number = 600; // seconds
  @type("boolean") isGameOver: boolean = false;
  @type("string") winnerId: string = "";
  
  // Host and lobby state
  @type("string") hostId: string = "";
  @type("string") lobbyState: string = "waiting"; // waiting | starting | playing | ended
  
  // Team state (S&D)
  @type("uint8") ghostsRoundsWon: number = 0;
  @type("uint8") sentinelsRoundsWon: number = 0;
  @type("string") roundWinnerTeam: string = ""; // "ghosts" | "sentinels" | ""
  @type("string") gameWinnerTeam: string = "";
  
  // Round-based mode state (S&D)
  @type("uint8") currentRound: number = 1;
  @type("uint8") roundsToWin: number = 3;
  @type("uint16") roundTimeRemaining: number = 90;
  @type("boolean") isRoundActive: boolean = false;
  @type("string") roundWinnerId: string = "";
  
  // Data Spike state (S&D objective)
  @type("string") spikeCarrierId: string = "";
  @type("string") spikeState: string = "ground"; // ground | carried | uploading | uploaded | decrypting | decrypted
  @type("string") spikeTerminalId: string = "";
  @type("number") spikeUploadProgress: number = 0;
  @type("number") spikeDecryptProgress: number = 0;
  @type("number") spikeDetonationTimer: number = 0; // 45 second countdown when planted
  @type("number") spikeX: number = 0;
  @type("number") spikeZ: number = 0;
  @type("string") spikePlantingTeam: string = ""; // Which team planted the spike
}
