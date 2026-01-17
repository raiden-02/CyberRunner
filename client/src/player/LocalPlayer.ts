import * as THREE from "three";

// Constants - match server values
const MOVE_SPEED = 5.0;
const SPRINT_SPEED = 7.5;
const AIR_CONTROL = 0.3; // Reduced control in air
const GRAVITY = 9.81;
const JUMP_IMPULSE = 5.5;

// Capsule dimensions for eye height calculation
const CAPSULE_HALF = 0.9;
const CAPSULE_RADIUS = 0.35;
const CENTER_TO_FOOT = CAPSULE_HALF + CAPSULE_RADIUS;
const EYE_HEIGHT = 1.6;
const EYE_FROM_CENTER = EYE_HEIGHT - CENTER_TO_FOOT;

/**
 * Simple velocity-based local player.
 * No physics engine - just smooth movement that runs every frame.
 */
export class LocalPlayer {
  private camera: THREE.PerspectiveCamera;

  // Position is the capsule CENTER (server-authoritative)
  private capsuleCenter = new THREE.Vector3(0, CENTER_TO_FOOT, 0);
  private velocity = new THREE.Vector3(0, 0, 0);

  // For smooth visual blending toward server
  private visualPos = new THREE.Vector3(0, EYE_HEIGHT, 0);
  private lastGrounded = true;
  private lastInputMag = 0;

