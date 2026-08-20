import { GameRenderer, DEFAULT_BLOOM_CONFIG } from "./GameRenderer.js";
import { InputManager } from "../input/InputManager.js";
import { NetworkManager } from "../network/NetworkManager.js";
import { LocalPlayer } from "../player/LocalPlayer.js";
import { RemotePlayers } from "../player/RemotePlayers.js";
import { HUD } from "../ui/HUD.js";
import { createLevelFromMap, type LevelInstance } from "../world/LevelFactory.js";
import { ARENA_FORGE_PREVIEW_MAP_ID } from "@shared/world/arena-forge-preview.js";
import { WeaponSystem } from "../weapons/weapon-system.js";
import { Scoreboard } from "../ui/Scoreboard.js";
import { Minimap } from "../ui/Minimap.js";
import { ActionPrompt } from "../ui/ActionPrompt.js";
import { Skybox } from "../world/Skybox.js";
import { WEAPON_RENDER_LAYER } from "../world/lighting/CyberpunkLighting.js";
import { getGameplayMap, getMapVisuals, isShootHouseNeonMap } from "../world/maps/map-registry.js";
import type { GameplayMapDefinition } from "@shared/world/map-types.js";
import { SHOOT_HOUSE_NEON_LIGHTING_CONFIG } from "../world/lighting/ShootHouseNeonLighting.js";
import { TeamLobbyScreen } from "../ui/screens/TeamLobbyScreen.js";
import { PauseMenu } from "../ui/PauseMenu.js";
import { SettingsManager } from "../settings/SettingsManager.js";
import { AudioManager, setAudioManager } from "../audio/AudioManager.js";
import { HitMarker } from "../ui/HitMarker.js";
import { DamageIndicator } from "../ui/DamageIndicator.js";
import { KillFeed } from "../ui/KillFeed.js";
import { DeathCam } from "../ui/DeathCam.js";
import { Netgraph } from "../ui/Netgraph.js";
import { GameplayDebug } from "../debug/GameplayDebug.js";
import { MatchOverlays } from "../ui/MatchOverlays.js";
import { SearchDestroyView } from "../world/SearchDestroyView.js";
import type { UserProfile } from "../api/client.js";
import type { PlayAction } from "../ui/screens/LobbyScreen.js";
import type { InputMsg } from "@shared/movement/types.js";
import { consumeFixedTicks } from "@shared/net/fixed-tick.js";
import type { InputState } from "../input/InputManager.js";
import type { SyncedPlayer } from "../network/synced-state.js";

const FOV_LERP_SPEED = 8;

async function fetchArenaForgePreviewMap(catalogId?: string): Promise<GameplayMapDefinition> {
  const query = catalogId ? `?id=${encodeURIComponent(catalogId)}` : "";
  const res = await fetch(`/api/arena-forge/preview-map${query}`);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || `ArenaForge preview map failed: ${res.status}`);
  }
  return res.json() as Promise<GameplayMapDefinition>;
}

export class Game {
  private renderer: GameRenderer;
  private input: InputManager;
  private network: NetworkManager;
  private localPlayer: LocalPlayer;
  private remotePlayers: RemotePlayers;
  private hud: HUD;
  private scoreboard: Scoreboard;
  private minimap: Minimap;
  private actionPrompt: ActionPrompt;
  private teamLobbyScreen: TeamLobbyScreen;
  private weaponSystem: WeaponSystem;
  private level: LevelInstance | null = null;
  private skybox: Skybox;
  private currentMap: GameplayMapDefinition | null = null;
  private hostId: string = "";
  private onReturnToMenu: (() => void) | null = null;
  private pauseMenu: PauseMenu;
  private pointerLockChangeHandler: () => void;
  private audioManager: AudioManager;
  private hitMarker: HitMarker;
  private damageIndicator: DamageIndicator;
  private killFeed: KillFeed;
  private deathCam: DeathCam;
  private netgraph: Netgraph;
  private debug: GameplayDebug;
  private matchOverlays = new MatchOverlays();
  private sndView: SearchDestroyView;

