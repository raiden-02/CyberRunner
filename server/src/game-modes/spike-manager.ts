/**
 * Data Spike Manager
 * Handles upload/decrypt mechanics for Search & Destroy mode
 */

import { GameState } from "../GameState.js";
import { PlayerState } from "../PlayerState.js";
import type { UploadTerminal } from "@shared/world/map-types.js";

export type SpikeState = "ground" | "carried" | "uploading" | "uploaded" | "dropped" | "decrypting" | "decrypted";

const UPLOAD_TIME = 4.0;    // seconds to upload
const DECRYPT_TIME = 7.0;   // seconds to decrypt (longer than upload)
const DETONATE_TIME = 45.0; // seconds after upload completes before detonation
const PICKUP_RADIUS = 2.5;  // meters to pick up spike

function withinRadius(a: { x: number; z: number }, b: { x: number; z: number }, radius: number): boolean {
  return Math.hypot(a.x - b.x, a.z - b.z) <= radius;
}

export class SpikeManager {
  private terminals: UploadTerminal[] = [];
  private detonationTimer: number = 0;
  private uploaderId: string = "";  // Who uploaded the spike

  constructor(terminals: UploadTerminal[] = []) {
    this.terminals = terminals;
  }

  setTerminals(terminals: UploadTerminal[]): void {
    this.terminals = terminals;
  }

  // Check if player is near a terminal
  getNearbyTerminal(x: number, z: number): UploadTerminal | null {
    return this.terminals.find((t) => withinRadius({ x, z }, t, t.radius)) ?? null;
  }

  // Start uploading (planting)
  startUpload(
    sessionId: string,
    gameState: GameState,
    player: PlayerState,
    terminal: UploadTerminal
  ): boolean {
    if (gameState.spikeState !== "carried") return false;
    if (gameState.spikeCarrierId !== sessionId) return false;
    if (!player.hasSpike) return false;

    gameState.spikeState = "uploading";
    gameState.spikeTerminalId = terminal.id;
    gameState.spikeUploadProgress = 0;
    player.isUploading = true;

    return true;
  }

  // Cancel upload (player moved or died)
  cancelUpload(
    sessionId: string,
    gameState: GameState,
    player: PlayerState
  ): void {
    if (gameState.spikeState !== "uploading") return;
    if (gameState.spikeCarrierId !== sessionId) return;

    gameState.spikeState = "carried";
    gameState.spikeUploadProgress = 0;
    gameState.spikeTerminalId = "";
    player.isUploading = false;
  }

  // Start decrypting (defusing)
  startDecrypt(
    sessionId: string,
    gameState: GameState,
    player: PlayerState
  ): boolean {
    if (gameState.spikeState !== "uploaded") return false;
    if (gameState.spikeCarrierId === sessionId) return false;
    if (player.isDead) return false;

    const terminal = this.terminals.find(t => t.id === gameState.spikeTerminalId);
    if (!terminal || !withinRadius(player, terminal, terminal.radius)) return false;

    gameState.spikeState = "decrypting";
    player.isDecrypting = true;
    return true;
  }

  // Cancel decrypt
  cancelDecrypt(
    gameState: GameState,
    player: PlayerState
  ): void {
    if (gameState.spikeState !== "decrypting") return;
    if (!player.isDecrypting) return;

    gameState.spikeState = "uploaded";
    player.isDecrypting = false;
    // Note: progress is NOT reset on cancel (partial decrypt preserved)
  }

  // Handle spike carrier death
  onCarrierDeath(
    carrierId: string,
    gameState: GameState,
    players: Map<string, { schema: PlayerState }>
  ): void {
    const carrier = players.get(carrierId);
    if (!carrier) return;

    carrier.schema.hasSpike = false;
    carrier.schema.isUploading = false;

    // Only drop the spike if it hasn't been planted yet
    // Once planted (uploaded/decrypting), spike stays at terminal
    if (gameState.spikeState === "carried" || gameState.spikeState === "uploading") {
      if (gameState.spikeState === "uploading") {
        gameState.spikeUploadProgress = 0;
      }
      
      // Drop the spike at carrier's location
      gameState.spikeState = "dropped";
      gameState.spikeX = carrier.schema.x;
      gameState.spikeZ = carrier.schema.z;
      gameState.spikeCarrierId = "";
    }
    // If spike is already planted (uploaded/decrypting), do nothing - it stays planted
  }

