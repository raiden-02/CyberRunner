import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { CyberpunkLighting, CYBERPUNK_LIGHTING_CONFIG, type LightingConfig } from "../world/lighting/CyberpunkLighting.js";
import { SettingsManager, type GraphicsSettings } from "../settings/SettingsManager.js";

export interface BloomConfig {
  enabled: boolean;
  strength: number;
  radius: number;
  threshold: number;
}

export const DEFAULT_BLOOM_CONFIG: BloomConfig = {
  enabled: true,
  strength: 0.16,
  radius: 0.32,
  threshold: 0.88
};

const SHADOW_MAP_SIZES: Record<GraphicsSettings["shadowQuality"], number> = {
  low: 512,
  medium: 1024,
  high: 2048,
};

const PIXEL_RATIO_BY_PRESET: Record<GraphicsSettings["qualityPreset"], number> = {
  low: 1,
  medium: 1.5,
  high: 2,
  ultra: Math.min(window.devicePixelRatio, 2),
};

export class GameRenderer {
  public canvas: HTMLCanvasElement;
  public renderer: THREE.WebGLRenderer;
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  
  private disposed = false;
  private handleResize: () => void;
  private handleKeyDown: (e: KeyboardEvent) => void;
  
  private composer?: EffectComposer;
  private bloomPass?: UnrealBloomPass;
  private bloomConfig: BloomConfig;
  private lighting?: CyberpunkLighting;
  private lightingConfig: LightingConfig;

  constructor(bloomConfig: BloomConfig = DEFAULT_BLOOM_CONFIG, lightingConfig?: LightingConfig) {
    this.bloomConfig = bloomConfig;
    this.lightingConfig = lightingConfig ?? CYBERPUNK_LIGHTING_CONFIG;

    this.canvas = document.createElement("canvas");
    this.canvas.id = "gameCanvas";
    this.canvas.tabIndex = 0;
    this.canvas.style.cssText = "position: fixed; top: 0; left: 0; z-index: 0;";
    
    const existingCanvas = document.getElementById("gameCanvas");
    if (existingCanvas) {
      existingCanvas.remove();
    }
    document.body.appendChild(this.canvas);

    this.renderer = new THREE.WebGLRenderer({ 
      canvas: this.canvas, 
      antialias: true,
      powerPreference: "high-performance"
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    this.camera.position.set(0, 1.6, 5);
    this.scene.add(this.camera);

    this.setupLighting();
    this.setupPostProcessing();

    this.handleResize = this.onResize.bind(this);
    window.addEventListener("resize", this.handleResize);

    this.handleKeyDown = this.onKeyDown.bind(this);
    window.addEventListener("keydown", this.handleKeyDown);
  }

  private setupLighting(): void {
    this.lighting = new CyberpunkLighting(this.scene, this.lightingConfig);
    this.lighting.setup(this.renderer);
  }

  private setupPostProcessing(): void {
    this.composer = new EffectComposer(this.renderer);
    
    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(renderPass);

    if (this.bloomConfig.enabled) {
      this.bloomPass = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        this.bloomConfig.strength,
        this.bloomConfig.radius,
        this.bloomConfig.threshold
      );
      this.composer.addPass(this.bloomPass);
    }

    const outputPass = new OutputPass();
    this.composer.addPass(outputPass);
  }

  private onResize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    
    if (this.composer) {
      this.composer.setSize(w, h);
    }
    if (this.bloomPass) {
      this.bloomPass.resolution.set(w, h);
    }
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (e.key === "b" && e.ctrlKey) {
      this.toggleBloom();
    }
  }

  public toggleBloom(): void {
    if (!this.bloomPass) return;
    this.bloomConfig.enabled = !this.bloomConfig.enabled;
    this.bloomPass.enabled = this.bloomConfig.enabled;
    console.log(`Bloom ${this.bloomConfig.enabled ? "enabled" : "disabled"}`);
  }

  public setBloomStrength(strength: number): void {
    if (this.bloomPass) {
      this.bloomPass.strength = strength;
    }
  }

  public setExposure(exposure: number): void {
    this.renderer.toneMappingExposure = exposure;
  }

  public getLighting(): CyberpunkLighting | undefined {
    return this.lighting;
  }

  public setFOV(fov: number): void {
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
  }

  public setBloomEnabled(enabled: boolean): void {
    if (!this.bloomPass) {
      if (enabled) {
        this.bloomPass = new UnrealBloomPass(
          new THREE.Vector2(window.innerWidth, window.innerHeight),
          this.bloomConfig.strength,
          this.bloomConfig.radius,
          this.bloomConfig.threshold
        );
        this.composer?.insertPass(this.bloomPass, 1);
      }
      return;
    }
    this.bloomConfig.enabled = enabled;
    this.bloomPass.enabled = enabled;
  }

  public setShadowsEnabled(enabled: boolean): void {
    this.renderer.shadowMap.enabled = enabled;
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.castShadow = enabled;
        obj.receiveShadow = enabled;
      }
    });
  }

  public setShadowQuality(quality: GraphicsSettings["shadowQuality"]): void {
    const size = SHADOW_MAP_SIZES[quality];
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Light && obj.shadow) {
        obj.shadow.mapSize.width = size;
        obj.shadow.mapSize.height = size;
        if (obj.shadow.map) {
          obj.shadow.map.dispose();
          obj.shadow.map = null;
        }
      }
    });
  }

  public setPixelRatio(ratio: number): void {
    this.renderer.setPixelRatio(Math.min(ratio, 2));
  }

  public applyGraphicsSettings(settings: GraphicsSettings): void {
    this.setBloomEnabled(settings.bloomEnabled);
    this.setBloomStrength(settings.bloomStrength);
    this.setShadowsEnabled(settings.shadowsEnabled);
    this.setShadowQuality(settings.shadowQuality);
    this.setFOV(settings.fov);
    
    const pixelRatio = PIXEL_RATIO_BY_PRESET[settings.qualityPreset];
    this.setPixelRatio(pixelRatio);
  }

  public applySettingsFromManager(): void {
    const settings = SettingsManager.getInstance().getGraphics();
    this.applyGraphicsSettings(settings);
  }

  public render(): void {
    if (this.lighting) {
      this.lighting.updateWeaponLight(this.camera);
    }
    
    if (this.composer && this.bloomConfig.enabled) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    
    window.removeEventListener("resize", this.handleResize);
    window.removeEventListener("keydown", this.handleKeyDown);
    
    if (this.lighting) {
      this.lighting.dispose();
    }
    if (this.composer) {
      this.composer.dispose();
    }
    this.renderer.dispose();
    this.canvas.remove();
  }
}
