import { Room, Client } from "colyseus";
import { GameState } from "./GameState.js";
import { PlayerState, MovementState } from "./PlayerState.js";
import { InputMsg, WeaponSwitchMsg, FireInputMsg, ReloadInputMsg, DamageMsg } from "./net/messages.js";
import { CharacterController } from "./movement/character-controller.js";
import { CAPSULE } from "./physics/constants.js";
import { HealthSystem } from "./systems/health-system.js";
import { WeaponSystem } from "./systems/weapon-system.js";
import { getWeaponConfig, isValidWeapon } from "./weapons/weapon-config.js";
import { createHitboxes, removeHitboxes, HitboxRegistry, type HitboxSet } from "./physics/hitbox-system.js";
import RAPIER from "@dimforge/rapier3d-compat";
import { calculateSpawnFacing, getCurrentMap, isPointInsideBox, setCurrentMap, type MapId } from "./world/maps/map-registry.js";
import { LobbyService } from "./services/lobby-service.js";

const TICK_RATE = 60; // Hz
const DEFAULT_MAX_PLAYERS = 8;

const MIN_SPAWN_DISTANCE = 8; // meters

type PlayerRuntime = {
  ctrl: CharacterController;
  schema: PlayerState;
  hitboxes: HitboxSet;
};

type BreakableRuntime = {
  id: number;
  hp: number;
  collider: RAPIER.Collider;
};

export class GameRoom extends Room<GameState> {
  private running = false;
  private world!: RAPIER.World;
  private players = new Map<string, PlayerRuntime>();
  private maxPlayers = DEFAULT_MAX_PLAYERS;
  private breakablesByHandle = new Map<number, BreakableRuntime>();
  private breakablesById = new Map<number, BreakableRuntime>();
  private hitboxRegistry = new HitboxRegistry();

  private joinCode: string = "";

  async onAuth(_client: Client, _options: any): Promise<boolean> {
    const max = this.maxPlayers ?? DEFAULT_MAX_PLAYERS;
    if (this.clients.length >= max) {
      throw new Error(`Room is full (${max}/${max}). Try again later.`);
    }
    return true;
  }

