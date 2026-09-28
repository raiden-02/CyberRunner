import RAPIER from "@dimforge/rapier3d-compat";
import { sanitizeAimDir, shotOriginFromBody } from "../net/shot-origin.js";
import type { PlayerRuntime } from "../player-runtime.js";
import { HealthSystem } from "./health-system.js";
import { WeaponSystem } from "./weapon-system.js";
import { getWeaponConfig } from "@shared/weapons/weapon-config.js";
import type { LagCompensation } from "./lag-compensation.js";
import type { ProjectileManager } from "./projectile-system.js";
import type { HitboxRegistry, BodyPart } from "../physics/hitbox-system.js";

export type BreakableRuntime = {
  id: number;
  hp: number;
  collider: RAPIER.Collider;
};

export type CombatBroadcast = (type: string, message?: unknown) => void;

function applyCombatHit(
  players: Map<string, PlayerRuntime>,
  victimId: string,
  attackerId: string,
  damage: number,
  broadcast: CombatBroadcast,
  onPlayerKill: (victimId: string, killerId: string) => void,
  bodyPart?: BodyPart,
): void {
  const hitPlayer = players.get(victimId);
  if (!hitPlayer) return;

  const isGodMode = hitPlayer.godMode;
  const dmgResult = HealthSystem.applyDamage(hitPlayer.schema, damage);

  if (isGodMode) {
    hitPlayer.schema.health = hitPlayer.schema.maxHealth;
    hitPlayer.schema.isDead = false;
  }

  if (dmgResult.damaged) {
    const healthMsg = HealthSystem.createHealthChangeMessage(
      victimId,
      hitPlayer.schema,
      bodyPart,
      attackerId,
      damage,
    );
    broadcast("health_change", healthMsg);
  }

  if (dmgResult.killed && !isGodMode) {
    onPlayerKill(victimId, attackerId);
  }
}

export function applyBreakableDamage(
  world: RAPIER.World,
  breakablesByHandle: Map<number, BreakableRuntime>,
  breakablesById: Map<number, BreakableRuntime>,
  colliderHandle: number,
  damage: number,
  broadcast: CombatBroadcast,
): void {
  const runtime = breakablesByHandle.get(colliderHandle);
  if (!runtime) return;

  runtime.hp -= damage;
  if (runtime.hp > 0) return;

  world.removeCollider(runtime.collider, false);
  breakablesByHandle.delete(colliderHandle);
  breakablesById.delete(runtime.id);

  broadcast("breakable_destroyed", { id: runtime.id });
}

export function processFiringPlayers(
  players: Map<string, PlayerRuntime>,
  world: RAPIER.World,
  now: number,
  lagCompensation: LagCompensation,
  hitboxRegistry: HitboxRegistry,
  projectileManager: ProjectileManager,
  breakablesByHandle: Map<number, BreakableRuntime>,
  breakablesById: Map<number, BreakableRuntime>,
  broadcast: CombatBroadcast,
  onPlayerKill: (victimId: string, killerId: string) => void,
): void {
  for (const [sessionId, player] of players) {
    if (player.schema.isDead || !player.schema.firing || player.schema.reloading) continue;
    if (!WeaponSystem.canFire(player.schema, now)) continue;

    const aim = sanitizeAimDir(player.aimDir ?? undefined);
    if (!aim) continue;

    const rewindClient = { sessionId };
    const rewindTick = lagCompensation.getRewindTick(rewindClient);
    const histPos = lagCompensation.getInterpolatedPosition(sessionId, rewindTick);
    const currentPos = player.ctrl.body.translation();
    const bodyPos = histPos ?? { x: currentPos.x, y: currentPos.y, z: currentPos.z };
    const origin = shotOriginFromBody(bodyPos, aim);

    const shotResult = lagCompensation.withRewoundWorld(
      players,
      sessionId,
      rewindClient,
      world,
      () => WeaponSystem.processShot(
        world,
        player.schema,
        sessionId,
        origin,
        aim,
        players,
        now,
        hitboxRegistry,
      ),
    );

    if (player.unlimitedAmmo && shotResult.shotFired) {
      const weaponCfg = getWeaponConfig(player.schema.equippedWeapon);
      player.schema.ammoInMag = weaponCfg?.magazineSize ?? 30;
    }

    if (!shotResult.shotFired) continue;

    player.schema.nextFireTime = WeaponSystem.computeNextFireTime(
      player.schema.equippedWeapon,
      now,
    );

    if (shotResult.shotMsg) {
      broadcast("shot_fired", shotResult.shotMsg);
    }

    const weaponConfig = getWeaponConfig(player.schema.equippedWeapon);
    if (weaponConfig?.type === "projectile" && weaponConfig.projectileSpeed) {
      const projectileId = projectileManager.spawnProjectile(origin, aim, {
        speed: weaponConfig.projectileSpeed,
        lifetime: weaponConfig.range / weaponConfig.projectileSpeed,
        ownerId: sessionId,
        weaponId: weaponConfig.id,
      });
      broadcast("projectile_spawned", {
        id: projectileId,
        origin,
        direction: aim,
        speed: weaponConfig.projectileSpeed,
        weaponId: weaponConfig.id,
      });
    }

    if (shotResult.multiHits && shotResult.multiHits.length > 0) {
      for (const hit of shotResult.multiHits) {
        applyCombatHit(
          players,
          hit.playerId,
          sessionId,
          hit.damage,
          broadcast,
          onPlayerKill,
          hit.bodyPart,
        );
      }
    } else if (shotResult.hitPlayerId && shotResult.damage !== undefined) {
      applyCombatHit(
        players,
        shotResult.hitPlayerId,
        sessionId,
        shotResult.damage,
        broadcast,
        onPlayerKill,
        shotResult.bodyPart,
      );
    }

    if (shotResult.hitColliderHandle !== undefined && !shotResult.hitPlayerId) {
      const hitDamage = shotResult.hitDamage ?? 0;
      if (hitDamage > 0) {
        applyBreakableDamage(
          world,
          breakablesByHandle,
          breakablesById,
          shotResult.hitColliderHandle,
          hitDamage,
          broadcast,
        );
      }
    }
  }
}

export function updateProjectiles(
  dt: number,
  world: RAPIER.World,
  players: Map<string, PlayerRuntime>,
  projectileManager: ProjectileManager,
  broadcast: CombatBroadcast,
  onPlayerKill: (victimId: string, killerId: string) => void,
): void {
  const targets = [...players].map(([id, p]) => [id, p.schema] as [string, PlayerRuntime["schema"]]);
  const { impacts, expired } = projectileManager.step(dt, world, targets);

  for (const id of expired) {
    broadcast("projectile_destroyed", { id, reason: "expired" });
  }

  for (const { id, config, position } of impacts) {
    const weaponConfig = getWeaponConfig(config.weaponId);
    if (weaponConfig?.explosionRadius) {
      const explosionHits = WeaponSystem.processExplosion(position, config.weaponId, players);
      for (const hit of explosionHits) {
        applyCombatHit(
          players,
          hit.playerId,
          config.ownerId,
          hit.damage,
          broadcast,
          onPlayerKill,
        );
      }
      broadcast("explosion", {
        position,
        radius: weaponConfig.explosionRadius,
        weaponId: config.weaponId,
      });
    }
    broadcast("projectile_destroyed", { id, reason: "impact", position });
  }
}
