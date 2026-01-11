import * as THREE from "three";

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
  aimDir: THREE.Vector3;
}

export class InputManager {
  private canvas: HTMLCanvasElement;
  private camera: THREE.Camera;
  
  private keys: Record<string, boolean> = {};
  private sprintToggle = false;
  private isMouseDown = false;
  
  public yaw = 0;
  public pitch = 0;
  
  // Edge detection state
  private prevCrouchState = false;
  private prevJumpState = false;
  private prevDashState = false;

  // Weapon switching callback
  public onWeaponSwitch?: (weaponId: string) => void;
  public onReload?: () => void;
  public onDebugDamage?: () => void;
  public onToggleDebug?: () => void;

  private disposed = false;

  // Expose raw key state for client-side prediction
  public isKeyDown(code: string): boolean {
    return !!this.keys[code];
  }

  constructor(canvas: HTMLCanvasElement, camera: THREE.Camera) {
    this.canvas = canvas;
    this.camera = camera;
    this.setupEventListeners();
  }

  // Store handler refs so we can remove them in dispose()
  private handleCanvasClick = (): void => {
    this.canvas.focus();
    this.canvas.requestPointerLock();
  };

  private handleMouseDown = (e: MouseEvent): void => {
    if (e.button === 0 && document.pointerLockElement === this.canvas) {
      this.isMouseDown = true;
    }
  };

  private handleMouseUp = (e: MouseEvent): void => {
    if (e.button === 0) {
      this.isMouseDown = false;
    }
  };

  private handleMouseMove = (e: MouseEvent): void => {
    if (document.pointerLockElement === this.canvas) {
      this.yaw -= (e.movementX || 0) * 0.002;
      this.pitch -= (e.movementY || 0) * 0.002;
      this.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.pitch));
    }
  };

  private handleKeyDown = (e: KeyboardEvent): void => this.onKeyDown(e);
  private handleKeyUp = (e: KeyboardEvent): void => this.onKeyUp(e);

  private setupEventListeners(): void {
    // Pointer lock
    this.canvas.addEventListener("click", this.handleCanvasClick);

    // Mouse buttons
    this.canvas.addEventListener("mousedown", this.handleMouseDown);

    this.canvas.addEventListener("mouseup", this.handleMouseUp);

    // Mouse movement
    document.addEventListener("mousemove", this.handleMouseMove);

    // Keyboard
    document.addEventListener("keydown", this.handleKeyDown);
    document.addEventListener("keyup", this.handleKeyUp);
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) {
      e.preventDefault();
    }

    const wasDown = !!this.keys[e.code];
    this.keys[e.code] = true;

    // Sprint toggle
    if ((e.code === "ShiftLeft" || e.code === "ShiftRight") && !wasDown) {
      this.sprintToggle = !this.sprintToggle;
    }

    // Weapon switching
    const weaponKeys: Record<string, string> = {
      "Digit1": "AR_1",
      "Digit2": "Pistol_1",
      "Digit3": "AR_2",
      "Digit4": "Sniper_1"
    };

    if (weaponKeys[e.code] && this.onWeaponSwitch) {
      this.onWeaponSwitch(weaponKeys[e.code]);
    }

    // Reload
    if (e.code === "KeyR" && this.onReload) {
      this.onReload();
    }

    // Debug damage
    if (e.code === "KeyT" && this.onDebugDamage) {
      this.onDebugDamage();
    }

    // Toggle debug visuals
    if (e.code === "F3" && this.onToggleDebug) {
      this.onToggleDebug();
    }
  }

  private onKeyUp(e: KeyboardEvent): void {
    this.keys[e.code] = false;
  }

  public getState(): InputState {
    // Movement
    let moveZ = 0, moveX = 0;
    if (this.keys["KeyW"]) moveZ += 1;
    if (this.keys["KeyS"]) moveZ -= 1;
    if (this.keys["KeyD"]) moveX += 1;
    if (this.keys["KeyA"]) moveX -= 1;

    const len = Math.hypot(moveX, moveZ);
    if (len > 0) {
      moveX /= len;
      moveZ /= len;
    }

    // Edge detection
    const currentCrouch = this.keys["KeyC"] || this.keys["ControlLeft"] || false;
    const currentJump = this.keys["Space"] || false;
    const currentDash = this.keys["KeyQ"] || false;

    const crouchPressed = currentCrouch && !this.prevCrouchState;
    const crouchReleased = !currentCrouch && this.prevCrouchState;
    const jumpPressed = currentJump && !this.prevJumpState;
    const dashPressed = currentDash && !this.prevDashState;

    this.prevCrouchState = currentCrouch;
    this.prevJumpState = currentJump;
    this.prevDashState = currentDash;

    // Aim direction
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
    this.canvas.removeEventListener("mousedown", this.handleMouseDown);
    this.canvas.removeEventListener("mouseup", this.handleMouseUp);
    document.removeEventListener("mousemove", this.handleMouseMove);
    document.removeEventListener("keydown", this.handleKeyDown);
    document.removeEventListener("keyup", this.handleKeyUp);
  }
}
