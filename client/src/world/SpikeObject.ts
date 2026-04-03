/**
 * Spike Object - Visual representation of the Data Spike in S&D mode
 * Bright, cyberpunk-themed mesh that's easily visible
 */

import * as THREE from "three";

export type SpikeState = "ground" | "carried" | "uploading" | "uploaded" | "dropped" | "decrypting" | "decrypted";

export class SpikeObject {
  private mesh: THREE.Group;
  private scene: THREE.Scene;
  private visible: boolean = false;
  private glowMesh: THREE.Mesh;
  private coreMesh: THREE.Mesh;
  private ringMesh: THREE.Mesh;
  private pulseTime: number = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.mesh = new THREE.Group();

    // Core spike - octahedron shape (diamond-like)
    const coreGeom = new THREE.OctahedronGeometry(0.3, 0);
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xff3300,
      transparent: true,
      opacity: 0.9,
    });
    this.coreMesh = new THREE.Mesh(coreGeom, coreMat);
    this.coreMesh.position.y = 0.5;
    this.mesh.add(this.coreMesh);

    // Outer glow sphere
    const glowGeom = new THREE.SphereGeometry(0.5, 16, 16);
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0xff6600,
      transparent: true,
      opacity: 0.3,
      side: THREE.BackSide,
    });
    this.glowMesh = new THREE.Mesh(glowGeom, glowMat);
    this.glowMesh.position.y = 0.5;
    this.mesh.add(this.glowMesh);

    // Rotating ring
    const ringGeom = new THREE.TorusGeometry(0.4, 0.03, 8, 24);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xff9900,
      transparent: true,
      opacity: 0.8,
    });
    this.ringMesh = new THREE.Mesh(ringGeom, ringMat);
    this.ringMesh.position.y = 0.5;
    this.ringMesh.rotation.x = Math.PI / 2;
    this.mesh.add(this.ringMesh);

    // Add vertical beam of light
    const beamGeom = new THREE.CylinderGeometry(0.05, 0.15, 2, 8, 1, true);
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xff4400,
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide,
    });
    const beam = new THREE.Mesh(beamGeom, beamMat);
    beam.position.y = 1.5;
    this.mesh.add(beam);

    // Ground marker ring
    const groundRingGeom = new THREE.RingGeometry(0.3, 0.5, 24);
    const groundRingMat = new THREE.MeshBasicMaterial({
      color: 0xff3300,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide,
    });
    const groundRing = new THREE.Mesh(groundRingGeom, groundRingMat);
    groundRing.rotation.x = -Math.PI / 2;
    groundRing.position.y = 0.01;
    this.mesh.add(groundRing);

    this.mesh.visible = false;
  }

  setPosition(x: number, z: number): void {
    this.mesh.position.set(x, 0, z);
  }

  setVisible(visible: boolean): void {
    if (visible && !this.visible) {
      this.scene.add(this.mesh);
    } else if (!visible && this.visible) {
      this.scene.remove(this.mesh);
    }
    this.visible = visible;
    this.mesh.visible = visible;
  }

  update(dt: number, spikeState: SpikeState): void {
    if (!this.visible) return;

    this.pulseTime += dt;

    // Rotate the ring
    this.ringMesh.rotation.z += dt * 2;

    // Pulse effect based on state
    const pulseSpeed = spikeState === "uploaded" || spikeState === "decrypting" ? 4 : 2;
    const pulse = 0.9 + 0.1 * Math.sin(this.pulseTime * pulseSpeed);
    this.coreMesh.scale.setScalar(pulse);
    this.glowMesh.scale.setScalar(1 + 0.2 * Math.sin(this.pulseTime * pulseSpeed * 0.5));

    // Color based on state
    const coreMat = this.coreMesh.material as THREE.MeshBasicMaterial;
    const glowMat = this.glowMesh.material as THREE.MeshBasicMaterial;

    switch (spikeState) {
      case "ground":
      case "dropped":
        coreMat.color.setHex(0xff3300);
        glowMat.color.setHex(0xff6600);
        break;
      case "carried":
        // When carried, spike is not visible (player has it)
        break;
      case "uploading":
        coreMat.color.setHex(0xff6600);
        glowMat.color.setHex(0xffaa00);
        break;
      case "uploaded":
      case "decrypting":
        // Urgent red pulse when active
        coreMat.color.setHex(0xff0000);
        glowMat.color.setHex(0xff3300);
        break;
    }

    // Float animation
    this.coreMesh.position.y = 0.5 + 0.1 * Math.sin(this.pulseTime * 1.5);
    this.glowMesh.position.y = this.coreMesh.position.y;
    this.ringMesh.position.y = this.coreMesh.position.y;
  }

  dispose(): void {
    if (this.visible) {
      this.scene.remove(this.mesh);
    }
    this.coreMesh.geometry.dispose();
    (this.coreMesh.material as THREE.Material).dispose();
    this.glowMesh.geometry.dispose();
    (this.glowMesh.material as THREE.Material).dispose();
    this.ringMesh.geometry.dispose();
    (this.ringMesh.material as THREE.Material).dispose();
  }
}
