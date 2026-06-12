import * as THREE from "three";
import { CAPSULE } from "@shared/physics/constants.js";
import { THEME } from "../theme.js";

const DEBUG_RAY_LENGTH = 75;
const SHOT_RAY_LENGTH = 75;
const SHOT_LIFE_SEC = 0.45;
const PRED_COLOR = 0x4a8b8a;
const SERVER_COLOR = 0xd4893a;
const AIM_COLOR = 0x4a8b8a;
const LOCAL_SHOT_COLOR = 0xd4893a;
const REMOTE_SHOT_COLOR = 0xc45c3a;

type ShotKind = "local" | "remote";

type ShotLine = {
  line: THREE.Line;
  age: number;
};

function makeCapsule(color: number): THREE.Mesh {
  const geom = new THREE.CapsuleGeometry(CAPSULE.Radius, CAPSULE.HalfHeight * 2, 6, 12);
  const mat = new THREE.MeshBasicMaterial({ color, wireframe: true });
  return new THREE.Mesh(geom, mat);
}

function makeLabelSprite(text: string, cssColor: string): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "rgba(26, 24, 20, 0.82)";
  ctx.fillRect(0, 0, 256, 64);
  ctx.font = "bold 28px Segoe UI, system-ui, sans-serif";
  ctx.fillStyle = cssColor;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 128, 32);
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(1.15, 0.29, 1);
  sprite.position.y = CAPSULE.HalfHeight + CAPSULE.Radius + 0.35;
  return sprite;
}

function disposeObject3D(obj: THREE.Object3D, scene: THREE.Scene): void {
  scene.remove(obj);
  obj.traverse((child) => {
    if (child instanceof THREE.Mesh || child instanceof THREE.Line || child instanceof THREE.Sprite) {
      child.geometry?.dispose();
      const mat = child.material;
      if (Array.isArray(mat)) {
        for (const m of mat) {
          if (m.map) m.map.dispose();
          m.dispose();
        }
      } else if (mat) {
        if ("map" in mat && mat.map) mat.map.dispose();
        mat.dispose();
      }
    }
  });
}

export type DebugCommandActions = {
  godMode: () => void;
  unlimitedAmmo: () => void;
  autoRun: () => void;
  overlay: () => void;
};

export class GameplayDebug {
  readonly statusEl: HTMLDivElement;

  private enabled = false;
  private debugRay?: THREE.Line;
  private predCapsule?: THREE.Mesh;
  private serverCapsule?: THREE.Mesh;
  private predLabel?: THREE.Sprite;
  private serverLabel?: THREE.Sprite;
  private shots: ShotLine[] = [];

