import * as THREE from "three";
import { GameRenderer, DEFAULT_BLOOM_CONFIG } from "./GameRenderer.js";
import { InputManager } from "../input/InputManager.js";
import { NetworkManager } from "../network/NetworkManager.js";
import { LocalPlayer } from "../player/LocalPlayer.js";
import { RemotePlayers } from "../player/RemotePlayers.js";
import { HUD } from "../ui/HUD.js";
import { createLevel, type LevelInstance } from "../world/LevelFactory.js";
import { WeaponSystem } from "../weapons/weapon-system.js";
import { Scoreboard } from "../ui/Scoreboard.js";
import { Minimap, type PlayerMarker, type TerminalInfo } from "../ui/Minimap.js";
import { ActionPrompt } from "../ui/ActionPrompt.js";
import { Skybox } from "../world/Skybox.js";
import { SHOOT_HOUSE_NEON } from "../world/maps/shoot-house-neon.js";
import { WEAPON_RENDER_LAYER } from "../world/lighting/CyberpunkLighting.js";
import { getDefaultMapId, getMapEntry, isShootHouseNeonMap } from "../world/maps/map-registry.js";
import { SHOOT_HOUSE_NEON_LIGHTING_CONFIG } from "../world/lighting/ShootHouseNeonLighting.js";
import { TeamLobbyScreen } from "../ui/screens/TeamLobbyScreen.js";
import { SpikeObject, type SpikeState } from "../world/SpikeObject.js";
import { PlantSiteMarker, type PlantSiteState } from "../world/PlantSiteMarker.js";
import { PauseMenu } from "../ui/PauseMenu.js";
import { SettingsManager } from "../settings/SettingsManager.js";
import { AudioManager, setAudioManager } from "../audio/AudioManager.js";
import { HitMarker } from "../ui/HitMarker.js";
import { DamageIndicator } from "../ui/DamageIndicator.js";
import { KillFeed } from "../ui/KillFeed.js";
import { DeathCam } from "../ui/DeathCam.js";
import type { UserProfile } from "../api/client.js";
import type { PlayAction } from "../ui/screens/LobbyScreen.js";
import type { GameOverMessage } from "../network/NetworkManager.js";

