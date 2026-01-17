import { PlayerState } from "../PlayerState.js";
import { DamageMsg, HealthChangeMsg } from "../net/messages.js";

export class HealthSystem {
  private static RESPAWN_DELAY = 3.0; // seconds

  /**
   * Apply damage to a player and handle death/respawn logic
   */
  static applyDamage(
    player: PlayerState,
    damage: number,
    sourceId?: string,
    weaponId?: string,
    damageType: "projectile" | "hitscan" | "explosion" = "hitscan"
  ): { damaged: boolean; killed: boolean; newHealth: number } {
    if (player.isDead) {
      return { damaged: false, killed: false, newHealth: player.health };
    }
    if (player.isSpawnProtected) {
      return { damaged: false, killed: false, newHealth: player.health };
    }

    const dmg = Math.max(0, Math.round(damage));
    const oldHealth = player.health;
    player.health = Math.max(0, player.health - dmg);
    
    const damaged = player.health < oldHealth;
    const killed = !player.isDead && player.health <= 0;

    if (killed) {
      player.isDead = true;
      player.respawnTime = HealthSystem.RESPAWN_DELAY;
      
      player.firing = false;
      player.reloading = false;
    }

    return { damaged, killed, newHealth: player.health };
  }

  /**
   * Heal a player (cannot heal if dead)
   */
  static healPlayer(player: PlayerState, amount: number): { healed: boolean; newHealth: number } {
    if (player.isDead) {
      return { healed: false, newHealth: player.health };
    }

    const oldHealth = player.health;
    player.health = Math.min(player.maxHealth, player.health + amount);
    
    return { healed: player.health > oldHealth, newHealth: player.health };
  }

  /**
   * Update respawn countdown and handle respawn logic
   */
  static updateRespawn(
    player: PlayerState, 
    deltaTime: number,
    spawnPosition: { x: number, y: number, z: number } = { x: 0, y: 2, z: 0 }
  ): { respawned: boolean } {
    if (!player.isDead) {
      return { respawned: false };
    }

    player.respawnTime = Math.max(0, player.respawnTime - deltaTime);

    if (player.respawnTime <= 0) {
      // Respawn the player
      player.isDead = false;
      player.health = player.maxHealth;
      player.respawnTime = 0;
      player.isSpawnProtected = true;
      player.spawnProtectionTime = 2.5;
      
      // Reset position
      player.x = spawnPosition.x;
      player.y = spawnPosition.y;
      player.z = spawnPosition.z;
      
      // Reset movement state
      player.velX = 0;
      player.velY = 0;
      player.velZ = 0;
      
      player.firing = false;
      player.reloading = false;
      player.reloadEndTime = 0;
      player.nextFireTime = 0;
      
      return { respawned: true };
    }

    return { respawned: false };
  }

  /**
   * Create a damage message for broadcasting
   */
  static createDamageMessage(
    targetId: string,
    amount: number,
    damageType: "projectile" | "hitscan" | "explosion",
    sourceId?: string,
    weaponId?: string
  ): DamageMsg {
    return {
      targetId,
      amount,
      damageType,
      sourceId,
      weaponId
    };
  }

  /**
   * Create a health change message for broadcasting
   */
  static createHealthChangeMessage(
    playerId: string,
    player: PlayerState
  ): HealthChangeMsg {
    return {
      playerId,
      newHealth: player.health,
      maxHealth: player.maxHealth,
      isDead: player.isDead,
      respawnTime: player.isDead ? player.respawnTime : undefined
    };
  }

  /**
   * Calculate damage with modifiers (headshot, armor, etc.)
   */
  static calculateDamage(
    baseDamage: number,
    hitLocation: "head" | "body" | "limb" = "body",
    headshotMultiplier: number = 2.0
  ): number {
    switch (hitLocation) {
      case "head":
        return Math.round(baseDamage * headshotMultiplier);
      case "body":
        return baseDamage;
      case "limb":
        return Math.round(baseDamage * 0.8); // 20% damage reduction for limbs
      default:
        return baseDamage;
    }
  }
}