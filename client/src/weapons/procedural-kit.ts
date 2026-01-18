import * as THREE from "three";

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

const NEON_COLORS: Record<ColorVariant, number> = {
  cyan: 0x00f0ff,
  magenta: 0xff00ff,
  green: 0x00ff66,
  orange: 0xff6600,
  red: 0xff2222
};

export function createMaterialSet(variant: ColorVariant): MaterialSet {
  const neonColor = NEON_COLORS[variant];
  const dimColor = new THREE.Color(neonColor).multiplyScalar(0.4).getHex();

  return {
    darkMetal: new THREE.MeshStandardMaterial({
      color: 0x0a0c10,
      roughness: 0.6,
      metalness: 0.85
    }),
    midMetal: new THREE.MeshStandardMaterial({
      color: 0x1a1e26,
      roughness: 0.45,
      metalness: 0.8
    }),
    lightMetal: new THREE.MeshStandardMaterial({
      color: 0x3a4050,
      roughness: 0.35,
      metalness: 0.7
    }),
    neon: new THREE.MeshStandardMaterial({
      color: neonColor,
      emissive: neonColor,
      emissiveIntensity: 2.0,
      roughness: 0.15,
      metalness: 0.5
    }),
    neonDim: new THREE.MeshStandardMaterial({
      color: dimColor,
      emissive: dimColor,
      emissiveIntensity: 0.8,
      roughness: 0.3,
      metalness: 0.6
    }),
    glass: new THREE.MeshStandardMaterial({
      color: 0x88ffff,
      transparent: true,
      opacity: 0.25,
      roughness: 0.05,
      metalness: 0.0,
      emissive: neonColor,
      emissiveIntensity: 0.3
    }),
    danger: new THREE.MeshStandardMaterial({
      color: 0xff3300,
      emissive: 0xff2200,
      emissiveIntensity: 1.2,
      roughness: 0.3,
      metalness: 0.5
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
    if (child instanceof THREE.Mesh) {
      const isReticle = (child as any).userData?.isReticle === true;
      child.renderOrder = isReticle ? 999 : 1;
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach((mat) => {
        mat.depthTest = !isReticle;
        mat.depthWrite = !isReticle;
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
