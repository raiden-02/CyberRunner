/**
 * BASE LEVEL (Abstract)
 * Base class for all game levels.
 * Provides common utilities and defines the interface for level construction.
 */
import * as THREE from "three";
import { MaterialFactory, MATERIAL_PRESETS, type MaterialParams } from "./MaterialFactory.js";
import type { NeonColorKey } from "./NeonColors.js";
import type { BoxObstacle } from "@shared/world/map-types.js";
import type { GameplayMapDefinition } from "@shared/world/map-types.js";

/**
 * Abstract base class for all game levels.
 * Subclasses must implement abstract methods for map-specific construction.
 */
export abstract class BaseLevel {
  protected scene: THREE.Scene;
  protected materialFactory: MaterialFactory;
  protected breakableMeshes = new Map<number, THREE.Mesh>();
  protected animatedObjects: AnimatedObject[] = [];
  protected clock = new THREE.Clock();
  protected meshes: THREE.Object3D[] = [];

  constructor(scene: THREE.Scene, protected readonly gameplayMap: GameplayMapDefinition) {
    this.scene = scene;
    this.materialFactory = new MaterialFactory();
  }

  // ═══════════════════════════════════════════════════════════════
  // ABSTRACT METHODS - Must be implemented by subclasses
  // ═══════════════════════════════════════════════════════════════

  /**
   * Get the map definition for this level
   */
  protected getMapDefinition(): GameplayMapDefinition {
    return this.gameplayMap;
  }

  /**
   * Build the level geometry. Subclasses must call this after super().
   */
  protected abstract build(): void;

  // ═══════════════════════════════════════════════════════════════
  // COMMON CONSTRUCTION METHODS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Create the ground plane with optional grid
   */
  protected createGroundPlane(
    size: number,
    materialPreset: keyof typeof MATERIAL_PRESETS = "floor",
    showGrid = true,
    gridDivisions = 60
  ): void {
    const floorMat = this.materialFactory.createMaterial(MATERIAL_PRESETS[materialPreset]);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      floorMat
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0;
    floor.receiveShadow = true;
    this.addMesh(floor);

    if (showGrid) {
      const grid = new THREE.GridHelper(size, gridDivisions, 0x8a8274, 0x6a6862);
      grid.position.y = 0.01;
      this.scene.add(grid);
    }
  }

  /**
   * Create boundary walls around the map
   */
  protected createBoundaryWalls(
    halfSize: number,
    wallHeight: number,
    wallThickness: number,
    materialPreset: keyof typeof MATERIAL_PRESETS = "wall"
  ): void {
    const wallMat = this.materialFactory.createMaterial(MATERIAL_PRESETS[materialPreset]);
    const posY = wallHeight / 2;

    const wallGeomX = new THREE.BoxGeometry(wallThickness * 2, wallHeight, halfSize * 2);
    const wallGeomZ = new THREE.BoxGeometry(halfSize * 2, wallHeight, wallThickness * 2);

    const createWall = (geom: THREE.BoxGeometry, x: number, z: number): THREE.Mesh => {
      const wall = new THREE.Mesh(geom, wallMat);
      wall.position.set(x, posY, z);
      wall.castShadow = true;
      wall.receiveShadow = true;
      return wall;
    };

    this.addMesh(createWall(wallGeomX, halfSize + wallThickness, 0));
    this.addMesh(createWall(wallGeomX, -halfSize - wallThickness, 0));
    this.addMesh(createWall(wallGeomZ, 0, halfSize + wallThickness));
    this.addMesh(createWall(wallGeomZ, 0, -halfSize - wallThickness));
  }

