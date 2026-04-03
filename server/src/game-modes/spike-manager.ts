/**
 * Data Spike Manager
 * Handles upload/decrypt mechanics for Search & Destroy mode
 */

import { GameState } from "../GameState.js";
import { PlayerState } from "../PlayerState.js";
import type { UploadTerminal } from "../world/maps/map-types.js";

export type SpikeState = "ground" | "carried" | "uploading" | "uploaded" | "dropped" | "decrypting" | "decrypted";

const UPLOAD_TIME = 4.0;    // seconds to upload
const DECRYPT_TIME = 7.0;   // seconds to decrypt (longer than upload)
const DETONATE_TIME = 45.0; // seconds after upload completes before detonation
const PICKUP_RADIUS = 2.5;  // meters to pick up spike

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

  // Assign spike to a random player at round start
  assignSpikeToRandomPlayer(
    gameState: GameState,
    players: Map<string, { schema: PlayerState }>
  ): void {
    const alivePlayers: string[] = [];
    for (const [sessionId, player] of players) {
      if (!player.schema.isDead) {
        alivePlayers.push(sessionId);
        player.schema.hasSpike = false;
        player.schema.isUploading = false;
        player.schema.isDecrypting = false;
      }
    }

    if (alivePlayers.length === 0) return;

    const carrierId = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
    const carrier = players.get(carrierId);
    if (carrier) {
      carrier.schema.hasSpike = true;
      gameState.spikeCarrierId = carrierId;
      gameState.spikeState = "carried";
      gameState.spikeUploadProgress = 0;
      gameState.spikeDecryptProgress = 0;
      gameState.spikeTerminalId = "";
      this.detonationTimer = 0;
      this.uploaderId = "";
    }
  }

  // Check if player is near a terminal
  getNearbyTerminal(x: number, z: number): UploadTerminal | null {
    for (const terminal of this.terminals) {
      const dx = x - terminal.x;
      const dz = z - terminal.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist <= terminal.radius) {
        return terminal;
      }
    }
    return null;
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
    console.log(`[SPIKE] startDecrypt attempt by ${sessionId}, spikeState=${gameState.spikeState}, carrierId=${gameState.spikeCarrierId}`);
    
    if (gameState.spikeState !== "uploaded") {
      console.log(`[SPIKE] startDecrypt failed: spikeState is ${gameState.spikeState}, expected "uploaded"`);
      return false;
    }
    if (gameState.spikeCarrierId === sessionId) {
      console.log(`[SPIKE] startDecrypt failed: player is the uploader`);
      return false;
    }
    if (player.isDead) {
      console.log(`[SPIKE] startDecrypt failed: player is dead`);
      return false;
    }

    // Check if player is near the uploaded terminal
    const terminal = this.terminals.find(t => t.id === gameState.spikeTerminalId);
    if (!terminal) {
      console.log(`[SPIKE] startDecrypt failed: terminal ${gameState.spikeTerminalId} not found`);
      return false;
    }

    const dx = player.x - terminal.x;
    const dz = player.z - terminal.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist > terminal.radius) {
      console.log(`[SPIKE] startDecrypt failed: player too far from terminal (${dist.toFixed(1)} > ${terminal.radius})`);
      return false;
    }

    gameState.spikeState = "decrypting";
    player.isDecrypting = true;
    console.log(`[SPIKE] startDecrypt SUCCESS - player ${sessionId} now decrypting`);

    return true;
  }

  // Cancel decrypt
  cancelDecrypt(
    sessionId: string,
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
    killerId: string | null,
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

    // Check if player is near the spike
    const dx = player.x - gameState.spikeX;
    const dz = player.z - gameState.spikeZ;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist > PICKUP_RADIUS) return false;

    player.hasSpike = true;
    gameState.spikeCarrierId = sessionId;
    gameState.spikeState = "carried";

    return true;
  }

  // Check if player is near the spike for pickup
  isNearSpike(player: PlayerState, gameState: GameState): boolean {
    if (gameState.spikeState !== "ground" && gameState.spikeState !== "dropped") return false;
    
    const dx = player.x - gameState.spikeX;
    const dz = player.z - gameState.spikeZ;
    const dist = Math.sqrt(dx * dx + dz * dz);
    return dist <= PICKUP_RADIUS;
  }

  // Update tick - returns round end reason if any
  update(
    dt: number,
    gameState: GameState,
    players: Map<string, { schema: PlayerState }>
  ): { ended: boolean; reason?: string; winnerId?: string } {
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
      
      // Find who is decrypting for logging
      let decrypterId = "";
      for (const [sessionId, player] of players) {
        if (player.schema.isDecrypting) {
          decrypterId = sessionId;
          break;
        }
      }
      
      if (gameState.spikeDecryptProgress % 10 < 1) {
        console.log(`[SPIKE] Decrypting: ${gameState.spikeDecryptProgress.toFixed(1)}% by ${decrypterId}, detonation in ${this.detonationTimer.toFixed(1)}s`);
      }

      if (gameState.spikeDecryptProgress >= 100) {
        // Decrypt complete - find who was decrypting
        for (const [sessionId, player] of players) {
          if (player.schema.isDecrypting) {
            player.schema.isDecrypting = false;
            gameState.spikeState = "decrypted";
            console.log(`[SPIKE] Decrypt complete by ${sessionId}`);
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

  getDetonationTimer(): number {
    return this.detonationTimer;
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
