/**
 * BASE LIGHTING (Abstract)
 * Base class for all map lighting configurations.
 * Provides common lighting setup and defines the interface for map-specific lighting.
 */
import * as THREE from "three";
import type { NeonColorKey } from "./NeonColors.js";
import { NEON_PALETTE } from "./NeonColors.js";

// ═══════════════════════════════════════════════════════════════
// LIGHTING CONFIGURATION TYPES
// ═══════════════════════════════════════════════════════════════

export interface AmbientLightConfig {
  color: number;
  intensity: number;
}

export interface HemisphereLightConfig {
  skyColor: number;
  groundColor: number;
  intensity: number;
}

export interface DirectionalLightConfig {
  color: number;
  intensity: number;
  position: THREE.Vector3;
  castShadow?: boolean;
  shadowMapSize?: number;
  shadowBias?: number;
  shadowCameraBounds?: number;
}

export interface PointLightConfig {
  color: number;
  intensity: number;
  position: THREE.Vector3;
  distance: number;
  decay: number;
}

export interface FogConfig {
  color: number;
  near: number;
  far: number;
}

export interface LightingConfig {
  ambient: AmbientLightConfig;
  hemisphere: HemisphereLightConfig;
  keyLight: DirectionalLightConfig;
  rimLight?: DirectionalLightConfig;
  fillLight?: DirectionalLightConfig;
  neonAccents: PointLightConfig[];
  exposure: number;
  fog: FogConfig;
}

// ═══════════════════════════════════════════════════════════════
// LIGHTING RENDER LAYER
// ═══════════════════════════════════════════════════════════════

export const WEAPON_RENDER_LAYER = 1;

// ═══════════════════════════════════════════════════════════════
// BASE LIGHTING CLASS
// ═══════════════════════════════════════════════════════════════

/**
 * Abstract base class for map lighting.
 * Provides common lighting setup methods.
 */
export abstract class BaseLighting {
  protected scene: THREE.Scene;
  protected lights: THREE.Light[] = [];
  protected weaponLight?: THREE.PointLight;
  protected config: LightingConfig;

  constructor(scene: THREE.Scene, config: LightingConfig) {
    this.scene = scene;
    this.config = config;
  }

  /**
   * Full lighting setup. Call after construction.
   */
  public setup(renderer: THREE.WebGLRenderer): void {
    this.setupRenderer(renderer);
    this.setupFog();
    this.setupAmbient();
    this.setupHemisphere();
    this.setupKeyLight(renderer);
    if (this.config.rimLight) this.setupRimLight();
    if (this.config.fillLight) this.setupFillLight();
    this.setupNeonAccents();
    this.setupWeaponLight();
    this.onSetupComplete();
  }

  /**
   * Override for additional setup after base lights are created
   */
  protected onSetupComplete(): void {
    // Override in subclasses for additional setup
  }

  // ═══════════════════════════════════════════════════════════════
  // RENDERER SETUP
  // ═══════════════════════════════════════════════════════════════

