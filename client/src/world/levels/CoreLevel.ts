import * as THREE from "three";
import { resolveMapBounds } from "@shared/world/map-bounds.js";
import { BaseLevel } from "../core/BaseLevel.js";
import type { GameplayMapDefinition } from "@shared/world/map-types.js";
import { UploadTerminalMesh } from "../components/upload-terminal.js";

/**
 * Unstyled boxes from a canonical GameplayMapDefinition.
 * Smoke maps use this. Shoot House layers decoration on top of the same helpers.
 */
export class CoreLevel extends BaseLevel {
  private terminals: UploadTerminalMesh[] = [];

  constructor(scene: THREE.Scene, map: GameplayMapDefinition) {
    super(scene, map);
    this.build();
  }

  protected addObstacleNeonTrim(): void {}
  protected addOccluderNeonEdge(): void {}

  protected build(): void {
    const map = this.gameplayMap;
    const bounds = resolveMapBounds(map);
    this.createGroundFromBounds(bounds, "floor", true, 24, 4);
    this.createBoundaryWallsFromBounds(bounds, map.wallHeight, map.wallThickness, "wall");
    this.createObstaclesFromData(map.obstacles);
    this.createOccludersFromData(map.occluders);
    this.createBreakablesFromData(map.breakables);

    if (map.uploadTerminals) {
      for (const config of map.uploadTerminals) {
        const terminal = new UploadTerminalMesh(config);
        this.terminals.push(terminal);
        this.scene.add(terminal.group);
      }
    }
  }

  public override update(): void {
    super.update();
    const dt = 1 / 60;
    for (const terminal of this.terminals) {
      terminal.update(dt);
    }
  }

  public override dispose(): void {
    for (const terminal of this.terminals) {
      terminal.dispose();
    }
    this.terminals = [];
    super.dispose();
  }
}
