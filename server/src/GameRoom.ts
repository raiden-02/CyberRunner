import { Room, Client } from "colyseus";
import { GameState } from "./GameState.js";
import { PlayerState, MovementState } from "./PlayerState.js";
import { InputMsg, WeaponSwitchMsg, FireInputMsg, ReloadInputMsg, DamageMsg, SpikeActionMsg, TeamSelectMsg } from "./net/messages.js";
import { CharacterController } from "./movement/character-controller.js";
import { CAPSULE } from "./physics/constants.js";
import { HealthSystem } from "./systems/health-system.js";
import { WeaponSystem } from "./systems/weapon-system.js";
import { getWeaponConfig } from "./weapons/weapon-config.js";
import { createHitboxes, removeHitboxes, HitboxRegistry, type HitboxSet } from "./physics/hitbox-system.js";
import RAPIER from "@dimforge/rapier3d-compat";
import { calculateSpawnFacing, getCurrentMap, isPointInsideBox, setCurrentMap, type MapId } from "./world/maps/map-registry.js";
import { LobbyService } from "./services/lobby-service.js";
import { 
  BaseGameMode, 
  createGameMode, 
  SearchDestroyMode,
  type TeamId 
} from "./game-modes/index.js";

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
  private gameMode!: BaseGameMode;

  private joinCode: string = "";
  private hostId: string = "";

  private isSearchDestroyMode(): boolean {
    return this.gameMode instanceof SearchDestroyMode;
  }

  private getSDMode(): SearchDestroyMode | null {
    return this.gameMode instanceof SearchDestroyMode ? this.gameMode : null;
  }

  async onAuth(_client: Client, _options: any): Promise<boolean> {
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
    
    console.log(`[GameRoom] Created (code: ${roomInfo.joinCode}, mode: ${modeConfig.name})`)

    await RAPIER.init();
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });

    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(
        currentMap.boundsHalfSize,
        currentMap.groundThickness,
        currentMap.boundsHalfSize
      ).setTranslation(0, -currentMap.groundThickness, 0).setFriction(1.0)
    );

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

    for (const obs of currentMap.obstacles) {
      this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(obs.hx, obs.hy, obs.hz)
          .setTranslation(obs.x, obs.y, obs.z)
          .setFriction(0.9)
      );
    }

    for (const occ of currentMap.occluders) {
      this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(occ.hx, occ.hy, occ.hz)
          .setTranslation(occ.x, occ.y, occ.z)
          .setFriction(0.9)
      );
    }

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

    this.onMessage("apply_damage", (client, data: DamageMsg) => {
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
        this.broadcastLobbyState();
      }
    });

    this.onMessage("start_game", (client) => {
      if (client.sessionId !== this.hostId) return;
      if (this.state.lobbyState !== "waiting") return;
      const sdMode = this.getSDMode();
      if (!sdMode || !sdMode.getTeamManager().canStartGame()) return;
      
      this.startTeamGame();
    });

    this.onMessage("restart_game", (client) => {
      if (client.sessionId !== this.hostId) return;
      if (this.state.lobbyState !== "ended") return;
      this.restartGame();
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
    
    const hitboxes = createHitboxes(this.world, body, client.sessionId, this.hitboxRegistry);
    
    this.players.set(client.sessionId, { ctrl, schema, hitboxes });

    LobbyService.updatePlayerCount(this.roomId, this.clients.length);
    
    const roomInfo = LobbyService.getRoomById(this.roomId);
    if (roomInfo) {
      client.send("room_info", {
        roomId: this.roomId,
        joinCode: roomInfo.joinCode,
        playerCount: this.clients.length,
        maxPlayers: this.maxPlayers,
        hostId: this.hostId,
        gameMode: this.state.gameMode,
        lobbyState: this.state.lobbyState,
      });
    }
    
    if (this.isSearchDestroyMode()) {
      this.broadcastLobbyState();
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
    
    const sdMode = this.getSDMode();
    if (sdMode) {
      sdMode.getTeamManager().removePlayer(client.sessionId);
    }
    LobbyService.updatePlayerCount(this.roomId, this.clients.length);
    
    if (client.sessionId === this.hostId) {
      this.transferHost();
    }
    
    if (this.isSearchDestroyMode()) {
      this.broadcastLobbyState();
    }
  }

  onDispose() {
    this.running = false;
    LobbyService.unregisterRoom(this.roomId);
    console.log("[GameRoom] Disposed");
  }

  private broadcastLobbyState(): void {
    const sdMode = this.getSDMode();
    if (!sdMode) return;
    
    const teamManager = sdMode.getTeamManager();
    const lobbyState = {
      lobbyState: this.state.lobbyState,
      hostId: this.hostId,
      ghostPlayers: teamManager.getTeamPlayers("ghosts"),
      sentinelPlayers: teamManager.getTeamPlayers("sentinels"),
      canStart: teamManager.canStartGame(),
      ghostsRoundsWon: this.state.ghostsRoundsWon,
      sentinelsRoundsWon: this.state.sentinelsRoundsWon,
    };
    this.broadcast("lobby_state", lobbyState);
  }

  private transferHost(): void {
    const remainingClients = this.clients.filter(c => c.sessionId !== this.hostId);
    if (remainingClients.length > 0) {
      this.hostId = remainingClients[0].sessionId;
      this.state.hostId = this.hostId;
      this.broadcast("host_changed", { newHostId: this.hostId });
    }
  }

  private startTeamGame(): void {
    const sdMode = this.getSDMode();
    if (!sdMode) return;
    
    this.state.lobbyState = "playing";
    this.state.isRoundActive = true;
    this.state.currentRound = 1;
    this.state.ghostsRoundsWon = 0;
    this.state.sentinelsRoundsWon = 0;
    
    sdMode.resetGame(this.state);
    sdMode.startRound();
    this.gameMode.startGame();
    this.spawnSpikeOnGround();
    
    for (const [sessionId, player] of this.players) {
      const spawn = this.pickSpawnPoint(sessionId);
      player.schema.isDead = false;
      player.schema.health = player.schema.maxHealth;
      player.schema.x = spawn.x;
      player.schema.y = spawn.y;
      player.schema.z = spawn.z;
      player.schema.rotationY = calculateSpawnFacing(spawn.x, spawn.z);
      player.schema.livesRemaining = this.gameMode.getConfig().maxLives || 1;
      player.schema.hasSpike = false;
      player.schema.isUploading = false;
      player.schema.isDecrypting = false;
      
      player.ctrl.body.setTranslation({ x: spawn.x, y: spawn.y, z: spawn.z }, true);
    }
    
    this.broadcast("game_started", {
      roundNumber: 1,
      spikeX: this.state.spikeX,
      spikeZ: this.state.spikeZ,
    });
    
    this.broadcastLobbyState();
  }

  private restartGame(): void {
    this.state.isGameOver = false;
    this.state.winnerId = "";
    this.state.gameWinnerTeam = "";
    this.state.currentRound = 1;
    this.state.ghostsRoundsWon = 0;
    this.state.sentinelsRoundsWon = 0;
    
    const sdMode = this.getSDMode();
    if (sdMode) {
      this.state.lobbyState = "waiting";
      this.state.isRoundActive = false;
      sdMode.resetGame(this.state);
    } else {
      this.state.lobbyState = "playing";
      this.state.isRoundActive = true;
      this.gameMode.startGame();
    }
    
    for (const [sessionId, player] of this.players) {
      const spawn = this.pickSpawnPoint(sessionId);
      player.schema.isDead = false;
      player.schema.health = player.schema.maxHealth;
      player.schema.kills = 0;
      player.schema.deaths = 0;
      player.schema.score = 0;
      player.schema.roundsWon = 0;
      player.schema.hasSpike = false;
      player.schema.x = spawn.x;
      player.schema.y = spawn.y;
      player.schema.z = spawn.z;
      player.schema.livesRemaining = this.gameMode.getConfig().maxLives || 99;
      
      player.ctrl.body.setTranslation({ x: spawn.x, y: spawn.y, z: spawn.z }, true);
      
      this.gameMode.addPlayer(sessionId);
    }
    
    this.broadcast("game_restarted", {});
    
    if (sdMode) {
      this.broadcastLobbyState();
    }
  }

  private spawnSpikeOnGround(): void {
    const currentMap = getCurrentMap();
    if (currentMap.spikeSpawnLocation) {
      this.state.spikeX = currentMap.spikeSpawnLocation.x;
      this.state.spikeZ = currentMap.spikeSpawnLocation.z;
    } else if (currentMap.ghostSpawnPoints && currentMap.ghostSpawnPoints.length > 0) {
      const spawnIdx = Math.floor(Math.random() * currentMap.ghostSpawnPoints.length);
      const spawnPoint = currentMap.ghostSpawnPoints[spawnIdx];
      this.state.spikeX = spawnPoint.x;
      this.state.spikeZ = spawnPoint.z;
    } else {
      this.state.spikeX = 0;
      this.state.spikeZ = -15;
    }
    this.state.spikeState = "ground";
    this.state.spikeCarrierId = "";
  }

  private update(dt: number) {
    if (this.state.isGameOver) return;
    
    const now = performance.now() / 1000;

    const result = this.gameMode.update(dt, this.state, this.players);
    
    const roundState = this.gameMode.getRoundState();
    this.state.currentRound = roundState.roundNumber;
    this.state.roundTimeRemaining = Math.max(0, Math.floor(roundState.roundTimeRemaining));
    this.state.isRoundActive = roundState.isRoundActive;
    
    if (this.gameMode.isGameEnded()) {
      this.handleGameOver(this.gameMode.getWinner());
      return;
    }

    if (result.ended && result.winnerTeam) {
      this.handleTeamRoundEnd(result.winnerTeam as TeamId, result.reason || "");
    }

    const normalize = (v: { x: number; y: number; z: number }) => {
      const len = Math.hypot(v.x, v.y, v.z);
      if (len <= 1e-6) return { x: 0, y: 0, z: -1 };
      return { x: v.x / len, y: v.y / len, z: v.z / len };
    };

    const CENTER_TO_FOOT = CAPSULE.HalfHeight + CAPSULE.Radius;
    const EYE_HEIGHT = 1.6;
    const EYE_FROM_CENTER = EYE_HEIGHT - CENTER_TO_FOOT;

    for (const [sessionId, player] of this.players) {
      if (!player.schema.isDead && player.schema.spawnProtectionTime > 0) {
        player.schema.spawnProtectionTime = Math.max(0, player.schema.spawnProtectionTime - dt);
      }

      if (!player.schema.isDead && player.schema.spawnProtectionTime > 0) {
        const inSpawnZone = this.isInSpawnProtectionZone(player.schema.x, player.schema.y, player.schema.z);
        player.schema.isSpawnProtected = inSpawnZone;
      } else if (!player.schema.isDead) {
        player.schema.isSpawnProtected = false;
      }

      if (player.schema.isDead) {
        const canRespawn = this.gameMode.canRespawn(sessionId);
        const spawnPosition = this.pickSpawnPoint(sessionId);
        const respawnResult = HealthSystem.updateRespawn(player.schema, dt, spawnPosition, canRespawn);
        if (respawnResult.respawned) {
          player.ctrl.body.setTranslation(
            { x: player.schema.x, y: player.schema.y, z: player.schema.z },
            true
          );
          player.ctrl.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
          player.ctrl.body.setAngvel({ x: 0, y: 0, z: 0 }, true);

          const sdMode = this.getSDMode();
          if (sdMode) {
            sdMode.onPlayerRespawn(sessionId);
          }

          const healthMsg = HealthSystem.createHealthChangeMessage(sessionId, player.schema);
          this.broadcast("health_change", healthMsg);
        }
      }

      if (player.schema.reloading && now >= player.schema.reloadEndTime) {
        WeaponSystem.completeReload(player.schema, player.schema.equippedWeapon);
      }
    }

    for (const [, player] of this.players) {
      if (!player.schema.isDead) {
        player.ctrl.update(this.world, dt, now);
      }
    }

    this.world.step();

    for (const [sessionId, player] of this.players) {
      if (!player.schema.isDead) {
        const pos = player.ctrl.body.translation();
        player.schema.x = pos.x;
        player.schema.y = pos.y;
        player.schema.z = pos.z;

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
                      this.handlePlayerKill(hit.playerId, sessionId);
                    }
                  }
                }
              } else if (shotResult.hitPlayerId && shotResult.damage !== undefined) {
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
                    this.handlePlayerKill(shotResult.hitPlayerId, sessionId);
                  }
                }
              }

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

  private handlePlayerKill(victimId: string, killerId: string): void {
    const victim = this.players.get(victimId);
    const killer = this.players.get(killerId);
    
    if (victim) {
      victim.schema.deaths += 1;
      victim.schema.score = Math.max(0, victim.schema.score - 50);
      
      const sdMode = this.getSDMode();
      if (sdMode) {
        const result = sdMode.onPlayerDeath(victimId, killerId, this.state, this.players);
        victim.schema.livesRemaining = result.livesRemaining;
        
        if (result.roundEnd?.ended && result.roundEnd.winnerTeam) {
          this.handleTeamRoundEnd(result.roundEnd.winnerTeam as TeamId, result.roundEnd.reason || "");
        }
      } else {
        const result = this.gameMode.onPlayerDeath(victimId, killerId, this.state, this.players);
        victim.schema.livesRemaining = result.livesRemaining;
      }
    }
    
    if (killer && killerId !== victimId) {
      killer.schema.kills += 1;
      killer.schema.score += 100;
      
      if (this.gameMode.checkScoreWin(killerId, killer.schema.kills)) {
        this.handleGameOver(killerId);
      }
    }
    
    this.broadcast("player_killed", {
      victimId,
      killerId: killerId !== victimId ? killerId : null,
      victimLivesRemaining: victim?.schema.livesRemaining ?? 0,
    });
    
    const sdMode = this.getSDMode();
    if (sdMode && this.state.isRoundActive) {
      this.checkEliminationRoundEnd();
    }
  }
  
  private checkEliminationRoundEnd(): void {
    if (!this.state.isRoundActive) return;
    
    const sdMode = this.getSDMode();
    if (!sdMode) return;
    
    const teamManager = sdMode.getTeamManager();
    
    const getPlayerLives = (sessionId: string): number => {
      const player = this.players.get(sessionId);
      return player ? player.schema.livesRemaining : 0;
    };
    
    const spikePlanted = this.state.spikeState === "uploaded" || 
                         this.state.spikeState === "decrypting";
    
    const ghostsEliminated = teamManager.isTeamEliminated("ghosts", getPlayerLives);
    const sentinelsEliminated = teamManager.isTeamEliminated("sentinels", getPlayerLives);
    
    if (sentinelsEliminated) {
      this.handleTeamRoundEnd("ghosts", "elimination");
      return;
    }
    
    if (ghostsEliminated && !spikePlanted) {
      this.handleTeamRoundEnd("sentinels", "elimination");
      return;
    }
  }
  
  private checkFFAElimination(): void {
    if (!this.state.isRoundActive) return;
    
    const alivePlayers: string[] = [];
    for (const [sessionId, player] of this.players) {
      if (!player.schema.isDead && player.schema.livesRemaining > 0) {
        alivePlayers.push(sessionId);
      }
    }
    
    if (alivePlayers.length <= 1) {
      this.handleRoundEnd(alivePlayers[0] || null, "elimination");
    }
  }

  private handleGameOver(winnerId: string | null, winnerTeam?: TeamId): void {
    this.state.isGameOver = true;
    this.state.winnerId = winnerId || "";
    this.state.lobbyState = "ended";
    
    const winner = winnerId ? this.players.get(winnerId) : null;
    const winnerName = winner?.schema.displayName || (winnerTeam ? winnerTeam.toUpperCase() : "Unknown");
    
    if (winnerTeam) {
      this.state.gameWinnerTeam = winnerTeam;
    }
    
    this.broadcast("game_over", {
      winnerId,
      winnerName,
      winnerTeam: winnerTeam || "",
      gameMode: this.state.gameMode,
      ghostsRoundsWon: this.state.ghostsRoundsWon,
      sentinelsRoundsWon: this.state.sentinelsRoundsWon,
    });
    
    this.broadcastLobbyState();
  }

  private handleTeamRoundEnd(winnerTeam: TeamId, reason: string): void {
    if (!this.state.isRoundActive) return;
    
    const sdMode = this.getSDMode();
    if (!sdMode) return;
    
    this.state.isRoundActive = false;
    this.state.roundWinnerTeam = winnerTeam;
    sdMode.stopRound();
    
    const teamManager = sdMode.getTeamManager();
    const roundsWon = teamManager.awardRoundWin(winnerTeam);
    
    if (winnerTeam === "ghosts") {
      this.state.ghostsRoundsWon = roundsWon;
    } else {
      this.state.sentinelsRoundsWon = roundsWon;
    }
    
    this.broadcast("round_end", {
      roundNumber: this.state.currentRound,
      winnerId: null,
      winnerName: winnerTeam === "ghosts" ? "GHOSTS" : "SENTINELS",
      winnerTeam,
      reason,
    });
    
    if (roundsWon >= this.state.roundsToWin) {
      this.handleGameOver(null, winnerTeam);
      return;
    }
    
    this.clock.setTimeout(() => this.startNewRound(), 5000);
  }

  private handleRoundEnd(winnerId: string | null, reason: string): void {
    this.state.isRoundActive = false;
    this.state.roundWinnerId = winnerId || "";
    
    const winner = winnerId ? this.players.get(winnerId) : null;
    if (winner) {
      winner.schema.roundsWon++;
    }
    
    const winnerName = winner?.schema.displayName || "Unknown";
    
    this.broadcast("round_end", {
      roundNumber: this.state.currentRound,
      winnerId,
      winnerName,
      reason,
    });
    
    if (winner && winner.schema.roundsWon >= this.state.roundsToWin) {
      this.handleGameOver(winnerId);
      return;
    }
    
    // Start next round after delay
    this.clock.setTimeout(() => this.startNewRound(), 5000);
  }

  private startNewRound(): void {
    this.state.currentRound++;
    this.state.isRoundActive = true;
    this.state.roundWinnerId = "";
    this.state.roundWinnerTeam = "";
    
    const sdMode = this.getSDMode();
    if (sdMode) {
      sdMode.resetForNewRound(this.state);
    } else {
      this.gameMode.startRound();
    }
    
    for (const [sessionId, player] of this.players) {
      const spawn = this.pickSpawnPoint(sessionId);
      player.schema.isDead = false;
      player.schema.health = player.schema.maxHealth;
      player.schema.x = spawn.x;
      player.schema.y = spawn.y;
      player.schema.z = spawn.z;
      player.schema.rotationY = calculateSpawnFacing(spawn.x, spawn.z);
      player.schema.livesRemaining = this.gameMode.getConfig().maxLives || 1;
      player.schema.hasSpike = false;
      player.schema.isUploading = false;
      player.schema.isDecrypting = false;
      
      player.ctrl.body.setTranslation({ x: spawn.x, y: spawn.y, z: spawn.z }, true);
      
      this.gameMode.addPlayer(sessionId);
    }
    
    if (this.isSearchDestroyMode()) {
      this.spawnSpikeOnGround();
    }
    
    this.broadcast("round_start", {
      roundNumber: this.state.currentRound,
      spikeX: this.state.spikeX,
      spikeZ: this.state.spikeZ,
    });
  }

  private pickSpawnPoint(sessionId?: string): { x: number; y: number; z: number } {
    const currentMap = getCurrentMap();
    
    let spawnPoints = currentMap.spawnPoints;
    const sdMode = this.getSDMode();
    if (sdMode && sessionId) {
      const teamId = sdMode.getTeamManager().getPlayerTeam(sessionId);
      if (teamId === "ghosts" && currentMap.ghostSpawnPoints) {
        spawnPoints = currentMap.ghostSpawnPoints;
      } else if (teamId === "sentinels" && currentMap.sentinelSpawnPoints) {
        spawnPoints = currentMap.sentinelSpawnPoints;
      }
    }
    
    const alivePositions: Array<{ x: number; y: number; z: number }> = [];
    for (const [, player] of this.players) {
      if (!player.schema.isDead) {
        alivePositions.push({ x: player.schema.x, y: player.schema.y, z: player.schema.z });
      }
    }

    if (alivePositions.length === 0) {
      const idx = Math.floor(Math.random() * spawnPoints.length);
      return spawnPoints[idx];
    }

    let bestPoint = spawnPoints[0];
    let bestScore = -Infinity;

    for (const point of spawnPoints) {
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
      const sorted = [...spawnPoints].sort((a, b) => {
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
      const idx = Math.floor(Math.random() * spawnPoints.length);
      return spawnPoints[idx];
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

    this.world.removeCollider(runtime.collider, false);
    this.breakablesByHandle.delete(colliderHandle);
    this.breakablesById.delete(runtime.id);

    this.broadcast("breakable_destroyed", { id: runtime.id });
  }
}
