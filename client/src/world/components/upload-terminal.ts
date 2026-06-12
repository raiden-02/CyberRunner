/**
 * Upload Terminal Visual Component
 * Renders the objective terminals for Search & Destroy mode
 */

import * as THREE from "three";
import type { UploadTerminal } from "../maps/map-types.js";

const TERMINAL_HEIGHT = 1.2;
const TERMINAL_WIDTH = 0.8;
const TERMINAL_DEPTH = 0.6;

// Colors
const INACTIVE_COLOR = 0xd4893a;
const ACTIVE_COLOR = 0xc45c3a;
const UPLOADED_COLOR = 0x8a3a2e;
const ZONE_INACTIVE = 0xd4893a;
const ZONE_ACTIVE = 0xc45c3a;

export class UploadTerminalMesh {
  public readonly group: THREE.Group;
  public readonly zoneIndicator: THREE.Mesh;
  private readonly terminalBody: THREE.Mesh;
  private readonly screenMaterial: THREE.MeshStandardMaterial;
  private readonly zoneMaterial: THREE.MeshBasicMaterial;
  private pulse = 0;

  constructor(config: UploadTerminal) {
    this.group = new THREE.Group();
    this.group.name = `Terminal_${config.id}`;

    // Terminal body (console/kiosk shape)
    const bodyGeometry = new THREE.BoxGeometry(TERMINAL_WIDTH, TERMINAL_HEIGHT, TERMINAL_DEPTH);
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: 0x222222,
      metalness: 0.8,
      roughness: 0.3,
    });
    this.terminalBody = new THREE.Mesh(bodyGeometry, bodyMaterial);
    this.terminalBody.position.y = TERMINAL_HEIGHT / 2;
    this.group.add(this.terminalBody);

    // Screen (front face with glow)
    const screenGeometry = new THREE.PlaneGeometry(TERMINAL_WIDTH * 0.7, TERMINAL_HEIGHT * 0.5);
    this.screenMaterial = new THREE.MeshStandardMaterial({
      color: INACTIVE_COLOR,
      emissive: INACTIVE_COLOR,
      emissiveIntensity: 0.5,
    });
    const screen = new THREE.Mesh(screenGeometry, this.screenMaterial);
    screen.position.set(0, TERMINAL_HEIGHT * 0.6, TERMINAL_DEPTH / 2 + 0.01);
    this.group.add(screen);

    // Terminal ID label (A or B)
    const labelGeometry = new THREE.PlaneGeometry(0.4, 0.4);
    const labelCanvas = document.createElement("canvas");
    labelCanvas.width = 64;
    labelCanvas.height = 64;
    const ctx = labelCanvas.getContext("2d")!;
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = "#d4893a";
    ctx.font = "bold 48px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(config.id, 32, 32);
    const labelTexture = new THREE.CanvasTexture(labelCanvas);
    const labelMaterial = new THREE.MeshBasicMaterial({ map: labelTexture, transparent: true });
    const label = new THREE.Mesh(labelGeometry, labelMaterial);
    label.position.set(0, TERMINAL_HEIGHT * 0.3, TERMINAL_DEPTH / 2 + 0.02);
    this.group.add(label);

    // Ground zone indicator (circle showing interaction radius)
    const zoneGeometry = new THREE.RingGeometry(config.radius - 0.1, config.radius, 32);
    this.zoneMaterial = new THREE.MeshBasicMaterial({
      color: ZONE_INACTIVE,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
    });
    this.zoneIndicator = new THREE.Mesh(zoneGeometry, this.zoneMaterial);
    this.zoneIndicator.rotation.x = -Math.PI / 2;
    this.zoneIndicator.position.y = 0.02;
    this.group.add(this.zoneIndicator);

    // Inner fill for zone
    const zoneFillGeometry = new THREE.CircleGeometry(config.radius - 0.1, 32);
    const zoneFillMaterial = new THREE.MeshBasicMaterial({
      color: ZONE_INACTIVE,
      transparent: true,
      opacity: 0.1,
      side: THREE.DoubleSide,
    });
    const zoneFill = new THREE.Mesh(zoneFillGeometry, zoneFillMaterial);
    zoneFill.rotation.x = -Math.PI / 2;
    zoneFill.position.y = 0.01;
    this.group.add(zoneFill);

    // Position the terminal
    this.group.position.set(config.x, config.y, config.z);
  }

  setState(state: "inactive" | "uploading" | "uploaded"): void {
    let color = INACTIVE_COLOR;
    let zoneColor = ZONE_INACTIVE;

    switch (state) {
      case "uploading":
        color = ACTIVE_COLOR;
        zoneColor = ZONE_ACTIVE;
        break;
      case "uploaded":
        color = UPLOADED_COLOR;
        zoneColor = ZONE_ACTIVE;
        break;
    }

    this.screenMaterial.color.setHex(color);
    this.screenMaterial.emissive.setHex(color);
    this.zoneMaterial.color.setHex(zoneColor);
  }

  update(dt: number): void {
    this.pulse += dt * 2;
    const intensity = 0.3 + Math.sin(this.pulse) * 0.2;
    this.screenMaterial.emissiveIntensity = intensity;
    this.zoneMaterial.opacity = 0.2 + Math.sin(this.pulse) * 0.1;
  }

  dispose(): void {
    this.group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose());
        } else {
          child.material.dispose();
        }
      }
    });
  }
}
