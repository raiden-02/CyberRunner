import * as RAPIER from '@dimforge/rapier3d-compat';
import { PlayerState } from '../PlayerState.js';
import { getWeaponConfig } from '../weapons/weapon-config.js';
import { ShotFiredMsg } from '../net/messages.js';

export interface HitResult {
  hit: boolean;
  playerId?: string;
  distance?: number;
  point?: { x: number; y: number; z: number };
  normal?: { x: number; y: number; z: number };
}

export class WeaponSystem {
  /**
   * Check if player can fire their weapon
   */
  static canFire(player: PlayerState, serverTime: number): boolean {
    if (player.isDead) return false;
    if (player.reloading) return false;
    if (player.ammoInMag <= 0) return false;
    if (serverTime < player.nextFireTime) return false;
    return true;
  }

  /**
   * Calculate next fire time based on weapon ROF
   */
  static computeNextFireTime(weaponId: string, currentTime: number): number {
    const config = getWeaponConfig(weaponId);
    if (!config) return currentTime;
    
    const fireInterval = 60 / config.roundsPerMinute; // Convert RPM to seconds
    return currentTime + fireInterval;
  }

  /**
   * Perform hitscan raycast and return hit result
   */
  static performHitscan(
    world: RAPIER.World,
    origin: { x: number; y: number; z: number },
    direction: { x: number; y: number; z: number },
    maxDistance: number,
    players: Map<string, { schema: PlayerState; ctrl: any }>,
    shooterId: string
  ): HitResult {
    // Normalize direction
    const len = Math.sqrt(direction.x ** 2 + direction.y ** 2 + direction.z ** 2);
    if (len === 0) return { hit: false };
    
    const dir = {
      x: direction.x / len,
      y: direction.y / len,
      z: direction.z / len
    };

    // Get shooter's collider to exclude from raycast
    const shooter = players.get(shooterId);
    if (!shooter) {
      return { hit: false };
    }
    const shooterColliderHandle = shooter.ctrl?.collider?.handle;
    
    // Create ray
    const ray = new RAPIER.Ray(origin, dir);
    const maxToi = maxDistance;

    // Perform raycast with filter to exclude shooter's collider
    // We need to cast multiple rays to find the first valid hit (not the shooter)
    let bestHit: RAPIER.RayColliderHit | null = null;
    let bestToi = maxToi;
    
    // First, try to find a hit that's not the shooter
    const hit = world.castRayAndGetNormal(ray, maxToi, true);
    
    if (hit) {
      const hitColliderHandle = hit.collider.handle;
      
      // If we hit the shooter's collider, we need to continue the raycast from that point
      if (shooterColliderHandle !== undefined && hitColliderHandle === shooterColliderHandle) {
        // Continue raycast from just past the shooter's collider
        const continueOrigin = ray.pointAt(hit.timeOfImpact + 0.1); // Small offset to get past the collider
        const continueRay = new RAPIER.Ray(continueOrigin, dir);
        const remainingDistance = maxToi - hit.timeOfImpact - 0.1;
        
        if (remainingDistance > 0) {
          const continueHit = world.castRayAndGetNormal(continueRay, remainingDistance, true);
          if (continueHit) {
            // Use the continue hit, but adjust the time of impact to account for the offset
            bestHit = continueHit;
            bestToi = hit.timeOfImpact + 0.1 + continueHit.timeOfImpact;
          }
        }
      } else {
        // Hit something other than shooter, use this hit
        bestHit = hit;
        bestToi = hit.timeOfImpact;
      }
    }

    if (!bestHit) {
      return { hit: false };
    }

    // Calculate hit point using the original ray and adjusted time of impact
    const hitPoint = ray.pointAt(bestToi);
    const collider = bestHit.collider;
    
    // Get normal from the hit (castRayAndGetNormal returns a hit with normal property)
    const normal = (bestHit as any).normal || { x: 0, y: 0, z: 0 };

    // Check if we hit a player
    for (const [playerId, playerData] of players) {
      if (playerId === shooterId) continue; // Can't hit yourself
      if (playerData.schema.isDead) continue; // Can't hit dead players
      
      // Check if this collider belongs to this player
      if (playerData.ctrl.collider.handle === collider.handle) {
        return {
          hit: true,
          playerId,
          distance: bestToi,
          point: { x: hitPoint.x, y: hitPoint.y, z: hitPoint.z },
          normal: { x: normal.x, y: normal.y, z: normal.z }
        };
      }
    }

    // Hit something else (wall, obstacle, etc.)
    return {
      hit: true,
      distance: bestToi,
      point: { x: hitPoint.x, y: hitPoint.y, z: hitPoint.z },
      normal: { x: normal.x, y: normal.y, z: normal.z }
    };
  }