  constructor(private readonly scene: THREE.Scene) {
    this.statusEl = document.createElement("div");
    this.statusEl.style.cssText = `
      position: fixed;
      top: 12px;
      left: 12px;
      z-index: 9999;
      padding: 10px 12px;
      background: ${THEME.hudBg};
      color: ${THEME.paper};
      font-family: ${THEME.font};
      font-size: 13px;
      border-radius: 3px;
      border-left: 3px solid ${THEME.accent};
      pointer-events: none;
      white-space: pre-line;
    `;
    this.statusEl.textContent = "Connecting...";
    document.body.appendChild(this.statusEl);
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  setStatus(text: string): void {
    this.statusEl.style.display = "block";
    this.statusEl.textContent = text;
  }

  hideStatus(): void {
    this.statusEl.style.display = "none";
  }

  toggle(): boolean {
    this.enabled = !this.enabled;
    this.setWorldVisible(this.enabled);
    return this.enabled;
  }

  updateCapsules(
    predicted: { x: number; y: number; z: number },
    server: { x: number; y: number; z: number },
    alive: boolean,
  ): void {
    if (!this.enabled) {
      this.setWorldVisible(false);
      return;
    }
    this.ensureCapsules();
    if (this.predCapsule && this.predLabel) {
      this.predCapsule.visible = alive;
      this.predLabel.visible = alive;
      this.predCapsule.position.set(predicted.x, predicted.y, predicted.z);
      this.predLabel.position.set(predicted.x, predicted.y + this.predLabel.userData.lift, predicted.z);
    }
    if (this.serverCapsule && this.serverLabel) {
      this.serverCapsule.visible = alive;
      this.serverLabel.visible = alive;
      this.serverCapsule.position.set(server.x, server.y, server.z);
      this.serverLabel.position.set(server.x, server.y + this.serverLabel.userData.lift, server.z);
    }
  }

  updateAimRay(camera: THREE.Camera, pointerLocked: boolean): void {
    if (!this.enabled || !pointerLocked) {
      if (this.debugRay) this.debugRay.visible = false;
      return;
    }

    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
    const origin = camera.position.clone().add(dir.clone().multiplyScalar(CAPSULE.Radius + 0.15));
    const end = origin.clone().add(dir.clone().multiplyScalar(DEBUG_RAY_LENGTH));

    if (!this.debugRay) {
      const geom = new THREE.BufferGeometry().setFromPoints([origin, end]);
      const mat = new THREE.LineBasicMaterial({ color: AIM_COLOR });
      this.debugRay = new THREE.Line(geom, mat);
      this.debugRay.frustumCulled = false;
      this.scene.add(this.debugRay);
    }

    this.debugRay.visible = true;
    const posAttr = this.debugRay.geometry.getAttribute("position") as THREE.BufferAttribute;
    posAttr.setXYZ(0, origin.x, origin.y, origin.z);
    posAttr.setXYZ(1, end.x, end.y, end.z);
    posAttr.needsUpdate = true;
  }

  showShot(origin: { x: number; y: number; z: number }, direction: { x: number; y: number; z: number }, kind: ShotKind): void {
    if (!this.enabled) return;
    const start = new THREE.Vector3(origin.x, origin.y, origin.z);
    const dir = new THREE.Vector3(direction.x, direction.y, direction.z);
    if (dir.lengthSq() < 1e-8) return;
    dir.normalize();
    const end = start.clone().add(dir.multiplyScalar(SHOT_RAY_LENGTH));
    const geom = new THREE.BufferGeometry().setFromPoints([start, end]);
    const color = kind === "local" ? LOCAL_SHOT_COLOR : REMOTE_SHOT_COLOR;
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 1 });
    const line = new THREE.Line(geom, mat);
    line.frustumCulled = false;
    this.scene.add(line);
    this.shots.push({ line, age: 0 });
  }

  tick(dt: number): void {
    if (this.shots.length === 0) return;
    const keep: ShotLine[] = [];
    for (const shot of this.shots) {
      shot.age += dt;
      const mat = shot.line.material as THREE.LineBasicMaterial;
      mat.opacity = Math.max(0, 1 - shot.age / SHOT_LIFE_SEC);
      if (shot.age < SHOT_LIFE_SEC) {
        keep.push(shot);
      } else {
        disposeObject3D(shot.line, this.scene);
      }
    }
    this.shots = keep;
  }

  exposeCommands(actions: DebugCommandActions): void {
    window.debug = {
      godMode: actions.godMode,
      unlimitedAmmo: actions.unlimitedAmmo,
      autoRun: actions.autoRun,
      overlay: actions.overlay,
      help: () => {
        console.log(`
CyberRunner debug
F3 or debug.overlay()  toggle net overlay, capsules, hitboxes, aim/shot rays
debug.godMode()        toggle invincibility (non-production server)
debug.unlimitedAmmo()  toggle infinite ammo (non-production server)
debug.autoRun()        toggle auto-run
        `);
      },
    };
    console.log("[CyberRunner] Debug: F3 overlay, or debug.help()");
  }

  private ensureCapsules(): void {
    if (!this.predCapsule) {
      this.predCapsule = makeCapsule(PRED_COLOR);
      this.predCapsule.visible = this.enabled;
      this.scene.add(this.predCapsule);
      this.predLabel = makeLabelSprite("PRED", THEME.teammate);
      this.predLabel.userData.lift = this.predLabel.position.y;
      this.scene.add(this.predLabel);
    }
    if (!this.serverCapsule) {
      this.serverCapsule = makeCapsule(SERVER_COLOR);
      this.serverCapsule.visible = this.enabled;
      this.scene.add(this.serverCapsule);
      this.serverLabel = makeLabelSprite("SERVER", THEME.accent);
      this.serverLabel.userData.lift = this.serverLabel.position.y;
      this.scene.add(this.serverLabel);
    }
  }

  private setWorldVisible(visible: boolean): void {
    if (this.predCapsule) this.predCapsule.visible = visible;
    if (this.serverCapsule) this.serverCapsule.visible = visible;
    if (this.predLabel) this.predLabel.visible = visible;
    if (this.serverLabel) this.serverLabel.visible = visible;
    if (this.debugRay) this.debugRay.visible = visible;
    if (!visible) {
      for (const shot of this.shots) {
        disposeObject3D(shot.line, this.scene);
      }
      this.shots = [];
    }
  }

  dispose(): void {
    if (this.debugRay) {
      disposeObject3D(this.debugRay, this.scene);
      this.debugRay = undefined;
    }
    if (this.predCapsule) {
      disposeObject3D(this.predCapsule, this.scene);
      this.predCapsule = undefined;
    }
    if (this.serverCapsule) {
      disposeObject3D(this.serverCapsule, this.scene);
      this.serverCapsule = undefined;
    }
    if (this.predLabel) {
      disposeObject3D(this.predLabel, this.scene);
      this.predLabel = undefined;
    }
    if (this.serverLabel) {
      disposeObject3D(this.serverLabel, this.scene);
      this.serverLabel = undefined;
    }
    for (const shot of this.shots) {
      disposeObject3D(shot.line, this.scene);
    }
    this.shots = [];
    this.statusEl.remove();
  }
}

declare global {
  interface Window {
    debug?: {
      godMode: () => void;
      unlimitedAmmo: () => void;
      autoRun: () => void;
      overlay: () => void;
      help: () => void;
    };
  }
}
