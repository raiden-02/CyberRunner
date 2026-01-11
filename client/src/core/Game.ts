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

const INPUT_SEND_RATE = 20; // Hz
const CAPSULE_HALF = 0.9; // keep in sync with server
const CAPSULE_RADIUS = 0.35; // keep in sync with server
const DEBUG_RAY_LENGTH = 75;

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

  private debugEnabled = false; // toggle with F3
  private debugRay?: THREE.Line;
  private localCapsule?: THREE.Mesh;

  constructor() {
    // Initialize core systems
    this.renderer = new GameRenderer();
    this.input = new InputManager(this.renderer.canvas, this.renderer.camera);
    this.network = new NetworkManager();
    this.localPlayer = new LocalPlayer(this.renderer.camera);
    this.remotePlayers = new RemotePlayers(this.renderer.scene);
    this.hud = new HUD();
    new Crosshair(); // Creates and attaches to DOM
    new Level(this.renderer.scene); // Creates level geometry
    this.weaponView = new WeaponView(this.renderer.camera);

    this.setupCallbacks();
  }

  private setupCallbacks(): void {
    // Input callbacks
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

    // Network callbacks
    this.network.onConnected = (sessionId: string) => {
      this.remotePlayers.setLocalPlayerId(sessionId);
      this.remotePlayers.setDebugEnabled(this.debugEnabled);
      this.startInputLoop();
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
      // Visual effects can be added here (muzzle flash, tracer, impact)
    };
  }

  public async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    // Load initial weapon
    await this.weaponView.switchWeapon("AR_1");
    this.hud.setWeapon("AR_1");
    this.hud.update();

    // Connect to server
    await this.network.connect();

    // Apply camera rotation
    this.updateCameraRotation();

    // Start game loop
    this.animate();
  }

  private startInputLoop(): void {
    if (this.inputIntervalId !== undefined) {
      window.clearInterval(this.inputIntervalId);
      this.inputIntervalId = undefined;
    }

    this.inputIntervalId = window.setInterval(() => {
      if (!this.network.connected) return;

      const state = this.input.getState();

      // Send movement input
      this.network.sendInput({
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
      });

      // Send fire input if firing
      const canFire = !this.localPlayer.isReloading && !this.localPlayer.isDead;
      const firingNow = state.firing && canFire;

      // Send "fire start/continue" while firing, and importantly, send "fire stop" on release/unlock.
      if (firingNow || this.prevFiring !== firingNow) {
        this.network.sendFireInput(firingNow, {
          x: state.aimDir.x,
          y: state.aimDir.y,
          z: state.aimDir.z
        });
      }

      this.prevFiring = firingNow;
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

    // Update camera rotation from input
    this.updateCameraRotation();

    // Update local player
    const keys = this.getKeys();
    this.localPlayer.update(dt, keys, this.input.yaw);

    // Update weapon view
    this.weaponView.update(dt);
    this.weaponView.setVisible(!this.localPlayer.isDead);

    // Get server state
    const state = this.network.state;
    const players = state?.players;
    const myId = this.network.sessionId;

    // Update remote players
    this.remotePlayers.update(dt, players);

    // Get local player from server state
    let serverPlayer: any;
    if (players && typeof players.forEach === "function") {
      players.forEach((p: any, id: string) => {
        if (id === myId) {
          serverPlayer = p;
          this.localPlayer.isReloading = p.reloading || false;
        }
      });
    }

    // Server reconciliation
    if (serverPlayer) {
      this.localPlayer.reconcileWithServer(
        serverPlayer.x,
        serverPlayer.y,
        serverPlayer.z
      );

      // Authoritative health from replicated server state (events are optional FX only)
      this.localPlayer.health = serverPlayer.health;
      this.localPlayer.maxHealth = serverPlayer.maxHealth;
      this.localPlayer.isDead = serverPlayer.isDead;
      this.localPlayer.respawnTime = serverPlayer.respawnTime || 0;

      // Debug: show local collision capsule (server-authoritative position)
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

    // Apply camera position
    this.localPlayer.applyToCamera();

    // Debug: draw raycast line (client aim ray)
    this.updateDebugRay();

    // Render
    this.renderer.render();
  };

  private ensureLocalCapsule(): void {
    if (this.localCapsule) return;

    const capsuleGeom = new THREE.CapsuleGeometry(CAPSULE_RADIUS, CAPSULE_HALF * 2, 6, 12);
    const capsuleMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, wireframe: true });
    this.localCapsule = new THREE.Mesh(capsuleGeom, capsuleMat);
    this.localCapsule.visible = this.debugEnabled;
    this.renderer.scene.add(this.localCapsule);
  }

  private updateDebugRay(): void {
    if (!this.debugEnabled) {
      if (this.debugRay) this.debugRay.visible = false;
      return;
    }

    // Only show when pointer-locked (aiming)
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

  private getKeys(): Record<string, boolean> {
    return {
      KeyW: this.input.isKeyDown("KeyW"),
      KeyS: this.input.isKeyDown("KeyS"),
      KeyA: this.input.isKeyDown("KeyA"),
      KeyD: this.input.isKeyDown("KeyD")
    };
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
