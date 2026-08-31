import * as THREE from "three";

const FACE_SIZE = 256;

function paintFace(face: "px" | "nx" | "py" | "ny" | "pz" | "nz"): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = FACE_SIZE;
  canvas.height = FACE_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  const zenith = face === "py";
  const nadir = face === "ny";
  const top = zenith ? "#061018" : nadir ? "#020406" : "#08141c";
  const bottom = zenith ? "#0a1822" : nadir ? "#010203" : "#02060a";
  const grad = ctx.createLinearGradient(0, 0, 0, FACE_SIZE);
  grad.addColorStop(0, top);
  grad.addColorStop(1, bottom);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, FACE_SIZE, FACE_SIZE);

  if (!zenith && !nadir) {
    ctx.fillStyle = "rgba(0, 220, 210, 0.08)";
    ctx.fillRect(0, FACE_SIZE * 0.62, FACE_SIZE, FACE_SIZE * 0.08);
    ctx.fillStyle = "rgba(255, 61, 138, 0.05)";
    ctx.fillRect(0, FACE_SIZE * 0.7, FACE_SIZE, 3);
  }

  return canvas;
}

export class Skybox {
  private scene: THREE.Scene;
  private cubeTexture?: THREE.CubeTexture;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  public applyGenerated(): void {
    this.dispose();
    const texture = new THREE.CubeTexture([
      paintFace("px"),
      paintFace("nx"),
      paintFace("py"),
      paintFace("ny"),
      paintFace("pz"),
      paintFace("nz"),
    ]);
    texture.needsUpdate = true;
    texture.colorSpace = THREE.SRGBColorSpace;
    this.cubeTexture = texture;
    this.scene.background = texture;
  }

  public dispose(): void {
    if (this.cubeTexture) {
      this.cubeTexture.dispose();
      this.cubeTexture = undefined;
    }
  }
}
