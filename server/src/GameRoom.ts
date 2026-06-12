import { Room, Client } from "colyseus";
import { GameState } from "./GameState.js";
import { PlayerState, MovementState } from "./PlayerState.js";
import { WeaponSwitchMsg, FireInputMsg, ReloadInputMsg, DamageMsg, SpikeActionMsg, TeamSelectMsg } from "./net/messages.js";
import type { InputMsg } from "@shared/movement/types.js";
import { decodeInputCmd, decodeFireCmd } from "./net/BinaryCodec.js";
import { ServerInputQueue } from "./net/server-input-queue.js";
import { ackSeqAfterTick } from "./net/auth-player-tick.js";
import { RttChallengeBook } from "./net/rtt-challenge.js";
import { FIXED_DT, FIXED_TICK_HZ, authoritativeMovementDt, simulationTimeSec } from "@shared/net/fixed-tick.js";
import { CharacterController } from "@shared/movement/character-controller.js";
import { CAPSULE } from "@shared/physics/constants.js";
import { buildMapColliders, createPlayerPhysics } from "@shared/world/map-physics.js";
import { SHOOT_HOUSE_NEON_COLLISION } from "@shared/world/maps/shoot-house-neon.js";
import { HealthSystem } from "./systems/health-system.js";
import { WeaponSystem } from "./systems/weapon-system.js";
import { getWeaponConfig } from "./weapons/weapon-config.js";
import { createHitboxes, removeHitboxes, HitboxRegistry } from "./physics/hitbox-system.js";
import RAPIER from "@dimforge/rapier3d-compat";
import { calculateSpawnFacing, getCurrentMap, setCurrentMap, type MapId } from "./world/maps/map-registry.js";
import { LobbyService } from "./services/lobby-service.js";
import {
  BaseGameMode,
  createGameMode,
  SearchDestroyMode,
} from "./game-modes/index.js";
import { LagCompensation } from "./systems/lag-compensation.js";
import { ProjectileManager } from "./systems/projectile-system.js";
import { createPlayerRuntime, type PlayerRuntime } from "./player-runtime.js";
import { pickSpawnPoint, isInSpawnProtectionZone } from "./spawn/spawn-select.js";
import {
  processFiringPlayers,
  updateProjectiles,
  type BreakableRuntime,
} from "./systems/combat-tick.js";
import { MatchLifecycle } from "./match/match-lifecycle.js";

const TICK_RATE = FIXED_TICK_HZ;
const DEFAULT_MAX_PLAYERS = 8;

export class GameRoom extends Room<GameState> {
  private running = false;
  private world!: RAPIER.World;
  private players = new Map<string, PlayerRuntime>();
  private maxPlayers = DEFAULT_MAX_PLAYERS;
  private breakablesByHandle = new Map<number, BreakableRuntime>();
  private breakablesById = new Map<number, BreakableRuntime>();
  private hitboxRegistry = new HitboxRegistry();
  private gameMode!: BaseGameMode;
  private lagCompensation = new LagCompensation();
  private rttChallenges = new RttChallengeBook();
  private projectileManager!: ProjectileManager;
  private serverTick = 0;
  private match!: MatchLifecycle;

  private joinCode: string = "";
  private hostId: string = "";

  private isSearchDestroyMode(): boolean {
    return this.gameMode instanceof SearchDestroyMode;
  }

  private getSDMode(): SearchDestroyMode | null {
    return this.gameMode instanceof SearchDestroyMode ? this.gameMode : null;
  }

  private bindMatch(): MatchLifecycle {
    const room = this;
    return new MatchLifecycle({
      get state() { return room.state; },
      get players() { return room.players; },
      get clients() { return room.clients; },
      get hostId() { return room.hostId; },
      get gameMode() { return room.gameMode; },
      getSDMode: () => room.getSDMode(),
      isSearchDestroyMode: () => room.isSearchDestroyMode(),
      broadcast: (type, message) => room.broadcast(type, message),
      setHostId: (id) => {
        room.hostId = id;
        room.state.hostId = id;
      },
      schedule: (fn, ms) => { room.clock.setTimeout(fn, ms); },
      placePlayerAt: (player, x, y, z) => room.placePlayerAt(player, x, y, z),
      pickSpawnPoint: (sessionId) => room.pickSpawnPoint(sessionId),
    });
  }

