/**
 * Plant Site Marker - Visual perimeter for upload terminals in S&D mode
 * Shows highlighted circles on the ground to indicate plant zones
 */

import * as THREE from "three";

export interface PlantSiteConfig {
  id: "A" | "B";
  x: number;
  z: number;
  radius: number;
}

export type PlantSiteState = "inactive" | "uploading" | "uploaded";

export class PlantSiteMarker {
  private mesh: THREE.Group;
  private scene: THREE.Scene;
  public readonly config: PlantSiteConfig;
  private outerRing: THREE.Mesh;
  private innerRing: THREE.Mesh;
  private labelMesh: THREE.Mesh;
  private pulseTime: number = 0;
  private state: PlantSiteState = "inactive";

  constructor(scene: THREE.Scene, config: PlantSiteConfig) {
    this.scene = scene;
    this.config = config;
    this.mesh = new THREE.Group();
    this.mesh.position.set(config.x, 0.02, config.z);

    // Outer perimeter ring
    const outerGeom = new THREE.RingGeometry(config.radius - 0.1, config.radius, 48);
    const outerMat = new THREE.MeshBasicMaterial({
      color: config.id === "A" ? 0x4a8b8a : 0xd4893a,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
    });
    this.outerRing = new THREE.Mesh(outerGeom, outerMat);
    this.outerRing.rotation.x = -Math.PI / 2;
    this.mesh.add(this.outerRing);

    // Inner fill circle (subtle)
    const innerGeom = new THREE.CircleGeometry(config.radius - 0.1, 48);
    const innerMat = new THREE.MeshBasicMaterial({
      color: config.id === "A" ? 0x4a8b8a : 0xd4893a,
      transparent: true,
      opacity: 0.1,
      side: THREE.DoubleSide,
    });
    this.innerRing = new THREE.Mesh(innerGeom, innerMat);
    this.innerRing.rotation.x = -Math.PI / 2;
    this.innerRing.position.y = -0.01;
    this.mesh.add(this.innerRing);

    // Corner markers (4 corners of the zone)
    const cornerGeom = new THREE.PlaneGeometry(0.5, 0.5);
    const cornerMat = new THREE.MeshBasicMaterial({
      color: config.id === "A" ? 0x4a8b8a : 0xd4893a,
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide,
    });
    
    const cornerPositions = [
      { x: config.radius * 0.7, z: config.radius * 0.7 },
      { x: -config.radius * 0.7, z: config.radius * 0.7 },
      { x: config.radius * 0.7, z: -config.radius * 0.7 },
      { x: -config.radius * 0.7, z: -config.radius * 0.7 },
    ];

    for (const pos of cornerPositions) {
      const corner = new THREE.Mesh(cornerGeom.clone(), cornerMat.clone());
      corner.rotation.x = -Math.PI / 2;
      corner.position.set(pos.x, 0.01, pos.z);
      this.mesh.add(corner);
    }

    // Terminal pillar/hologram
    const pillarGeom = new THREE.CylinderGeometry(0.3, 0.4, 1.5, 8);
    const pillarMat = new THREE.MeshBasicMaterial({
      color: config.id === "A" ? 0x006666 : 0x660066,
      transparent: true,
      opacity: 0.6,
    });
    const pillar = new THREE.Mesh(pillarGeom, pillarMat);
    pillar.position.y = 0.75;
    this.mesh.add(pillar);

    // Terminal top platform
    const topGeom = new THREE.CylinderGeometry(0.5, 0.3, 0.2, 8);
    const topMat = new THREE.MeshBasicMaterial({
      color: config.id === "A" ? 0x4a8b8a : 0xd4893a,
      transparent: true,
      opacity: 0.8,
    });
    const top = new THREE.Mesh(topGeom, topMat);
    top.position.y = 1.6;
    this.mesh.add(top);

    // Label (site ID)
    const labelCanvas = document.createElement("canvas");
    labelCanvas.width = 128;
    labelCanvas.height = 128;
    const ctx = labelCanvas.getContext("2d")!;
    ctx.fillStyle = config.id === "A" ? "#4a8b8a" : "#d4893a";
    ctx.font = "bold 80px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(config.id, 64, 64);

    const labelTexture = new THREE.CanvasTexture(labelCanvas);
    const labelGeom = new THREE.PlaneGeometry(1, 1);
    const labelMat = new THREE.MeshBasicMaterial({
      map: labelTexture,
      transparent: true,
      side: THREE.DoubleSide,
    });
    this.labelMesh = new THREE.Mesh(labelGeom, labelMat);
    this.labelMesh.position.y = 2.2;
    this.mesh.add(this.labelMesh);

    this.scene.add(this.mesh);
  }

  setState(state: PlantSiteState): void {
    this.state = state;

    const outerMat = this.outerRing.material as THREE.MeshBasicMaterial;
    const innerMat = this.innerRing.material as THREE.MeshBasicMaterial;

    switch (state) {
      case "inactive":
        outerMat.color.setHex(this.config.id === "A" ? 0x4a8b8a : 0xd4893a);
        innerMat.opacity = 0.1;
        break;
      case "uploading":
        outerMat.color.setHex(0xc45c3a);
        innerMat.color.setHex(0xc45c3a);
        innerMat.opacity = 0.3;
        break;
      case "uploaded":
        outerMat.color.setHex(0x8a3a2e);
        innerMat.color.setHex(0x8a3a2e);
        innerMat.opacity = 0.4;
        break;
    }
  }

  update(dt: number): void {
    this.pulseTime += dt;

    // Make label always face camera would require camera ref
    // For now, just rotate slowly
    this.labelMesh.rotation.y = this.pulseTime * 0.5;

    // Pulse effect when active
    if (this.state === "uploading" || this.state === "uploaded") {
      const pulse = 0.8 + 0.2 * Math.sin(this.pulseTime * 4);
      const outerMat = this.outerRing.material as THREE.MeshBasicMaterial;
      outerMat.opacity = 0.4 + 0.3 * pulse;
    }
  }

  setVisible(visible: boolean): void {
    this.mesh.visible = visible;
  }

  dispose(): void {
    this.scene.remove(this.mesh);
    this.mesh.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (child.material instanceof THREE.Material) {
          child.material.dispose();
        }
      }
    });
  }
}
