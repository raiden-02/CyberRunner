import * as THREE from "three";
import {
  computeShowcaseFraming,
  gameplayFromPublicView,
  type PublicArenaMapView,
} from "@shared/world/arena-map-view.js";
import { ARENA_FORGE_PREVIEW_MAP_ID } from "@shared/world/arena-forge-preview.js";
import { createLevelFromMap, type LevelInstance } from "./LevelFactory.js";

export type ShowcaseHighlight = {
  x: number;
  y: number;
  z: number;
  hx: number;
  hy: number;
  hz: number;
};

export class MapShowcase {
  private host: HTMLElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private level: LevelInstance | null = null;
  private lights: THREE.Light[] = [];
  private highlight: THREE.Object3D | null = null;
  private raf = 0;
  private running = false;
  private startMs = 0;
  private framing = computeShowcaseFraming({
    boundsHalfSize: 12,
    wallHeight: 3,
    wallThickness: 0.4,
    groundThickness: 0.1,
    solids: [],
    spawns: [],
    objectives: [],
  });
  private onResize = (): void => this.resize();

  attach(host: HTMLElement): void {
    if (this.host === host && this.canvas) return;
    this.disposeRenderer();
    this.host = host;
    const canvas = document.createElement("canvas");
    canvas.style.cssText = "display:block;width:100%;height:100%;";
    host.appendChild(canvas);
    this.canvas = canvas;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer = renderer;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1814);
    this.scene.fog = new THREE.Fog(0x2a2620, 18, 90);

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.2, 120);
    this.addLights();
    this.resize();
    window.addEventListener("resize", this.onResize);
  }

  setMap(view: PublicArenaMapView, highlight?: ShowcaseHighlight): void {
    if (!this.scene) return;
    this.clearLevel();
    const map = gameplayFromPublicView(view, {
      id: ARENA_FORGE_PREVIEW_MAP_ID,
      name: "ArenaForge preview",
    });
    this.level = createLevelFromMap(this.scene, map);
    this.framing = computeShowcaseFraming(view);
    if (this.camera) {
      this.camera.near = this.framing.near;
      this.camera.far = this.framing.far;
      this.camera.updateProjectionMatrix();
    }
    if (highlight) this.addHighlight(highlight);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.startMs = performance.now();
    this.tick();
  }

  stop(): void {
    this.running = false;
    if (this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
  }

  isRunning(): boolean {
    return this.running;
  }

  dispose(): void {
    this.stop();
    window.removeEventListener("resize", this.onResize);
    this.disposeRenderer();
    this.host = null;
  }

  private tick = (): void => {
    if (!this.running || !this.renderer || !this.scene || !this.camera) return;
    const t = (performance.now() - this.startMs) / 1000;
    const { centerX, centerY, centerZ, radius, elevation } = this.framing;
    const yaw = t * 0.18;
    const lift = elevation + Math.sin(t * 0.35) * Math.min(1.4, elevation * 0.12);
    this.camera.position.set(
      centerX + Math.cos(yaw) * radius,
      centerY + lift,
      centerZ + Math.sin(yaw) * radius,
    );
    this.camera.lookAt(centerX, centerY, centerZ);
    this.level?.update();
    this.renderer.render(this.scene, this.camera);
    this.raf = requestAnimationFrame(this.tick);
  };

  private resize(): void {
    if (!this.host || !this.canvas || !this.renderer || !this.camera) return;
    const width = Math.max(1, this.host.clientWidth);
    const height = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  private addLights(): void {
    if (!this.scene) return;
    const hemi = new THREE.HemisphereLight(0x6a7a88, 0x3a3832, 0.7);
    const key = new THREE.DirectionalLight(0xffe2b8, 1.35);
    key.position.set(18, 28, -12);
    const fill = new THREE.DirectionalLight(0xd4893a, 0.28);
    fill.position.set(-16, 10, 14);
    this.scene.add(hemi, key, fill);
    this.lights = [hemi, key, fill];
  }

  private addHighlight(box: ShowcaseHighlight): void {
    if (!this.scene) return;
    const geom = new THREE.BoxGeometry(box.hx * 2 + 0.1, box.hy * 2 + 0.1, box.hz * 2 + 0.1);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xd4893a,
      wireframe: true,
      transparent: true,
      opacity: 0.9,
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.set(box.x, box.y, box.z);
    this.scene.add(mesh);
    this.highlight = mesh;
  }

  private clearLevel(): void {
    if (this.highlight && this.scene) {
      this.scene.remove(this.highlight);
      disposeObject(this.highlight);
      this.highlight = null;
    }
    this.level?.dispose();
    this.level = null;
    if (this.scene) {
      const leftover = [...this.scene.children].filter((c) => !this.lights.includes(c as THREE.Light));
      for (const child of leftover) {
        this.scene.remove(child);
        disposeObject(child);
      }
    }
  }

  private disposeRenderer(): void {
    this.clearLevel();
    if (this.scene) {
      for (const light of this.lights) this.scene.remove(light);
    }
    this.lights = [];
    this.scene = null;
    this.camera = null;
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.forceContextLoss();
      this.renderer = null;
    }
    if (this.canvas) {
      this.canvas.remove();
      this.canvas = null;
    }
  }
}

function disposeObject(obj: THREE.Object3D): void {
  obj.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const mat = mesh.material;
    if (!mat) return;
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
    else mat.dispose();
  });
}
