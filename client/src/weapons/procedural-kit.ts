import * as THREE from "three";
import { WEAPON_RENDER_LAYER } from "../world/lighting/CyberpunkLighting.js";

export type ColorVariant = "cyan" | "magenta" | "green" | "orange" | "red";

export interface MaterialSet {
  darkMetal: THREE.MeshStandardMaterial;
  midMetal: THREE.MeshStandardMaterial;
  lightMetal: THREE.MeshStandardMaterial;
  neon: THREE.MeshStandardMaterial;
  neonDim: THREE.MeshStandardMaterial;
  glass: THREE.MeshStandardMaterial;
  danger: THREE.MeshStandardMaterial;
}

const ACCENT_COLORS: Record<ColorVariant, number> = {
  cyan: 0x4a8b8a,
  magenta: 0x8a5a52,
  green: 0x6b7a4a,
  orange: 0xd4893a,
  red: 0xc45c3a
};

export function createMaterialSet(variant: ColorVariant): MaterialSet {
  const accent = ACCENT_COLORS[variant];
  const dimColor = new THREE.Color(accent).multiplyScalar(0.45).getHex();

  return {
    darkMetal: new THREE.MeshStandardMaterial({
      color: 0x1c1f24,
      roughness: 0.55,
      metalness: 0.72
    }),
    midMetal: new THREE.MeshStandardMaterial({
      color: 0x2e333a,
      roughness: 0.42,
      metalness: 0.68
    }),
    lightMetal: new THREE.MeshStandardMaterial({
      color: 0x5a616c,
      roughness: 0.38,
      metalness: 0.55
    }),
    neon: new THREE.MeshStandardMaterial({
      color: accent,
      emissive: accent,
      emissiveIntensity: 0.35,
      roughness: 0.4,
      metalness: 0.45
    }),
    neonDim: new THREE.MeshStandardMaterial({
      color: dimColor,
      emissive: dimColor,
      emissiveIntensity: 0.15,
      roughness: 0.5,
      metalness: 0.5
    }),
    glass: new THREE.MeshStandardMaterial({
      color: 0x8a9aa0,
      transparent: true,
      opacity: 0.28,
      roughness: 0.08,
      metalness: 0.05,
      emissive: accent,
      emissiveIntensity: 0.08
    }),
    danger: new THREE.MeshStandardMaterial({
      color: 0xc45c3a,
      emissive: 0x6a2818,
      emissiveIntensity: 0.25,
      roughness: 0.4,
      metalness: 0.4
    })
  };
}

export function createBox(size: THREE.Vector3, material: THREE.Material): THREE.Mesh {
  const geom = new THREE.BoxGeometry(size.x, size.y, size.z);
  return new THREE.Mesh(geom, material);
}

export function createCylinder(
  radius: number,
  length: number,
  material: THREE.Material,
  openEnded = false
): THREE.Mesh {
  const geom = new THREE.CylinderGeometry(radius, radius, length, 16, 1, openEnded);
  const mesh = new THREE.Mesh(geom, material);
  // Align cylinder length along the weapon's forward (Z) axis.
  mesh.rotation.x = Math.PI / 2;
  return mesh;
}

