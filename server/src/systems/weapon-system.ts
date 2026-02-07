import * as RAPIER from '@dimforge/rapier3d-compat';
import { PlayerState } from '../PlayerState.js';
import { 
  getWeaponConfig, 
  calculateDamageFalloff, 
  calculateExplosionDamage,
  generatePelletSpread 
} from '../weapons/weapon-config.js';
import { ShotFiredMsg } from '../net/messages.js';
import { getHitboxInfo, getDamageMultiplier, type BodyPart } from '../physics/hitbox-system.js';

export interface HitResult {
  hit: boolean;
  playerId?: string;
  bodyPart?: BodyPart;
  damageMultiplier?: number;
  distance?: number;
  point?: { x: number; y: number; z: number };
  normal?: { x: number; y: number; z: number };
  colliderHandle?: number;
}

export interface ShotResult {
  shotFired: boolean;
  hits?: Array<{
    playerId: string;
    damage: number;
    bodyPart?: BodyPart;
  }>;
  hitColliderHandle?: number;
  shotMsg?: ShotFiredMsg;
}

export class WeaponSystem {
  static canFire(player: PlayerState, serverTime: number): boolean {
    if (player.isDead) return false;
    if (player.reloading) return false;
    if (player.ammoInMag <= 0) return false;
    if (serverTime < player.nextFireTime) return false;
    return true;
  }

  static computeNextFireTime(weaponId: string, currentTime: number): number {
    const config = getWeaponConfig(weaponId);
    if (!config) return currentTime;
    const fireInterval = 60 / config.roundsPerMinute;
    return currentTime + fireInterval;
  }

  static performHitscan(
    world: RAPIER.World,
    origin: { x: number; y: number; z: number },
    direction: { x: number; y: number; z: number },
    maxDistance: number,
    players: Map<string, { schema: PlayerState; ctrl: any }>,
    shooterId: string
  ): HitResult {
    const len = Math.sqrt(direction.x ** 2 + direction.y ** 2 + direction.z ** 2);
    if (len === 0) return { hit: false };
    
    const dir = { x: direction.x / len, y: direction.y / len, z: direction.z / len };

    const shooter = players.get(shooterId);
    if (!shooter) return { hit: false };
    
    // Exclude all player capsules and shooter's own hitboxes
    const excludedHandles = new Set<number>();
    for (const [, playerData] of players) {
      if (playerData.ctrl?.collider?.handle !== undefined) {
        excludedHandles.add(playerData.ctrl.collider.handle);
      }
    }
    const shooterData = players.get(shooterId) as any;
    if (shooterData?.hitboxes?.colliders) {
      for (const handle of shooterData.hitboxes.colliders.keys()) {
        excludedHandles.add(handle);
      }
    }
    
    const ray = new RAPIER.Ray(origin, dir);
    type HitInfo = { collider: RAPIER.Collider; toi: number; normal: { x: number; y: number; z: number } };
    const hits: HitInfo[] = [];
    
    world.intersectionsWithRay(ray, maxDistance, false, (intersection) => {
      if (excludedHandles.has(intersection.collider.handle)) return true;
      hits.push({
        collider: intersection.collider,
        toi: intersection.timeOfImpact,
        normal: intersection.normal || { x: 0, y: 0, z: 0 }
      });
      return true;
    });
    
    if (hits.length === 0) return { hit: false };

    hits.sort((a, b) => a.toi - b.toi);
    const closestToi = hits[0].toi;
    
    // Prefer headshots within 30cm of closest hit
    const PRIORITY_TOLERANCE = 0.3;
    let bestHit = hits[0];
    let bestHitboxInfo = getHitboxInfo(bestHit.collider.handle);
    
    for (const hit of hits) {
      if (hit.toi > closestToi + PRIORITY_TOLERANCE) break;
      const hitboxInfo = getHitboxInfo(hit.collider.handle);
      if (hitboxInfo?.bodyPart === "head") {
        bestHit = hit;
        bestHitboxInfo = hitboxInfo;
        break;
      }
    }
    
    const bestToi = bestHit.toi;
    const hitPoint = ray.pointAt(bestToi);
    const collider = bestHit.collider;
    const normal = bestHit.normal;
    
    if (bestHitboxInfo) {
      const hitPlayerId = bestHitboxInfo.playerId;
      const hitPlayer = players.get(hitPlayerId);
      
      if (hitPlayerId !== shooterId && hitPlayer && !hitPlayer.schema.isDead) {
        return {
          hit: true,
          playerId: hitPlayerId,
          bodyPart: bestHitboxInfo.bodyPart,
          damageMultiplier: getDamageMultiplier(bestHitboxInfo.bodyPart),
          distance: bestToi,
          point: { x: hitPoint.x, y: hitPoint.y, z: hitPoint.z },
          normal: { x: normal.x, y: normal.y, z: normal.z },
          colliderHandle: collider.handle
        };
      }
    }

    return {
      hit: true,
      distance: bestToi,
      point: { x: hitPoint.x, y: hitPoint.y, z: hitPoint.z },
      normal: { x: normal.x, y: normal.y, z: normal.z },
      colliderHandle: collider.handle
    };
  }

