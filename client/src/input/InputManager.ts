import * as THREE from "three";
import { SettingsManager, type KeybindSettings } from "../settings/SettingsManager.js";

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

  private keybinds: KeybindSettings;
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
  public onDebugDamage?: () => void;
  public onToggleDebug?: () => void;
  
  public onSpikeInteract?: () => void;
  public onSpikeCancel?: () => void;

  private disposed = false;

  public isKeyDown(code: string): boolean {
    return !!this.keys[code];
  }

  constructor(canvas: HTMLCanvasElement, camera: THREE.Camera) {
    this.canvas = canvas;
    this.camera = camera;
    this.keybinds = SettingsManager.getInstance().getKeybinds();
    this.setupEventListeners();
    
    SettingsManager.getInstance().addChangeListener(() => {
      this.updateKeybinds();
    });
  }

  updateKeybinds(): void {
    this.keybinds = SettingsManager.getInstance().getKeybinds();
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

  private setupEventListeners(): void {
    this.canvas.addEventListener("click", this.handleCanvasClick);
    this.canvas.addEventListener("contextmenu", this.handleContextMenu);
    this.canvas.addEventListener("mousedown", this.handleMouseDown);
    this.canvas.addEventListener("mouseup", this.handleMouseUp);
    document.addEventListener("mousemove", this.handleMouseMove);
    document.addEventListener("keydown", this.handleKeyDown);
    document.addEventListener("keyup", this.handleKeyUp);
  }

  private handleContextMenu = (e: MouseEvent): void => {
    e.preventDefault();
  };

  private onKeyDown(e: KeyboardEvent): void {
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Tab"].includes(e.code)) {
      e.preventDefault();
    }

    const wasDown = !!this.keys[e.code];
    this.keys[e.code] = true;

    if ((e.code === this.keybinds.sprint || e.code === "ShiftRight") && !wasDown) {
      this.sprintToggle = !this.sprintToggle;
    }

    if (this.onWeaponSwitch) {
      if (e.code === this.keybinds.primaryWeapon) {
        this.onWeaponSwitch("primary");
      } else if (e.code === this.keybinds.secondaryWeapon) {
        this.onWeaponSwitch("secondary");
      } else if (e.code === this.keybinds.toggleWeapon) {
        this.onWeaponSwitch("toggle");
      }
    }

    if (e.code === this.keybinds.reload && this.onReload) {
      this.onReload();
    }

    if (e.code === "KeyT" && this.onDebugDamage) {
      this.onDebugDamage();
    }

    if (e.code === "F3" && this.onToggleDebug) {
      this.onToggleDebug();
    }

    if (e.code === this.keybinds.interact && !wasDown && this.onSpikeInteract) {
      this.onSpikeInteract();
    }
  }

  private onKeyUp(e: KeyboardEvent): void {
    if (e.code === "Tab") {
      e.preventDefault();
    }
    this.keys[e.code] = false;

    if (e.code === this.keybinds.interact && this.onSpikeCancel) {
      this.onSpikeCancel();
    }
  }

  public getState(): InputState {
    let moveZ = 0, moveX = 0;
    if (this.keys[this.keybinds.moveForward]) moveZ += 1;
    if (this.keys[this.keybinds.moveBack]) moveZ -= 1;
    if (this.keys[this.keybinds.moveRight]) moveX += 1;
    if (this.keys[this.keybinds.moveLeft]) moveX -= 1;

    const len = Math.hypot(moveX, moveZ);
    if (len > 0) {
      moveX /= len;
      moveZ /= len;
    }

    const currentCrouch = this.keys[this.keybinds.crouch] || this.keys["ControlLeft"] || false;
    const currentJump = this.keys[this.keybinds.jump] || false;
    const currentDash = this.keys[this.keybinds.toggleWeapon] || false;

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
      sprint: this.sprintToggle,
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
  }
}