export function createCone(
  radius: number,
  length: number,
  material: THREE.Material
): THREE.Mesh {
  const geom = new THREE.ConeGeometry(radius, length, 12);
  const mesh = new THREE.Mesh(geom, material);
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

// Chamfered box (angular cyberpunk look)
export function createChamferedBox(
  size: THREE.Vector3,
  material: THREE.Material,
  chamfer = 0.02
): THREE.Object3D {
  const root = new THREE.Object3D();
  // Main body
  const main = createBox(new THREE.Vector3(size.x - chamfer * 2, size.y, size.z), material);
  root.add(main);
  // Side chamfers
  const leftChamfer = createBox(new THREE.Vector3(chamfer, size.y * 0.7, size.z * 0.9), material);
  leftChamfer.position.set(-size.x / 2 + chamfer / 2, 0, 0);
  leftChamfer.rotation.z = 0.3;
  root.add(leftChamfer);
  const rightChamfer = createBox(new THREE.Vector3(chamfer, size.y * 0.7, size.z * 0.9), material);
  rightChamfer.position.set(size.x / 2 - chamfer / 2, 0, 0);
  rightChamfer.rotation.z = -0.3;
  root.add(rightChamfer);
  return root;
}

export function addRail(parent: THREE.Object3D, length: number, material: THREE.Material): void {
  const ridgeCount = Math.max(4, Math.floor(length / 0.12));
  for (let i = 0; i < ridgeCount; i += 1) {
    const ridge = createBox(new THREE.Vector3(0.07, 0.012, 0.06), material);
    ridge.position.set(0, 0.008, -length * 0.5 + (i + 0.5) * (length / ridgeCount));
    parent.add(ridge);
  }
}

export function addVentCuts(parent: THREE.Object3D, count: number, spacing: number, material?: THREE.Material): void {
  const ventMat = material || new THREE.MeshStandardMaterial({ color: 0x050608, roughness: 0.9, metalness: 0.1 });
  for (let i = 0; i < count; i += 1) {
    const vent = createBox(new THREE.Vector3(0.018, 0.018, 0.06), ventMat);
    vent.position.set(0.065, 0.02, -0.12 - i * spacing);
    parent.add(vent);
  }
}

export function addHeatSink(parent: THREE.Object3D, count: number, material: THREE.Material): void {
  for (let i = 0; i < count; i++) {
    const fin = createBox(new THREE.Vector3(0.16, 0.004, 0.02), material);
    fin.position.set(0, 0.04 + i * 0.012, -0.5);
    parent.add(fin);
  }
}

export function addNeonStripe(parent: THREE.Object3D, length: number, material: THREE.Material, yOffset = 0.04): void {
  const stripe = createBox(new THREE.Vector3(0.015, 0.015, length), material);
  stripe.position.set(0.1, yOffset, -0.18);
  parent.add(stripe);
  // Add small glow dots
  for (let i = 0; i < 3; i++) {
    const dot = createBox(new THREE.Vector3(0.01, 0.01, 0.01), material);
    dot.position.set(-0.1, yOffset, -0.1 - i * 0.12);
    parent.add(dot);
  }
}

export function addAngularAccent(parent: THREE.Object3D, material: THREE.Material): void {
  // Angular chevron accent on side
  const chevron1 = createBox(new THREE.Vector3(0.008, 0.03, 0.04), material);
  chevron1.position.set(0.11, 0.02, -0.08);
  chevron1.rotation.z = 0.4;
  parent.add(chevron1);
  const chevron2 = createBox(new THREE.Vector3(0.008, 0.03, 0.04), material);
  chevron2.position.set(0.11, 0.02, -0.16);
  chevron2.rotation.z = -0.4;
  parent.add(chevron2);
}

export function setFirstPersonMaterialFlags(root: THREE.Object3D): void {
  root.traverse((child) => {
    child.layers.enable(WEAPON_RENDER_LAYER);
    if (child instanceof THREE.Mesh) {
      const isReticle = (child as any).userData?.isReticle === true;
      child.renderOrder = isReticle ? 999 : 1;
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach((mat) => {
        mat.depthTest = !isReticle;
        mat.depthWrite = !isReticle;
        if (mat instanceof THREE.MeshStandardMaterial && !mat.emissive) {
          mat.emissive = new THREE.Color(0x1a1a1a);
          mat.emissiveIntensity = 0.15;
        }
        mat.needsUpdate = true;
      });
    }
  });
}

export function setThirdPersonMaterialFlags(root: THREE.Object3D): void {
  root.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach((mat) => {
        mat.depthTest = true;
        mat.depthWrite = true;
        mat.transparent = false;
        mat.needsUpdate = true;
      });
      child.renderOrder = 0;
      child.frustumCulled = true;
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
}
