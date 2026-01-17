import * as THREE from "three";
import { THREE_LANE_MAP } from "./maps/three-lane-map.js";

export class Level {
  private scene: THREE.Scene;
  private breakableMeshes = new Map<number, THREE.Mesh>();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.createGround();
    this.createWalls();
    this.createObstacles();
    this.createOccluders();
    this.createBreakables();
  }

  private createGround(): void {
    const size = THREE_LANE_MAP.boundsHalfSize * 2;

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size, 1, 1),
      new THREE.MeshStandardMaterial({
        color: 0x1b1f24,
        roughness: 0.95,
        metalness: 0.05
      })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0;
    this.scene.add(floor);

    const grid = new THREE.GridHelper(size, 60, 0x2b313a, 0x1a1f24);
    grid.position.y = 0.02;
    this.scene.add(grid);

    // Lane markings (subtle emissive strips)
    const stripeMat = new THREE.MeshStandardMaterial({
      color: 0x2f6fff,
      emissive: 0x0b1a3a,
      emissiveIntensity: 0.8,
      roughness: 0.6,
      metalness: 0.2
    });
    const stripeGeom = new THREE.BoxGeometry(0.25, 0.02, size * 0.9);
    const stripeLeft = new THREE.Mesh(stripeGeom, stripeMat);
    stripeLeft.position.set(-8, 0.02, 0);
    this.scene.add(stripeLeft);
    const stripeRight = new THREE.Mesh(stripeGeom, stripeMat);
    stripeRight.position.set(8, 0.02, 0);
    this.scene.add(stripeRight);
  }

  private createWalls(): void {
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x2c3036,
      roughness: 0.75,
      metalness: 0.25
    });
    const halfSize = THREE_LANE_MAP.boundsHalfSize;
    const wallThickness = THREE_LANE_MAP.wallThickness * 2;
    const wallHeight = THREE_LANE_MAP.wallHeight;
    const wallPosY = wallHeight / 2;

    const wallGeomX = new THREE.BoxGeometry(wallThickness, wallHeight, halfSize * 2);
    const wallGeomZ = new THREE.BoxGeometry(halfSize * 2, wallHeight, wallThickness);

    // +X wall
    const wallPX = new THREE.Mesh(wallGeomX, wallMat);
    wallPX.position.set(halfSize + wallThickness / 2, wallPosY, 0);
    this.scene.add(wallPX);

    // -X wall
    const wallNX = new THREE.Mesh(wallGeomX, wallMat);
    wallNX.position.set(-halfSize - wallThickness / 2, wallPosY, 0);
    this.scene.add(wallNX);

    // +Z wall
    const wallPZ = new THREE.Mesh(wallGeomZ, wallMat);
    wallPZ.position.set(0, wallPosY, halfSize + wallThickness / 2);
    this.scene.add(wallPZ);

    // -Z wall
    const wallNZ = new THREE.Mesh(wallGeomZ, wallMat);
    wallNZ.position.set(0, wallPosY, -halfSize - wallThickness / 2);
    this.scene.add(wallNZ);
  }

  private createObstacles(): void {
    const dividerMat = new THREE.MeshStandardMaterial({
      color: 0x252a31,
      roughness: 0.85,
      metalness: 0.15
    });
    const coverMat = new THREE.MeshStandardMaterial({
      color: 0x4a535d,
      roughness: 0.7,
      metalness: 0.25
    });

    for (const obs of THREE_LANE_MAP.obstacles) {
      const isDivider = obs.hx <= 0.6;
      const mat = isDivider ? dividerMat : coverMat;
      const geom = new THREE.BoxGeometry(obs.hx * 2, obs.hy * 2, obs.hz * 2);
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.set(obs.x, obs.y, obs.z);
      this.scene.add(mesh);
    }
  }

  private createOccluders(): void {
    const occMat = new THREE.MeshStandardMaterial({
      color: 0x2b2f36,
      roughness: 0.65,
      metalness: 0.3
    });
    for (const occ of THREE_LANE_MAP.occluders) {
      const geom = new THREE.BoxGeometry(occ.hx * 2, occ.hy * 2, occ.hz * 2);
      const mesh = new THREE.Mesh(geom, occMat);
      mesh.position.set(occ.x, occ.y, occ.z);
      this.scene.add(mesh);
    }
  }

  private createBreakables(): void {
    const breakMat = new THREE.MeshStandardMaterial({
      color: 0x8c5a22,
      emissive: 0x20140a,
      emissiveIntensity: 0.4,
      roughness: 0.6,
      metalness: 0.1
    });
    THREE_LANE_MAP.breakables.forEach((br, idx) => {
      const geom = new THREE.BoxGeometry(br.hx * 2, br.hy * 2, br.hz * 2);
      const mesh = new THREE.Mesh(geom, breakMat);
      mesh.position.set(br.x, br.y, br.z);
      this.scene.add(mesh);
      this.breakableMeshes.set(idx, mesh);
    });
  }

  public destroyBreakable(id: number): void {
    const mesh = this.breakableMeshes.get(id);
    if (!mesh) return;
    this.scene.remove(mesh);
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
    this.breakableMeshes.delete(id);
  }
}