  private lastTime = performance.now();
  private running = false;
  private rafId: number | undefined;
  private inputAccumulator = 0;

  private inputSeq = 0;
  private hasInitialPosition = false;
  private needsRespawnSnap = false;
  private currentFov = 75;
  private userProfile: UserProfile | null = null;
  private activeSlot = 0;

  constructor() {
    this.renderer = new GameRenderer(DEFAULT_BLOOM_CONFIG, SHOOT_HOUSE_NEON_LIGHTING_CONFIG);
    this.input = new InputManager(this.renderer.canvas, this.renderer.camera);
    this.network = new NetworkManager();
    this.localPlayer = new LocalPlayer(this.renderer.camera);
    this.remotePlayers = new RemotePlayers(this.renderer.scene);
    this.hud = new HUD();
    this.scoreboard = new Scoreboard();
    this.minimap = new Minimap({ mapSize: 56, displaySize: 150 });
    this.actionPrompt = new ActionPrompt();
    this.teamLobbyScreen = new TeamLobbyScreen();
    this.pauseMenu = new PauseMenu();
    this.debug = new GameplayDebug(this.renderer.scene);
    this.sndView = new SearchDestroyView(this.renderer.scene, this.minimap, this.actionPrompt);

    this.audioManager = new AudioManager(this.renderer.camera);
    setAudioManager(this.audioManager);
    this.audioManager.init();

    this.hitMarker = new HitMarker();
    this.damageIndicator = new DamageIndicator();
    this.killFeed = new KillFeed();
    this.deathCam = new DeathCam();
    this.netgraph = new Netgraph(this.network);

    this.pauseMenu.setOnResume(() => {
      this.renderer.canvas.requestPointerLock();
    });

    this.pauseMenu.setOnLeaveGame(() => {
      this.stop();
      if (this.onReturnToMenu) {
        this.onReturnToMenu();
      }
    });

    this.pointerLockChangeHandler = () => {
      const isLocked = document.pointerLockElement === this.renderer.canvas;

      if (!isLocked && this.running) {
        const state = this.network.state;
        if (state?.lobbyState === "waiting") return;

        if (!this.pauseMenu.isVisible() && !this.pauseMenu.isSettingsOpen()) {
          this.pauseMenu.show();
        }
      }
    };
    document.addEventListener("pointerlockchange", this.pointerLockChangeHandler);

    SettingsManager.getInstance().addChangeListener(() => {
      this.renderer.applySettingsFromManager();
    });

    this.weaponSystem = new WeaponSystem(this.renderer.camera, {
      onFireInput: (firing, aimDir) => {
        if (this.network.connected) {
          this.network.sendFireInput(firing, aimDir);
        }
      },
      onWeaponSwitch: (weaponId) => {
        this.network.sendWeaponSwitch(weaponId);
      },
      onReload: (weaponId) => {
        this.network.sendReload(weaponId);
        this.audioManager.playReload();
      },
      onShotRequested: (shot) => {
        this.audioManager.playGunshot(shot.weaponId, true);
      },
      onRecoil: (pitch, yaw, returnSpeed) => {
        this.input.applyRecoil(pitch, yaw, returnSpeed);
      }
    });
    this.renderer.camera.layers.enable(WEAPON_RENDER_LAYER);

    this.skybox = new Skybox(this.renderer.scene);

    this.setupCallbacks();
  }

