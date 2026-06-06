import { Schema, type } from "@colyseus/schema";
export { MovementState } from "@shared/movement/types.js";
import { MovementState } from "@shared/movement/types.js";

export class PlayerState extends Schema {
  @type("number") x: number = 0;
  @type("number") y: number = 0;
  @type("number") z: number = 0;
  @type("number") rotationY: number = 0;
  @type("number") pitch: number = 0;  // Camera pitch for weapon aiming
  // Server ack: last input sequence number processed/accepted for this player.
  // Client uses this to reconcile predicted movement.
  @type("number") lastProcessedInputSeq: number = 0;
  @type("number") velX: number = 0;
  @type("number") velY: number = 0;
  @type("number") velZ: number = 0;
  @type("uint8") movementState: MovementState = MovementState.Walking;
  @type("boolean") isSprinting: boolean = false;
  @type("boolean") isCrouching: boolean = false;
  @type("boolean") isSliding: boolean = false;
  @type("boolean") canJump: boolean = false;
  @type("boolean") wallRight: boolean = false;
  
  // Health state
  @type("uint8") health: number = 100;
  @type("uint8") maxHealth: number = 100;
  @type("boolean") isDead: boolean = false;
  @type("number") respawnTime: number = 0; // Time until respawn (0 if alive)
  @type("boolean") isSpawnProtected: boolean = false;
  @type("number") spawnProtectionTime: number = 0;
  
  // Slow effect when taking damage (0-1, decays over time)
  @type("number") slowEffect: number = 0;

  // Player identity
  @type("string") displayName: string = "Player";

  // Scoreboard stats
  @type("uint16") kills: number = 0;
  @type("uint16") deaths: number = 0;
  @type("uint32") score: number = 0;
  
  // Team assignment (S&D)
  @type("string") teamId: string = ""; // "ghosts" | "sentinels" | ""
  
  // Game mode stats
  @type("uint8") livesRemaining: number = 3;
  @type("uint8") roundsWon: number = 0;
  @type("boolean") hasSpike: boolean = false;
  @type("boolean") isUploading: boolean = false;
  @type("boolean") isDecrypting: boolean = false;
  
  // Loadout (2 weapons only)
  @type("string") primaryWeaponId: string = "AR_1";
  @type("string") secondaryWeaponId: string = "PISTOL_1";
  @type("uint8") activeSlot: number = 0; // 0 = primary, 1 = secondary
  
  // Current weapon state
  @type("string") equippedWeapon: string = "AR_1";
  @type("uint8") ammoInMag: number = 30;
  @type("uint16") ammoReserve: number = 120;
  @type("boolean") firing: boolean = false;
  @type("number") nextFireTime: number = 0;
  @type("boolean") reloading: boolean = false;
  @type("number") reloadEndTime: number = 0;
}