  async onCreate(_options: any) {
    this.setState(new GameState());
    
    const roomInfo = LobbyService.registerRoom(this.roomId);
    this.joinCode = roomInfo.joinCode;
    console.log(`[GameRoom] Created (joinCode: ${roomInfo.joinCode})`);

    this.maxPlayers = Number(process.env.MAX_PLAYERS || DEFAULT_MAX_PLAYERS);
    if (!Number.isFinite(this.maxPlayers) || this.maxPlayers <= 0) {
      this.maxPlayers = DEFAULT_MAX_PLAYERS;
    }
    this.maxClients = this.maxPlayers;

    // Set the active map (can be configured via options or env)
    const mapId = (process.env.MAP_ID || "neon-pub-district") as MapId;
    setCurrentMap(mapId);
    const currentMap = getCurrentMap();
    console.log(`[GameRoom] Using map: ${currentMap.name}`);

    await RAPIER.init();
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });

    // Ground
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(
        currentMap.boundsHalfSize,
        currentMap.groundThickness,
        currentMap.boundsHalfSize
      ).setTranslation(0, -currentMap.groundThickness, 0).setFriction(1.0)
    );

    // Boundary walls
    const wallHalfThickness = currentMap.wallThickness;
    const wallHalfHeight = currentMap.wallHeight / 2;
    const halfSize = currentMap.boundsHalfSize;
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(wallHalfThickness, wallHalfHeight, halfSize)
        .setTranslation(halfSize + wallHalfThickness, wallHalfHeight, 0)
        .setFriction(0.8)
    );
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(wallHalfThickness, wallHalfHeight, halfSize)
        .setTranslation(-halfSize - wallHalfThickness, wallHalfHeight, 0)
        .setFriction(0.8)
    );
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(halfSize, wallHalfHeight, wallHalfThickness)
        .setTranslation(0, wallHalfHeight, halfSize + wallHalfThickness)
        .setFriction(0.8)
    );
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(halfSize, wallHalfHeight, wallHalfThickness)
        .setTranslation(0, wallHalfHeight, -halfSize - wallHalfThickness)
        .setFriction(0.8)
    );

    // Interior obstacles
    for (const obs of currentMap.obstacles) {
      this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(obs.hx, obs.hy, obs.hz)
          .setTranslation(obs.x, obs.y, obs.z)
          .setFriction(0.9)
      );
    }

    // Occluders (taller covers)
    for (const occ of currentMap.occluders) {
      this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(occ.hx, occ.hy, occ.hz)
          .setTranslation(occ.x, occ.y, occ.z)
          .setFriction(0.9)
      );
    }

    // Breakable cover
    currentMap.breakables.forEach((b, idx) => {
      const collider = this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(b.hx, b.hy, b.hz)
          .setTranslation(b.x, b.y, b.z)
          .setFriction(0.9)
      );
      const runtime: BreakableRuntime = {
        id: idx,
        hp: b.hp,
        collider
      };
      this.breakablesByHandle.set(collider.handle, runtime);
      this.breakablesById.set(idx, runtime);
    });

    this.running = true;
    this.setSimulationInterval((deltaTime) => {
      if (!this.running) return;
      const dt = Math.min(100, Math.max(0, deltaTime)) / 1000;
      this.update(dt);
    }, 1000 / TICK_RATE);

    this.onMessage("input", (client, data: InputMsg) => {
      const player = this.players.get(client.sessionId);
      if (!player) return;
      
      player.ctrl.updateInput(data);
      player.schema.rotationY = data.lookYaw;
      player.schema.pitch = data.lookPitch;
    });

    this.onMessage("weapon_switch", (client, data: WeaponSwitchMsg) => {
      const player = this.players.get(client.sessionId);
      if (!player) return;
      if (player.schema.reloading) return;
      
      // Only allow switching to primary or secondary weapon
      const { primaryWeaponId, secondaryWeaponId } = player.schema;
      let newWeapon: string | null = null;
      let newSlot = player.schema.activeSlot;
      
      if (data.weaponId === primaryWeaponId) {
        newWeapon = primaryWeaponId;
        newSlot = 0;
      } else if (data.weaponId === secondaryWeaponId) {
        newWeapon = secondaryWeaponId;
        newSlot = 1;
      } else if (data.weaponId === "toggle") {
        // Toggle between slots
        newSlot = player.schema.activeSlot === 0 ? 1 : 0;
        newWeapon = newSlot === 0 ? primaryWeaponId : secondaryWeaponId;
      }
      
      if (!newWeapon || newWeapon === player.schema.equippedWeapon) return;
      
      player.schema.activeSlot = newSlot;
      player.schema.equippedWeapon = newWeapon;
      
      const config = getWeaponConfig(newWeapon);
      if (config) {
        player.schema.ammoInMag = config.magazineSize;
        player.schema.ammoReserve = config.reserveMax;
      }
    });

    this.onMessage("fire_input", (client, data: FireInputMsg) => {
      const player = this.players.get(client.sessionId);
      if (!player) return;
      
      player.schema.firing = data.firing;
      (player as any).aimDir = data.aimDir;
    });

    this.onMessage("reload_input", (client, data: ReloadInputMsg) => {
      const player = this.players.get(client.sessionId);
      if (!player) return;
      
      if (data.weaponId !== player.schema.equippedWeapon) return;
      
      if (WeaponSystem.startReload(player.schema, data.weaponId)) {
        const config = getWeaponConfig(data.weaponId);
        if (config) {
          const now = performance.now() / 1000;
          player.schema.reloadEndTime = now + config.reloadTime;
        }
      }
    });

    this.onMessage("apply_damage", (client, data: DamageMsg) => {
      // Debug-only safety: only allow damaging yourself (prevents chaos in multiplayer tests)
      if (data.targetId !== client.sessionId) return;

      const targetPlayer = this.players.get(data.targetId);
      if (!targetPlayer) return;

      const amount = Math.max(0, Math.min(100, Math.round(data.amount)));

      const result = HealthSystem.applyDamage(
        targetPlayer.schema,
        amount,
        client.sessionId,
        data.weaponId,
        data.damageType
      );
      
      if (result.damaged) {
        const healthMsg = HealthSystem.createHealthChangeMessage(data.targetId, targetPlayer.schema);
        this.broadcast("health_change", healthMsg);
      }
    });
  }

  onJoin(client: Client, options?: { displayName?: string; primaryWeaponId?: string; secondaryWeaponId?: string }) {
    if (this.clients.length > this.maxPlayers) {
      client.leave(4000, `Room is full (${this.maxPlayers}/${this.maxPlayers}).`);
      return;
    }

    const spawn = this.pickSpawnPoint();
    const schema = new PlayerState();
    schema.x = spawn.x;
    schema.y = spawn.y;
    schema.z = spawn.z;
    schema.rotationY = calculateSpawnFacing(spawn.x, spawn.z);
    schema.pitch = 0;
    schema.movementState = MovementState.Walking;
    schema.isSpawnProtected = true;
    schema.spawnProtectionTime = 2.5;
    schema.displayName = options?.displayName || "Player";
    
    // Set loadout
    schema.primaryWeaponId = options?.primaryWeaponId || "AR_1";
    schema.secondaryWeaponId = options?.secondaryWeaponId || "PISTOL_1";
    schema.activeSlot = 0;
    schema.equippedWeapon = schema.primaryWeaponId;
    
    // Initialize ammo for equipped weapon
    const config = getWeaponConfig(schema.equippedWeapon);
    if (config) {
      schema.ammoInMag = config.magazineSize;
      schema.ammoReserve = config.reserveMax;
    }
    
    this.state.players.set(client.sessionId, schema);

    const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(schema.x, schema.y, schema.z);
    const body = this.world.createRigidBody(bodyDesc);
    
    const colliderDesc = RAPIER.ColliderDesc.capsule(CAPSULE.HalfHeight, CAPSULE.Radius)
      .setFriction(0.7)
      .setRestitution(0.0)
      .setActiveCollisionTypes(RAPIER.ActiveCollisionTypes.DEFAULT)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
    const collider = this.world.createCollider(colliderDesc, body);
    
    const controller = this.world.createCharacterController(0.1);
    controller.enableAutostep(0.3, 0.2, true);
    controller.enableSnapToGround(0.2);
    controller.setApplyImpulsesToDynamicBodies(true);
    
    const ctrl = new CharacterController(body, collider, controller);
    
    // Create hitbox colliders for body part damage detection
    const hitboxes = createHitboxes(this.world, body, client.sessionId, this.hitboxRegistry);
    
    this.players.set(client.sessionId, {
      ctrl,
      schema,
      hitboxes
    });

    LobbyService.updatePlayerCount(this.roomId, this.clients.length);
    
    // Send room info to the client
    const roomInfo = LobbyService.getRoomById(this.roomId);
    if (roomInfo) {
      client.send("room_info", {
        roomId: this.roomId,
        joinCode: roomInfo.joinCode,
        playerCount: this.clients.length,
        maxPlayers: this.maxPlayers,
      });
    }
    
    console.log(`[GameRoom] Player ${client.sessionId} joined`);
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
    const player = this.players.get(client.sessionId);
    if (player) {
      // Remove hitboxes from registry
      removeHitboxes(player.hitboxes);
      // Remove colliders and body
      this.world.removeCollider(player.ctrl.collider, false);
      this.world.removeRigidBody(player.ctrl.body);
    }
    this.players.delete(client.sessionId);
    LobbyService.updatePlayerCount(this.roomId, this.clients.length);
    console.log(`[GameRoom] Player ${client.sessionId} left`);
  }

  onDispose() {
    this.running = false;
    LobbyService.unregisterRoom(this.roomId);
    console.log("[GameRoom] Disposed");
  }

  private update(dt: number) {
    const now = performance.now() / 1000;

    const normalize = (v: { x: number; y: number; z: number }) => {
      const len = Math.hypot(v.x, v.y, v.z);
      if (len <= 1e-6) return { x: 0, y: 0, z: -1 };
      return { x: v.x / len, y: v.y / len, z: v.z / len };
    };

    // Match client/server notion of eye height:
    // - Rapier body translation is the capsule center.
    // - Eye height is ~1.6m above ground.
    const CENTER_TO_FOOT = CAPSULE.HalfHeight + CAPSULE.Radius;
    const EYE_HEIGHT = 1.6;
    const EYE_FROM_CENTER = EYE_HEIGHT - CENTER_TO_FOOT;

    // Phase 0: timers (respawn + reload), no physics step yet
    for (const [sessionId, player] of this.players) {
      // Update spawn protection timer
      if (!player.schema.isDead && player.schema.spawnProtectionTime > 0) {
        player.schema.spawnProtectionTime = Math.max(0, player.schema.spawnProtectionTime - dt);
      }

      // Keep spawn protection active only while inside spawn volumes
      if (!player.schema.isDead && player.schema.spawnProtectionTime > 0) {
        const inSpawnZone = this.isInSpawnProtectionZone(player.schema.x, player.schema.y, player.schema.z);
        player.schema.isSpawnProtected = inSpawnZone;
      } else if (!player.schema.isDead) {
        player.schema.isSpawnProtected = false;
      }

      if (player.schema.isDead) {
        const spawnPosition = this.pickSpawnPoint();
        const respawnResult = HealthSystem.updateRespawn(player.schema, dt, spawnPosition);
        if (respawnResult.respawned) {
          player.ctrl.body.setTranslation(
            { x: player.schema.x, y: player.schema.y, z: player.schema.z },
            true
          );
          player.ctrl.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
          player.ctrl.body.setAngvel({ x: 0, y: 0, z: 0 }, true);

          const healthMsg = HealthSystem.createHealthChangeMessage(sessionId, player.schema);
          this.broadcast("health_change", healthMsg);
        }
      }

      if (player.schema.reloading && now >= player.schema.reloadEndTime) {
        WeaponSystem.completeReload(player.schema, player.schema.equippedWeapon);
      }
    }

    // Phase 1: movement updates for all players (set kinematic targets consistently)
    for (const [, player] of this.players) {
      if (!player.schema.isDead) {
        player.ctrl.update(this.world, dt, now);
      }
    }

    // Phase 2: step physics ONCE after all kinematic targets were updated
    this.world.step();

    // Phase 3: sync schema from physics + handle firing against a consistent world state
    for (const [sessionId, player] of this.players) {
      if (!player.schema.isDead) {
        const pos = player.ctrl.body.translation();
        player.schema.x = pos.x;
        player.schema.y = pos.y;
        player.schema.z = pos.z;

        // Ack the latest input seq that was actually used for movement this tick.
        // (Updating ack here avoids mismatches where onMessage updates ack asynchronously
        // but the player's position is still from a different simulation step.)
        player.schema.lastProcessedInputSeq =
          (player.ctrl.input as any)?.seq ?? player.schema.lastProcessedInputSeq;

        player.schema.velX = 0;
        player.schema.velY = 0;
        player.schema.velZ = 0;

        player.schema.canJump = player.ctrl.isGrounded();
        player.schema.movementState = player.ctrl.currentState();
        player.schema.isSprinting = player.ctrl.input.sprint;

        const currentState = player.ctrl.currentState();
        player.schema.isCrouching = (currentState === MovementState.Crouching);
        player.schema.isSliding = (currentState === MovementState.Sliding);
      }

      if (!player.schema.isDead && player.schema.firing && !player.schema.reloading) {
        if (WeaponSystem.canFire(player.schema, now)) {
          const aimDir = (player as any).aimDir;
          if (aimDir) {
            const aim = normalize(aimDir);
            const pos = player.ctrl.body.translation();

            // Use authoritative physics body position (NOT schema) and offset forward to avoid self-hit
            const eye = { x: pos.x, y: pos.y + EYE_FROM_CENTER, z: pos.z };
            const origin = {
              x: eye.x + aim.x * (CAPSULE.Radius + 0.15),
              y: eye.y + aim.y * (CAPSULE.Radius + 0.15),
              z: eye.z + aim.z * (CAPSULE.Radius + 0.15)
            };

            const shotResult = WeaponSystem.processShot(
              this.world,
              player.schema,
              sessionId,
              origin,
              aim,
              this.players,
              now,
              this.hitboxRegistry
            );

            if (shotResult.shotFired) {
              
              player.schema.nextFireTime = WeaponSystem.computeNextFireTime(
                player.schema.equippedWeapon,
                now
              );

              if (shotResult.shotMsg) {
                this.broadcast("shot_fired", shotResult.shotMsg);
              }

              // Handle multi-hit (shotgun pellets hitting multiple players)
              if (shotResult.multiHits && shotResult.multiHits.length > 0) {
                for (const hit of shotResult.multiHits) {
                  const hitPlayer = this.players.get(hit.playerId);
                  if (hitPlayer) {
                    const dmgResult = HealthSystem.applyDamage(
                      hitPlayer.schema,
                      hit.damage,
                      sessionId,
                      player.schema.equippedWeapon,
                      "hitscan"
                    );

                    if (dmgResult.damaged) {
                      const healthMsg = HealthSystem.createHealthChangeMessage(
                        hit.playerId,
                        hitPlayer.schema,
                        hit.bodyPart
                      );
                      this.broadcast("health_change", healthMsg);
                    }

                    if (dmgResult.killed) {
                      hitPlayer.schema.deaths += 1;
                      hitPlayer.schema.score = Math.max(0, hitPlayer.schema.score - 50);

                      if (hit.playerId !== sessionId) {
                        const killer = this.players.get(sessionId);
                        if (killer) {
                          killer.schema.kills += 1;
                          killer.schema.score += 100;
                        }
                      }
                    }
                  }
                }
              } else if (shotResult.hitPlayerId && shotResult.damage !== undefined) {
                // Single hit (regular weapons)
                const hitPlayer = this.players.get(shotResult.hitPlayerId);
                if (hitPlayer) {
                  const dmgResult = HealthSystem.applyDamage(
                    hitPlayer.schema,
                    shotResult.damage,
                    sessionId,
                    player.schema.equippedWeapon,
                    "hitscan"
                  );

                  if (dmgResult.damaged) {
                    const healthMsg = HealthSystem.createHealthChangeMessage(
                      shotResult.hitPlayerId,
                      hitPlayer.schema,
                      shotResult.bodyPart
                    );
                    this.broadcast("health_change", healthMsg);
                  }

                  if (dmgResult.killed) {
                    hitPlayer.schema.deaths += 1;
                    hitPlayer.schema.score = Math.max(0, hitPlayer.schema.score - 50);

                    if (shotResult.hitPlayerId !== sessionId) {
                      const killer = this.players.get(sessionId);
                      if (killer) {
                        killer.schema.kills += 1;
                        killer.schema.score += 100;
                      }
                    }
                  }
                }
              }

              // Breakable cover damage
              if (shotResult.hitColliderHandle !== undefined && !shotResult.hitPlayerId) {
                const hitDamage = shotResult.hitDamage ?? 0;
                if (hitDamage > 0) {
                  this.applyBreakableDamage(shotResult.hitColliderHandle, hitDamage);
                }
              }
            }
          }
        }
      }
    }
  }

  private pickSpawnPoint(): { x: number; y: number; z: number } {
    const currentMap = getCurrentMap();
    const alivePositions: Array<{ x: number; y: number; z: number }> = [];
    for (const [, player] of this.players) {
      if (!player.schema.isDead) {
        alivePositions.push({ x: player.schema.x, y: player.schema.y, z: player.schema.z });
      }
    }

    if (alivePositions.length === 0) {
      const idx = Math.floor(Math.random() * currentMap.spawnPoints.length);
      return currentMap.spawnPoints[idx];
    }

    let bestPoint = currentMap.spawnPoints[0];
    let bestScore = -Infinity;

    for (const point of currentMap.spawnPoints) {
      // Safety: avoid any spawn inside obstacles
      let blocked = false;
      for (const obs of currentMap.obstacles) {
        if (isPointInsideBox(point, obs)) {
          blocked = true;
          break;
        }
      }
      if (!blocked) {
        for (const occ of currentMap.occluders) {
          if (isPointInsideBox(point, occ)) {
            blocked = true;
            break;
          }
        }
      }
      if (!blocked) {
        for (const br of currentMap.breakables) {
          if (isPointInsideBox(point, br)) {
            blocked = true;
            break;
          }
        }
      }
      if (blocked) continue;

      let minDistSq = Infinity;
      for (const pos of alivePositions) {
        const dx = point.x - pos.x;
        const dz = point.z - pos.z;
        const distSq = dx * dx + dz * dz;
        if (distSq < minDistSq) minDistSq = distSq;
      }
      if (minDistSq > bestScore) {
        bestScore = minDistSq;
        bestPoint = point;
      }
    }

    if (bestScore < MIN_SPAWN_DISTANCE * MIN_SPAWN_DISTANCE) {
      // If all spawns are close, randomize among top few to avoid predictability.
      const sorted = [...currentMap.spawnPoints].sort((a, b) => {
        const aScore = alivePositions.reduce((min, pos) => {
          const dx = a.x - pos.x;
          const dz = a.z - pos.z;
          return Math.min(min, dx * dx + dz * dz);
        }, Infinity);
        const bScore = alivePositions.reduce((min, pos) => {
          const dx = b.x - pos.x;
          const dz = b.z - pos.z;
          return Math.min(min, dx * dx + dz * dz);
        }, Infinity);
        return bScore - aScore;
      });
      const pick = sorted[Math.floor(Math.random() * Math.min(3, sorted.length))];
      return pick;
    }

    if (bestScore === -Infinity) {
      const idx = Math.floor(Math.random() * currentMap.spawnPoints.length);
      return currentMap.spawnPoints[idx];
    }

    return bestPoint;
  }

  private isInSpawnProtectionZone(x: number, y: number, z: number): boolean {
    const currentMap = getCurrentMap();
    return currentMap.spawnProtectionZones.some((zone) =>
      x >= zone.x - zone.hx &&
      x <= zone.x + zone.hx &&
      z >= zone.z - zone.hz &&
      z <= zone.z + zone.hz &&
      y >= zone.y - zone.hy &&
      y <= zone.y + zone.hy
    );
  }

  private applyBreakableDamage(colliderHandle: number, damage: number): void {
    const runtime = this.breakablesByHandle.get(colliderHandle);
    if (!runtime) return;

    runtime.hp -= damage;
    if (runtime.hp > 0) return;

    // Destroy breakable collider
    this.world.removeCollider(runtime.collider, false);
    this.breakablesByHandle.delete(colliderHandle);
    this.breakablesById.delete(runtime.id);

    this.broadcast("breakable_destroyed", { id: runtime.id });
  }
}