  private setupCallbacks(): void {
    this.input.onWeaponSwitch = (slot: string) => {
      const primary = this.userProfile?.primaryWeaponId || "AR_1";
      const secondary = this.userProfile?.secondaryWeaponId || "PISTOL_1";

      let weaponId: string;
      if (slot === "primary") {
        this.activeSlot = 0;
        weaponId = primary;
      } else if (slot === "secondary") {
        this.activeSlot = 1;
        weaponId = secondary;
      } else if (slot === "toggle") {
        this.activeSlot = this.activeSlot === 0 ? 1 : 0;
        weaponId = this.activeSlot === 0 ? primary : secondary;
      } else {
        return;
      }

      this.weaponSystem.switchWeapon(weaponId);
      this.hud.setWeapon(weaponId);
      this.network.sendWeaponSwitch(weaponId);
    };

    this.input.onReload = () => {
      this.weaponSystem.startReload(performance.now() / 1000);
    };

    this.input.onToggleDebug = () => {
      this.toggleDebugOverlay();
    };

    this.debug.exposeCommands({
      overlay: () => {
        this.toggleDebugOverlay();
      },
      godMode: () => {
        if (this.network.connected) {
          this.network.sendToggleGodMode();
          console.log("[Debug] God mode toggled (check server console for status)");
        } else {
          console.log("[Debug] Not connected to server");
        }
      },
      unlimitedAmmo: () => {
        if (this.network.connected) {
          this.network.sendToggleUnlimitedAmmo();
          console.log("[Debug] Unlimited ammo toggled (check server console for status)");
        } else {
          console.log("[Debug] Not connected to server");
        }
      },
      autoRun: () => {
        this.input.toggleAutoRun();
      },
    });

    this.input.onSpikeInteract = () => {
      const state = this.network.state;
      if (!state || state.gameMode !== "search_destroy") return;
      if (state.lobbyState !== "playing") return;

      const myId = this.network.sessionId;
      const myPlayer = state.players?.get(myId);
      if (!myPlayer || myPlayer.isDead) return;

      const myTeam = myPlayer.teamId;

      if ((state.spikeState === "ground" || state.spikeState === "dropped") && myTeam === "ghosts") {
        this.network.sendSpikeAction("pickup");
      } else if (myPlayer.hasSpike && state.spikeState === "carried" && myTeam === "ghosts") {
        this.network.sendSpikeAction("upload");
      } else if (state.spikeState === "uploaded" && myTeam === "sentinels") {
        this.network.sendSpikeAction("decrypt");
      }
    };

    this.input.onSpikeCancel = () => {
      const state = this.network.state;
      if (!state || state.gameMode !== "search_destroy") return;
      this.network.sendSpikeAction("cancel");
    };

    this.network.onConnected = (sessionId: string) => {
      this.remotePlayers.setLocalPlayerId(sessionId);
      this.remotePlayers.setDebugEnabled(this.debug.isEnabled);
      this.debug.hideStatus();
    };

    this.network.onRoomInfo = (info) => {
      this.hud.setRoomInfo(info.joinCode, info.playerCount, info.maxPlayers);
      this.teamLobbyScreen.setJoinCode(info.joinCode);
      this.hostId = info.hostId;

      if (info.gameMode === "search_destroy" && this.currentMap) {
        this.sndView.initIfNeeded(this.currentMap);
      }
    };

    this.network.onHostChanged = (msg) => {
      this.hostId = msg.newHostId;
    };

    this.network.onError = (err) => {
      const msg = err instanceof Error ? err.message : String(err);
      this.debug.setStatus(`Connection failed:\n${msg}`);
    };

    this.network.onHealthChange = (msg) => {
      if (msg.playerId === this.network.sessionId) {
        const wasDead = this.localPlayer.isDead;

        this.localPlayer.updateHealth(
          msg.newHealth,
          msg.maxHealth,
          msg.isDead,
          msg.respawnTime || 0
        );

        if (msg.attackerId && msg.damage && msg.damage > 0) {
          const attacker = this.network.state?.players?.get(msg.attackerId);
          if (attacker) {
            this.damageIndicator.showDamage(
              attacker.x,
              attacker.z,
              this.localPlayer.getCapsuleCenter().x,
              this.localPlayer.getCapsuleCenter().z
            );
          }
        }

        if (msg.isDead && !wasDead) {
          this.localPlayer.clearPendingInputs();
        }

        if (msg.isDead && !wasDead && msg.attackerId) {
          const killer = this.network.state?.players?.get(msg.attackerId);
          if (killer) {
            this.deathCam.show(
              killer.displayName || "Unknown",
              killer.equippedWeapon || "Unknown Weapon",
              msg.isHeadshot || false
            );
          }
        }

        if (!msg.isDead && wasDead) {
          this.deathCam.hide();
          this.needsRespawnSnap = true;
        }
      } else if (msg.attackerId === this.network.sessionId && msg.damage && msg.damage > 0) {
        this.hitMarker.show(msg.isHeadshot || false, msg.isDead);
      }

      if (msg.isDead && msg.attackerId) {
        const players = this.network.state?.players;
        const killer = players?.get(msg.attackerId);
        const victim = players?.get(msg.playerId);

        if (killer && victim) {
          this.killFeed.addKill(
            killer.displayName || "Unknown",
            victim.displayName || "Unknown",
            killer.equippedWeapon || "AR_1",
            msg.isHeadshot || false,
            msg.attackerId === this.network.sessionId,
            msg.playerId === this.network.sessionId
          );
        }
      }
    };

    this.network.onShotFired = (msg) => {
      this.debug.showShot(
        msg.origin,
        msg.direction,
        msg.shooterId === this.network.sessionId ? "local" : "remote",
      );
      if (msg.shooterId !== this.network.sessionId) {
        this.audioManager.playGunshot(msg.weaponId, false, msg.origin);
      }
    };

    this.network.onBreakableDestroyed = (msg) => {
      this.level?.destroyBreakable(msg.id);
    };

    this.network.onLobbyState = (msg) => {
      if (msg.lobbyState === "waiting") {
        this.matchOverlays.removeGameOver();
        this.teamLobbyScreen.setLocalSessionId(this.network.sessionId);
        this.teamLobbyScreen.updateLobbyState(msg);
        this.teamLobbyScreen.show();
        this.hud.hide();
        this.minimap.hide();

        const state = this.network.state;
        if (state?.players) {
          state.players.forEach((player, sessionId) => {
            this.teamLobbyScreen.setPlayerName(sessionId, player.displayName || sessionId.substring(0, 8));
          });
        }
      } else if (msg.lobbyState === "playing") {
        this.teamLobbyScreen.hide();
        this.hud.show();
        this.minimap.show();
      } else if (msg.lobbyState === "ended") {
        this.teamLobbyScreen.hide();
      }
    };

    this.network.onGameStarted = (_msg) => {
      this.teamLobbyScreen.hide();
      this.hud.show();
      this.minimap.show();
    };

    this.network.onGameOver = (msg) => {
      this.matchOverlays.showGameOver(
        msg,
        this.network.sessionId,
        this.hostId,
        () => this.network.sendRestartGame(),
        () => this.network.sendDisbandLobby(),
      );
    };

    this.network.onGameRestarted = () => {
      this.matchOverlays.removeGameOver();
    };

    this.network.onRoundEnd = (msg) => {
      this.matchOverlays.showRoundEnd(msg);
    };

    this.network.onLobbyDisbanded = () => {
      this.matchOverlays.removeGameOver();
      this.stop();
      if (this.onReturnToMenu) {
        this.onReturnToMenu();
      }
    };

    this.teamLobbyScreen.setCallbacks({
      onTeamSelect: (teamId) => {
        this.network.sendTeamSelect(teamId);
      },
      onStartGame: () => {
        this.network.sendStartGame();
      },
      onLeaveLobby: () => {
        this.stop();
        if (this.onReturnToMenu) {
          this.onReturnToMenu();
        }
      },
    });
  }

