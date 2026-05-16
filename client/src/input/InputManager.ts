import * as THREE from "three";
import { SettingsManager, type KeybindSettings, type KeybindSettingsAlt } from "../settings/SettingsManager.js";

export interface InputState {
  moveX: number;
  moveZ: number;
  yaw: number;
  pitch: number;
  sprint: boolean;
  crouchPressed: boolean;
  crouchReleased: boolean;
  crouchHeld: boolean;
  jumpPressed: boolean;
  dashPressed: boolean;
  firing: boolean;
  aiming: boolean;
  aimDir: THREE.Vector3;
}

export class InputManager {
  private canvas: HTMLCanvasElement;
  private camera: THREE.Camera;
  
  private keys: Record<string, boolean> = {};
  private sprintToggle = false;
  private isMouseDown = false;
  private isRightMouseDown = false;
  
  public yaw = 0;
  public pitch = 0;
  
  private recoilPitch = 0;
  private recoilYaw = 0;
  private recoilReturnSpeed = 10;

  private keybinds: KeybindSettings;
  private keybindsAlt: KeybindSettingsAlt;
  private baseSensitivity = 0.002;
  
  private currentAdsAlpha = 0;
  private isScoped = false;

  public setInitialRotation(yaw: number, pitch: number = 0): void {
    this.yaw = yaw;
    this.pitch = pitch;
  }
  
  private prevCrouchState = false;
  private prevJumpState = false;
  private prevDashState = false;

  public onWeaponSwitch?: (weaponId: string) => void;
  public onReload?: () => void;
  public onToggleDebug?: () => void;
  
  public onSpikeInteract?: () => void;
  public onSpikeCancel?: () => void;

  private disposed = false;

  // Debug auto-run for testing hit registration (enabled via console)
  private autoRunEnabled = false;
  private autoRunDirection = 1;
  private autoRunTimer = 0;

  public isKeyDown(code: string): boolean {
    return !!this.keys[code];
  }

  /** Toggle auto-run for testing hit registration (call from console) */
  public toggleAutoRun(): void {
    this.autoRunEnabled = !this.autoRunEnabled;
    this.autoRunTimer = 0;
    this.autoRunDirection = 1;
    console.log(`[Debug] Auto-run: ${this.autoRunEnabled ? "ON" : "OFF"}`);
  }

  constructor(canvas: HTMLCanvasElement, camera: THREE.Camera) {
    this.canvas = canvas;
    this.camera = camera;
    this.keybinds = SettingsManager.getInstance().getKeybinds();
    this.keybindsAlt = SettingsManager.getInstance().getKeybindsAlt();
    this.setupEventListeners();
    
    SettingsManager.getInstance().addChangeListener(() => {
      this.updateKeybinds();
    });
  }

  updateKeybinds(): void {
    this.keybinds = SettingsManager.getInstance().getKeybinds();
    this.keybindsAlt = SettingsManager.getInstance().getKeybindsAlt();
  }

  setAdsState(adsAlpha: number, isScoped: boolean): void {
    this.currentAdsAlpha = adsAlpha;
    this.isScoped = isScoped;
  }

  private handleCanvasClick = (): void => {
    this.canvas.focus();
    this.canvas.requestPointerLock();
  };

  private handleMouseDown = (e: MouseEvent): void => {
    if (e.button === 0 && document.pointerLockElement === this.canvas) {
      this.isMouseDown = true;
    }
    if (e.button === 2 && document.pointerLockElement === this.canvas) {
      this.isRightMouseDown = true;
    }
  };

  private handleMouseUp = (e: MouseEvent): void => {
    if (e.button === 0) {
      this.isMouseDown = false;
    }
    if (e.button === 2) {
      this.isRightMouseDown = false;
    }
  };

