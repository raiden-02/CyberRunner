import RAPIER from "@dimforge/rapier3d-compat";
import { COLLISION_GROUPS } from "@shared/physics/collision-groups.js";

type Vec3 = { x: number; y: number; z: number };

/** Proximity fuse: a projectile detonates when it passes this close to a live player's center. */
const PLAYER_FUSE_RADIUS = 1.5;

export interface ProjectileConfig {
  speed: number;
  lifetime: number;
  ownerId: string;
  weaponId: string;
}

type Projectile = {
  config: ProjectileConfig;
  position: Vec3;
  velocity: Vec3;
  age: number;
};

export type ProjectileImpact = { id: string; config: ProjectileConfig; position: Vec3 };

type Target = { x: number; y: number; z: number; isDead: boolean };

/** Fraction along a→b of the point closest to p, clamped to [0, 1]. */
function closestT(a: Vec3, b: Vec3, p: Vec3): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const lenSq = dx * dx + dy * dy + dz * dz;
  if (lenSq === 0) return 0;
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy + (p.z - a.z) * dz) / lenSq;
  return Math.max(0, Math.min(1, t));
}

function lerp(a: Vec3, b: Vec3, t: number): Vec3 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
}

/**
 * Straight-line projectiles swept one tick at a time against world colliders
 * and live players. No rigid bodies: speed is exactly `config.speed`.
 */
export class ProjectileManager {
  private projectiles = new Map<string, Projectile>();
  private nextProjectileId = 1;

  spawnProjectile(position: Vec3, direction: Vec3, config: ProjectileConfig): string {
    const len = Math.hypot(direction.x, direction.y, direction.z) || 1;
    const id = `projectile_${this.nextProjectileId++}`;
    this.projectiles.set(id, {
      config,
      position: { ...position },
      velocity: {
        x: (direction.x / len) * config.speed,
        y: (direction.y / len) * config.speed,
        z: (direction.z / len) * config.speed,
      },
      age: 0,
    });
    return id;
  }

  step(
    dt: number,
    world: RAPIER.World,
    players: Iterable<[string, Target]>,
  ): { impacts: ProjectileImpact[]; expired: string[] } {
    const impacts: ProjectileImpact[] = [];
    const expired: string[] = [];
    const targets = [...players];

    for (const [id, p] of this.projectiles) {
      p.age += dt;
      if (p.age > p.config.lifetime) {
        expired.push(id);
        continue;
      }

      const from = p.position;
      const to = {
        x: from.x + p.velocity.x * dt,
        y: from.y + p.velocity.y * dt,
        z: from.z + p.velocity.z * dt,
      };
      const stepLen = p.config.speed * dt;
      const ray = new RAPIER.Ray(from, {
        x: p.velocity.x / p.config.speed,
        y: p.velocity.y / p.config.speed,
        z: p.velocity.z / p.config.speed,
      });
      const worldHit = world.castRay(ray, stepLen, true, undefined, COLLISION_GROUPS.PROJECTILE);
      let hitT = worldHit ? worldHit.timeOfImpact / stepLen : Infinity;

      for (const [playerId, target] of targets) {
        if (playerId === p.config.ownerId || target.isDead) continue;
        const t = closestT(from, to, target);
        if (t >= hitT) continue;
        const c = lerp(from, to, t);
        if (Math.hypot(c.x - target.x, c.y - target.y, c.z - target.z) < PLAYER_FUSE_RADIUS) {
          hitT = t;
        }
      }

      if (hitT <= 1) {
        impacts.push({ id, config: p.config, position: lerp(from, to, hitT) });
      } else {
        p.position = to;
      }
    }

    for (const id of expired) this.projectiles.delete(id);
    for (const { id } of impacts) this.projectiles.delete(id);
    return { impacts, expired };
  }
}
