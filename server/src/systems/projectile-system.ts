import * as RAPIER from '@dimforge/rapier3d-compat';

export interface ProjectileConfig {
  speed: number;
  radius: number;
  length: number;
  damage: number;
  lifetime: number;
  explosionRadius?: number; // Optional for explosive projectiles
  ownerType: 'player' | 'enemy';
  ownerId: string; // Player/entity ID who fired this projectile
  weaponId: string;
}

export class ServerProjectile {
  public id: string;
  public body: RAPIER.RigidBody;
  public collider: RAPIER.Collider;
  public sensorCollider?: RAPIER.Collider; // For hit detection
  public physicalCollider?: RAPIER.Collider; // For world collision
  public config: ProjectileConfig;
  public lifetime: number;
  public active: boolean = true;

  constructor(
    world: RAPIER.World,
    id: string,
    position: { x: number; y: number; z: number },
    direction: { x: number; y: number; z: number },
    config: ProjectileConfig
  ) {
    this.id = id;
    this.config = config;
    this.lifetime = config.lifetime;

    // Create rigid body
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(position.x, position.y, position.z)
      .setCcdEnabled(true); // Continuous collision detection

    // Orient body to match direction
    const dir = { x: direction.x, y: direction.y, z: direction.z };
    const length = Math.sqrt(dir.x * dir.x + dir.y * dir.y + dir.z * dir.z);
    if (length > 0) {
      dir.x /= length;
      dir.y /= length;
      dir.z /= length;
    }

    // Simple rotation towards direction
    this.body = world.createRigidBody(bodyDesc);

    // Set up colliders based on projectile type
    const halfHeight = config.length / 2;
    
    if (config.explosionRadius == null) {
      // Non-explosive: separate sensor and physical colliders
      // Sensor collider for hit detection
      const sensorDesc = RAPIER.ColliderDesc.capsule(config.radius, halfHeight)
        .setSensor(true)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
      this.sensorCollider = world.createCollider(sensorDesc, this.body);
      
      // Physical collider for world interaction
      const physDesc = RAPIER.ColliderDesc.capsule(config.radius, halfHeight)
        .setRestitution(0.3)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
      this.physicalCollider = world.createCollider(physDesc, this.body);
      
      this.collider = this.sensorCollider;
    } else {
      // Explosive: single collider for both hit detection and world collision
      const explDesc = RAPIER.ColliderDesc.capsule(config.radius, halfHeight)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
      this.collider = world.createCollider(explDesc, this.body);
    }

    // Apply initial velocity
    const impulse = {
      x: dir.x * config.speed,
      y: dir.y * config.speed,
      z: dir.z * config.speed
    };
    this.body.applyImpulse(impulse, true);
  }

  update(deltaTime: number): boolean {
    this.lifetime -= deltaTime;
    return this.lifetime > 0 && this.active;
  }

  getPosition(): { x: number; y: number; z: number } {
    const pos = this.body.translation();
    return { x: pos.x, y: pos.y, z: pos.z };
  }

  getRotation(): { x: number; y: number; z: number; w: number } {
    const rot = this.body.rotation();
    return { x: rot.x, y: rot.y, z: rot.z, w: rot.w };
  }

  deactivate(): void {
    this.active = false;
  }

  destroy(world: RAPIER.World): void {
    world.removeRigidBody(this.body);
  }
}

export class ProjectileManager {
  private world: RAPIER.World;
  private projectiles: Map<string, ServerProjectile> = new Map();
  private nextProjectileId: number = 1;

  constructor(world: RAPIER.World) {
    this.world = world;
  }

  spawnProjectile(
    position: { x: number; y: number; z: number },
    direction: { x: number; y: number; z: number },
    config: ProjectileConfig
  ): string {
    const id = `projectile_${this.nextProjectileId++}`;
    const projectile = new ServerProjectile(this.world, id, position, direction, config);
    this.projectiles.set(id, projectile);
    return id;
  }

  update(deltaTime: number): {
    activeProjectiles: Map<string, ServerProjectile>;
    expiredProjectiles: string[];
  } {
    const expiredProjectiles: string[] = [];

    for (const [id, projectile] of this.projectiles) {
      if (!projectile.update(deltaTime)) {
        expiredProjectiles.push(id);
      }
    }

    // Remove expired projectiles
    for (const id of expiredProjectiles) {
      const projectile = this.projectiles.get(id);
      if (projectile) {
        projectile.destroy(this.world);
        this.projectiles.delete(id);
      }
    }

    return {
      activeProjectiles: new Map(this.projectiles),
      expiredProjectiles
    };
  }

  getProjectile(id: string): ServerProjectile | undefined {
    return this.projectiles.get(id);
  }

  removeProjectile(id: string): boolean {
    const projectile = this.projectiles.get(id);
    if (projectile) {
      projectile.destroy(this.world);
      this.projectiles.delete(id);
      return true;
    }
    return false;
  }

  getAllProjectiles(): Map<string, ServerProjectile> {
    return new Map(this.projectiles);
  }

  clear(): void {
    for (const projectile of this.projectiles.values()) {
      projectile.destroy(this.world);
    }
    this.projectiles.clear();
  }
}