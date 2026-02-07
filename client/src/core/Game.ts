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
import { Skybox } from "../world/Skybox.js";
import { WEAPON_RENDER_LAYER } from "../world/lighting/CyberpunkLighting.js";
import { getDefaultMapId, getMapEntry, isShootHouseNeonMap } from "../world/maps/map-registry.js";
import { SHOOT_HOUSE_NEON_LIGHTING_CONFIG } from "../world/lighting/ShootHouseNeonLighting.js";

const INPUT_SEND_RATE = 60;
const DEBUG_RAY_LENGTH = 75;
const CAPSULE_RADIUS = 0.35;
const CAPSULE_HALF = 0.9;
const BASE_FOV = 75;
const SPRINT_FOV = 85;
const FOV_LERP_SPEED = 8;

export class Game {
  private renderer: GameRenderer;
  private input: InputManager;
  private network: NetworkManager;
  private localPlayer: LocalPlayer;
  private remotePlayers: RemotePlayers;
  private hud: HUD;
  private scoreboard: Scoreboard;
  private weaponSystem: WeaponSystem;
  private level: LevelInstance;
  private skybox: Skybox;
  private currentMapId = getDefaultMapId();

  private lastTime = performance.now();
  private running = false;
  private rafId: number | undefined;
  private inputIntervalId: number | undefined;

  private inputSeq = 0;
  private hasInitialPosition = false;
  private currentFov = BASE_FOV;

  private debugEnabled = false;
  private debugRay?: THREE.Line;
  private localCapsule?: THREE.Mesh;
  private statusEl: HTMLDivElement;
  private fpsEl: HTMLDivElement;
  private fpsAccumMs = 0;
  private fpsFrames = 0;

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
    
    // Create level based on current map
    this.level = createLevel(this.renderer.scene, this.currentMapId);
    const mapEntry = getMapEntry(this.currentMapId);
    console.log(`[Game] Loading map: ${mapEntry?.displayName || this.currentMapId}`);

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

  private setupCallbacks(): void {
    this.input.onWeaponSwitch = (weaponId: string) => {
      this.weaponSystem.switchWeapon(weaponId);
      this.hud.setWeapon(weaponId);
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

    this.network.onConnected = (sessionId: string) => {
      this.remotePlayers.setLocalPlayerId(sessionId);
      this.remotePlayers.setDebugEnabled(this.debugEnabled);
      this.statusEl.style.display = "none";
      this.startInputSendLoop();
    };

    this.network.onError = (err) => {
      const msg = (err as any)?.message ? String((err as any).message) : String(err);
      this.statusEl.style.display = "block";
      this.statusEl.textContent = `Connection failed:\n${msg}`;
    };

    this.network.onHealthChange = (msg) => {
      if (msg.playerId === this.network.sessionId) {
        this.localPlayer.updateHealth(
          msg.newHealth,
          msg.maxHealth,
          msg.isDead,
          msg.respawnTime || 0
        );
      }
    };

    this.network.onShotFired = (_msg) => {};

    this.network.onBreakableDestroyed = (msg) => {
      this.level.destroyBreakable(msg.id);
    };
  }

  public async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    this.statusEl.textContent = "Loading weapons...";
    this.weaponSystem.switchWeapon("AR_1");
    this.hud.setWeapon("AR_1");
    this.hud.update();

    this.statusEl.textContent = "Connecting...";
    await this.network.connect();

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

    this.updateCameraRotation();
    const inputState = this.input.getState();

    this.localPlayer.update(dt, {
      moveX: inputState.moveX,
      moveZ: inputState.moveZ,
      yaw: inputState.yaw,
      sprint: inputState.sprint && !inputState.aiming,
      aiming: inputState.aiming,
      jump: inputState.jumpPressed
    });

    const canFire = !this.localPlayer.isReloading && !this.localPlayer.isDead;
    const firingNow = inputState.firing && canFire;
    this.weaponSystem.setFiring(firingNow);
    this.weaponSystem.setAiming(inputState.aiming);

    this.weaponSystem.update(dt, now / 1000, inputState.aimDir);
    this.weaponSystem.setVisible(!this.localPlayer.isDead);

    const state = this.network.state;
    const players = state?.players;
    const myId = this.network.sessionId;

    this.remotePlayers.update(dt, players);

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
    const baseFov = isSprinting ? SPRINT_FOV : BASE_FOV;
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

    this.weaponSystem.dispose();
    this.input.dispose();
    if (this.level.dispose) {
      this.level.dispose();
    }
    this.renderer.dispose();
  }
}