  // Pickup spike from ground or dropped state
  pickupSpike(
    sessionId: string,
    gameState: GameState,
    player: PlayerState
  ): boolean {
    // Can pick up from ground (initial spawn) or dropped (after carrier death)
    if (gameState.spikeState !== "ground" && gameState.spikeState !== "dropped") return false;
    if (player.isDead) return false;

    if (!withinRadius(player, { x: gameState.spikeX, z: gameState.spikeZ }, PICKUP_RADIUS)) return false;

    player.hasSpike = true;
    gameState.spikeCarrierId = sessionId;
    gameState.spikeState = "carried";

    return true;
  }

  // Update tick - returns round end reason if any
  update(
    dt: number,
    gameState: GameState,
    players: Map<string, { schema: PlayerState }>
  ): { ended: boolean; reason?: string; winnerId?: string } {
    this.cancelAbandonedActions(gameState, players);

    // Handle upload progress
    if (gameState.spikeState === "uploading") {
      const progress = gameState.spikeUploadProgress + (dt / UPLOAD_TIME) * 100;
      gameState.spikeUploadProgress = Math.min(100, progress);

      if (gameState.spikeUploadProgress >= 100) {
        // Upload complete
        gameState.spikeState = "uploaded";
        gameState.spikePlantingTeam = "ghosts"; // Ghosts are always the planting team
        this.detonationTimer = DETONATE_TIME;
        gameState.spikeDetonationTimer = DETONATE_TIME;
        this.uploaderId = gameState.spikeCarrierId;

        const carrier = players.get(gameState.spikeCarrierId);
        if (carrier) {
          carrier.schema.isUploading = false;
        }
      }
    }

    // Handle detonation countdown
    if (gameState.spikeState === "uploaded" || gameState.spikeState === "decrypting") {
      this.detonationTimer -= dt;
      gameState.spikeDetonationTimer = Math.max(0, this.detonationTimer);

      if (this.detonationTimer <= 0) {
        // Spike detonates - uploader wins
        return {
          ended: true,
          reason: "spike_detonated",
          winnerId: this.uploaderId,
        };
      }
    }

    // Handle decrypt progress
    if (gameState.spikeState === "decrypting") {
      const progress = gameState.spikeDecryptProgress + (dt / DECRYPT_TIME) * 100;
      gameState.spikeDecryptProgress = Math.min(100, progress);
      
      if (gameState.spikeDecryptProgress >= 100) {
        // Decrypt complete - find who was decrypting
        for (const [sessionId, player] of players) {
          if (player.schema.isDecrypting) {
            player.schema.isDecrypting = false;
            gameState.spikeState = "decrypted";
            return {
              ended: true,
              reason: "spike_decrypted",
              winnerId: sessionId,
            };
          }
        }
      }
    }

    return { ended: false };
  }

  /**
   * The server owns interaction range: an uploader or decrypter who dies or
   * leaves the terminal radius stops, whether or not the client sent "cancel".
   */
  private cancelAbandonedActions(
    gameState: GameState,
    players: Map<string, { schema: PlayerState }>
  ): void {
    const terminal = this.terminals.find((t) => t.id === gameState.spikeTerminalId);
    const stillValid = (p: PlayerState) =>
      !p.isDead && terminal !== undefined && withinRadius(p, terminal, terminal.radius);

    if (gameState.spikeState === "uploading") {
      const carrier = players.get(gameState.spikeCarrierId)?.schema;
      if (!carrier || !stillValid(carrier)) {
        gameState.spikeState = "carried";
        gameState.spikeUploadProgress = 0;
        gameState.spikeTerminalId = "";
        if (carrier) carrier.isUploading = false;
      }
    }

    if (gameState.spikeState === "decrypting") {
      let anyDecrypting = false;
      for (const { schema } of players.values()) {
        if (!schema.isDecrypting) continue;
        if (stillValid(schema)) anyDecrypting = true;
        else schema.isDecrypting = false;
      }
      if (!anyDecrypting) gameState.spikeState = "uploaded";
    }
  }

  // Reset for new round
  reset(gameState: GameState): void {
    gameState.spikeCarrierId = "";
    gameState.spikeState = "ground";
    gameState.spikeTerminalId = "";
    gameState.spikeUploadProgress = 0;
    gameState.spikeDecryptProgress = 0;
    gameState.spikeDetonationTimer = 0;
    gameState.spikeX = 0;
    gameState.spikeZ = 0;
    gameState.spikePlantingTeam = "";
    this.detonationTimer = 0;
    this.uploaderId = "";
  }
}