  /**
   * Create box obstacles from map definition
   */
  protected createObstaclesFromData(
    obstacles: BoxObstacle[],
    dividerMaterial: MaterialParams = MATERIAL_PRESETS.divider,
    coverMaterial: MaterialParams = MATERIAL_PRESETS.cover,
    dividerThreshold = 0.6
  ): void {
    const dividerMat = this.materialFactory.createMaterial(dividerMaterial);
    const coverMat = this.materialFactory.createMaterial(coverMaterial);

    for (const obs of obstacles) {
      const isDivider = obs.hx <= dividerThreshold || obs.hz <= dividerThreshold;
      const mat = isDivider ? dividerMat : coverMat;
      const geom = new THREE.BoxGeometry(obs.hx * 2, obs.hy * 2, obs.hz * 2);
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.set(obs.x, obs.y, obs.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.addMesh(mesh);

      if (!isDivider) {
        this.addObstacleNeonTrim(obs);
      }
    }
  }

  /**
   * Add neon trim to an obstacle (override for custom behavior)
   */
  protected addObstacleNeonTrim(obs: BoxObstacle): void {
    const trimHeight = 0.05;
    const topY = obs.y + obs.hy + trimHeight / 2;

    // Default: color by X position
    const colorKey: NeonColorKey = obs.x < 0 ? "cyan" : obs.x > 0 ? "magenta" : "purple";

    const trim = this.createNeonStrip(obs.hx * 2 + 0.08, trimHeight, obs.hz * 2 + 0.08, colorKey);
    trim.position.set(obs.x, topY, obs.z);
    this.addMesh(trim);
  }

  /**
   * Create occluders (tall sightline blockers)
   */
  protected createOccludersFromData(
    occluders: BoxObstacle[],
    materialPreset: keyof typeof MATERIAL_PRESETS = "occluder"
  ): void {
    const occMat = this.materialFactory.createMaterial(MATERIAL_PRESETS[materialPreset]);

    for (const occ of occluders) {
      const geom = new THREE.BoxGeometry(occ.hx * 2, occ.hy * 2, occ.hz * 2);
      const mesh = new THREE.Mesh(geom, occMat);
      mesh.position.set(occ.x, occ.y, occ.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.addMesh(mesh);

      this.addOccluderNeonEdge(occ);
    }
  }

  /**
   * Add neon edge to an occluder (override for custom behavior)
   */
  protected addOccluderNeonEdge(occ: BoxObstacle): void {
    const edgeHeight = 0.06;
    const topY = occ.y + occ.hy + edgeHeight / 2;
    const colorKey: NeonColorKey = occ.z < 0 ? "magenta" : "cyan";

    const edge = this.createNeonStrip(occ.hx * 2, edgeHeight, 0.06, colorKey);
    edge.position.set(occ.x, topY, occ.z - occ.hz);
    this.addMesh(edge);

    const edge2 = this.createNeonStrip(occ.hx * 2, edgeHeight, 0.06, colorKey);
    edge2.position.set(occ.x, topY, occ.z + occ.hz);
    this.addMesh(edge2);
  }

  /**
   * Create breakable objects
   */
  protected createBreakablesFromData(
    breakables: Array<BoxObstacle & { hp: number }>,
    materialPreset: keyof typeof MATERIAL_PRESETS = "breakable"
  ): void {
    const breakMat = this.materialFactory.createMaterial(MATERIAL_PRESETS[materialPreset]);

    breakables.forEach((br, idx) => {
      const geom = new THREE.BoxGeometry(br.hx * 2, br.hy * 2, br.hz * 2);
      const mesh = new THREE.Mesh(geom, breakMat);
      mesh.position.set(br.x, br.y, br.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.addMesh(mesh);
      this.breakableMeshes.set(idx, mesh);
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // NEON UTILITIES
  // ═══════════════════════════════════════════════════════════════

  /**
   * Create a neon strip/bar
   */
  protected createNeonStrip(
    width: number,
    height: number,
    depth: number,
    colorKey: NeonColorKey
  ): THREE.Mesh {
    const geom = new THREE.BoxGeometry(width, height, depth);
    const mat = this.materialFactory.createNeonMaterial(colorKey);
    return new THREE.Mesh(geom, mat);
  }

  /**
   * Create a floor neon strip (lane marking)
   */
  protected createFloorStrip(
    x: number,
    z: number,
    length: number,
    colorKey: NeonColorKey,
    width = 0.12,
    height = 0.04,
    rotateZ = false
  ): void {
    const geom = rotateZ 
      ? new THREE.BoxGeometry(length, height, width)
      : new THREE.BoxGeometry(width, height, length);
    const mat = this.materialFactory.createNeonMaterial(colorKey);
    const strip = new THREE.Mesh(geom, mat);
    strip.position.set(x, height / 2, z);
    strip.receiveShadow = true;
    this.addMesh(strip);
  }

  /**
   * Add a wall neon accent strip
   */
  protected addWallNeonStrip(
    x: number,
    y: number,
    z: number,
    length: number,
    rotationY: number,
    colorKey: NeonColorKey,
    stripHeight = 0.08,
    stripDepth = 0.04
  ): void {
    const strip = this.createNeonStrip(length, stripHeight, stripDepth, colorKey);
    strip.position.set(x, y, z);
    strip.rotation.y = rotationY;
    this.addMesh(strip);
  }

  // ═══════════════════════════════════════════════════════════════
  // ANIMATION SYSTEM
  // ═══════════════════════════════════════════════════════════════

  /**
   * Register an object for animation (flickering, pulsing, etc.)
   */
  protected registerAnimatedObject(mesh: THREE.Mesh, speed = 2, phase?: number): void {
    this.animatedObjects.push({
      mesh,
      phase: phase ?? Math.random() * Math.PI * 2,
      speed,
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // MESH MANAGEMENT
  // ═══════════════════════════════════════════════════════════════

  /**
   * Add a mesh to the scene and track it
   */
  protected addMesh(mesh: THREE.Object3D): void {
    this.scene.add(mesh);
    this.meshes.push(mesh);
  }

  // ═══════════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════════

  /**
   * Update animations. Call every frame.
   */
  public update(): void {
    const time = this.clock.getElapsedTime();

    for (const obj of this.animatedObjects) {
      const intensity = 0.7 + 0.3 * Math.sin(time * obj.speed + obj.phase);
      const mat = obj.mesh.material as THREE.MeshStandardMaterial;
      if (mat.emissiveIntensity !== undefined) {
        // Store original intensity if not already stored
        if ((obj as any).originalIntensity === undefined) {
          (obj as any).originalIntensity = mat.emissiveIntensity;
        }
        mat.emissiveIntensity = (obj as any).originalIntensity * intensity;
      }
    }
  }

  /**
   * Destroy a breakable object by ID
   */
  public destroyBreakable(id: number): void {
    const mesh = this.breakableMeshes.get(id);
    if (!mesh) return;
    this.scene.remove(mesh);
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
    this.breakableMeshes.delete(id);

    // Remove from meshes array
    const idx = this.meshes.indexOf(mesh);
    if (idx !== -1) this.meshes.splice(idx, 1);
  }

  /**
   * Dispose all level resources
   */
  public dispose(): void {
    // Dispose all meshes
    for (const mesh of this.meshes) {
      this.scene.remove(mesh);
      if (mesh instanceof THREE.Mesh) {
        mesh.geometry.dispose();
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach(m => m.dispose());
        } else {
          mesh.material.dispose();
        }
      }
    }
    this.meshes = [];
    this.breakableMeshes.clear();
    this.animatedObjects = [];
    this.materialFactory.dispose();
  }
}

/**
 * Animated object tracking
 */
export interface AnimatedObject {
  mesh: THREE.Mesh;
  phase: number;
  speed: number;
}
