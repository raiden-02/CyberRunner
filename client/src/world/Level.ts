import * as THREE from "three";

export class Level {
  private scene: THREE.Scene;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.createGround();
    this.createWalls();
    this.createObstacles();
    this.createDecorativeBoxes();
  }

  private createGround(): void {
    const grid = new THREE.GridHelper(100, 100, 0x4444ff, 0x222222);
    this.scene.add(grid);

    const axes = new THREE.AxesHelper(2);
    this.scene.add(axes);
  }

  private createWalls(): void {
    const wallMat = new THREE.MeshBasicMaterial({ color: 0x5050a0, wireframe: true });
    const halfSize = 25;
    const wallThickness = 1;
    const wallHeight = 6;
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
    const obstacleMat = new THREE.MeshBasicMaterial({ color: 0xa05050, wireframe: true });
    const obstacleGeom = new THREE.BoxGeometry(4, 2, 4);

    const positions = [
      new THREE.Vector3(0, 1, -10),
      new THREE.Vector3(10, 1, 10),
      new THREE.Vector3(-12, 1, 6),
    ];

    for (const pos of positions) {
      const mesh = new THREE.Mesh(obstacleGeom, obstacleMat);
      mesh.position.copy(pos);
      this.scene.add(mesh);
    }
  }

  private createDecorativeBoxes(): void {
    for (let i = -2; i <= 2; i++) {
      for (let j = -2; j <= 2; j++) {
        if (i === 0 && j === 0) continue;
        const box = new THREE.Mesh(
          new THREE.BoxGeometry(1, 1, 1),
          new THREE.MeshBasicMaterial({ color: (i + j) % 2 === 0 ? 0xff4477 : 0x44ffaa })
        );
        box.position.set(i * 5, 0.5, j * 5);
        this.scene.add(box);
      }
    }
  }
}
