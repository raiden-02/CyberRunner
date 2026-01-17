import * as THREE from "three";
import { GameRenderer } from "./GameRenderer.js";
import { InputManager } from "../input/InputManager.js";
import { NetworkManager } from "../network/NetworkManager.js";
import { LocalPlayer } from "../player/LocalPlayer.js";
import { RemotePlayers } from "../player/RemotePlayers.js";
import { HUD } from "../ui/HUD.js";
import { Crosshair } from "../ui/Crosshair.js";
import { Level } from "../world/Level.js";
import { WeaponView } from "../weapons/weapon-loader.js";

const INPUT_SEND_RATE = 60; // Hz - how often we send inputs to server
const DEBUG_RAY_LENGTH = 75;
const CAPSULE_RADIUS = 0.35;
const CAPSULE_HALF = 0.9;

// Sprint camera effect
const BASE_FOV = 75;
const SPRINT_FOV = 85;
const FOV_LERP_SPEED = 8; // How fast FOV transitions

export class Game {
  private renderer: GameRenderer;
  private input: InputManager;
  private network: NetworkManager;
  private localPlayer: LocalPlayer;
  private remotePlayers: RemotePlayers;
  private hud: HUD;
  private weaponView: WeaponView;

  private currentWeaponId = "AR_1";
  private lastTime = performance.now();
  private running = false;
  private rafId: number | undefined;
  private inputIntervalId: number | undefined;
  private prevFiring = false;

  // Input sequence for server reconciliation
  private inputSeq = 0;

  // Track if we've received initial server position
  private hasInitialPosition = false;

  // Sprint camera effect
  private currentFov = BASE_FOV;

  private debugEnabled = false;
  private debugRay?: THREE.Line;
  private localCapsule?: THREE.Mesh;
  private statusEl: HTMLDivElement;

  constructor() {
    this.renderer = new GameRenderer();
    this.input = new InputManager(this.renderer.canvas, this.renderer.camera);
    this.network = new NetworkManager();
    this.localPlayer = new LocalPlayer(this.renderer.camera);
    this.remotePlayers = new RemotePlayers(this.renderer.scene);
    this.hud = new HUD();
    new Crosshair();
    new Level(this.renderer.scene);
    this.weaponView = new WeaponView(this.renderer.camera);

    // Status overlay
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

    this.setupCallbacks();
  }

  private setupCallbacks(): void {
    this.input.onWeaponSwitch = (weaponId: string) => {
      this.currentWeaponId = weaponId;
      this.weaponView.switchWeapon(weaponId).catch(console.error);
      this.network.sendWeaponSwitch(weaponId);
      this.hud.setWeapon(weaponId);
    };

    this.input.onReload = () => {
      this.network.sendReload(this.currentWeaponId);
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

    this.network.onShotFired = (_msg) => {
      // Visual effects can be added here
    };
  }

  public async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    // Load initial weapon
    this.statusEl.textContent = "Loading weapons...";
    await this.weaponView.switchWeapon("AR_1");
    this.hud.setWeapon("AR_1");
    this.hud.update();

    // Connect to server
    this.statusEl.textContent = "Connecting...";
    await this.network.connect();

    this.updateCameraRotation();
    this.animate();
  }

  /**
   * Send inputs to server at fixed rate (separate from rendering).
   */
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
        sprint: state.sprint,
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

    // Update camera rotation (always smooth, runs every frame)
    this.updateCameraRotation();

    // Get current input state for local prediction
    const inputState = this.input.getState();

    // Update local player movement EVERY FRAME (no fixed timestep!)
    this.localPlayer.update(dt, {
      moveX: inputState.moveX,
      moveZ: inputState.moveZ,
      yaw: inputState.yaw,
      sprint: inputState.sprint,
      jump: inputState.jumpPressed
    });

    // Handle firing (check every frame)
    const canFire = !this.localPlayer.isReloading && !this.localPlayer.isDead;
    const firingNow = inputState.firing && canFire;
    if (this.network.connected && (firingNow || this.prevFiring !== firingNow)) {
      this.network.sendFireInput(firingNow, {
        x: inputState.aimDir.x,
        y: inputState.aimDir.y,
        z: inputState.aimDir.z
      });
    }
    this.prevFiring = firingNow;

    // Update weapon view
    this.weaponView.update(dt);
    this.weaponView.setVisible(!this.localPlayer.isDead);

    // Get server state
    const state = this.network.state;
    const players = state?.players;
    const myId = this.network.sessionId;

    this.remotePlayers.update(dt, players);

    // Find local player in server state and reconcile
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
      // Initialize position on first server state
      if (!this.hasInitialPosition) {
        this.localPlayer.setInitialPosition(serverPlayer.x, serverPlayer.y, serverPlayer.z);
        this.hasInitialPosition = true;
      }

      // Reconcile with server (smooth blend toward authoritative position)
      this.localPlayer.reconcileWithServer(
        serverPlayer.x,
        serverPlayer.y,
        serverPlayer.z,
        dt
      );

      // Authoritative health
      this.localPlayer.health = serverPlayer.health;
      this.localPlayer.maxHealth = serverPlayer.maxHealth;
      this.localPlayer.isDead = serverPlayer.isDead;
      this.localPlayer.respawnTime = serverPlayer.respawnTime || 0;

      // Debug capsule (shows server position)
      if (this.debugEnabled) {
        this.ensureLocalCapsule();
        if (this.localCapsule) {
          this.localCapsule.visible = !this.localPlayer.isDead;
          this.localCapsule.position.set(serverPlayer.x, serverPlayer.y, serverPlayer.z);
        }
      } else if (this.localCapsule) {
        this.localCapsule.visible = false;
      }

      // Update HUD
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

    // Apply local player position to camera
    this.localPlayer.applyToCamera();

    // Sprint FOV effect - smooth transition
    const isSprinting = inputState.sprint && 
      (Math.abs(inputState.moveX) > 0.1 || Math.abs(inputState.moveZ) > 0.1) && 
      !this.localPlayer.isDead;
    const targetFov = isSprinting ? SPRINT_FOV : BASE_FOV;
    this.currentFov += (targetFov - this.currentFov) * Math.min(1, dt * FOV_LERP_SPEED);
    this.renderer.camera.fov = this.currentFov;
    this.renderer.camera.updateProjectionMatrix();

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

    this.weaponView.dispose();
    this.input.dispose();
    this.renderer.dispose();
  }
}
