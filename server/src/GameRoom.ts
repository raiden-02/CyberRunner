import { Room, Client } from "colyseus";
import { GameState } from "./GameState.js";
import { PlayerState, MovementState } from "./PlayerState.js";
import { InputMsg, WeaponSwitchMsg, FireInputMsg, ReloadInputMsg, DamageMsg } from "./net/messages.js";
import { CharacterController } from "./movement/character-controller.js";
import { CAPSULE } from "./physics/constants.js";
import { HealthSystem } from "./systems/health-system.js";
import { WeaponSystem } from "./systems/weapon-system.js";
import { getWeaponConfig, isValidWeapon } from "./weapons/weapon-config.js";
import RAPIER from "@dimforge/rapier3d-compat";

const TICK_RATE = 60; // Hz

type PlayerRuntime = {
  ctrl: CharacterController;
  schema: PlayerState;
};

export class GameRoom extends Room<GameState> {
  private running = false;
  private world!: RAPIER.World;
  private players = new Map<string, PlayerRuntime>();

  async onCreate(_options: any) {
    this.setState(new GameState());
    console.log("[GameRoom] Created");

    await RAPIER.init();
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });

    // Ground
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(50, 0.1, 50).setTranslation(0, -0.1, 0).setFriction(1.0)
    );

    // Boundary walls
    const wallHalfThickness = 0.5;
    const wallHalfHeight = 3;
    const halfSize = 25;
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
    for (const [x, y, z] of [
      [0, 1, -10],
      [10, 1, 10],
      [-12, 1, 6],
    ] as Array<[number, number, number]>) {
      this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(2, 1, 2).setTranslation(x, y, z).setFriction(0.9)
      );
    }

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
      
      if (!isValidWeapon(data.weaponId)) return;
      if (player.schema.reloading) return;
      
      player.schema.equippedWeapon = data.weaponId;
      
      const config = getWeaponConfig(data.weaponId);
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

  onJoin(client: Client) {
    const schema = new PlayerState();
    schema.x = (Math.random() - 0.5) * 4;
    schema.y = 2.0;
    schema.z = (Math.random() - 0.5) * 4;
    schema.movementState = MovementState.Walking;
    
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
    
    this.players.set(client.sessionId, {
      ctrl,
      schema
    });

    console.log(`[GameRoom] Player ${client.sessionId} joined`);
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
    const player = this.players.get(client.sessionId);
    if (player) {
      this.world.removeCollider(player.ctrl.collider, false);
      this.world.removeRigidBody(player.ctrl.body);
    }
    this.players.delete(client.sessionId);
    console.log(`[GameRoom] Player ${client.sessionId} left`);
  }

  onDispose() {
    this.running = false;
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
      const spawnPosition = {
        x: (Math.random() - 0.5) * 4,
        y: 2.0,
        z: (Math.random() - 0.5) * 4
      };
      const respawnResult = HealthSystem.updateRespawn(player.schema, dt, spawnPosition);
      if (respawnResult.respawned) {
        player.ctrl.body.setTranslation({ x: player.schema.x, y: player.schema.y, z: player.schema.z }, true);
        player.ctrl.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        player.ctrl.body.setAngvel({ x: 0, y: 0, z: 0 }, true);

        const healthMsg = HealthSystem.createHealthChangeMessage(sessionId, player.schema);
        this.broadcast("health_change", healthMsg);
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
              now
            );

            if (shotResult.shotFired) {
              player.schema.nextFireTime = WeaponSystem.computeNextFireTime(
                player.schema.equippedWeapon,
                now
              );

              if (shotResult.shotMsg) {
                this.broadcast("shot_fired", shotResult.shotMsg);
              }

              if (shotResult.hitPlayerId && shotResult.damage !== undefined) {
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
                      hitPlayer.schema
                    );
                    this.broadcast("health_change", healthMsg);
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
