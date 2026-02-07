import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { CyberpunkLighting, CYBERPUNK_LIGHTING_CONFIG, type LightingConfig } from "../world/lighting/CyberpunkLighting.js";

export interface BloomConfig {
  enabled: boolean;
  strength: number;
  radius: number;
  threshold: number;
}

export const DEFAULT_BLOOM_CONFIG: BloomConfig = {
  enabled: true,
  strength: 0.35,
  radius: 0.4,
  threshold: 0.75
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
    document.body.innerHTML = "";
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
  }
}