  // Health state
  public health = 100;
  public maxHealth = 100;
  public isDead = false;
  public respawnTime = 0;
  public isReloading = false;

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
  }

  /**
   * Initialize position (called after receiving first server state).
   */
  public setInitialPosition(x: number, y: number, z: number): void {
    this.capsuleCenter.set(x, y, z);
    this.visualPos.set(x, y + EYE_FROM_CENTER, z);
    this.velocity.set(0, 0, 0);
  }

  /**
   * Apply input and update position. Called EVERY FRAME for smooth movement.
   */
  public update(
    dt: number,
    input: {
      moveX: number;
      moveZ: number;
      yaw: number;
      sprint: boolean;
      jump: boolean;
    }
  ): void {
    if (this.isDead) return;

    const grounded = this.capsuleCenter.y <= CENTER_TO_FOOT + 0.1;

    // Calculate movement direction from input
    const forwardX = -Math.sin(input.yaw);
    const forwardZ = -Math.cos(input.yaw);
    const rightX = Math.cos(input.yaw);
    const rightZ = -Math.sin(input.yaw);

    // Raw input direction (not normalized - counter-strafing cancels out)
    const inputDirX = input.moveZ * forwardX + input.moveX * rightX;
    const inputDirZ = input.moveZ * forwardZ + input.moveX * rightZ;
    const inputMag = Math.hypot(inputDirX, inputDirZ);
    this.lastGrounded = grounded;
    this.lastInputMag = inputMag;

    // GROUND: Instant velocity - no acceleration, no momentum
    // This gives CoD/CS feel: press = move, release = stop, counter-strafe = stop
    if (grounded) {
      if (inputMag < 0.01) {
        // No input or counter-strafing (A+D) = instant stop
        this.velocity.x = 0;
        this.velocity.z = 0;
      } else {
        // Has input = instant velocity in that direction
        const speed = input.sprint ? SPRINT_SPEED : MOVE_SPEED;
        const normX = inputDirX / inputMag;
        const normZ = inputDirZ / inputMag;
        this.velocity.x = normX * speed;
        this.velocity.z = normZ * speed;
      }
    } else {
      // AIR: Some momentum, reduced control
      const speed = input.sprint ? SPRINT_SPEED : MOVE_SPEED;
      const targetVelX = inputMag > 0.01 ? (inputDirX / inputMag) * speed : 0;
      const targetVelZ = inputMag > 0.01 ? (inputDirZ / inputMag) * speed : 0;
      
      // Blend toward target with reduced air control
      const airBlend = AIR_CONTROL * dt * 10;
      this.velocity.x += (targetVelX - this.velocity.x) * airBlend;
      this.velocity.z += (targetVelZ - this.velocity.z) * airBlend;
    }

    // Gravity
    if (!grounded) {
      this.velocity.y -= GRAVITY * dt;
    } else if (this.velocity.y < 0) {
      this.velocity.y = 0;
    }

    // Jump
    if (input.jump && grounded) {
      this.velocity.y = JUMP_IMPULSE;
    }

    // Apply velocity to position
    this.capsuleCenter.x += this.velocity.x * dt;
    this.capsuleCenter.y += this.velocity.y * dt;
    this.capsuleCenter.z += this.velocity.z * dt;

    // Simple ground collision (y >= CENTER_TO_FOOT)
    // Use small tolerance to avoid micro-bouncing with server
    const groundY = CENTER_TO_FOOT;
    if (this.capsuleCenter.y < groundY + 0.01) {
      this.capsuleCenter.y = groundY;
      if (this.velocity.y < 0) {
        this.velocity.y = 0;
      }
    }

    // Update visual position to follow capsule center (instant, no lag here)
    this.visualPos.set(
      this.capsuleCenter.x,
      this.capsuleCenter.y + EYE_FROM_CENTER,
      this.capsuleCenter.z
    );
  }

  /**
   * Blend toward server's authoritative position.
   * Called when we receive server state.
   */
  public reconcileWithServer(
    serverX: number,
    serverY: number,
    serverZ: number,
    dt: number
  ): void {
    // Horizontal error (X/Z)
    const hErrorX = serverX - this.capsuleCenter.x;
    const hErrorZ = serverZ - this.capsuleCenter.z;
    const hError = Math.hypot(hErrorX, hErrorZ);

    // Vertical error (Y)
    const vError = Math.abs(serverY - this.capsuleCenter.y);

    // Total error for snap detection
    const totalError = Math.hypot(hError, vError);

    if (totalError > 2.0) {
      // Large error (teleport, respawn): snap immediately
      this.capsuleCenter.set(serverX, serverY, serverZ);
      this.velocity.set(0, 0, 0);
    } else {
      // Blend X/Z with stronger correction on ground to avoid "car" drift
      if (this.lastGrounded) {
        if (this.lastInputMag < 0.01) {
          // No input or counter-strafe: snap small drift quickly
          if (hError > 0.02) {
            this.capsuleCenter.x = serverX;
            this.capsuleCenter.z = serverZ;
          }
        } else if (hError > 0.02) {
          const hBlend = Math.min(1, dt * 25);
          this.capsuleCenter.x += hErrorX * hBlend;
          this.capsuleCenter.z += hErrorZ * hBlend;
        }
      } else if (hError > 0.05) {
        const hBlend = Math.min(1, dt * (5 + hError * 10));
        this.capsuleCenter.x += hErrorX * hBlend;
        this.capsuleCenter.z += hErrorZ * hBlend;
      }

      // Blend Y more gently to avoid bouncing when grounded
      // Only correct Y if error is significant (jumping, falling, or real desync)
      if (vError > 0.15) {
        const vBlend = Math.min(1, dt * 3); // Slower vertical correction
        this.capsuleCenter.y += (serverY - this.capsuleCenter.y) * vBlend;
      } else if (vError > 0.02) {
        // Very small vertical blend for tiny discrepancies
        const vBlend = Math.min(1, dt * 1);
        this.capsuleCenter.y += (serverY - this.capsuleCenter.y) * vBlend;
      }
      // If vError < 0.02, don't correct Y (avoid micro-bouncing)
    }

    // Visual always follows capsule center
    this.visualPos.set(
      this.capsuleCenter.x,
      this.capsuleCenter.y + EYE_FROM_CENTER,
      this.capsuleCenter.z
    );
  }

  /**
   * Get current visual position (eye level) for camera.
   */
  public get position(): THREE.Vector3 {
    return this.visualPos.clone();
  }

  /**
   * Get capsule center for debugging/comparison.
   */
  public getCapsuleCenter(): { x: number; y: number; z: number } {
    return { x: this.capsuleCenter.x, y: this.capsuleCenter.y, z: this.capsuleCenter.z };
  }

  /**
   * Apply visual position to camera.
   */
  public applyToCamera(): void {
    this.camera.position.copy(this.visualPos);
  }

  public updateHealth(newHealth: number, maxHealth: number, isDead: boolean, respawnTime: number): void {
    this.health = newHealth;
    this.maxHealth = maxHealth;
    this.isDead = isDead;
    this.respawnTime = respawnTime;
  }
}
