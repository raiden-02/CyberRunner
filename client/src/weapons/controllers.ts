import * as THREE from "three";
import type { WeaponStats } from "./definitions.js";
import type { WeaponViewModel } from "./weapon-viewmodel.js";

/**
 * ADSController - Handles aiming down sights using explicit hip/ADS
 * position and rotation offsets with time-based progress interpolation.
 *
 * Mirrors the proven approach: define where the weapon should be at hip
 * and at ADS, then smoothly interpolate between them.
 */
export class ADSController {
  private adsProgress = 0;
  private isADS = false;

  /**
   * Update ADS state and apply interpolated pose to the weapon.
   * @returns Current ADS progress (0 = hip, 1 = fully aimed)
   */
  public update(
    dt: number,
    isAiming: boolean,
    _camera: THREE.PerspectiveCamera,
    viewModel: WeaponViewModel,
    stats: WeaponStats
  ): number {
    this.isADS = isAiming;

    // Time-based progress: ads.speed is now transition time in seconds
    // Lower value = faster transition
    const transitionTime = 1 / stats.ads.speed; // Convert speed to time
    if (transitionTime > 0) {
      const step = dt / transitionTime;
      this.adsProgress = THREE.MathUtils.clamp(
        this.adsProgress + (this.isADS ? step : -step),
        0,
        1
      );
    } else {
      this.adsProgress = this.isADS ? 1 : 0;
    }

    // Apply interpolated pose to the view model
    viewModel.applyADSProgress(this.adsProgress);

    return this.adsProgress;
  }

  public getAlpha(): number {
    return this.adsProgress;
  }
}