  private handleMouseMove = (e: MouseEvent): void => {
    if (document.pointerLockElement === this.canvas) {
      const graphics = SettingsManager.getInstance().getGraphics();
      let sensitivity = this.baseSensitivity * graphics.mouseSensitivity;
      
      if (this.currentAdsAlpha > 0) {
        const adsMultiplier = this.isScoped 
          ? graphics.scopeSensitivityMultiplier 
          : graphics.adsSensitivityMultiplier;
        sensitivity *= THREE.MathUtils.lerp(1, adsMultiplier, this.currentAdsAlpha);
      }
      
      this.yaw -= (e.movementX || 0) * sensitivity;
      this.pitch -= (e.movementY || 0) * sensitivity;
      this.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.pitch));
    }
  };

  private handleKeyDown = (e: KeyboardEvent): void => this.onKeyDown(e);
  private handleKeyUp = (e: KeyboardEvent): void => this.onKeyUp(e);
  private handleWheel = (e: WheelEvent): void => this.onWheel(e);

  private setupEventListeners(): void {
    this.canvas.addEventListener("click", this.handleCanvasClick);
    this.canvas.addEventListener("contextmenu", this.handleContextMenu);
    this.canvas.addEventListener("mousedown", this.handleMouseDown);
    this.canvas.addEventListener("mouseup", this.handleMouseUp);
    document.addEventListener("mousemove", this.handleMouseMove);
    document.addEventListener("keydown", this.handleKeyDown);
    document.addEventListener("keyup", this.handleKeyUp);
    document.addEventListener("wheel", this.handleWheel);
  }

  private handleContextMenu = (e: MouseEvent): void => {
    e.preventDefault();
  };

  private matchesKeybind(code: string, action: keyof KeybindSettings): boolean {
    return code === this.keybinds[action] || code === this.keybindsAlt[action];
  }

  private isActionKeyDown(action: keyof KeybindSettings): boolean {
    const primary = this.keybinds[action];
    const alt = this.keybindsAlt[action];
    return !!(primary && this.keys[primary]) || !!(alt && this.keys[alt]);
  }

  private onWheel(e: WheelEvent): void {
    if (document.pointerLockElement !== this.canvas) return;
    
    const wheelCode = e.deltaY < 0 ? "WheelUp" : "WheelDown";
    
    if (this.onWeaponSwitch) {
      if (this.matchesKeybind(wheelCode, "toggleWeapon")) {
        this.onWeaponSwitch("toggle");
      } else if (this.matchesKeybind(wheelCode, "primaryWeapon")) {
        this.onWeaponSwitch("primary");
      } else if (this.matchesKeybind(wheelCode, "secondaryWeapon")) {
        this.onWeaponSwitch("secondary");
      }
    }
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Tab"].includes(e.code)) {
      e.preventDefault();
    }

    const wasDown = !!this.keys[e.code];
    this.keys[e.code] = true;

    if (this.matchesKeybind(e.code, "sprint") && !wasDown) {
      this.sprintToggle = !this.sprintToggle;
    }

    if (this.onWeaponSwitch) {
      if (this.matchesKeybind(e.code, "primaryWeapon")) {
        this.onWeaponSwitch("primary");
      } else if (this.matchesKeybind(e.code, "secondaryWeapon")) {
        this.onWeaponSwitch("secondary");
      } else if (this.matchesKeybind(e.code, "toggleWeapon")) {
        this.onWeaponSwitch("toggle");
      }
    }

    if (this.matchesKeybind(e.code, "reload") && this.onReload) {
      this.onReload();
    }

    // F3 = Toggle debug visuals (hitboxes, rays)
    if (e.code === "F3" && this.onToggleDebug) {
      this.onToggleDebug();
    }

    if (this.matchesKeybind(e.code, "interact") && !wasDown && this.onSpikeInteract) {
      this.onSpikeInteract();
    }
  }

  private onKeyUp(e: KeyboardEvent): void {
    if (e.code === "Tab") {
      e.preventDefault();
    }
    this.keys[e.code] = false;

    if (this.matchesKeybind(e.code, "interact") && this.onSpikeCancel) {
      this.onSpikeCancel();
    }
  }

  public updateAutoRun(dt: number): void {
    if (!this.autoRunEnabled) return;
    
    // Switch direction every 3 seconds
    this.autoRunTimer += dt;
    if (this.autoRunTimer >= 3.0) {
      this.autoRunTimer = 0;
      this.autoRunDirection *= -1;
    }
  }

  public getState(): InputState {
    let moveZ = 0, moveX = 0;
    let autoSprint = false;
    
    // Auto-run overrides manual input when enabled
    if (this.autoRunEnabled) {
      // Simple forward/backward run
      moveZ = this.autoRunDirection;
      autoSprint = true;
    } else {
      if (this.isActionKeyDown("moveForward")) moveZ += 1;
      if (this.isActionKeyDown("moveBack")) moveZ -= 1;
      if (this.isActionKeyDown("moveRight")) moveX += 1;
      if (this.isActionKeyDown("moveLeft")) moveX -= 1;
    }

    const len = Math.hypot(moveX, moveZ);
    if (len > 0) {
      moveX /= len;
      moveZ /= len;
    }

    const currentCrouch = this.isActionKeyDown("crouch");
    const currentJump = this.isActionKeyDown("jump");
    const currentDash = false;

    const crouchPressed = currentCrouch && !this.prevCrouchState;
    const crouchReleased = !currentCrouch && this.prevCrouchState;
    const jumpPressed = currentJump && !this.prevJumpState;
    const dashPressed = currentDash && !this.prevDashState;

    this.prevCrouchState = currentCrouch;
    this.prevJumpState = currentJump;
    this.prevDashState = currentDash;

    const aimDir = new THREE.Vector3(0, 0, -1);
    aimDir.applyQuaternion(this.camera.quaternion);

    return {
      moveX,
      moveZ,
      yaw: this.yaw,
      pitch: this.pitch,
      sprint: autoSprint || this.sprintToggle,
      crouchPressed,
      crouchReleased,
      crouchHeld: currentCrouch,
      jumpPressed,
      dashPressed,
      firing: this.isMouseDown && document.pointerLockElement === this.canvas,
      aiming: this.isRightMouseDown && document.pointerLockElement === this.canvas,
      aimDir
    };
  }

  public isPointerLocked(): boolean {
    return document.pointerLockElement === this.canvas;
  }

  public applyRecoil(pitchAmount: number, yawAmount: number = 0, returnSpeed: number = 10): void {
    this.recoilPitch += pitchAmount;
    this.recoilYaw += yawAmount;
    this.recoilReturnSpeed = returnSpeed;
    
    this.pitch += pitchAmount;
    this.yaw += yawAmount;
    this.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.pitch));
  }

  public updateRecoil(dt: number): void {
    if (Math.abs(this.recoilPitch) > 0.0001 || Math.abs(this.recoilYaw) > 0.0001) {
      const recovery = this.recoilReturnSpeed * dt;
      
      const pitchRecovery = Math.min(Math.abs(this.recoilPitch), recovery);
      this.recoilPitch -= Math.sign(this.recoilPitch) * pitchRecovery;
      this.pitch -= Math.sign(this.recoilPitch) * pitchRecovery * 0.7;
      
      const yawRecovery = Math.min(Math.abs(this.recoilYaw), recovery * 0.5);
      this.recoilYaw -= Math.sign(this.recoilYaw) * yawRecovery;
      this.yaw -= Math.sign(this.recoilYaw) * yawRecovery * 0.5;
      
      this.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.pitch));
    }
  }

  public resetRecoil(): void {
    this.recoilPitch = 0;
    this.recoilYaw = 0;
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    this.canvas.removeEventListener("click", this.handleCanvasClick);
    this.canvas.removeEventListener("contextmenu", this.handleContextMenu);
    this.canvas.removeEventListener("mousedown", this.handleMouseDown);
    this.canvas.removeEventListener("mouseup", this.handleMouseUp);
    document.removeEventListener("mousemove", this.handleMouseMove);
    document.removeEventListener("keydown", this.handleKeyDown);
    document.removeEventListener("keyup", this.handleKeyUp);
    document.removeEventListener("wheel", this.handleWheel);
  }
}