  async onAuth(_client: Client, _options: unknown): Promise<boolean> {
    const max = this.maxPlayers ?? DEFAULT_MAX_PLAYERS;
    if (this.clients.length >= max) {
      throw new Error(`Room is full (${max}/${max}). Try again later.`);
    }
    return true;
  }

  async onCreate(options: { gameMode?: string } = {}) {
    this.setState(new GameState());

    const roomInfo = LobbyService.registerRoom(this.roomId);
    this.joinCode = roomInfo.joinCode;

    this.maxPlayers = Number(process.env.MAX_PLAYERS || DEFAULT_MAX_PLAYERS);
    if (!Number.isFinite(this.maxPlayers) || this.maxPlayers <= 0) {
      this.maxPlayers = DEFAULT_MAX_PLAYERS;
    }
    this.maxClients = this.maxPlayers;

    const mapId = (process.env.MAP_ID || "shoot-house-neon") as MapId;
    setCurrentMap(mapId);
    const currentMap = getCurrentMap();

    const modeId = options.gameMode || "deathmatch";
    this.gameMode = createGameMode(modeId, currentMap.uploadTerminals || []);
    const modeConfig = this.gameMode.getConfig();

    this.state.gameMode = modeConfig.id;
    this.state.scoreLimit = modeConfig.scoreLimit;
    this.state.timeRemaining = modeConfig.timeLimit;
    this.state.roundsToWin = modeConfig.roundsToWin;
    this.state.currentRound = 1;

    if (modeConfig.teamBased) {
      this.state.lobbyState = "waiting";
      this.state.isRoundActive = false;
    } else {
      this.state.lobbyState = "playing";
      this.state.isRoundActive = true;
      this.gameMode.startGame();
    }

    console.log(`[GameRoom] Created (code: ${roomInfo.joinCode}, mode: ${modeConfig.name})`);

    await RAPIER.init();
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = FIXED_DT;

    const { breakableColliders } = buildMapColliders(RAPIER, this.world, SHOOT_HOUSE_NEON_COLLISION);

    breakableColliders.forEach((collider, idx) => {
      const b = SHOOT_HOUSE_NEON_COLLISION.breakables[idx];
      const runtime: BreakableRuntime = {
        id: idx,
        hp: b.hp,
        collider,
      };
      this.breakablesByHandle.set(collider.handle, runtime);
      this.breakablesById.set(idx, runtime);
    });

    this.projectileManager = new ProjectileManager(this.world);
    this.match = this.bindMatch();

    this.running = true;
    this.setSimulationInterval((_deltaTime) => {
      if (!this.running) return;
      this.update();
    }, 1000 / TICK_RATE);

    this.onMessage("input_bin", (client, raw: Uint8Array | ArrayBuffer) => {
      const bytes = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
      const data = decodeInputCmd(bytes);
      if (!data) return;
      this.handleInput(client, data);
    });

    this.onMessage("weapon_switch", (client, data: WeaponSwitchMsg) => {
      const player = this.players.get(client.sessionId);
      if (!player) return;
      if (player.schema.reloading) return;

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

    this.onMessage("fire_bin", (client, raw: Uint8Array | ArrayBuffer) => {
      const bytes = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
      const data = decodeFireCmd(bytes);
      if (!data) return;
      this.handleFireInput(client, data);
    });

    this.onMessage("ping", (client, data: { clientTime: number }) => {
      const challengeId = this.rttChallenges.issue(client.sessionId, Date.now());
      client.send("pong", { clientTime: data.clientTime, challengeId });
    });

    this.onMessage("rtt_echo", (client, data: { challengeId?: number }) => {
      if (!data) return;
      const rtt = this.rttChallenges.take(client.sessionId, data.challengeId as number, Date.now());
      if (rtt === null) return;
      this.lagCompensation.recordRtt(client, rtt);
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

    this.onMessage("spike_action", (client, data: SpikeActionMsg) => {
      if (this.state.gameMode !== "search_destroy") return;
      if (this.state.lobbyState !== "playing") return;

      const player = this.players.get(client.sessionId);
      if (!player || player.schema.isDead) return;

      const playerTeam = player.schema.teamId;

      const sdMode = this.getSDMode();
      if (!sdMode) return;
      const spikeManager = sdMode.getSpikeManager();

      switch (data.action) {
        case "upload": {
          if (playerTeam !== "ghosts") return;
          const terminal = spikeManager.getNearbyTerminal(player.schema.x, player.schema.z);
          if (terminal) {
            spikeManager.startUpload(client.sessionId, this.state, player.schema, terminal);
          }
          break;
        }
        case "decrypt": {
          if (playerTeam !== "sentinels") return;
          spikeManager.startDecrypt(client.sessionId, this.state, player.schema);
          break;
        }
        case "pickup": {
          if (playerTeam !== "ghosts") return;
          spikeManager.pickupSpike(client.sessionId, this.state, player.schema);
          break;
        }
        case "cancel": {
          if (player.schema.isUploading) {
            spikeManager.cancelUpload(client.sessionId, this.state, player.schema);
          } else if (player.schema.isDecrypting) {
            spikeManager.cancelDecrypt(client.sessionId, this.state, player.schema);
          }
          break;
        }
      }
    });

    this.onMessage("toggle_god_mode", (client) => {
      if (process.env.NODE_ENV === "production") return;
      const player = this.players.get(client.sessionId);
      if (!player) return;

      player.godMode = !player.godMode;
      const enabled = player.godMode;

      if (enabled) {
        player.schema.health = player.schema.maxHealth;
        player.schema.isDead = false;
      }

      console.log(`[Debug] God mode ${enabled ? "ON" : "OFF"} for ${player.schema.displayName}`);
      client.send("god_mode_changed", { enabled });
    });

    this.onMessage("toggle_unlimited_ammo", (client) => {
      if (process.env.NODE_ENV === "production") return;
      const player = this.players.get(client.sessionId);
      if (!player) return;

      player.unlimitedAmmo = !player.unlimitedAmmo;
      const enabled = player.unlimitedAmmo;

      if (enabled) {
        const weaponCfg = getWeaponConfig(player.schema.equippedWeapon);
        player.schema.ammoInMag = weaponCfg?.magazineSize ?? 30;
        player.schema.ammoReserve = 999;
      }

      console.log(`[Debug] Unlimited ammo ${enabled ? "ON" : "OFF"} for ${player.schema.displayName}`);
      client.send("unlimited_ammo_changed", { enabled });
    });

    this.onMessage("apply_damage", (client, data: DamageMsg) => {
      if (process.env.NODE_ENV === "production") return;
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

    this.onMessage("team_select", (client, data: TeamSelectMsg) => {
      if (this.state.lobbyState !== "waiting") return;
      const sdMode = this.getSDMode();
      if (!sdMode) return;

      const player = this.players.get(client.sessionId);
      if (!player) return;

      const success = sdMode.getTeamManager().assignToTeam(client.sessionId, data.teamId);
      if (success) {
        player.schema.teamId = data.teamId;
        this.match.broadcastLobbyState();
      }
    });

    this.onMessage("start_game", (client) => {
      if (client.sessionId !== this.hostId) return;
      if (this.state.lobbyState !== "waiting") return;
      const sdMode = this.getSDMode();
      if (!sdMode || !sdMode.getTeamManager().canStartGame()) return;

      this.match.startTeamGame();
    });

    this.onMessage("restart_game", (client) => {
      if (client.sessionId !== this.hostId) return;
      if (this.state.lobbyState !== "ended") return;
      this.match.restartGame();
    });

    this.onMessage("disband_lobby", (client) => {
      if (client.sessionId !== this.hostId) return;

      this.broadcast("lobby_disbanded", {});
      this.disconnect();
    });
  }

  onJoin(client: Client, options?: { displayName?: string; primaryWeaponId?: string; secondaryWeaponId?: string }) {
    if (this.clients.length > this.maxPlayers) {
      client.leave(4000, `Room is full (${this.maxPlayers}/${this.maxPlayers}).`);
      return;
    }

    if (!this.hostId) {
      this.hostId = client.sessionId;
      this.state.hostId = client.sessionId;
    }

    const spawn = this.pickSpawnPoint(client.sessionId);
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
    schema.primaryWeaponId = options?.primaryWeaponId || "AR_1";
    schema.secondaryWeaponId = options?.secondaryWeaponId || "PISTOL_1";
    schema.activeSlot = 0;
    schema.equippedWeapon = schema.primaryWeaponId;

    const weaponConfig = getWeaponConfig(schema.equippedWeapon);
    if (weaponConfig) {
      schema.ammoInMag = weaponConfig.magazineSize;
      schema.ammoReserve = weaponConfig.reserveMax;
    }

    this.gameMode.addPlayer(client.sessionId);
    const modeConfig = this.gameMode.getConfig();
    schema.livesRemaining = modeConfig.maxLives > 0 ? modeConfig.maxLives : 99;
    schema.roundsWon = 0;

    const sdMode = this.getSDMode();
    if (sdMode) {
      const teamId = sdMode.getTeamManager().autoAssignTeam(client.sessionId);
      schema.teamId = teamId;
    }

    this.state.players.set(client.sessionId, schema);

    const { body, collider, controller } = createPlayerPhysics(
      RAPIER, this.world,
      schema.x, schema.y, schema.z,
      CAPSULE.HalfHeight, CAPSULE.Radius
    );

    const ctrl = new CharacterController(body, collider, controller);
    const hitboxes = createHitboxes(this.world, body, client.sessionId, this.hitboxRegistry);
    this.players.set(client.sessionId, createPlayerRuntime(ctrl, schema, hitboxes));

    LobbyService.updatePlayerCount(this.roomId, this.clients.length);

    const joinedRoom = LobbyService.getRoomById(this.roomId);
    if (joinedRoom) {
      client.send("room_info", {
        roomId: this.roomId,
        joinCode: joinedRoom.joinCode,
        playerCount: this.clients.length,
        maxPlayers: this.maxPlayers,
        hostId: this.hostId,
        gameMode: this.state.gameMode,
        lobbyState: this.state.lobbyState,
      });
    }

    if (this.isSearchDestroyMode()) {
      this.match.broadcastLobbyState();
    }
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
    const player = this.players.get(client.sessionId);
    if (player) {
      removeHitboxes(player.hitboxes);
      this.world.removeCollider(player.ctrl.collider, false);
      this.world.removeRigidBody(player.ctrl.body);
    }
    this.players.delete(client.sessionId);
    this.gameMode.removePlayer(client.sessionId);
    this.lagCompensation.removePlayer(client.sessionId);
    this.rttChallenges.clear(client.sessionId);

    const sdMode = this.getSDMode();
    if (sdMode) {
      sdMode.getTeamManager().removePlayer(client.sessionId);
    }
    LobbyService.updatePlayerCount(this.roomId, this.clients.length);

    if (client.sessionId === this.hostId) {
      this.match.transferHost();
    }

    if (this.isSearchDestroyMode()) {
      this.match.broadcastLobbyState();
    }
  }

  onDispose() {
    this.running = false;
    LobbyService.unregisterRoom(this.roomId);
    console.log("[GameRoom] Disposed");
  }

  private sanitizeInput(data: InputMsg): InputMsg {
    const moveX = Math.max(-1, Math.min(1, data.moveX || 0));
    const moveZ = Math.max(-1, Math.min(1, data.moveZ || 0));
    let lookYaw = data.lookYaw;
    let lookPitch = data.lookPitch;
    if (!Number.isFinite(lookYaw)) lookYaw = 0;
    if (!Number.isFinite(lookPitch)) lookPitch = 0;
    lookPitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, lookPitch));
    return { ...data, moveX, moveZ, lookYaw, lookPitch };
  }

  private handleInput(client: Client, data: InputMsg): void {
    const player = this.players.get(client.sessionId);
    if (!player) return;

    const result = player.inputQueue.enqueue(this.sanitizeInput(data));
    if (result === "overflow") {
      client.leave(4002, "input queue overflow");
    }
  }

  private handleFireInput(client: Client, data: FireInputMsg): void {
    const player = this.players.get(client.sessionId);
    if (!player) return;

    player.schema.firing = data.firing;
    player.aimDir = data.aimDir;
  }

  private update() {
    if (this.state.isGameOver) return;

    this.serverTick += 1;
    const dt = authoritativeMovementDt();
    const now = simulationTimeSec(this.serverTick);
    const wallNow = performance.now() / 1000;

    const result = this.gameMode.update(dt, this.state, this.players);

    const roundState = this.gameMode.getRoundState();
    this.state.currentRound = roundState.roundNumber;
    this.state.roundTimeRemaining = Math.max(0, Math.floor(roundState.roundTimeRemaining));
    this.state.isRoundActive = roundState.isRoundActive;

    if (this.gameMode.isGameEnded()) {
      this.match.handleGameOver(this.gameMode.getWinner());
      return;
    }

    if (result.ended && result.winnerTeam) {
      this.match.handleTeamRoundEnd(result.winnerTeam as "ghosts" | "sentinels", result.reason || "");
    }

    for (const [sessionId, player] of this.players) {
      if (!player.schema.isDead && player.schema.spawnProtectionTime > 0) {
        player.schema.spawnProtectionTime = Math.max(0, player.schema.spawnProtectionTime - dt);
      }

      if (!player.schema.isDead && player.schema.spawnProtectionTime > 0) {
        const inSpawnZone = isInSpawnProtectionZone(player.schema.x, player.schema.y, player.schema.z);
        player.schema.isSpawnProtected = inSpawnZone;
      } else if (!player.schema.isDead) {
        player.schema.isSpawnProtected = false;
      }

      if (player.schema.isDead) {
        const canRespawn = this.gameMode.canRespawn(sessionId);
        const spawnPosition = this.pickSpawnPoint(sessionId);
        const respawnResult = HealthSystem.updateRespawn(player.schema, dt, spawnPosition, canRespawn);
        if (respawnResult.respawned) {
          this.placePlayerAt(player, player.schema.x, player.schema.y, player.schema.z);

          const sdMode = this.getSDMode();
          if (sdMode) {
            sdMode.onPlayerRespawn(sessionId);
          }

          const healthMsg = HealthSystem.createHealthChangeMessage(sessionId, player.schema);
          this.broadcast("health_change", healthMsg);
        }
      }

      if (player.schema.reloading && wallNow >= player.schema.reloadEndTime) {
        WeaponSystem.completeReload(player.schema, player.schema.equippedWeapon);
      }
    }

    for (const [, player] of this.players) {
      if (player.schema.isDead) {
        player.inputQueue.discardUnsimulated();
        continue;
      }

      const applied = player.inputQueue.consumeForTick();
      if (applied.kind !== "none") {
        player.ctrl.updateInput(applied.input);
        player.schema.rotationY = applied.input.lookYaw;
        player.schema.pitch = applied.input.lookPitch;
      }

      HealthSystem.updateSlowEffect(player.schema, dt);
      player.ctrl.setSpeedMultiplier(1 - player.schema.slowEffect);
      player.ctrl.update(this.world, dt, now);

      const ack = ackSeqAfterTick(false, applied);
      if (ack !== null) {
        player.schema.lastProcessedInputSeq = ack;
      }
    }

    this.world.step();

    updateProjectiles(
      dt,
      this.world,
      this.players,
      this.projectileManager,
      (type, message) => this.broadcast(type, message),
      (victimId, killerId) => this.match.handlePlayerKill(victimId, killerId),
    );

    for (const [, player] of this.players) {
      if (!player.schema.isDead) {
        const pos = player.ctrl.body.translation();
        player.schema.x = pos.x;
        player.schema.y = pos.y;
        player.schema.z = pos.z;

        player.schema.movementState = player.ctrl.currentState();
        player.schema.isSprinting = player.ctrl.input.sprint;

        const currentState = player.ctrl.currentState();
        player.schema.isCrouching = (currentState === MovementState.Crouching);
        player.schema.isSliding = (currentState === MovementState.Sliding);
      }
    }

    this.lagCompensation.recordTick(this.serverTick, this.players);

    processFiringPlayers(
      this.players,
      this.world,
      now,
      this.lagCompensation,
      this.hitboxRegistry,
      this.projectileManager,
      this.breakablesByHandle,
      this.breakablesById,
      (type, message) => this.broadcast(type, message),
      (victimId, killerId) => this.match.handlePlayerKill(victimId, killerId),
    );
  }

  private placePlayerAt(
    player: { ctrl: CharacterController; inputQueue?: ServerInputQueue },
    x: number, y: number, z: number,
  ): void {
    player.inputQueue?.discardUnsimulated();
    player.ctrl.resetAfterTeleport();
    player.ctrl.body.setTranslation({ x, y, z }, true);
    player.ctrl.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    player.ctrl.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }

  private pickSpawnPoint(sessionId?: string): { x: number; y: number; z: number } {
    const sdMode = this.getSDMode();
    return pickSpawnPoint(
      this.players,
      sessionId,
      (id) => sdMode?.getTeamManager().getPlayerTeam(id),
    );
  }
}
