import * as THREE from "three";
import { ThirdPersonWeaponView } from "../weapons/weapon-loader.js";

const CAPSULE_HALF = 0.9;
const CAPSULE_RADIUS = 0.35;

interface RemotePlayerData {
  root: THREE.Group;
  body: THREE.Mesh;
  debugCapsule: THREE.Mesh;
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
      p.debugCapsule.visible = enabled;
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
    // Server sends capsule center. Keep our root aligned to the collider center.
    const targetPos = new THREE.Vector3(player.x, player.y, player.z);
    const targetRotY = player.rotationY || 0;

    let data = this.players.get(sessionId);

    if (!data) {
      // Root group positioned at the capsule center (server-authoritative)
      const root = new THREE.Group();

      // Visual body = collider capsule (matches server dimensions exactly)
      const capsuleGeom = new THREE.CapsuleGeometry(CAPSULE_RADIUS, CAPSULE_HALF * 2, 6, 12);

      const bodyMat = new THREE.MeshStandardMaterial({ color: 0x00ff88, roughness: 0.85, metalness: 0.0 });
      const body = new THREE.Mesh(capsuleGeom, bodyMat);
      body.castShadow = false;
      body.receiveShadow = false;

      // Optional wireframe overlay for debugging (toggle with F3)
      const debugMat = new THREE.MeshBasicMaterial({ color: 0xff00ff, wireframe: true });
      const debugCapsule = new THREE.Mesh(capsuleGeom, debugMat);
      debugCapsule.visible = this.debugEnabled;

      root.add(body);
      root.add(debugCapsule);
      root.position.copy(targetPos);
      root.rotation.y = targetRotY;
      this.scene.add(root);

      // Create weapon view
      const weaponView = new ThirdPersonWeaponView(root);
      if (player.equippedWeapon) {
        weaponView.switchWeapon(player.equippedWeapon).catch(console.error);
      }

      data = { root, body, debugCapsule, weaponView, targetPos, targetRotY };
      this.players.set(sessionId, data);
    } else {
      // Update target
      data.targetPos.copy(targetPos);
      data.targetRotY = targetRotY;

      // Update weapon if changed
      if (player.equippedWeapon && data.weaponView.getCurrentWeaponId() !== player.equippedWeapon) {
        data.weaponView.switchWeapon(player.equippedWeapon).catch(console.error);
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

  private interpolate(dt: number): void {
    const alpha = Math.min(1, dt * 10);

    for (const data of this.players.values()) {
      data.root.position.lerp(data.targetPos, alpha);
      data.root.rotation.y = THREE.MathUtils.lerp(
        data.root.rotation.y,
        data.targetRotY,
        alpha
      );
    }
  }
}
