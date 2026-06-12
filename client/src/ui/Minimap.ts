/**
 * Minimap Component
 * Player-centered, rotation-following overhead view
 * Shows map layout, player positions, terminals, and objectives
 */

import { SHOOT_HOUSE_NEON } from "../world/maps/shoot-house-neon.js";

export interface MinimapConfig {
  mapSize: number;      // World units visible on minimap (zoom level)
  displaySize: number;  // Pixels
}

export interface TerminalInfo {
  id: "A" | "B";
  x: number;
  z: number;
  state: "inactive" | "uploading" | "uploaded";
}

export interface PlayerMarker {
  id: string;
  x: number;
  z: number;
  rotationY: number;
  isLocal: boolean;
  hasSpike: boolean;
  isDead: boolean;
  teamId?: string;
}

interface MapObstacle {
  x: number;
  z: number;
  hx: number;
  hz: number;
}

const DEFAULT_CONFIG: MinimapConfig = {
  mapSize: 40,  // Show 40 world units around player
  displaySize: 180,
};

export class Minimap {
  private container: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private config: MinimapConfig;
  private terminals: TerminalInfo[] = [];
  private players: PlayerMarker[] = [];
  private droppedSpikePos: { x: number; z: number } | null = null;
  private mapObstacles: MapObstacle[] = [];
  private mapBoundsHalf: number = 28;

  constructor(config: Partial<MinimapConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Load map obstacles from the map definition
    this.loadMapData();

    // Container (circular shape for player-centered minimap)
    this.container = document.createElement("div");
    this.container.style.cssText = `
      position: fixed;
      top: 20px;
      left: 20px;
      width: ${this.config.displaySize}px;
      height: ${this.config.displaySize}px;
      background: rgba(0, 10, 20, 0.85);
      border: 2px solid #4a433a;
      border-radius: 50%;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
      pointer-events: none;
      z-index: 100;
      overflow: hidden;
    `;

    // Canvas
    this.canvas = document.createElement("canvas");
    this.canvas.width = this.config.displaySize;
    this.canvas.height = this.config.displaySize;
    this.canvas.style.cssText = `
      width: 100%;
      height: 100%;
    `;
    this.container.appendChild(this.canvas);

    this.ctx = this.canvas.getContext("2d")!;

    // Compass indicator
    const compass = document.createElement("div");
    compass.style.cssText = `
      position: absolute;
      top: 4px;
      left: 50%;
      transform: translateX(-50%);
      font-size: 10px;
      color: #d4893a;
      font-weight: bold;
    `;
    compass.textContent = "N";
    this.container.appendChild(compass);

    document.body.appendChild(this.container);
  }

  private loadMapData(): void {
    // Combine obstacles and occluders for minimap display
    const map = SHOOT_HOUSE_NEON;
    this.mapBoundsHalf = map.boundsHalfSize;
    
    this.mapObstacles = [
      ...map.obstacles.map(o => ({ x: o.x, z: o.z, hx: o.hx, hz: o.hz })),
      ...map.occluders.map(o => ({ x: o.x, z: o.z, hx: o.hx, hz: o.hz })),
    ];
  }

  setTerminals(terminals: TerminalInfo[]): void {
    this.terminals = terminals;
  }

  setPlayers(players: PlayerMarker[]): void {
    this.players = players;
  }

  setDroppedSpike(pos: { x: number; z: number } | null): void {
    this.droppedSpikePos = pos;
  }

  private worldToMinimap(
    worldX: number,
    worldZ: number,
    centerX: number,
    centerZ: number,
    rotation: number
  ): { x: number; y: number } | null {
    // Translate relative to player
    const relX = worldX - centerX;
    const relZ = worldZ - centerZ;
    
    // Rotate to player's view (player always faces up)
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const rotX = relX * cos - relZ * sin;
    const rotZ = relX * sin + relZ * cos;
    
    // Scale to minimap
    const scale = this.config.displaySize / this.config.mapSize;
    const halfSize = this.config.displaySize / 2;
    
    const mapX = halfSize + rotX * scale;
    const mapY = halfSize + rotZ * scale; // Forward (-Z in world) appears at top
    
    // Check if within minimap bounds (circular)
    const dx = mapX - halfSize;
    const dy = mapY - halfSize;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > halfSize - 4) {
      return null; // Outside minimap circle
    }
    