  /**
   * Process a shot: consume ammo, perform raycast, apply damage
   */
  static processShot(
    world: RAPIER.World,
    shooter: PlayerState,
    shooterId: string,
    origin: { x: number; y: number; z: number },
    direction: { x: number; y: number; z: number },
    players: Map<string, { schema: PlayerState; ctrl: any }>,
    serverTime: number
  ): { shotFired: boolean; hitPlayerId?: string; damage?: number; shotMsg?: ShotFiredMsg } {
    const config = getWeaponConfig(shooter.equippedWeapon);
    if (!config) {
      console.error(`Unknown weapon: ${shooter.equippedWeapon}`);
      return { shotFired: false };
    }

    // Validate and consume ammo
    if (shooter.ammoInMag <= 0) {
      return { shotFired: false };
    }

    shooter.ammoInMag--;

    // Perform raycast for hitscan weapons
    if (config.type === "hitscan") {
      const hitResult = WeaponSystem.performHitscan(
        world,
        origin,
        direction,
        config.range,
        players,
        shooterId
      );

    // If we hit a player, return hit + damage info (caller applies damage)
      if (hitResult.hit && hitResult.playerId) {
        const targetPlayer = players.get(hitResult.playerId);
        if (!targetPlayer) {
          return {
            shotFired: true,
            shotMsg: {
              shooterId,
              weaponId: config.id,
              origin,
              direction,
              timestamp: serverTime
            }
          };
        }
        
        if (targetPlayer.schema.isDead) {
          return {
            shotFired: true,
            shotMsg: {
              shooterId,
              weaponId: config.id,
              origin,
              direction,
              timestamp: serverTime
            }
          };
        }
        
        const damage = Math.max(0, Math.round(config.damage));

        return {
          shotFired: true,
          hitPlayerId: hitResult.playerId,
          damage,
          shotMsg: {
            shooterId,
            weaponId: config.id,
            origin,
            direction,
            timestamp: serverTime
          }
        };
      }

      // Shot fired but didn't hit a player
      return {
        shotFired: true,
        shotMsg: {
          shooterId,
          weaponId: config.id,
          origin,
          direction,
          timestamp: serverTime
        }
      };
    }

    // TODO: Handle projectile weapons
    return { shotFired: false };
  }

  /**
   * Start reloading a weapon
   */
  static startReload(player: PlayerState, weaponId: string): boolean {
    if (player.reloading) return false;
    if (player.isDead) return false;
    
    const config = getWeaponConfig(weaponId);
    if (!config) return false;

    // Don't reload if magazine is full
    if (player.ammoInMag >= config.magazineSize) return false;
    
    // Don't reload if no reserve ammo
    if (player.ammoReserve <= 0) return false;

    player.reloading = true;
    return true;
  }

  /**
   * Complete reload: transfer ammo from reserve to magazine
   */
  static completeReload(player: PlayerState, weaponId: string): void {
    const config = getWeaponConfig(weaponId);
    if (!config) return;

    const needed = config.magazineSize - player.ammoInMag;
    const available = Math.min(needed, player.ammoReserve);
    
    player.ammoInMag += available;
    player.ammoReserve -= available;
    player.reloading = false;
  }
}
