import * as THREE from "three";
import { ThirdPersonWeaponView } from "../weapons/third-person-view.js";
import { resolveWeaponDefinition } from "../weapons/definitions.js";

// Must match server hitbox dimensions
const HITBOX = {
  Head:       { radius: 0.16, offsetY: 0.50 },
  UpperTorso: { halfExtents: { x: 0.30, y: 0.17, z: 0.18 }, offsetY: 0.17 },
  LowerTorso: { halfExtents: { x: 0.28, y: 0.15, z: 0.16 }, offsetY: -0.15 },
  Arm:        { radius: 0.07, halfHeight: 0.22, offsetX: 0.38, offsetY: 0.10 },
  Leg:        { radius: 0.10, halfHeight: 0.30, offsetX: 0.12, offsetY: -0.60 },
};

interface BodyParts {
  head: THREE.Mesh;
  upperTorso: THREE.Mesh;
  lowerTorso: THREE.Mesh;
  leftArm: THREE.Mesh;
  rightArm: THREE.Mesh;
  leftLeg: THREE.Mesh;
  rightLeg: THREE.Mesh;
}

interface RemotePlayerData {
  root: THREE.Group;
  bodyParts: BodyParts;
  debugGroup: THREE.Group;
  weaponView: ThirdPersonWeaponView;
  targetPos: THREE.Vector3;
  targetRotY: number;
}

export class RemotePlayers {
  private scene: THREE.Scene;
  private players = new Map<string, RemotePlayerData>();
  private localPlayerId: string = "";
  private debugEnabled = false;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  public setDebugEnabled(enabled: boolean): void {
    this.debugEnabled = enabled;
    for (const p of this.players.values()) {
      p.debugGroup.visible = enabled;
    }
  }

  public setLocalPlayerId(id: string): void {
    this.localPlayerId = id;
  }

  public update(dt: number, playersState: any): number {
    const presentIds = new Set<string>();
    let count = 0;

    if (playersState && typeof playersState.forEach === "function") {
      playersState.forEach((player: any, sessionId: string) => {
        count++;
        if (!player) return;
        presentIds.add(sessionId);

        // Skip local player
        if (sessionId === this.localPlayerId) return;

        this.updateRemotePlayer(sessionId, player);
      });
    }

    // Remove disconnected players
    this.removeDisconnectedPlayers(presentIds);

    // Interpolate positions
    this.interpolate(dt);

    return count;
  }

  private updateRemotePlayer(sessionId: string, player: any): void {
    const targetPos = new THREE.Vector3(player.x, player.y, player.z);
    const targetRotY = player.rotationY || 0;

    let data = this.players.get(sessionId);

    if (!data) {
      const root = new THREE.Group();
      const bodyParts = this.createBodyParts();
      const debugGroup = this.createDebugHitboxes();
      debugGroup.visible = this.debugEnabled;

      // Add all body parts to root
      root.add(bodyParts.head);
      root.add(bodyParts.upperTorso);
      root.add(bodyParts.lowerTorso);
      root.add(bodyParts.leftArm);
      root.add(bodyParts.rightArm);
      root.add(bodyParts.leftLeg);
      root.add(bodyParts.rightLeg);
      root.add(debugGroup);

      root.position.copy(targetPos);
      root.rotation.y = targetRotY;
      this.scene.add(root);

      const weaponView = new ThirdPersonWeaponView(root);
      if (player.equippedWeapon) {
        weaponView.switchWeapon(player.equippedWeapon);
      }

      data = { root, bodyParts, debugGroup, weaponView, targetPos, targetRotY };
      this.players.set(sessionId, data);
    } else {
      // Update target
      data.targetPos.copy(targetPos);
      data.targetRotY = targetRotY;

      // Update weapon if changed
      if (player.equippedWeapon) {
        const resolved = resolveWeaponDefinition(player.equippedWeapon)?.id || player.equippedWeapon;
        if (data.weaponView.getCurrentWeaponId() !== resolved) {
          data.weaponView.switchWeapon(player.equippedWeapon);
        }
      }

      // Update weapon look direction
      if (player.pitch !== undefined) {
        data.weaponView.updateLookDirection(targetRotY, player.pitch);
      }

      // Handle visibility
      const isDead = player.isDead || false;
      data.root.visible = !isDead;
      data.weaponView.setVisible(!isDead);
    }
  }

  private removeDisconnectedPlayers(presentIds: Set<string>): void {
    for (const [sid, data] of this.players) {
      if (!presentIds.has(sid)) {
        this.scene.remove(data.root);
        data.weaponView.dispose();
        this.players.delete(sid);
      }
    }
  }

  /**
   * Interpolate remote player positions for smooth visuals.
   * 
   * Uses fast interpolation (dt*50) to minimize visual delay while preventing jitter.
   * At 60fps, this catches up to target position in ~1-2 frames (~17-33ms).
   * 
   * IMPORTANT: This delay must be accounted for in server-side lag compensation.
   * See: server/src/systems/lag-compensation.ts (CLIENT_INTERPOLATION_DELAY_MS)
   */
  private interpolate(dt: number): void {
    const alpha = Math.min(1, dt * 50);

    for (const data of this.players.values()) {
      const distance = data.root.position.distanceTo(data.targetPos);
      if (distance < 0.05) {
        // Snap to position if within 5cm to eliminate micro-jitter
        data.root.position.copy(data.targetPos);
      } else {
        data.root.position.lerp(data.targetPos, alpha);
      }
      
      const rotAlpha = Math.min(1, dt * 40);
      data.root.rotation.y = THREE.MathUtils.lerp(
        data.root.rotation.y,
        data.targetRotY,
        rotAlpha
      );
    }
  }

