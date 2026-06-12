import * as THREE from "three";
import { HITBOX } from "@shared/physics/constants.js";
import { WORLD } from "../theme.js";
import { ThirdPersonWeaponView } from "../weapons/third-person-view.js";
import { resolveWeaponDefinition } from "../weapons/definitions.js";

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
  nameSprite: THREE.Sprite;
  solidMats: THREE.MeshStandardMaterial[];
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
      this.applyDebugStyle(p);
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
      const { parts: bodyParts, materials: solidMats } = this.createBodyParts();
      const debugGroup = this.createDebugHitboxes();
      const nameSprite = this.createNameSprite(player.displayName || sessionId.slice(0, 8));

      root.add(bodyParts.head);
      root.add(bodyParts.upperTorso);
      root.add(bodyParts.lowerTorso);
      root.add(bodyParts.leftArm);
      root.add(bodyParts.rightArm);
      root.add(bodyParts.leftLeg);
      root.add(bodyParts.rightLeg);
      root.add(debugGroup);
      root.add(nameSprite);

      root.position.copy(targetPos);
      root.rotation.y = targetRotY;
      this.scene.add(root);

      const weaponView = new ThirdPersonWeaponView(root);
      if (player.equippedWeapon) {
        weaponView.switchWeapon(player.equippedWeapon);
      }

      data = { root, bodyParts, debugGroup, nameSprite, solidMats, weaponView, targetPos, targetRotY };
      this.applyDebugStyle(data);
      this.players.set(sessionId, data);
    } else {
      // Dead zone: ignore sub-millimeter position changes to prevent chasing
      // RAPIER settling micro-oscillations that cause rubber-band on stop.
      if (data.targetPos.distanceToSquared(targetPos) > 0.005 * 0.005) {
        data.targetPos.copy(targetPos);
      }
      data.targetRotY = targetRotY;

      if (player.equippedWeapon) {
        const resolved = resolveWeaponDefinition(player.equippedWeapon)?.id || player.equippedWeapon;
        if (data.weaponView.getCurrentWeaponId() !== resolved) {
          data.weaponView.switchWeapon(player.equippedWeapon);
        }
      }

      if (player.pitch !== undefined) {
        data.weaponView.updateLookDirection(targetRotY, player.pitch);
      }

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
        const map = (data.nameSprite.material as THREE.SpriteMaterial).map;
        map?.dispose();
        (data.nameSprite.material as THREE.SpriteMaterial).dispose();
        this.players.delete(sid);
      }
    }
  }

  /**
   * Smooth remote player positions using fast exponential lerp.
   * Position lerp is aggressive (dt*50) to minimize visual lag for hit registration.
   * Rotation uses a dead zone to prevent constant micro-corrections from
   * quantized server rotation values.
   */
  private interpolate(dt: number): void {
    const posAlpha = Math.min(1, dt * 50);
    const rotAlpha = Math.min(1, dt * 20);

    for (const data of this.players.values()) {
      const distance = data.root.position.distanceTo(data.targetPos);
      if (distance < 0.03) {
        data.root.position.copy(data.targetPos);
      } else {
        data.root.position.lerp(data.targetPos, posAlpha);
      }

      let rotDiff = data.targetRotY - data.root.rotation.y;
      // Normalize to [-PI, PI]
      while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
      while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;

      if (Math.abs(rotDiff) < 0.005) {
        data.root.rotation.y = data.targetRotY;
      } else {
        data.root.rotation.y += rotDiff * rotAlpha;
      }
    }
  }

  private applyDebugStyle(data: RemotePlayerData): void {
    data.debugGroup.visible = this.debugEnabled;
    data.nameSprite.visible = this.debugEnabled;
    for (const mat of data.solidMats) {
      mat.transparent = this.debugEnabled;
      mat.opacity = this.debugEnabled ? 0.35 : 1;
      mat.needsUpdate = true;
    }
  }

  private createNameSprite(name: string): THREE.Sprite {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "rgba(26, 24, 20, 0.82)";
    ctx.fillRect(0, 0, 256, 64);
    ctx.font = "bold 26px Segoe UI, system-ui, sans-serif";
    ctx.fillStyle = "#ede6d9";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(name.slice(0, 16), 128, 32);
    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(1.3, 0.32, 1);
    sprite.position.y = 1.85;
    sprite.visible = this.debugEnabled;
    return sprite;
  }

  private createBodyParts(): { parts: BodyParts; materials: THREE.MeshStandardMaterial[] } {
    const bodyMat = new THREE.MeshStandardMaterial({ color: WORLD.playerBody, roughness: 0.85, metalness: 0.0 });
    const headMat = new THREE.MeshStandardMaterial({ color: WORLD.playerHead, roughness: 0.8, metalness: 0.0 });
    const limbMat = new THREE.MeshStandardMaterial({ color: WORLD.playerLimb, roughness: 0.85, metalness: 0.0 });

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

    return {
      parts: { head, upperTorso, lowerTorso, leftArm, rightArm, leftLeg, rightLeg },
      materials: [bodyMat, headMat, limbMat],
    };
  }

  private createDebugHitboxes(): THREE.Group {
    const group = new THREE.Group();
    const headMat = new THREE.MeshBasicMaterial({ color: 0xc45c3a, wireframe: true });
    const torsoMat = new THREE.MeshBasicMaterial({ color: 0xd4893a, wireframe: true });
    const armMat = new THREE.MeshBasicMaterial({ color: 0x4a8b8a, wireframe: true });
    const legMat = new THREE.MeshBasicMaterial({ color: 0x9a9286, wireframe: true });

    const headGeom = new THREE.SphereGeometry(HITBOX.Head.radius, 8, 6);
    const head = new THREE.Mesh(headGeom, headMat);
    head.position.y = HITBOX.Head.offsetY;
    group.add(head);

    const upperTorsoGeom = new THREE.BoxGeometry(
      HITBOX.UpperTorso.halfExtents.x * 2,
      HITBOX.UpperTorso.halfExtents.y * 2,
      HITBOX.UpperTorso.halfExtents.z * 2
    );
    const upperTorso = new THREE.Mesh(upperTorsoGeom, torsoMat);
    upperTorso.position.y = HITBOX.UpperTorso.offsetY;
    group.add(upperTorso);

    const lowerTorsoGeom = new THREE.BoxGeometry(
      HITBOX.LowerTorso.halfExtents.x * 2,
      HITBOX.LowerTorso.halfExtents.y * 2,
      HITBOX.LowerTorso.halfExtents.z * 2
    );
    const lowerTorso = new THREE.Mesh(lowerTorsoGeom, torsoMat);
    lowerTorso.position.y = HITBOX.LowerTorso.offsetY;
    group.add(lowerTorso);

    const armGeom = new THREE.CapsuleGeometry(HITBOX.Arm.radius, HITBOX.Arm.halfHeight * 2, 4, 4);
    const leftArm = new THREE.Mesh(armGeom, armMat);
    leftArm.position.set(-HITBOX.Arm.offsetX, HITBOX.Arm.offsetY, 0);
    group.add(leftArm);
    const rightArm = new THREE.Mesh(armGeom, armMat);
    rightArm.position.set(HITBOX.Arm.offsetX, HITBOX.Arm.offsetY, 0);
    group.add(rightArm);

    const legGeom = new THREE.CapsuleGeometry(HITBOX.Leg.radius, HITBOX.Leg.halfHeight * 2, 4, 4);
    const leftLeg = new THREE.Mesh(legGeom, legMat);
    leftLeg.position.set(-HITBOX.Leg.offsetX, HITBOX.Leg.offsetY, 0);
    group.add(leftLeg);
    const rightLeg = new THREE.Mesh(legGeom, legMat);
    rightLeg.position.set(HITBOX.Leg.offsetX, HITBOX.Leg.offsetY, 0);
    group.add(rightLeg);

    group.visible = this.debugEnabled;
    return group;
  }
}
