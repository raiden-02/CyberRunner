import * as THREE from "three";
import { ATTACHMENT_DEFINITIONS, resolveWeaponDefinition, type WeaponDefinition, type WeaponFamily } from "./definitions.js";
import { WeaponViewModel } from "./weapon-viewmodel.js";

interface WeaponPlacement {
  scale: number;
  position: THREE.Vector3;
}

// Third person weapon placement - positioned at shoulder height, in front of player
// X: right offset from center, Y: vertical offset from shoulder, Z: forward offset
function getWeaponPlacement(family: WeaponFamily): WeaponPlacement {
  switch (family) {
    case "Pistol":
    case "MachinePistol":
      return { scale: 0.6, position: new THREE.Vector3(0.18, -0.08, 0.25) };
    case "SMG":
      return { scale: 0.7, position: new THREE.Vector3(0.16, -0.1, 0.28) };
    case "AssaultRifle":
    case "DMR":
      return { scale: 0.8, position: new THREE.Vector3(0.14, -0.12, 0.32) };
    case "Shotgun":
      return { scale: 0.82, position: new THREE.Vector3(0.16, -0.1, 0.28) };
    case "LMG":
      return { scale: 0.9, position: new THREE.Vector3(0.14, -0.14, 0.34) };
    case "Sniper":
      return { scale: 0.88, position: new THREE.Vector3(0.14, -0.12, 0.36) };
    case "RocketLauncher":
    case "Launcher":
      return { scale: 0.95, position: new THREE.Vector3(0.2, -0.06, 0.26) };
    case "GrenadeLauncher":
      return { scale: 0.82, position: new THREE.Vector3(0.18, -0.1, 0.28) };
    case "Melee":
      return { scale: 0.65, position: new THREE.Vector3(0.2, -0.05, 0.18) };
    default:
      return { scale: 0.8, position: new THREE.Vector3(0.14, -0.12, 0.32) };
  }
}

export class ThirdPersonWeaponView {
  private playerRoot: THREE.Object3D;
  private virtualCamera: THREE.Object3D;
  private pitchContainer: THREE.Object3D;
  private viewModel?: WeaponViewModel;
  private currentWeaponId?: string;

  constructor(playerMesh: THREE.Object3D) {
    this.playerRoot = playerMesh;
    this.virtualCamera = new THREE.Object3D();
    this.pitchContainer = new THREE.Object3D();
    // Position at chest/hand height where weapon is held (upper torso Y=0.42)
    this.virtualCamera.position.set(0, 0.40, 0);
    this.playerRoot.add(this.virtualCamera);
    this.virtualCamera.add(this.pitchContainer);
  }

  public switchWeapon(weaponId: string): void {
    if (this.currentWeaponId === weaponId) return;
    const def = resolveWeaponDefinition(weaponId);
    if (!def) return;

    if (this.viewModel) {
      this.pitchContainer.remove(this.viewModel.viewRoot);
    }
    this.viewModel = this.buildViewModel(def);
    this.pitchContainer.add(this.viewModel.viewRoot);
    this.currentWeaponId = def.id;
  }

  public updateLookDirection(_yaw: number, pitch: number): void {
    this.pitchContainer.rotation.x = pitch;
  }

  public getCurrentWeaponId(): string | undefined {
    return this.currentWeaponId;
  }

  public setVisible(visible: boolean): void {
    if (this.viewModel) {
      this.viewModel.setVisible(visible);
    }
    this.virtualCamera.visible = visible;
  }

  public dispose(): void {
    if (this.viewModel) {
      this.pitchContainer.remove(this.viewModel.viewRoot);
      this.viewModel = undefined;
    }
    this.virtualCamera.parent?.remove(this.virtualCamera);
  }

  private buildViewModel(def: WeaponDefinition): WeaponViewModel {
    const attachments = def.attachments.map((id) => ATTACHMENT_DEFINITIONS[id]).filter(Boolean);
    const viewModel = new WeaponViewModel(def, attachments, { thirdPerson: true });
    const placement = getWeaponPlacement(def.family);
    viewModel.viewRoot.scale.setScalar(placement.scale);
    viewModel.viewRoot.position.copy(placement.position);
    viewModel.viewRoot.rotation.set(0, 0, 0);
    return viewModel;
  }
}