  public setOnReturnToMenu(callback: () => void): void {
    this.onReturnToMenu = callback;
  }

  public setUserProfile(profile: UserProfile): void {
    this.userProfile = profile;
  }

  private toggleDebugOverlay(): void {
    const enabled = this.debug.toggle();
    this.remotePlayers.setDebugEnabled(enabled);
    this.netgraph.setVisible(enabled);
  }

  public async start(action?: PlayAction): Promise<void> {
    if (this.running) return;
    this.running = true;

    this.renderer.applySettingsFromManager();

    const primaryWeapon = this.userProfile?.primaryWeaponId || "AR_1";
    this.activeSlot = 0;

    this.debug.setStatus("Loading weapons...");
    this.weaponSystem.switchWeapon(primaryWeapon);
    this.hud.setWeapon(primaryWeapon);
    this.hud.update();

    this.debug.setStatus("Connecting...");

    const displayName = this.userProfile?.displayName || "Player";
    const primaryWeaponId = this.userProfile?.primaryWeaponId || "AR_1";
    const secondaryWeaponId = this.userProfile?.secondaryWeaponId || "PISTOL_1";
    const gameMode = action?.gameMode || "deathmatch";

    await this.network.connect({
      roomId: action?.roomId,
      forceCreate: action?.type === "create" || Boolean(action?.forgeMapId),
      displayName,
      primaryWeaponId,
      secondaryWeaponId,
      gameMode,
      mapId: action?.mapId,
      forgeMapId: action?.forgeMapId,
    });

    await this.applyAuthoritativeMap();

    this.updateCameraRotation();
    this.animate();
  }