const INPUT_SEND_RATE = 60;
const DEBUG_RAY_LENGTH = 75;
const CAPSULE_RADIUS = 0.35;
const CAPSULE_HALF = 0.9;
const FOV_LERP_SPEED = 8;

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
  private level: LevelInstance;
  private skybox: Skybox;
  private currentMapId = getDefaultMapId();
  private hostId: string = "";
  private onReturnToMenu: (() => void) | null = null;
  private spikeObject: SpikeObject | null = null;
  private plantSiteMarkers: PlantSiteMarker[] = [];
  private pauseMenu: PauseMenu;
  private pointerLockChangeHandler: () => void;
  private audioManager: AudioManager;
  private hitMarker: HitMarker;
  private damageIndicator: DamageIndicator;
  private killFeed: KillFeed;
  private deathCam: DeathCam;

  private lastTime = performance.now();
  private running = false;
  private rafId: number | undefined;
  private inputIntervalId: number | undefined;

  private inputSeq = 0;
  private hasInitialPosition = false;
  private currentFov = 75;

  private debugEnabled = false;
  private debugRay?: THREE.Line;
  private localCapsule?: THREE.Mesh;
  private statusEl: HTMLDivElement;
  private fpsEl: HTMLDivElement;
  private fpsAccumMs = 0;
  private fpsFrames = 0;
  private userProfile: UserProfile | null = null;

  constructor() {
    // Determine lighting config based on map
    const lightingConfig = isShootHouseNeonMap(this.currentMapId) 
      ? SHOOT_HOUSE_NEON_LIGHTING_CONFIG 
      : undefined;
    
    this.renderer = new GameRenderer(DEFAULT_BLOOM_CONFIG, lightingConfig);
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
    
    this.audioManager = new AudioManager(this.renderer.camera);
    setAudioManager(this.audioManager);
    this.audioManager.init();
    
    this.hitMarker = new HitMarker();
    this.damageIndicator = new DamageIndicator();
    this.killFeed = new KillFeed();
    this.deathCam = new DeathCam();
    
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
    
    // Create level based on current map
    this.level = createLevel(this.renderer.scene, this.currentMapId);
    const mapEntry = getMapEntry(this.currentMapId);
    console.log(`[Game] Loading map: ${mapEntry?.displayName || this.currentMapId}`);
    
    // Initialize minimap terminals and 3D plant site markers
    if (SHOOT_HOUSE_NEON.uploadTerminals) {
      this.minimap.setTerminals(
        SHOOT_HOUSE_NEON.uploadTerminals.map(t => ({
          id: t.id,
          x: t.x,
          z: t.z,
          state: "inactive" as const,
        }))
      );
    }

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
    
    // Load skybox from map configuration
    this.skybox = new Skybox(this.renderer.scene);
    const skyboxPath = mapEntry?.skyboxPath || "/skybox/cyberpunk";
    this.skybox.loadFromFolder(skyboxPath).catch(() => undefined);

    this.statusEl = document.createElement("div");
    this.statusEl.style.cssText = `
      position: fixed;
      top: 12px;
      left: 12px;
      z-index: 9999;
      padding: 10px 12px;
      background: rgba(0,0,0,0.65);
      color: #fff;
      font-family: monospace;
      font-size: 14px;
      border-radius: 6px;
      pointer-events: none;
      white-space: pre-line;
    `;
    this.statusEl.textContent = "Connecting...";
    document.body.appendChild(this.statusEl);

    this.fpsEl = document.createElement("div");
    this.fpsEl.style.cssText = `
      position: fixed;
      top: 12px;
      left: 12px;
      z-index: 9999;
      padding: 6px 8px;
      background: rgba(0,0,0,0.45);
      color: #9cff9c;
      font-family: monospace;
      font-size: 12px;
      border-radius: 6px;
      pointer-events: none;
    `;
    this.fpsEl.textContent = "FPS: --";
    document.body.appendChild(this.fpsEl);

    this.setupCallbacks();
  }

  private activeSlot = 0; // 0 = primary, 1 = secondary

  private initSearchDestroyObjects(): void {
    if (this.spikeObject) return;
    
    this.spikeObject = new SpikeObject(this.renderer.scene);
    
    const terminals = SHOOT_HOUSE_NEON.uploadTerminals;
    if (isShootHouseNeonMap(this.currentMapId) && terminals) {
      for (const t of terminals) {
        const marker = new PlantSiteMarker(this.renderer.scene, {
          id: t.id,
          x: t.x,
          z: t.z,
          radius: t.radius,
        });
        this.plantSiteMarkers.push(marker);
      }
    }
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

    this.input.onDebugDamage = () => {
      if (this.network.connected) {
        this.network.sendDebugDamage(this.network.sessionId);
      }
    };

    this.input.onToggleDebug = () => {
      this.debugEnabled = !this.debugEnabled;
      this.remotePlayers.setDebugEnabled(this.debugEnabled);
      if (this.localCapsule) this.localCapsule.visible = this.debugEnabled;
      if (this.debugRay) this.debugRay.visible = this.debugEnabled;
    };

    // Spike interaction (S&D mode)
    this.input.onSpikeInteract = () => {
      const state = this.network.state;
      if (!state || state.gameMode !== "search_destroy") return;
      if (state.lobbyState !== "playing") return;
      
      const myId = this.network.sessionId;
      const myPlayer = state.players?.get(myId);
      if (!myPlayer || myPlayer.isDead) return;

      const myTeam = myPlayer.teamId;

      // Context-sensitive action based on team
      if ((state.spikeState === "ground" || state.spikeState === "dropped") && myTeam === "ghosts") {
        // Ghosts can pick up spike from ground or dropped
        this.network.sendSpikeAction("pickup");
      } else if (myPlayer.hasSpike && state.spikeState === "carried" && myTeam === "ghosts") {
        // Ghosts can upload at terminal
        this.network.sendSpikeAction("upload");
      } else if (state.spikeState === "uploaded" && myTeam === "sentinels") {
        // Sentinels can decrypt uploaded spike
        this.network.sendSpikeAction("decrypt");
      }
    };

    this.input.onSpikeCancel = () => {
      const state = this.network.state;
      if (!state || state.gameMode !== "search_destroy") return;
      
      // Cancel any ongoing action
      this.network.sendSpikeAction("cancel");
    };

    this.network.onConnected = (sessionId: string) => {
      this.remotePlayers.setLocalPlayerId(sessionId);
      this.remotePlayers.setDebugEnabled(this.debugEnabled);
      this.statusEl.style.display = "none";
      this.startInputSendLoop();
    };

    this.network.onRoomInfo = (info) => {
      this.hud.setRoomInfo(info.joinCode, info.playerCount, info.maxPlayers);
      this.teamLobbyScreen.setJoinCode(info.joinCode);
      this.hostId = info.hostId;
      
      if (info.gameMode === "search_destroy") {
        this.initSearchDestroyObjects();
      }
    };

    this.network.onHostChanged = (msg) => {
      this.hostId = msg.newHostId;
    };

    this.network.onError = (err) => {
      const msg = (err as any)?.message ? String((err as any).message) : String(err);
      this.statusEl.style.display = "block";
      this.statusEl.textContent = `Connection failed:\n${msg}`;
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
      if (msg.shooterId !== this.network.sessionId) {
        this.audioManager.playGunshot(msg.weaponId, false, msg.origin);
      }
    };

    this.network.onBreakableDestroyed = (msg) => {
      this.level.destroyBreakable(msg.id);
    };

    // Team lobby handlers (S&D mode)
    this.network.onLobbyState = (msg) => {
      if (msg.lobbyState === "waiting") {
        // Remove game over overlay if present (from restart)
        const existingOverlay = document.getElementById("game-over-overlay");
        if (existingOverlay) {
          existingOverlay.remove();
        }
        
        this.teamLobbyScreen.setLocalSessionId(this.network.sessionId);
        this.teamLobbyScreen.updateLobbyState(msg);
        this.teamLobbyScreen.show();
        this.hud.hide();
        this.minimap.hide();
        
        // Update player names in lobby
        const state = this.network.state;
        if (state?.players) {
          state.players.forEach((player: any, sessionId: string) => {
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
      this.handleGameOver(msg);
    };

    this.network.onGameRestarted = () => {
      const overlay = document.getElementById("game-over-overlay");
      if (overlay) {
        overlay.remove();
      }
    };

    this.network.onRoundEnd = (msg) => {
      this.showRoundEndAnnouncement(msg);
    };

    this.network.onLobbyDisbanded = () => {
      // Remove game over overlay if present
      const existingOverlay = document.getElementById("game-over-overlay");
      if (existingOverlay) {
        existingOverlay.remove();
      }
      
      this.stop();
      if (this.onReturnToMenu) {
        this.onReturnToMenu();
      }
    };

    // Team lobby callbacks
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

  private handleGameOver(msg: GameOverMessage): void {
    const overlay = document.createElement("div");
    overlay.id = "game-over-overlay";
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.8);
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      z-index: 2000;
      color: white;
      font-family: 'Segoe UI', sans-serif;
    `;
    
    let titleHtml: string;
    let subtitleHtml: string;
    
    if (msg.gameMode === "deathmatch") {
      const isLocalWinner = msg.winnerId === this.network.sessionId;
      if (isLocalWinner) {
        titleHtml = `<div style="font-size: 48px; font-weight: bold; color: #00ff00; margin-bottom: 16px;">YOU WIN</div>`;
        subtitleHtml = `<div style="font-size: 24px; color: #888; margin-bottom: 32px;">First to ${msg.winnerName ? "the kill limit" : "5 kills"}!</div>`;
      } else {
        titleHtml = `<div style="font-size: 48px; font-weight: bold; color: #ff4444; margin-bottom: 16px;">YOU LOSE</div>`;
        subtitleHtml = `<div style="font-size: 24px; color: #888; margin-bottom: 32px;">${msg.winnerName} wins!</div>`;
      }
    } else {
      const winnerTeamColor = msg.winnerTeam === "ghosts" ? "#ff4444" : "#4488ff";
      const winnerTeamName = msg.winnerTeam === "ghosts" ? "GHOSTS" : "SENTINELS";
      titleHtml = `<div style="font-size: 48px; font-weight: bold; color: ${winnerTeamColor}; margin-bottom: 16px;">${winnerTeamName} WIN</div>`;
      subtitleHtml = `<div style="font-size: 24px; color: #888; margin-bottom: 32px;">Ghosts ${msg.ghostsRoundsWon} - ${msg.sentinelsRoundsWon} Sentinels</div>`;
    }
    
    overlay.innerHTML = `
      ${titleHtml}
      ${subtitleHtml}
      <div id="game-over-status" style="font-size: 16px; color: #666;">
        Waiting for host...
      </div>
    `;
    
    document.body.appendChild(overlay);
    
    const isHost = this.hostId === this.network.sessionId;
    if (isHost) {
      const statusEl = overlay.querySelector("#game-over-status")!;
      statusEl.innerHTML = `
        <button id="restart-btn" style="
          padding: 12px 32px;
          margin: 8px;
          border: 2px solid #00ffff;
          border-radius: 8px;
          background: rgba(0, 255, 255, 0.1);
          color: #00ffff;
          font-size: 16px;
          cursor: pointer;
        ">PLAY AGAIN</button>
        <button id="disband-btn" style="
          padding: 12px 32px;
          margin: 8px;
          border: 2px solid #666;
          border-radius: 8px;
          background: transparent;
          color: #888;
          font-size: 16px;
          cursor: pointer;
        ">LEAVE</button>
      `;
      
      overlay.querySelector("#restart-btn")?.addEventListener("click", () => {
        overlay.remove();
        this.network.sendRestartGame();
      });
      
      overlay.querySelector("#disband-btn")?.addEventListener("click", () => {
        overlay.remove();
        this.network.sendDisbandLobby();
      });
    }
  }

  public setOnReturnToMenu(callback: () => void): void {
    this.onReturnToMenu = callback;
  }

  private showRoundEndAnnouncement(msg: { roundNumber: number; winnerTeam: string; reason: string }): void {
    // Remove any existing announcement
    const existing = document.getElementById("round-end-announcement");
    if (existing) existing.remove();

    const teamColor = msg.winnerTeam === "ghosts" ? "#ff4444" : "#4488ff";
    const teamName = msg.winnerTeam === "ghosts" ? "GHOSTS" : "SENTINELS";
    
    let reasonText = "";
    switch (msg.reason) {
      case "spike_detonated":
        reasonText = "Spike uploaded successfully!";
        break;
      case "spike_decrypted":
        reasonText = "Spike decrypted!";
        break;
      case "elimination":
        reasonText = "Enemy team eliminated!";
        break;
      case "time":
        reasonText = "Time ran out!";
        break;
      default:
        reasonText = "";
    }

    const announcement = document.createElement("div");
    announcement.id = "round-end-announcement";
    announcement.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      text-align: center;
      z-index: 1500;
      pointer-events: none;
      animation: fadeInOut 4s ease-in-out forwards;
    `;
    announcement.innerHTML = `
      <div style="
        font-size: 48px;
        font-weight: bold;
        color: ${teamColor};
        text-shadow: 0 0 20px ${teamColor}, 0 4px 8px rgba(0,0,0,0.5);
        margin-bottom: 12px;
      ">${teamName} WIN ROUND ${msg.roundNumber}</div>
      <div style="
        font-size: 20px;
        color: #ccc;
        text-shadow: 0 2px 4px rgba(0,0,0,0.5);
      ">${reasonText}</div>
    `;

    // Add animation style if not already present
    if (!document.getElementById("round-announcement-style")) {
      const style = document.createElement("style");
      style.id = "round-announcement-style";
      style.textContent = `
        @keyframes fadeInOut {
          0% { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
          15% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
          85% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
          100% { opacity: 0; transform: translate(-50%, -50%) scale(0.9); }
        }
      `;
      document.head.appendChild(style);
    }

    document.body.appendChild(announcement);

    // Remove after animation
    setTimeout(() => {
      announcement.remove();
    }, 4000);
  }

  public setUserProfile(profile: UserProfile): void {
    this.userProfile = profile;
  }

  public async start(action?: PlayAction): Promise<void> {
    if (this.running) return;
    this.running = true;

    this.renderer.applySettingsFromManager();

    // Use user's primary weapon or fallback to AR_1
    const primaryWeapon = this.userProfile?.primaryWeaponId || "AR_1";
    this.activeSlot = 0;
    
    this.statusEl.textContent = "Loading weapons...";
    this.weaponSystem.switchWeapon(primaryWeapon);
    this.hud.setWeapon(primaryWeapon);
    this.hud.update();

    this.statusEl.textContent = "Connecting...";
    
    const displayName = this.userProfile?.displayName || "Player";
    const primaryWeaponId = this.userProfile?.primaryWeaponId || "AR_1";
    const secondaryWeaponId = this.userProfile?.secondaryWeaponId || "PISTOL_1";
    const gameMode = action?.gameMode || "deathmatch";
    
    await this.network.connect({
      roomId: action?.roomId,
      forceCreate: action?.type === "create",
      displayName,
      primaryWeaponId,
      secondaryWeaponId,
      gameMode,
    });

    this.updateCameraRotation();
    this.animate();
  }

  private startInputSendLoop(): void {
    if (this.inputIntervalId !== undefined) {
      window.clearInterval(this.inputIntervalId);
    }

    this.inputIntervalId = window.setInterval(() => {
      if (!this.network.connected) return;

      const state = this.input.getState();

      const inputMsg = {
        seq: ++this.inputSeq,
        moveX: state.moveX,
        moveZ: state.moveZ,
        lookYaw: state.yaw,
        lookPitch: state.pitch,
        sprint: state.sprint && !state.aiming,  // Can't sprint while aiming
        aiming: state.aiming,
        crouchPressed: state.crouchPressed,
        crouchReleased: state.crouchReleased,
        crouchHeld: state.crouchHeld,
        jumpPressed: state.jumpPressed,
        dashPressed: state.dashPressed
      };

      this.network.sendInput(inputMsg);
    }, 1000 / INPUT_SEND_RATE);
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

    this.fpsAccumMs += dt * 1000;
    this.fpsFrames += 1;
    if (this.fpsAccumMs >= 500) {
      const fps = (this.fpsFrames / this.fpsAccumMs) * 1000;
      this.fpsEl.textContent = `FPS: ${Math.round(fps)}`;
      this.fpsAccumMs = 0;
      this.fpsFrames = 0;
    }

    this.input.setAdsState(this.weaponSystem.getAdsAlpha(), this.weaponSystem.isScopeActive());
    this.input.updateRecoil(dt);
    this.updateCameraRotation();
    const inputState = this.input.getState();
    
    this.damageIndicator.setPlayerYaw(inputState.yaw);

    this.localPlayer.update(dt, {
      moveX: inputState.moveX,
      moveZ: inputState.moveZ,
      yaw: inputState.yaw,
      sprint: inputState.sprint && !inputState.aiming,
      aiming: inputState.aiming,
      jump: inputState.jumpPressed
    });
    
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

    // Update player count in HUD
    if (players) {
      let count = 0;
      players.forEach(() => count++);
      this.hud.updatePlayerCount(count);
    }

    // Update game mode HUD
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
        // Team state (S&D)
        lobbyState: state.lobbyState || "playing",
        ghostsRoundsWon: state.ghostsRoundsWon || 0,
        sentinelsRoundsWon: state.sentinelsRoundsWon || 0,
        myTeam: myPlayer?.teamId || "",
        // Spike state (S&D)
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
      
      // Update minimap
      this.updateMinimap(state, players, myId);
      
      // Update action prompt
      this.updateActionPrompt(state, myPlayer);
    }

    this.remotePlayers.update(dt, players);

    // Update spike object animation
    if (this.spikeObject && state?.gameMode === "search_destroy") {
      this.spikeObject.update(dt, state.spikeState as SpikeState || "ground");
    }
    
    // Update plant site marker animations
    for (const marker of this.plantSiteMarkers) {
      marker.update(dt);
    }

    let serverPlayer: any;
    if (players && typeof players.forEach === "function") {
      players.forEach((p: any, id: string) => {
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

      this.localPlayer.reconcileWithServer(serverPlayer.x, serverPlayer.y, serverPlayer.z, dt);

      this.localPlayer.health = serverPlayer.health;
      this.localPlayer.maxHealth = serverPlayer.maxHealth;
      this.localPlayer.isDead = serverPlayer.isDead;
      this.localPlayer.respawnTime = serverPlayer.respawnTime || 0;

      if (this.debugEnabled) {
        this.ensureLocalCapsule();
        if (this.localCapsule) {
          this.localCapsule.visible = !this.localPlayer.isDead;
          this.localCapsule.position.set(serverPlayer.x, serverPlayer.y, serverPlayer.z);
        }
      } else if (this.localCapsule) {
        this.localCapsule.visible = false;
      }

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

    // Update level animations (neon flickers, etc.)
    if (this.level.update) {
      this.level.update();
    }

    this.updateDebugRay();
    this.renderer.render();
  };

  private ensureLocalCapsule(): void {
    if (this.localCapsule) return;
    const geom = new THREE.CapsuleGeometry(CAPSULE_RADIUS, CAPSULE_HALF * 2, 6, 12);
    const mat = new THREE.MeshBasicMaterial({ color: 0x00ffff, wireframe: true });
    this.localCapsule = new THREE.Mesh(geom, mat);
    this.localCapsule.visible = this.debugEnabled;
    this.renderer.scene.add(this.localCapsule);
  }

  private updateDebugRay(): void {
    if (!this.debugEnabled) {
      if (this.debugRay) this.debugRay.visible = false;
      return;
    }
    if (!this.input.isPointerLocked()) {
      if (this.debugRay) this.debugRay.visible = false;
      return;
    }

    const camera = this.renderer.camera;
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
    const origin = camera.position.clone().add(dir.clone().multiplyScalar(CAPSULE_RADIUS + 0.15));
    const end = origin.clone().add(dir.clone().multiplyScalar(DEBUG_RAY_LENGTH));

    if (!this.debugRay) {
      const geom = new THREE.BufferGeometry().setFromPoints([origin, end]);
      const mat = new THREE.LineBasicMaterial({ color: 0xff3333 });
      this.debugRay = new THREE.Line(geom, mat);
      this.debugRay.frustumCulled = false;
      this.debugRay.visible = true;
      this.renderer.scene.add(this.debugRay);
      return;
    }

    this.debugRay.visible = true;
    const posAttr = this.debugRay.geometry.getAttribute("position") as THREE.BufferAttribute;
    posAttr.setXYZ(0, origin.x, origin.y, origin.z);
    posAttr.setXYZ(1, end.x, end.y, end.z);
    posAttr.needsUpdate = true;
  }

  private updateMinimap(state: any, players: any, myId: string): void {
    if (!state) {
      this.minimap.hide();
      return;
    }

    this.minimap.show();

    // Update terminal states (only relevant for S&D)
    const isSD = state.gameMode === "search_destroy";
    
    // Get local player's team first for visibility decisions
    let myTeam = "";
    if (players && typeof players.forEach === "function") {
      players.forEach((p: any, id: string) => {
        if (id === myId) {
          myTeam = p.teamId || "";
        }
      });
    }
    
    // Sentinels don't see which terminal has the spike - only Ghosts do
    const isGhost = myTeam === "ghosts";
    const terminals: TerminalInfo[] = (SHOOT_HOUSE_NEON.uploadTerminals || []).map(t => {
      let termState: "inactive" | "uploading" | "uploaded" = "inactive";
      
      if (isSD && state.spikeTerminalId === t.id) {
        if (state.spikeState === "uploading" && isGhost) {
          termState = "uploading";
        } else if ((state.spikeState === "uploaded" || state.spikeState === "decrypting") && isGhost) {
          termState = "uploaded";
        }
      }
      
      return { id: t.id, x: t.x, z: t.z, state: termState };
    });
    this.minimap.setTerminals(terminals);

    // Update player markers
    const playerMarkers: PlayerMarker[] = [];
    if (players && typeof players.forEach === "function") {
      players.forEach((p: any, id: string) => {
        playerMarkers.push({
          id,
          x: p.x,
          z: p.z,
          rotationY: p.rotationY || 0,
          isLocal: id === myId,
          hasSpike: isSD && (p.hasSpike || false),
          isDead: p.isDead || false,
          teamId: p.teamId || "",
        });
      });
    }
    this.minimap.setPlayers(playerMarkers);

    // Update spike position (S&D only)
    // Ghosts always see the spike location, Sentinels only see it when uploaded
    if (isSD) {
      const spikeState = state.spikeState as SpikeState;
      const showSpikeToMyTeam = 
        myTeam === "ghosts" || // Ghosts always see spike
        spikeState === "uploaded" || // Everyone sees uploaded spike
        spikeState === "decrypting";
      
      if ((spikeState === "ground" || spikeState === "dropped") && showSpikeToMyTeam && state.spikeX !== undefined) {
        this.minimap.setDroppedSpike({ x: state.spikeX, z: state.spikeZ });
      } else {
        this.minimap.setDroppedSpike(null);
      }
      
      // Update 3D spike object
      if (this.spikeObject) {
        // Show spike when on ground, dropped, or at terminal (uploaded)
        const showSpike3D = spikeState === "ground" || spikeState === "dropped" || 
                           spikeState === "uploading" || spikeState === "uploaded" || 
                           spikeState === "decrypting";
        
        if (showSpike3D && state.spikeX !== undefined) {
          // When uploading/uploaded, get position from terminal
          let spikeX = state.spikeX;
          let spikeZ = state.spikeZ;
          
          if (spikeState === "uploading" || spikeState === "uploaded" || spikeState === "decrypting") {
            const terminal = (SHOOT_HOUSE_NEON.uploadTerminals || []).find(t => t.id === state.spikeTerminalId);
            if (terminal) {
              spikeX = terminal.x;
              spikeZ = terminal.z;
            }
          }
          
          this.spikeObject.setPosition(spikeX, spikeZ);
          this.spikeObject.setVisible(true);
        } else {
          this.spikeObject.setVisible(false);
        }
      }
      
      // Update plant site markers
      for (const marker of this.plantSiteMarkers) {
        const terminal = terminals.find(t => t.id === marker.config.id);
        if (terminal) {
          marker.setState(terminal.state as PlantSiteState);
        }
      }
    } else {
      // Non-S&D modes: hide all spike-related objects
      this.minimap.setDroppedSpike(null);
      this.minimap.setTerminals([]);
      if (this.spikeObject) {
        this.spikeObject.setVisible(false);
      }
      for (const marker of this.plantSiteMarkers) {
        marker.setVisible(false);
      }
    }

    this.minimap.update();
  }

  private updateActionPrompt(state: any, myPlayer: any): void {
    if (!state || state.gameMode !== "search_destroy" || !myPlayer || myPlayer.isDead) {
      this.actionPrompt.hide();
      return;
    }
    
    // Don't show prompts in lobby
    if (state.lobbyState !== "playing") {
      this.actionPrompt.hide();
      return;
    }

    const playerX = myPlayer.x || 0;
    const playerZ = myPlayer.z || 0;
    const myTeam = myPlayer.teamId || "";

    // Check if currently in an action
    if (myPlayer.isUploading) {
      this.actionPrompt.update({
        action: "uploading",
        terminalId: state.spikeTerminalId,
        progress: state.spikeUploadProgress || 0,
      });
      return;
    }

    if (myPlayer.isDecrypting) {
      this.actionPrompt.update({
        action: "decrypting",
        terminalId: state.spikeTerminalId,
        progress: state.spikeDecryptProgress || 0,
      });
      return;
    }

    // Check for nearby spike (ground or dropped) - only Ghosts can pick up
    if ((state.spikeState === "ground" || state.spikeState === "dropped") && myTeam === "ghosts") {
      const dx = playerX - state.spikeX;
      const dz = playerZ - state.spikeZ;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < 2.5) {
        this.actionPrompt.update({ action: "pickup" });
        return;
      }
    }

    // Check for nearby terminal
    const terminals = SHOOT_HOUSE_NEON.uploadTerminals || [];
    for (const terminal of terminals) {
      const dx = playerX - terminal.x;
      const dz = playerZ - terminal.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      
      if (dist <= terminal.radius) {
        // Ghosts can upload when carrying spike
        if (myPlayer.hasSpike && state.spikeState === "carried" && myTeam === "ghosts") {
          this.actionPrompt.update({ action: "upload", terminalId: terminal.id });
          return;
        }
        
        // Sentinels can decrypt uploaded spike
        if (state.spikeState === "uploaded" && state.spikeTerminalId === terminal.id && myTeam === "sentinels") {
          this.actionPrompt.update({ action: "decrypt", terminalId: terminal.id });
          return;
        }
      }
    }

    // No action available
    this.actionPrompt.hide();
  }

  public stop(): void {
    if (!this.running) return;
    this.running = false;

    if (this.rafId !== undefined) {
      cancelAnimationFrame(this.rafId);
      this.rafId = undefined;
    }

    if (this.inputIntervalId !== undefined) {
      window.clearInterval(this.inputIntervalId);
      this.inputIntervalId = undefined;
    }

    if (this.debugRay) {
      this.renderer.scene.remove(this.debugRay);
      this.debugRay.geometry.dispose();
      (this.debugRay.material as THREE.Material).dispose();
      this.debugRay = undefined;
    }

    if (this.localCapsule) {
      this.renderer.scene.remove(this.localCapsule);
      this.localCapsule.geometry.dispose();
      (this.localCapsule.material as THREE.Material).dispose();
      this.localCapsule = undefined;
    }

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
    this.hud.destroy();
    this.scoreboard.destroy();
    this.teamLobbyScreen.destroy();
    this.statusEl.remove();
    this.fpsEl.remove();
    if (this.level.dispose) {
      this.level.dispose();
    }
    this.renderer.dispose();
  }
}
