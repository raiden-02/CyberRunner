import * as THREE from "three";

// Constants (keep in sync with server)
const MOVE_SPEED = 5;
const CAPSULE_HALF = 0.9;
const CAPSULE_RADIUS = 0.35;
const CENTER_TO_FOOT = CAPSULE_HALF + CAPSULE_RADIUS;
const EYE_HEIGHT = 1.6;
const EYE_FROM_CENTER = EYE_HEIGHT - CENTER_TO_FOOT;

export class LocalPlayer {
  private camera: THREE.PerspectiveCamera;
  private predictedPos: THREE.Vector3;
  
  // Health state
  public health = 100;
  public maxHealth = 100;
  public isDead = false;
  public respawnTime = 0;
  public isReloading = false;

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
    this.predictedPos = new THREE.Vector3(0, EYE_HEIGHT, 0);
  }

  public update(dt: number, keys: Record<string, boolean>, yaw: number): void {
    if (this.isDead) return;

    // Client-side prediction
    let forward = 0, strafe = 0;
    if (keys["KeyW"]) forward += 1;
    if (keys["KeyS"]) forward -= 1;
    if (keys["KeyD"]) strafe += 1;
    if (keys["KeyA"]) strafe -= 1;

    const len = Math.hypot(strafe, forward);
    if (len > 0) {
      strafe /= len;
      forward /= len;
    }

    const cos = Math.cos(yaw), sin = Math.sin(yaw);
    const wx = strafe * cos - forward * sin;
    const wz = -strafe * sin - forward * cos;

    this.predictedPos.x += wx * MOVE_SPEED * dt;
    this.predictedPos.z += wz * MOVE_SPEED * dt;
  }

  public reconcileWithServer(serverX: number, serverY: number, serverZ: number): void {
    const authoritative = new THREE.Vector3(serverX, serverY + EYE_FROM_CENTER, serverZ);
    this.predictedPos.lerp(authoritative, 0.1);
  }

  public applyToCamera(): void {
    this.camera.position.copy(this.predictedPos);
  }

  public updateHealth(newHealth: number, maxHealth: number, isDead: boolean, respawnTime: number): void {
    this.health = newHealth;
    this.maxHealth = maxHealth;
    this.isDead = isDead;
    this.respawnTime = respawnTime;
  }
}
