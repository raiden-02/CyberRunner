import * as THREE from "three";
import { ATTACHMENT_DEFINITIONS, resolveWeaponDefinition, type WeaponDefinition } from "./definitions.js";
import { createWeapon, type BaseWeapon, type ShotRequest } from "./weapon-logic.js";
import { WeaponViewModel } from "./weapon-viewmodel.js";
import { ADSController } from "./controllers.js";
import type { BaseScopeOverlay } from "./scope-overlays.js";
import { WeaponCrosshair } from "./crosshairs.js";

export interface WeaponSystemCallbacks {
  onShotRequested?: (shot: ShotRequest) => void;
  onFireInput?: (firing: boolean, aimDir: { x: number; y: number; z: number }) => void;
  onWeaponSwitch?: (weaponId: string) => void;
  onReload?: (weaponId: string) => void;
}

export class WeaponSystem {
  private camera: THREE.PerspectiveCamera;
  private weapon?: BaseWeapon;
  private viewModel?: WeaponViewModel;
  private scopeOverlay?: BaseScopeOverlay;
  private crosshair: WeaponCrosshair;
  private currentDef?: WeaponDefinition;
  private adsController = new ADSController();
  private callbacks: WeaponSystemCallbacks;
  private isFiring = false;
  private isAiming = false;
  private prevFiring = false;
  private lastAdsAlpha = 0;

  constructor(camera: THREE.PerspectiveCamera, callbacks: WeaponSystemCallbacks = {}) {
    this.camera = camera;
    this.callbacks = callbacks;
    this.crosshair = new WeaponCrosshair();
  }

  public switchWeapon(weaponId: string): void {
    if (this.weapon?.id === weaponId) return;
    const def = resolveWeaponDefinition(weaponId);
    if (!def) return;

    this.disposeViewModel();
    this.disposeScopeOverlay();

    this.weapon = createWeapon(weaponId);
    this.currentDef = def;
    this.viewModel = this.buildViewModel(def);
    this.camera.add(this.viewModel.viewRoot);
    this.scopeOverlay = this.weapon.createScopeOverlay() ?? undefined;
    this.crosshair.setConfig(this.weapon.getCrosshairConfig());

    this.callbacks.onWeaponSwitch?.(def.id);
  }

  public setFiring(firing: boolean): void {
    this.isFiring = firing;
  }

  public setAiming(aiming: boolean): void {
    this.isAiming = aiming;
  }

  public startReload(now: number): void {
    if (!this.weapon) return;
    if (this.weapon.startReload(now)) {
      this.callbacks.onReload?.(this.weapon.id);
    }
  }

  public update(dt: number, now: number, aimDir: THREE.Vector3): void {
    if (!this.weapon || !this.viewModel) return;
    
    this.weapon.update(now);
    this.camera.updateMatrixWorld(true);
    this.viewModel.viewRoot.updateMatrixWorld(true);
    
    const adsAlpha = this.adsController.update(dt, this.isAiming, this.camera, this.viewModel, this.weapon.stats);
    this.lastAdsAlpha = adsAlpha;
    this.viewModel.setAdsReticleAlpha(adsAlpha);
    this.viewModel.update(dt, now, adsAlpha);

    if (this.scopeOverlay) {
      const threshold = this.scopeOverlay.getActivationThreshold();
      const scopeAlpha = adsAlpha > threshold ? (adsAlpha - threshold) / (1 - threshold) : 0;
      this.scopeOverlay.update(scopeAlpha);
      if (this.scopeOverlay.shouldHideWeapon()) {
        this.viewModel.setVisible(false);
      }
    }

    this.updateCrosshairVisibility();

    if (this.isFiring || this.prevFiring !== this.isFiring) {
      this.callbacks.onFireInput?.(this.isFiring, { x: aimDir.x, y: aimDir.y, z: aimDir.z });
    }
    this.prevFiring = this.isFiring;

    if (this.isFiring) {
      const shot = this.weapon.tryShoot(now);
      if (shot) {
        this.viewModel.applyRecoil(this.weapon.stats.recoil.kick);
        this.callbacks.onShotRequested?.(shot);
      }
    }
  }

  public getTargetFov(baseFov: number): number {
    if (!this.weapon) return baseFov;
    return THREE.MathUtils.lerp(baseFov, this.weapon.stats.ads.fov, this.lastAdsAlpha);
  }

  public setVisible(visible: boolean): void {
    if (!this.viewModel) return;
    if (visible && this.scopeOverlay?.shouldHideWeapon()) {
      this.viewModel.setVisible(false);
    } else {
      this.viewModel.setVisible(visible);
    }
  }

  public getCurrentWeaponId(): string | undefined {
    return this.weapon?.id;
  }

  public getActiveOpticId(): string | undefined {
    if (!this.currentDef) return undefined;
    return this.currentDef.attachments.find((id) => ATTACHMENT_DEFINITIONS[id]?.type === "optic");
  }

  public getAdsAlpha(): number {
    return this.lastAdsAlpha;
  }

  public isScopeActive(): boolean {
    return this.scopeOverlay !== undefined && this.lastAdsAlpha > 0.1;
  }

  public dispose(): void {
    this.disposeViewModel();
    this.disposeScopeOverlay();
    this.crosshair.dispose();
  }

  private updateCrosshairVisibility(): void {
    const hasOptic = !!this.getActiveOpticId();
    const scopeActive = this.scopeOverlay?.shouldHideWeapon() ?? false;
    const shouldHide = scopeActive || (this.lastAdsAlpha > 0.2 && (hasOptic || this.isAiming));
    this.crosshair.setVisible(!shouldHide);
  }

  private buildViewModel(def: WeaponDefinition): WeaponViewModel {
    const attachments = def.attachments.map((id) => ATTACHMENT_DEFINITIONS[id]).filter(Boolean);
    return new WeaponViewModel(def, attachments);
  }

  private disposeViewModel(): void {
    if (!this.viewModel) return;
    this.viewModel.viewRoot.parent?.remove(this.viewModel.viewRoot);
    this.viewModel = undefined;
  }

  private disposeScopeOverlay(): void {
    if (this.scopeOverlay) {
      this.scopeOverlay.dispose();
      this.scopeOverlay = undefined;
    }
  }
}