  protected setupRenderer(renderer: THREE.WebGLRenderer): void {
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = this.config.exposure;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  // ═══════════════════════════════════════════════════════════════
  // FOG
  // ═══════════════════════════════════════════════════════════════

  protected setupFog(): void {
    this.scene.fog = new THREE.Fog(
      this.config.fog.color,
      this.config.fog.near,
      this.config.fog.far
    );
    this.scene.background = new THREE.Color(this.config.fog.color);
  }

  // ═══════════════════════════════════════════════════════════════
  // AMBIENT LIGHTING
  // ═══════════════════════════════════════════════════════════════

  protected setupAmbient(): void {
    const ambient = new THREE.AmbientLight(
      this.config.ambient.color,
      this.config.ambient.intensity
    );
    this.scene.add(ambient);
    this.lights.push(ambient);
  }

  // ═══════════════════════════════════════════════════════════════
  // HEMISPHERE LIGHTING
  // ═══════════════════════════════════════════════════════════════

  protected setupHemisphere(): void {
    const hemi = new THREE.HemisphereLight(
      this.config.hemisphere.skyColor,
      this.config.hemisphere.groundColor,
      this.config.hemisphere.intensity
    );
    this.scene.add(hemi);
    this.lights.push(hemi);
  }

  // ═══════════════════════════════════════════════════════════════
  // KEY LIGHT (Main directional light with shadows)
  // ═══════════════════════════════════════════════════════════════

  protected setupKeyLight(renderer: THREE.WebGLRenderer): void {
    const cfg = this.config.keyLight;
    const key = new THREE.DirectionalLight(cfg.color, cfg.intensity);
    key.position.copy(cfg.position);
    key.target.position.set(0, 0, 0);
    this.scene.add(key);
    this.scene.add(key.target);

    if (cfg.castShadow) {
      key.castShadow = true;
      key.shadow.mapSize.width = cfg.shadowMapSize ?? 2048;
      key.shadow.mapSize.height = cfg.shadowMapSize ?? 2048;
      key.shadow.bias = cfg.shadowBias ?? -0.0003;
      key.shadow.camera.near = 1;
      key.shadow.camera.far = 80;
      const bounds = cfg.shadowCameraBounds ?? 40;
      key.shadow.camera.left = -bounds;
      key.shadow.camera.right = bounds;
      key.shadow.camera.top = bounds;
      key.shadow.camera.bottom = -bounds;
      renderer.shadowMap.enabled = true;
    }

    this.lights.push(key);
  }

  // ═══════════════════════════════════════════════════════════════
  // RIM LIGHT
  // ═══════════════════════════════════════════════════════════════

  protected setupRimLight(): void {
    if (!this.config.rimLight) return;
    const cfg = this.config.rimLight;
    const rim = new THREE.DirectionalLight(cfg.color, cfg.intensity);
    rim.position.copy(cfg.position);
    this.scene.add(rim);
    this.lights.push(rim);
  }

  // ═══════════════════════════════════════════════════════════════
  // FILL LIGHT
  // ═══════════════════════════════════════════════════════════════

  protected setupFillLight(): void {
    if (!this.config.fillLight) return;
    const cfg = this.config.fillLight;
    const fill = new THREE.DirectionalLight(cfg.color, cfg.intensity);
    fill.position.copy(cfg.position);
    this.scene.add(fill);
    this.lights.push(fill);
  }

  // ═══════════════════════════════════════════════════════════════
  // NEON ACCENT LIGHTS
  // ═══════════════════════════════════════════════════════════════

  protected setupNeonAccents(): void {
    for (const neon of this.config.neonAccents) {
      const light = new THREE.PointLight(
        neon.color,
        neon.intensity,
        neon.distance,
        neon.decay
      );
      light.position.copy(neon.position);
      this.scene.add(light);
      this.lights.push(light);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // WEAPON LIGHT (For first-person weapon rendering)
  // ═══════════════════════════════════════════════════════════════

  protected setupWeaponLight(): void {
    this.weaponLight = new THREE.PointLight(0xffffff, 0.8, 5, 2);
    this.weaponLight.layers.set(WEAPON_RENDER_LAYER);
    this.lights.push(this.weaponLight);
  }

  // ═══════════════════════════════════════════════════════════════
  // UTILITY METHODS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Create a point light from neon color palette
   */
  protected createNeonPointLight(
    colorKey: NeonColorKey,
    position: THREE.Vector3,
    intensity?: number,
    distance = 12,
    decay = 1.5
  ): THREE.PointLight {
    const cfg = NEON_PALETTE[colorKey];
    const light = new THREE.PointLight(
      cfg.emissive,
      intensity ?? cfg.intensity * 0.5,
      distance,
      decay
    );
    light.position.copy(position);
    return light;
  }

  /**
   * Add a point light to the scene
   */
  protected addPointLight(config: PointLightConfig): THREE.PointLight {
    const light = new THREE.PointLight(
      config.color,
      config.intensity,
      config.distance,
      config.decay
    );
    light.position.copy(config.position);
    this.scene.add(light);
    this.lights.push(light);
    return light;
  }

  // ═══════════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════════

  public getWeaponLight(): THREE.PointLight | undefined {
    return this.weaponLight;
  }

  public updateWeaponLight(camera: THREE.Camera): void {
    if (!this.weaponLight) return;
    this.weaponLight.position.copy(camera.position);
    this.weaponLight.position.y += 0.3;
  }

  public setExposure(renderer: THREE.WebGLRenderer, exposure: number): void {
    renderer.toneMappingExposure = exposure;
  }

  /**
   * Update method for animated lights. Override for custom effects.
   */
  public update(_deltaTime: number): void {
    // Override in subclasses for animated lighting effects
  }

  public dispose(): void {
    for (const light of this.lights) {
      this.scene.remove(light);
      if ("dispose" in light && typeof light.dispose === "function") {
        light.dispose();
      }
    }
    this.lights = [];
    this.weaponLight = undefined;
  }
}
