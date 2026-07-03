import { circleInsideBounds, hypot2, solidOverlapsStandingCapsule } from "./geometry.js";
import {
  GRID_CELL_METERS,
  PLAYER_RADIUS,
  type ArenaMap,
  type ArenaObjective,
  type ArenaSpawn,
} from "./types.js";

const ORTHO: Array<[number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/**
 * XZ occupancy grid for standing ground traversal.
 * 4-neighbor only. No diagonal corner-cutting.
 * Does not model jump, crouch-only gaps, slide, or destroying breakables.
 */
export class NavGrid {
  readonly cell = GRID_CELL_METERS;
  readonly cols: number;
  readonly rows: number;
  readonly walkable: boolean[];
  readonly component: number[];
  readonly componentCount: number;
  readonly walkableCount: number;

  constructor(private readonly map: ArenaMap) {
    const span = map.boundsHalfSize * 2;
    this.cols = Math.max(1, Math.round(span / this.cell));
    this.rows = this.cols;
    const n = this.cols * this.rows;
    this.walkable = new Array(n).fill(false);

    let walkableCount = 0;
    for (let j = 0; j < this.rows; j++) {
      for (let i = 0; i < this.cols; i++) {
        const { x, z } = this.cellCenter(i, j);
        const idx = this.index(i, j);
        if (!circleInsideBounds(x, z, PLAYER_RADIUS, map.boundsHalfSize)) continue;
        let blocked = false;
        for (const solid of map.solids) {
          if (solidOverlapsStandingCapsule(solid, x, z)) {
            blocked = true;
            break;
          }
        }
        if (!blocked) {
          this.walkable[idx] = true;
          walkableCount++;
        }
      }
    }
    this.walkableCount = walkableCount;

    this.component = new Array(n).fill(-1);
    let next = 0;
    for (let idx = 0; idx < n; idx++) {
      if (!this.walkable[idx] || this.component[idx] !== -1) continue;
      this.flood(idx, next);
      next++;
    }
    this.componentCount = next;
  }

  get totalCells(): number {
    return this.cols * this.rows;
  }

  index(i: number, j: number): number {
    return j * this.cols + i;
  }

  cellCenter(i: number, j: number): { x: number; z: number } {
    const origin = -this.map.boundsHalfSize;
    return {
      x: origin + (i + 0.5) * this.cell,
      z: origin + (j + 0.5) * this.cell,
    };
  }

  worldToCell(x: number, z: number): { i: number; j: number } | null {
    const origin = -this.map.boundsHalfSize;
    const i = Math.floor((x - origin) / this.cell);
    const j = Math.floor((z - origin) / this.cell);
    if (i < 0 || j < 0 || i >= this.cols || j >= this.rows) return null;
    return { i, j };
  }

  cellIndexAt(x: number, z: number): number | null {
    const c = this.worldToCell(x, z);
    if (!c) return null;
    return this.index(c.i, c.j);
  }

  isWalkableWorld(x: number, z: number): boolean {
    const idx = this.cellIndexAt(x, z);
    return idx !== null && this.walkable[idx];
  }

  componentAt(x: number, z: number): number | null {
    const idx = this.cellIndexAt(x, z);
    if (idx === null || this.component[idx] < 0) return null;
    return this.component[idx];
  }

  largestComponent(): { id: number; cells: number } {
    const sizes = new Array(this.componentCount).fill(0);
    for (const id of this.component) {
      if (id >= 0) sizes[id]++;
    }
    let best = 0;
    let bestId = 0;
    for (let i = 0; i < sizes.length; i++) {
      if (sizes[i] > best) {
        best = sizes[i];
        bestId = i;
      }
    }
    return { id: bestId, cells: best };
  }

  objectiveCells(obj: ArenaObjective): number[] {
    const out: number[] = [];
    for (let j = 0; j < this.rows; j++) {
      for (let i = 0; i < this.cols; i++) {
        const idx = this.index(i, j);
        if (!this.walkable[idx]) continue;
        const { x, z } = this.cellCenter(i, j);
        if (hypot2(x - obj.x, z - obj.z) <= obj.radius) out.push(idx);
      }
    }
    return out;
  }

  /** Shortest 4-neighbor path in meters, or null. */
  pathMeters(fromIdx: number, goalIdxs: number[]): number | null {
    if (goalIdxs.length === 0) return null;
    const goals = new Set(goalIdxs);
    if (goals.has(fromIdx)) return 0;

    const n = this.totalCells;
    const seen = new Uint8Array(n);
    const q: number[] = [fromIdx];
    seen[fromIdx] = 1;
    let head = 0;
    const dist = new Float64Array(n);
    dist[fromIdx] = 0;

    while (head < q.length) {
      const cur = q[head++];
      const i = cur % this.cols;
      const j = (cur - i) / this.cols;
      for (const [di, dj] of ORTHO) {
        const ni = i + di;
        const nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= this.cols || nj >= this.rows) continue;
        const nxt = this.index(ni, nj);
        if (!this.walkable[nxt] || seen[nxt]) continue;
        seen[nxt] = 1;
        dist[nxt] = dist[cur] + this.cell;
        if (goals.has(nxt)) return dist[nxt];
        q.push(nxt);
      }
    }
    return null;
  }

  spawnCell(spawn: ArenaSpawn): number | null {
    const idx = this.cellIndexAt(spawn.x, spawn.z);
    if (idx === null || !this.walkable[idx]) return null;
    return idx;
  }

  private flood(start: number, label: number): void {
    const q = [start];
    this.component[start] = label;
    let head = 0;
    while (head < q.length) {
      const cur = q[head++];
      const i = cur % this.cols;
      const j = (cur - i) / this.cols;
      for (const [di, dj] of ORTHO) {
        const ni = i + di;
        const nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= this.cols || nj >= this.rows) continue;
        const nxt = this.index(ni, nj);
        if (!this.walkable[nxt] || this.component[nxt] !== -1) continue;
        this.component[nxt] = label;
        q.push(nxt);
      }
    }
  }
}