  private static calculateFinalDamage(
    baseDamage: number,
    distance: number,
    bodyPart: BodyPart | undefined,
    headshotMultiplier: number,
    bodyPartMultiplier: number,
    damageFalloff?: { startRange: number; endRange: number; minDamagePercent: number }
  ): number {
    const multiplier = bodyPart === "head" ? headshotMultiplier : bodyPartMultiplier;
    const falloffMultiplier = calculateDamageFalloff(distance, damageFalloff);
    return Math.max(1, Math.round(baseDamage * multiplier * falloffMultiplier));
  }

  static processShot(
    world: RAPIER.World,
    shooter: PlayerState,
    shooterId: string,
    origin: { x: number; y: number; z: number },
    direction: { x: number; y: number; z: number },
    players: Map<string, { schema: PlayerState; ctrl: any }>,
    serverTime: number
  ): {
    shotFired: boolean;
    hitPlayerId?: string;
    damage?: number;
    bodyPart?: BodyPart;
    hitColliderHandle?: number;
    hitDamage?: number;
    shotMsg?: ShotFiredMsg;
    // Multi-hit support for shotguns
    multiHits?: Array<{ playerId: string; damage: number; bodyPart?: BodyPart }>;
  } {
    const config = getWeaponConfig(shooter.equippedWeapon);
    if (!config) {
      console.error(`Unknown weapon: ${shooter.equippedWeapon}`);
      return { shotFired: false };
    }

    if (shooter.ammoInMag <= 0) {
      return { shotFired: false };
    }

    shooter.ammoInMag--;

    if (config.type === "hitscan") {
      if (config.pelletCount && config.pelletCount > 1) {
        return WeaponSystem.processShotgunShot(
          world, shooterId, origin, direction, players, serverTime, config
        );
      }
      
      const hitResult = WeaponSystem.performHitscan(
        world, origin, direction, config.range, players, shooterId
      );

      if (hitResult.hit && hitResult.playerId) {
        const targetPlayer = players.get(hitResult.playerId);
        if (!targetPlayer || targetPlayer.schema.isDead) {
          return {
            shotFired: true,
            shotMsg: { shooterId, weaponId: config.id, origin, direction, timestamp: serverTime }
          };
        }
        
        const damage = WeaponSystem.calculateFinalDamage(
          config.damage,
          hitResult.distance || 0,
          hitResult.bodyPart,
          config.headshotMultiplier,
          hitResult.damageMultiplier ?? 1.0,
          config.damageFalloff
        );

        return {
          shotFired: true,
          hitPlayerId: hitResult.playerId,
          damage,
          bodyPart: hitResult.bodyPart,
          hitColliderHandle: hitResult.colliderHandle,
          shotMsg: {
            shooterId,
            weaponId: config.id,
            origin,
            direction,
            timestamp: serverTime,
            bodyPart: hitResult.bodyPart
          }
        };
      }

      return {
        shotFired: true,
        hitColliderHandle: hitResult.colliderHandle,
        shotMsg: { shooterId, weaponId: config.id, origin, direction, timestamp: serverTime }
      };
    }

    if (config.type === "projectile") {
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

    return { shotFired: false };
  }

  private static processShotgunShot(
    world: RAPIER.World,
    shooterId: string,
    origin: { x: number; y: number; z: number },
    direction: { x: number; y: number; z: number },
    players: Map<string, { schema: PlayerState; ctrl: any }>,
    serverTime: number,
    config: ReturnType<typeof getWeaponConfig>
  ): ReturnType<typeof WeaponSystem.processShot> {
    if (!config) return { shotFired: false };
    
    const pelletCount = config.pelletCount || 8;
    const spreadAngle = config.spreadAngle || 5.0;
    const pelletDirs = generatePelletSpread(direction, pelletCount, spreadAngle);
    const playerDamage = new Map<string, { total: number; bodyPart?: BodyPart; hitCount: number }>();
    
    for (const pelletDir of pelletDirs) {
      const hitResult = WeaponSystem.performHitscan(
        world, origin, pelletDir, config.range, players, shooterId
      );
      
      if (hitResult.hit && hitResult.playerId) {
        const targetPlayer = players.get(hitResult.playerId);
        if (targetPlayer && !targetPlayer.schema.isDead) {
          const pelletDamage = WeaponSystem.calculateFinalDamage(
            config.damage,
            hitResult.distance || 0,
            hitResult.bodyPart,
            config.headshotMultiplier,
            hitResult.damageMultiplier ?? 1.0,
            config.damageFalloff
          );
          
          const existing = playerDamage.get(hitResult.playerId);
          if (existing) {
            existing.total += pelletDamage;
            existing.hitCount++;
            if (hitResult.bodyPart === "head") existing.bodyPart = "head";
          } else {
            playerDamage.set(hitResult.playerId, {
              total: pelletDamage,
              bodyPart: hitResult.bodyPart,
              hitCount: 1
            });
          }
        }
      }
    }
    
    const multiHits: Array<{ playerId: string; damage: number; bodyPart?: BodyPart }> = [];
    for (const [playerId, data] of playerDamage) {
      multiHits.push({ playerId, damage: data.total, bodyPart: data.bodyPart });
    }
    const firstHit = multiHits[0];
    
    return {
      shotFired: true,
      hitPlayerId: firstHit?.playerId,
      damage: firstHit?.damage,
      bodyPart: firstHit?.bodyPart,
      multiHits: multiHits.length > 0 ? multiHits : undefined,
      shotMsg: {
        shooterId,
        weaponId: config.id,
        origin,
        direction,
        timestamp: serverTime,
        bodyPart: firstHit?.bodyPart
      }
    };
  }

  static processExplosion(
    explosionCenter: { x: number; y: number; z: number },
    shooterId: string,
    weaponId: string,
    players: Map<string, { schema: PlayerState; ctrl: any }>
  ): Array<{ playerId: string; damage: number }> {
    const config = getWeaponConfig(weaponId);
    if (!config || !config.explosionRadius) return [];
    
    const hits: Array<{ playerId: string; damage: number }> = [];
    const radius = config.explosionRadius;
    const minDmgPercent = config.explosionMinDamage ?? 0.2;
    
    for (const [playerId, playerData] of players) {
      if (playerData.schema.isDead) continue;
      
      const dx = playerData.schema.x - explosionCenter.x;
      const dy = playerData.schema.y - explosionCenter.y;
      const dz = playerData.schema.z - explosionCenter.z;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
      
      if (distance < radius) {
        const damage = calculateExplosionDamage(
          config.damage,
          distance,
          radius,
          minDmgPercent
        );
        
        if (damage > 0) {
          hits.push({ playerId, damage });
        }
      }
    }
    
    return hits;
  }

  static startReload(player: PlayerState, weaponId: string): boolean {
    if (player.reloading || player.isDead) return false;
    const config = getWeaponConfig(weaponId);
    if (!config) return false;
    if (player.ammoInMag >= config.magazineSize) return false;
    if (player.ammoReserve <= 0) return false;
    player.reloading = true;
    return true;
  }

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
