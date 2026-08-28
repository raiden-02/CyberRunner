import * as THREE from "three";
import {
  computeShowcaseFraming,
  gameplayFromPublicView,
  type PublicArenaMapView,
} from "@shared/world/arena-map-view.js";
import type { GameplayMapDefinition } from "@shared/world/map-types.js";
import {
  showcaseSourceForForgePreview,
  showcaseSourceForGameplayMapId,
} from "@shared/world/showcase-source.js";
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
  private reduceMotion = false;
  private currentMapId: string | undefined;
  private observer: ResizeObserver | null = null;
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
    this.scene.background = new THREE.Color(0x07090d);
    this.scene.fog = new THREE.Fog(0x0b1218, 22, 96);

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.2, 140);
    this.addFillLights();
    this.observer?.disconnect();
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.resize();
    requestAnimationFrame(() => this.resize());
    window.addEventListener("resize", this.onResize);
  }

  setGameplayMap(map: GameplayMapDefinition, highlight?: ShowcaseHighlight): void {
    if (!this.scene) return;
    const source = showcaseSourceForGameplayMapId(map.id);
    if (source.mapId !== map.id) {
      throw new Error(`Showcase production map id mismatch: ${map.id}`);
    }
    this.applyMap(map, highlight);
  }

  setForgeView(view: PublicArenaMapView, highlight?: ShowcaseHighlight): void {
    if (!this.scene) return;
    const source = showcaseSourceForForgePreview();
    const map = gameplayFromPublicView(view, {
      id: source.mapId,
      name: "ArenaForge preview",
    });
    this.applyMap(map, highlight);
  }

  /** @deprecated use setForgeView or setGameplayMap */
  setMap(view: PublicArenaMapView, highlight?: ShowcaseHighlight): void {
    this.setForgeView(view, highlight);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.startMs = performance.now();
    this.reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
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

  lastMapId(): string | undefined {
    return this.currentMapId;
  }

  dispose(): void {
    this.stop();
    window.removeEventListener("resize", this.onResize);
    this.disposeRenderer();
    this.host = null;
  }

  private applyMap(map: GameplayMapDefinition, highlight?: ShowcaseHighlight): void {
    if (!this.scene) return;
    this.clearLevel();
    this.level = createLevelFromMap(this.scene, map);
    this.currentMapId = map.id;
    this.framing = computeShowcaseFraming({
      boundsHalfSize: map.boundsHalfSize,
      wallHeight: map.wallHeight,
      wallThickness: map.wallThickness,
      groundThickness: map.groundThickness,
      solids: [...map.obstacles, ...map.occluders].map((s, i) => ({
        id: `solid-${i}`,
        kind: "obstacle",
        x: s.x,
        y: s.y,
        z: s.z,
        hx: s.hx,
        hy: s.hy,
        hz: s.hz,
      })),
      spawns: [],
      objectives: [],
    });
    if (this.camera) {
      this.camera.near = this.framing.near;
      this.camera.far = this.framing.far;
      this.camera.updateProjectionMatrix();
    }
    if (highlight) this.addHighlight(highlight);
  }

  private tick = (): void => {
    if (!this.running || !this.renderer || !this.scene || !this.camera) return;
    const t = this.reduceMotion ? 0.4 : (performance.now() - this.startMs) / 1000;
    const { centerX, centerY, centerZ, radius, elevation } = this.framing;
    const yaw = this.reduceMotion ? 0.85 : t * 0.12;
    const lift = this.reduceMotion
      ? elevation
      : elevation + Math.sin(t * 0.28) * Math.min(1.1, elevation * 0.1);
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

  private addFillLights(): void {
    if (!this.scene) return;
    const hemi = new THREE.HemisphereLight(0x7a8a98, 0x1a222c, 0.55);
    const key = new THREE.DirectionalLight(0xc8d8e4, 0.85);
    key.position.set(16, 26, -10);
    const fill = new THREE.DirectionalLight(0x5ec8d8, 0.18);
    fill.position.set(-14, 10, 12);
    this.scene.add(hemi, key, fill);
    this.lights = [hemi, key, fill];
  }

  private addHighlight(box: ShowcaseHighlight): void {
    if (!this.scene) return;
    const geom = new THREE.BoxGeometry(box.hx * 2 + 0.1, box.hy * 2 + 0.1, box.hz * 2 + 0.1);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x5ec8d8,
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
    this.observer?.disconnect();
    this.observer = null;
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
