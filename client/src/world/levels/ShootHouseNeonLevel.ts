/**
 * SHOOT HOUSE NEON LEVEL
 * Clean, competitive-focused visual construction.
 * Minimal visual clutter, clear sightlines.
 */
import * as THREE from "three";
import { BaseLevel } from "../core/BaseLevel.js";
import { MATERIAL_PRESETS } from "../core/MaterialFactory.js";
import type { NeonColorKey } from "../core/NeonColors.js";
import { SHOOT_HOUSE_NEON } from "../maps/shoot-house-neon.js";
import type {
  MapDefinition,
  ShootHouseMapDefinition,
  Building,
  Connector,
  NeonSign,
} from "../maps/map-types.js";

export class ShootHouseNeonLevel extends BaseLevel {
  constructor(scene: THREE.Scene) {
    super(scene);
  }

  protected getMapDefinition(): MapDefinition {
    return SHOOT_HOUSE_NEON;
  }

  private getFullMapDef(): ShootHouseMapDefinition {
    return SHOOT_HOUSE_NEON;
  }

  protected build(): void {
    const map = this.getFullMapDef();

    // Core geometry
    this.createGround(map);
    this.createWalls(map);
    this.createObstaclesFromData(map.obstacles);
    this.createOccludersFromData(map.occluders);
    this.createBreakablesFromData(map.breakables);

    // Visual elements (minimal)
    this.createBuildings(map.buildings);
    this.createConnectors(map.connectors);
    this.createNeonSigns(map.neonSigns);
    this.createLaneLights(map.laneLights);
    this.createSpawnMarkers(map.spawnLightColors);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GROUND
  // ═══════════════════════════════════════════════════════════════════════════

  private createGround(map: ShootHouseMapDefinition): void {
    const size = map.boundsHalfSize * 2;
    this.createGroundPlane(size + 4, "floorWet", true, 50);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // WALLS
  // ═══════════════════════════════════════════════════════════════════════════

  private createWalls(map: ShootHouseMapDefinition): void {
    this.createBoundaryWalls(map.boundsHalfSize, map.wallHeight, map.wallThickness, "wall");

    const y = map.wallHeight * 0.9;
    const len = map.boundsHalfSize * 2;
    const halfSize = map.boundsHalfSize;

    this.addWallNeonStrip(-halfSize - 0.5, y, 0, len, 0, "orange", 0.04, 0.02);
    this.addWallNeonStrip(halfSize + 0.5, y, 0, len, 0, "teal", 0.04, 0.02);
    this.addWallNeonStrip(0, y, -halfSize - 0.5, len, Math.PI / 2, "cyan", 0.04, 0.02);
    this.addWallNeonStrip(0, y, halfSize + 0.5, len, Math.PI / 2, "magenta", 0.04, 0.02);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // BUILDINGS (Simple structures)
  // ═══════════════════════════════════════════════════════════════════════════

  private createBuildings(buildings: Building[]): void {
    for (const bld of buildings) {
      this.createBuilding(bld);
    }
  }

  private createBuilding(bld: Building): void {
    const group = new THREE.Group();

    // Main structure
    const baseMat = this.materialFactory.createMaterial(MATERIAL_PRESETS.buildingBase);
    const baseMesh = new THREE.Mesh(
      new THREE.BoxGeometry(bld.hx * 2, bld.hy * 2, bld.hz * 2),
      baseMat
    );
    baseMesh.castShadow = true;
    baseMesh.receiveShadow = true;
    group.add(baseMesh);

    // Windows (if present)
    if (bld.windowColor) {
      this.addBuildingWindows(group, bld);
    }

    // Roof neon trim
    this.addRoofTrim(group, bld);

    group.position.set(bld.x, bld.y, bld.z);
    this.scene.add(group);
  }

  private addBuildingWindows(group: THREE.Group, bld: Building): void {
    const windowMat = this.materialFactory.createWindowMaterial(bld.windowColor!);
    const windowH = bld.hy * 0.5;
    const windowW = bld.hx * 1.4;

    // Front
    const front = new THREE.Mesh(new THREE.PlaneGeometry(windowW, windowH), windowMat);
    front.position.set(0, bld.hy * 0.1, bld.hz + 0.01);
    group.add(front);

    // Back
    const back = new THREE.Mesh(new THREE.PlaneGeometry(windowW, windowH), windowMat);
    back.position.set(0, bld.hy * 0.1, -bld.hz - 0.01);
    back.rotation.y = Math.PI;
    group.add(back);
  }

  private addRoofTrim(group: THREE.Group, bld: Building): void {
    const trimH = 0.05;
    const topY = bld.hy + trimH / 2;

    let colorKey: NeonColorKey = "cyan";
    if (bld.type === "warehouse") colorKey = "orange";
    if (bld.type === "bar") colorKey = "cyan";
    if (bld.type === "billboard") colorKey = "purple";

    const mat = this.materialFactory.createNeonMaterial(colorKey);

    // Front/back
    const fb = new THREE.BoxGeometry(bld.hx * 2 + 0.05, trimH, 0.04);
    const front = new THREE.Mesh(fb, mat);
    front.position.set(0, topY, bld.hz);
    group.add(front);

    const back = new THREE.Mesh(fb, mat);
    back.position.set(0, topY, -bld.hz);
    group.add(back);

    // Sides
    const lr = new THREE.BoxGeometry(0.04, trimH, bld.hz * 2 + 0.05);
    const left = new THREE.Mesh(lr, mat);
    left.position.set(-bld.hx, topY, 0);
    group.add(left);

    const right = new THREE.Mesh(lr, mat);
    right.position.set(bld.hx, topY, 0);
    group.add(right);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CONNECTORS
  // ═══════════════════════════════════════════════════════════════════════════

  private createConnectors(connectors: Connector[]): void {
    for (const conn of connectors) {
      this.createConnector(conn);
    }
  }

  private createConnector(conn: Connector): void {
    const group = new THREE.Group();
    const postMat = this.materialFactory.createMaterial(MATERIAL_PRESETS.metal);

    const frameW = conn.hx * 2;
    const frameH = conn.hy * 2;

    // Door frame posts
    const postGeom = new THREE.BoxGeometry(0.1, frameH, 0.1);

    const leftPost = new THREE.Mesh(postGeom, postMat);
    leftPost.position.set(-frameW / 2 + 0.05, 0, 0);
    leftPost.castShadow = true;
    group.add(leftPost);

    const rightPost = new THREE.Mesh(postGeom, postMat);
    rightPost.position.set(frameW / 2 - 0.05, 0, 0);
    rightPost.castShadow = true;
    group.add(rightPost);

    // Top beam
    const topBeam = new THREE.Mesh(new THREE.BoxGeometry(frameW, 0.08, 0.1), postMat);
    topBeam.position.set(0, conn.hy - 0.04, 0);
    topBeam.castShadow = true;
    group.add(topBeam);

    // Light strip
    const stripColor: NeonColorKey = conn.lighting === "warm" ? "orange" : "cyan";
    const stripMat = this.materialFactory.createNeonMaterial(stripColor);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(frameW - 0.3, 0.03, 0.04), stripMat);
    strip.position.set(0, conn.hy - 0.1, 0);
    group.add(strip);

    group.position.set(conn.x, conn.y, conn.z);
    this.scene.add(group);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // NEON SIGNS
  // ═══════════════════════════════════════════════════════════════════════════

  private createNeonSigns(signs: NeonSign[]): void {
    for (const sign of signs) {
      this.createNeonSign(sign);
    }
  }

  private createNeonSign(sign: NeonSign): void {
    const group = new THREE.Group();

    // Back panel
    const backMat = this.materialFactory.createMaterial({
      color: 0x0a0c10,
      roughness: 0.9,
      metalness: 0.1,
    });
    const back = new THREE.Mesh(
      new THREE.BoxGeometry(sign.width + 0.1, sign.height + 0.08, 0.04),
      backMat
    );
    back.position.z = -0.03;
    group.add(back);

    // Glowing sign
    const signMat = this.materialFactory.createNeonMaterial(sign.color);
    const signMesh = new THREE.Mesh(
      new THREE.BoxGeometry(sign.width, sign.height, 0.03),
      signMat
    );
    signMesh.position.z = 0.01;
    group.add(signMesh);

    group.position.set(sign.x, sign.y, sign.z);
    group.rotation.y = sign.rotationY;
    this.scene.add(group);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LANE LIGHTS
  // ═══════════════════════════════════════════════════════════════════════════

  private createLaneLights(lights: Array<{ x: number; y: number; z: number; color: number; intensity: number; distance: number; decay: number }>): void {
    for (const cfg of lights) {
      const light = new THREE.PointLight(cfg.color, cfg.intensity, cfg.distance, cfg.decay);
      light.position.set(cfg.x, cfg.y, cfg.z);
      this.scene.add(light);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SPAWN MARKERS
  // ═══════════════════════════════════════════════════════════════════════════

  private createSpawnMarkers(colors: { north: number; south: number }): void {
    // Simple floor glow strips at spawns
    const width = 40;
    const depth = 2;
    const h = 0.015;

    const northMat = this.materialFactory.createGlowMaterial(colors.north, 0.5);
    const north = new THREE.Mesh(new THREE.BoxGeometry(width, h, depth), northMat);
    north.position.set(0, h / 2, -26);
    this.addMesh(north);

    const southMat = this.materialFactory.createGlowMaterial(colors.south, 0.5);
    const south = new THREE.Mesh(new THREE.BoxGeometry(width, h, depth), southMat);
    south.position.set(0, h / 2, 26);
    this.addMesh(south);
  }
}