    return { x: mapX, y: mapY };
  }

  update(): void {
    const ctx = this.ctx;
    const size = this.config.displaySize;
    const halfSize = size / 2;

    // Find local player for center and rotation
    const localPlayer = this.players.find(p => p.isLocal);
    if (!localPlayer) {
      ctx.fillStyle = "rgba(0, 15, 30, 0.9)";
      ctx.fillRect(0, 0, size, size);
      return;
    }

    const centerX = localPlayer.x;
    const centerZ = localPlayer.z;
    const rotation = localPlayer.rotationY;

    // Clear with circular clip
    ctx.save();
    ctx.beginPath();
    ctx.arc(halfSize, halfSize, halfSize - 2, 0, Math.PI * 2);
    ctx.clip();

    // Background
    ctx.fillStyle = "rgba(0, 15, 30, 0.95)";
    ctx.fillRect(0, 0, size, size);

    // Draw map boundaries
    this.drawMapBounds(ctx, centerX, centerZ, rotation);

    // Draw obstacles (walls and cover)
    this.drawObstacles(ctx, centerX, centerZ, rotation);

    // Draw terminals
    for (const terminal of this.terminals) {
      const pos = this.worldToMinimap(terminal.x, terminal.z, centerX, centerZ, rotation);
      if (!pos) continue;
      
      // Terminal zone
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 10, 0, Math.PI * 2);
      
      let color = terminal.id === "A" ? "#4a8b8a" : "#d4893a";
      if (terminal.state === "uploading") {
        color = "#c45c3a";
      } else if (terminal.state === "uploaded") {
        color = "#8a3a2e";
      }
      
      ctx.fillStyle = color + "33";
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.stroke();

      // Terminal label
      ctx.fillStyle = color;
      ctx.font = "bold 10px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(terminal.id, pos.x, pos.y);
    }

    // Draw dropped/ground spike
    if (this.droppedSpikePos) {
      const pos = this.worldToMinimap(
        this.droppedSpikePos.x,
        this.droppedSpikePos.z,
        centerX,
        centerZ,
        rotation
      );
      if (pos) {
        // Pulsing spike marker
        const pulse = 0.8 + 0.2 * Math.sin(Date.now() * 0.005);
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 6 * pulse, 0, Math.PI * 2);
        ctx.fillStyle = "#c45c3a";
        ctx.fill();
        ctx.strokeStyle = "#d4893a";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    // Draw teammates only
    const localTeam = localPlayer.teamId;
    for (const player of this.players) {
      if (player.isDead) continue;
      if (player.isLocal) continue;
      if (!localTeam || player.teamId !== localTeam) continue;

      const pos = this.worldToMinimap(player.x, player.z, centerX, centerZ, rotation);
      if (!pos) continue;

      ctx.save();
      ctx.translate(pos.x, pos.y);
      ctx.rotate(-(player.rotationY - rotation));

      ctx.beginPath();
      ctx.moveTo(0, -6);
      ctx.lineTo(-4, 4);
      ctx.lineTo(4, 4);
      ctx.closePath();

      ctx.fillStyle = "#4a8b8a";
      ctx.strokeStyle = "#4a8b8a";
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.stroke();

      if (player.hasSpike) {
        ctx.beginPath();
        ctx.arc(0, 0, 9, 0, Math.PI * 2);
        ctx.strokeStyle = "#ffaa00";
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      ctx.restore();
    }

    // Draw local player (always in center, always pointing up)
    ctx.save();
    ctx.translate(halfSize, halfSize);
    
    // Draw player triangle pointing up (forward)
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(-5, 5);
    ctx.lineTo(5, 5);
    ctx.closePath();
    ctx.fillStyle = "#d4893a";
    ctx.strokeStyle = "#d4893a";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.stroke();

    // Spike indicator for local player
    if (localPlayer.hasSpike) {
      ctx.beginPath();
      ctx.arc(0, 0, 10, 0, Math.PI * 2);
      ctx.strokeStyle = "#ffaa00";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    ctx.restore();
    ctx.restore(); // Restore clip
  }

  private drawMapBounds(
    ctx: CanvasRenderingContext2D,
    centerX: number,
    centerZ: number,
    rotation: number
  ): void {
    const corners = [
      { x: -this.mapBoundsHalf, z: -this.mapBoundsHalf },
      { x: this.mapBoundsHalf, z: -this.mapBoundsHalf },
      { x: this.mapBoundsHalf, z: this.mapBoundsHalf },
      { x: -this.mapBoundsHalf, z: this.mapBoundsHalf },
    ];

    // Draw lines between corners that are visible
    ctx.strokeStyle = "rgba(212, 137, 58, 0.35)";
    ctx.lineWidth = 2;
    
    for (let i = 0; i < corners.length; i++) {
      const c1 = corners[i];
      const c2 = corners[(i + 1) % corners.length];
      
      const p1 = this.worldToMinimap(c1.x, c1.z, centerX, centerZ, rotation);
      const p2 = this.worldToMinimap(c2.x, c2.z, centerX, centerZ, rotation);
      
      if (p1 && p2) {
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      }
    }
  }

  private drawObstacles(
    ctx: CanvasRenderingContext2D,
    centerX: number,
    centerZ: number,
    rotation: number
  ): void {
    for (const obs of this.mapObstacles) {
      // Get all 4 corners of the obstacle in world space
      const corners = [
        { x: obs.x - obs.hx, z: obs.z - obs.hz },
        { x: obs.x + obs.hx, z: obs.z - obs.hz },
        { x: obs.x + obs.hx, z: obs.z + obs.hz },
        { x: obs.x - obs.hx, z: obs.z + obs.hz },
      ];

      // Transform all corners to minimap space
      const transformedCorners: Array<{ x: number; y: number }> = [];
      let allVisible = true;
      
      for (const corner of corners) {
        const pos = this.worldToMinimap(corner.x, corner.z, centerX, centerZ, rotation);
        if (!pos) {
          allVisible = false;
          break;
        }
        transformedCorners.push(pos);
      }

      // Skip if any corner is outside the minimap
      if (!allVisible || transformedCorners.length < 4) continue;

      // Draw the transformed polygon
      ctx.beginPath();
      ctx.moveTo(transformedCorners[0].x, transformedCorners[0].y);
      for (let i = 1; i < transformedCorners.length; i++) {
        ctx.lineTo(transformedCorners[i].x, transformedCorners[i].y);
      }
      ctx.closePath();

      ctx.fillStyle = "rgba(80, 90, 100, 0.7)";
      ctx.strokeStyle = "rgba(120, 130, 140, 0.5)";
      ctx.lineWidth = 1;
      ctx.fill();
      ctx.stroke();
    }
  }

  show(): void {
    this.container.style.display = "block";
  }

  hide(): void {
    this.container.style.display = "none";
  }

  dispose(): void {
    this.container.remove();
  }
}