  private async applyAuthoritativeMap(): Promise<void> {
    const mapId = this.network.state?.mapId;
    if (!mapId) {
      const msg = "Room state has no mapId. Cannot build prediction or level.";
      this.debug.setStatus(msg);
      throw new Error(msg);
    }

    const map = mapId.startsWith(ARENA_FORGE_PREVIEW_MAP_ID)
      ? await fetchArenaForgePreviewMap(
          mapId === ARENA_FORGE_PREVIEW_MAP_ID
            ? undefined
            : mapId.slice(`${ARENA_FORGE_PREVIEW_MAP_ID}::`.length),
        )
      : getGameplayMap(mapId);
    const visuals = mapId.startsWith(ARENA_FORGE_PREVIEW_MAP_ID)
      ? { displayName: map.name }
      : getMapVisuals(map.id);
    this.currentMap = map;

    this.localPlayer.configureMap(map);
    this.minimap.setMap(map);
    if (map.uploadTerminals) {
      this.minimap.setTerminals(
        map.uploadTerminals.map((t) => ({
          id: t.id,
          x: t.x,
          z: t.z,
          state: "inactive" as const,
        })),
      );
    }

    this.level?.dispose();
    this.level = createLevelFromMap(this.renderer.scene, map);
    console.log(`[Game] Authoritative map: ${visuals.displayName} (${map.id})`);

    if (isShootHouseNeonMap(map.id) && visuals.skyboxPath) {
      this.skybox.loadFromFolder(visuals.skyboxPath).catch(() => undefined);
    }

    if (this.network.state?.gameMode === "search_destroy") {
      this.sndView.initIfNeeded(map);
    }
  }

  private buildInputMsg(seq: number, state: InputState): InputMsg {
    return {
      seq,
      moveX: state.moveX,
      moveZ: state.moveZ,
      lookYaw: state.yaw,
      lookPitch: state.pitch,
      sprint: state.sprint && !state.aiming,
      aiming: state.aiming,
      crouchPressed: state.crouchPressed,
      crouchReleased: state.crouchReleased,
      crouchHeld: state.crouchHeld,
      jumpPressed: state.jumpPressed,
    };
  }

  private getServerPlayer(): SyncedPlayer | undefined {
    const players = this.network.state?.players;
    const myId = this.network.sessionId;
    if (!players || !myId) return undefined;
    return players.get(myId);
  }

  private syncLocalLifeState(): void {
    const serverPlayer = this.getServerPlayer();
    if (!serverPlayer) return;

    if (this.needsRespawnSnap || (this.localPlayer.isDead && !serverPlayer.isDead)) {
      this.localPlayer.hardResetTo(serverPlayer.x, serverPlayer.y, serverPlayer.z);
      this.input.setInitialRotation(serverPlayer.rotationY, serverPlayer.pitch || 0);
      this.localPlayer.isDead = false;
      this.localPlayer.health = serverPlayer.health;
      this.localPlayer.maxHealth = serverPlayer.maxHealth;
      this.needsRespawnSnap = false;
      this.deathCam.hide();
      return;
    }

    if (!this.localPlayer.isDead && serverPlayer.isDead) {
      this.localPlayer.clearPendingInputs();
    }
    this.localPlayer.isDead = !!serverPlayer.isDead;
  }