  private createBodyParts(): BodyParts {
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x00ff88, roughness: 0.85, metalness: 0.0 });
    const headMat = new THREE.MeshStandardMaterial({ color: 0x00ffaa, roughness: 0.8, metalness: 0.0 });
    const limbMat = new THREE.MeshStandardMaterial({ color: 0x00dd77, roughness: 0.85, metalness: 0.0 });

    // Head - sphere
    const headGeom = new THREE.SphereGeometry(HITBOX.Head.radius, 12, 8);
    const head = new THREE.Mesh(headGeom, headMat);
    head.position.y = HITBOX.Head.offsetY;

    // Upper torso - box
    const upperTorsoGeom = new THREE.BoxGeometry(
      HITBOX.UpperTorso.halfExtents.x * 2,
      HITBOX.UpperTorso.halfExtents.y * 2,
      HITBOX.UpperTorso.halfExtents.z * 2
    );
    const upperTorso = new THREE.Mesh(upperTorsoGeom, bodyMat);
    upperTorso.position.y = HITBOX.UpperTorso.offsetY;

    // Lower torso - box
    const lowerTorsoGeom = new THREE.BoxGeometry(
      HITBOX.LowerTorso.halfExtents.x * 2,
      HITBOX.LowerTorso.halfExtents.y * 2,
      HITBOX.LowerTorso.halfExtents.z * 2
    );
    const lowerTorso = new THREE.Mesh(lowerTorsoGeom, bodyMat);
    lowerTorso.position.y = HITBOX.LowerTorso.offsetY;

    // Arms - capsules
    const armGeom = new THREE.CapsuleGeometry(HITBOX.Arm.radius, HITBOX.Arm.halfHeight * 2, 4, 6);
    const leftArm = new THREE.Mesh(armGeom, limbMat);
    leftArm.position.set(-HITBOX.Arm.offsetX, HITBOX.Arm.offsetY, 0);
    const rightArm = new THREE.Mesh(armGeom, limbMat);
    rightArm.position.set(HITBOX.Arm.offsetX, HITBOX.Arm.offsetY, 0);

    // Legs - capsules
    const legGeom = new THREE.CapsuleGeometry(HITBOX.Leg.radius, HITBOX.Leg.halfHeight * 2, 4, 6);
    const leftLeg = new THREE.Mesh(legGeom, limbMat);
    leftLeg.position.set(-HITBOX.Leg.offsetX, HITBOX.Leg.offsetY, 0);
    const rightLeg = new THREE.Mesh(legGeom, limbMat);
    rightLeg.position.set(HITBOX.Leg.offsetX, HITBOX.Leg.offsetY, 0);

    return { head, upperTorso, lowerTorso, leftArm, rightArm, leftLeg, rightLeg };
  }

  private createDebugHitboxes(): THREE.Group {
    const group = new THREE.Group();
    const debugMat = new THREE.MeshBasicMaterial({ color: 0xff00ff, wireframe: true });

    // Head
    const headGeom = new THREE.SphereGeometry(HITBOX.Head.radius, 8, 6);
    const head = new THREE.Mesh(headGeom, debugMat);
    head.position.y = HITBOX.Head.offsetY;
    group.add(head);

    // Upper torso
    const upperTorsoGeom = new THREE.BoxGeometry(
      HITBOX.UpperTorso.halfExtents.x * 2,
      HITBOX.UpperTorso.halfExtents.y * 2,
      HITBOX.UpperTorso.halfExtents.z * 2
    );
    const upperTorso = new THREE.Mesh(upperTorsoGeom, debugMat);
    upperTorso.position.y = HITBOX.UpperTorso.offsetY;
    group.add(upperTorso);

    // Lower torso
    const lowerTorsoGeom = new THREE.BoxGeometry(
      HITBOX.LowerTorso.halfExtents.x * 2,
      HITBOX.LowerTorso.halfExtents.y * 2,
      HITBOX.LowerTorso.halfExtents.z * 2
    );
    const lowerTorso = new THREE.Mesh(lowerTorsoGeom, debugMat);
    lowerTorso.position.y = HITBOX.LowerTorso.offsetY;
    group.add(lowerTorso);

    // Arms
    const armGeom = new THREE.CapsuleGeometry(HITBOX.Arm.radius, HITBOX.Arm.halfHeight * 2, 4, 4);
    const leftArm = new THREE.Mesh(armGeom, debugMat);
    leftArm.position.set(-HITBOX.Arm.offsetX, HITBOX.Arm.offsetY, 0);
    group.add(leftArm);
    const rightArm = new THREE.Mesh(armGeom, debugMat);
    rightArm.position.set(HITBOX.Arm.offsetX, HITBOX.Arm.offsetY, 0);
    group.add(rightArm);

    // Legs
    const legGeom = new THREE.CapsuleGeometry(HITBOX.Leg.radius, HITBOX.Leg.halfHeight * 2, 4, 4);
    const leftLeg = new THREE.Mesh(legGeom, debugMat);
    leftLeg.position.set(-HITBOX.Leg.offsetX, HITBOX.Leg.offsetY, 0);
    group.add(leftLeg);
    const rightLeg = new THREE.Mesh(legGeom, debugMat);
    rightLeg.position.set(HITBOX.Leg.offsetX, HITBOX.Leg.offsetY, 0);
    group.add(rightLeg);

    return group;
  }
}