  private stepSimulationTicks(dt: number): void {
    const stepped = consumeFixedTicks(this.inputAccumulator, dt);
    this.inputAccumulator = stepped.accumulator;
    const connected = this.network.connected;

    const inTeamLobby = this.network.state?.lobbyState === "waiting";
    for (let i = 0; i < stepped.ticks; i++) {
      const state = this.input.consumeTickState();
      if (inTeamLobby) continue;
      const msg = this.buildInputMsg(++this.inputSeq, state);
      this.localPlayer.applyFixedTick(msg, connected);
      if (connected) {
        this.network.sendInput(msg);
      }
    }
  }

  private updateCameraRotation(): void {
    this.renderer.camera.rotation.order = "YXZ";
    this.renderer.camera.rotation.y = this.input.yaw;
    this.renderer.camera.rotation.x = this.input.pitch;
  }

  private animate = (): void => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.animate);

    const now = performance.now();
    const dt = Math.min(100, Math.max(0, now - this.lastTime)) / 1000;
    this.lastTime = now;

    this.debug.tick(dt);

    this.input.setAdsState(this.weaponSystem.getAdsAlpha(), this.weaponSystem.isScopeActive());
    this.input.updateRecoil(dt);
    this.input.updateAutoRun(dt);
    this.updateCameraRotation();
    this.syncLocalLifeState();
    this.stepSimulationTicks(dt);
    const inputState = this.input.peekState();

    this.damageIndicator.setPlayerYaw(inputState.yaw);

    const isMoving = Math.abs(inputState.moveX) > 0.1 || Math.abs(inputState.moveZ) > 0.1;
    const isGrounded = this.localPlayer.getCapsuleCenter().y < 1.4;
    const isSprintingNow = inputState.sprint && !inputState.aiming;
    const isCrouching = inputState.crouchHeld;
    if (!this.localPlayer.isDead) {
      this.audioManager.updateFootsteps(dt, isMoving, isGrounded, isSprintingNow, isCrouching);
    }

    const canFire = !this.localPlayer.isReloading && !this.localPlayer.isDead;
    const firingNow = inputState.firing && canFire;
    this.weaponSystem.setFiring(firingNow);
    this.weaponSystem.setAiming(inputState.aiming);

    this.weaponSystem.update(dt, now / 1000, inputState.aimDir);
    this.weaponSystem.setVisible(!this.localPlayer.isDead);

    const state = this.network.state;
    const players = state?.players;
    const myId = this.network.sessionId;

    if (players) {
      let count = 0;
      players.forEach(() => count++);
      this.hud.updatePlayerCount(count);
    }

    if (state) {
      const myPlayer = players?.get(myId);
      this.hud.setGameModeState({
        gameMode: state.gameMode || "deathmatch",
        scoreLimit: state.scoreLimit || 30,
        timeRemaining: state.timeRemaining || 0,
        isGameOver: state.isGameOver || false,
        winnerId: state.winnerId || "",
        currentRound: state.currentRound || 1,
        roundsToWin: state.roundsToWin || 3,
        roundTimeRemaining: state.roundTimeRemaining || 0,
        isRoundActive: state.isRoundActive ?? true,
        livesRemaining: myPlayer?.livesRemaining ?? 1,
        lobbyState: state.lobbyState || "playing",
        ghostsRoundsWon: state.ghostsRoundsWon || 0,
        sentinelsRoundsWon: state.sentinelsRoundsWon || 0,
        myTeam: myPlayer?.teamId || "",
        spikeCarrierId: state.spikeCarrierId || "",
        spikeState: state.spikeState || "ground",
        spikeTerminalId: state.spikeTerminalId || "",
        spikeUploadProgress: state.spikeUploadProgress || 0,
        spikeDecryptProgress: state.spikeDecryptProgress || 0,
        spikeDetonationTimer: state.spikeDetonationTimer || 0,
        hasSpike: myPlayer?.hasSpike ?? false,
        isUploading: myPlayer?.isUploading ?? false,
        isDecrypting: myPlayer?.isDecrypting ?? false,
      });

      this.sndView.updateMinimap(state, players, myId);
      this.sndView.updateActionPrompt(state, myPlayer);
    }

    this.remotePlayers.update(dt, players);
    this.sndView.updateWorld(dt, state);

    let serverPlayer: SyncedPlayer | undefined;
    if (players && typeof players.forEach === "function") {
      players.forEach((p, id) => {
        if (id === myId) {
          serverPlayer = p;
          this.localPlayer.isReloading = p.reloading || false;
        }
      });
    }

    if (serverPlayer) {
      if (!this.hasInitialPosition) {
        this.localPlayer.setInitialPosition(serverPlayer.x, serverPlayer.y, serverPlayer.z);
        this.input.setInitialRotation(serverPlayer.rotationY, serverPlayer.pitch || 0);
        this.hasInitialPosition = true;
      }

      const ackSeq = serverPlayer.lastProcessedInputSeq || 0;
      this.localPlayer.reconcileWithServer(serverPlayer.x, serverPlayer.y, serverPlayer.z, ackSeq, dt);

      this.netgraph.updateStats({
        correctionMag: this.localPlayer.getCorrectionMag(),
        inputSeqLocal: this.inputSeq,
        lastAckedSeq: this.localPlayer.lastAckedSeq,
        pendingInputCount: this.localPlayer.getPendingInputCount(),
        predMove: this.localPlayer.getMovementState(),
        serverMove: serverPlayer.movementState,
      });

      this.localPlayer.health = serverPlayer.health;
      this.localPlayer.maxHealth = serverPlayer.maxHealth;
      this.localPlayer.isDead = serverPlayer.isDead;
      this.localPlayer.respawnTime = serverPlayer.respawnTime || 0;

      const pred = this.localPlayer.getCapsuleCenter();
      this.debug.updateCapsules(
        pred,
        { x: serverPlayer.x, y: serverPlayer.y, z: serverPlayer.z },
        !this.localPlayer.isDead,
      );

      this.hud.update(
        serverPlayer.ammoInMag,
        serverPlayer.ammoReserve,
        this.localPlayer.health,
        this.localPlayer.maxHealth,
        this.localPlayer.isDead,
        this.localPlayer.respawnTime,
        serverPlayer.reloading
      );
    }

    this.localPlayer.updateSmoothing(dt);
    this.netgraph.update(dt);

    const showScoreboard = this.input.isKeyDown("Tab");
    this.scoreboard.setVisible(showScoreboard);
    if (showScoreboard && players) {
      this.scoreboard.update(players, myId);
    }

    this.localPlayer.applyToCamera();

    const isSprinting = inputState.sprint &&
      (Math.abs(inputState.moveX) > 0.1 || Math.abs(inputState.moveZ) > 0.1) &&
      !this.localPlayer.isDead;
    const settingsFov = SettingsManager.getInstance().getGraphics().fov;
    const sprintFov = settingsFov + 10;
    const baseFov = isSprinting ? sprintFov : settingsFov;
    const targetFov = this.weaponSystem.getTargetFov(baseFov);
    this.currentFov += (targetFov - this.currentFov) * Math.min(1, dt * FOV_LERP_SPEED);
    this.renderer.camera.fov = this.currentFov;
    this.renderer.camera.updateProjectionMatrix();

    if (this.level?.update) {
      this.level.update();
    }

    this.debug.updateAimRay(this.renderer.camera, this.input.isPointerLocked());
    this.renderer.render();
  };

  public stop(): void {
    if (!this.running) return;
    this.running = false;

    if (this.rafId !== undefined) {
      cancelAnimationFrame(this.rafId);
      this.rafId = undefined;
    }

    this.debug.dispose();
    this.sndView.dispose();

    document.removeEventListener("pointerlockchange", this.pointerLockChangeHandler);
    this.pauseMenu.destroy();
    this.minimap.dispose();
    this.actionPrompt.dispose();
    this.weaponSystem.dispose();
    this.input.dispose();
    this.audioManager.dispose();
    this.hitMarker.dispose();
    this.damageIndicator.dispose();
    this.killFeed.dispose();
    this.deathCam.dispose();
    this.netgraph.destroy();
    this.hud.destroy();
    this.scoreboard.destroy();
    this.teamLobbyScreen.destroy();
    this.level?.dispose();
    this.renderer.dispose();
  }
}
