import {
  DEATHMATCH_MAX_SPAWNS,
  ENVELOPE_SNAP,
  parseArenaDesignSpec,
  snapWorld,
  teamClusterPoints,
  type ArenaDesignSpec,
  type ArenaGameMode,
  type ArenaPoint,
  type DesignSpecIssue,
} from "@shared/world/arena-design-spec.js";
import { resolveMapBounds } from "@shared/world/map-bounds.js";
import { THEME } from "../theme.js";

export type SetupTool = "envelope" | "ghost" | "sentinel" | "deathmatch" | "select";

export type ArenaSetupState = {
  mode: ArenaGameMode;
  envelope?: { x0: number; z0: number; x1: number; z1: number };
  ghostAnchor?: ArenaPoint;
  sentinelAnchor?: ArenaPoint;
  general: ArenaPoint[];
  brief: string;
};

const WORLD_HALF = 42;
const MARGIN = 18;

function envelopeFromCorners(x0: number, z0: number, x1: number, z1: number) {
  const minX = Math.min(x0, x1);
  const maxX = Math.max(x0, x1);
  const minZ = Math.min(z0, z1);
  const maxZ = Math.max(z0, z1);
  return {
    centerX: snapWorld((minX + maxX) / 2),
    centerZ: snapWorld((minZ + maxZ) / 2),
    halfWidth: snapWorld((maxX - minX) / 2),
    halfDepth: snapWorld((maxZ - minZ) / 2),
  };
}

export class ArenaSetupEditor {
  readonly canvas: HTMLCanvasElement;
  private tool: SetupTool = "envelope";
  private state: ArenaSetupState = { mode: "search_destroy", general: [], brief: "" };
  private drag: { x0: number; z0: number; x1: number; z1: number } | null = null;
  private hover: ArenaPoint | null = null;
  private selected: { kind: "ghost" | "sentinel" | "dm"; index?: number } | null = null;
  private undoStack: ArenaSetupState[] = [];
  private onChange: () => void = () => {};

  constructor() {
    this.canvas = document.createElement("canvas");
    this.canvas.style.cssText =
      "display:block;width:100%;height:100%;touch-action:none;user-select:none;";
    this.canvas.addEventListener("mousedown", (e) => this.onPointer(e, "down"));
    this.canvas.addEventListener("mousemove", (e) => this.onPointer(e, "move"));
    this.canvas.addEventListener("mouseup", (e) => this.onPointer(e, "up"));
    this.canvas.addEventListener("mouseleave", () => {
      this.hover = null;
      this.draw();
    });
    this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  setOnChange(fn: () => void): void {
    this.onChange = fn;
  }

  setMode(mode: ArenaGameMode): void {
    this.pushUndo();
    this.state.mode = mode;
    if (mode === "deathmatch") {
      this.tool = this.tool === "ghost" || this.tool === "sentinel" ? "deathmatch" : this.tool;
    } else if (this.tool === "deathmatch") {
      this.tool = "ghost";
    }
    this.selected = null;
    this.emit();
  }

  setBrief(brief: string): void {
    this.state.brief = brief;
  }

  setTool(tool: SetupTool): void {
    this.tool = tool;
    this.draw();
  }

  getTool(): SetupTool {
    return this.tool;
  }

  getState(): ArenaSetupState {
    return this.state;
  }

  issues(): DesignSpecIssue[] {
    const parsed = parseArenaDesignSpec(this.toSpecInput());
    return parsed.ok ? [] : parsed.issues;
  }

  toSpec(): ArenaDesignSpec | undefined {
    const parsed = parseArenaDesignSpec(this.toSpecInput());
    return parsed.ok ? parsed.spec : undefined;
  }

  reset(): void {
    this.pushUndo();
    this.state = { mode: this.state.mode, general: [], brief: this.state.brief };
    this.selected = null;
    this.drag = null;
    this.emit();
  }

  undo(): void {
    const prev = this.undoStack.pop();
    if (!prev) return;
    this.state = prev;
    this.emit();
  }

  deleteSelected(): void {
    if (!this.selected) return;
    this.pushUndo();
    if (this.selected.kind === "ghost") this.state.ghostAnchor = undefined;
    else if (this.selected.kind === "sentinel") this.state.sentinelAnchor = undefined;
    else if (this.selected.kind === "dm" && this.selected.index !== undefined) {
      this.state.general.splice(this.selected.index, 1);
    }
    this.selected = null;
    this.emit();
  }

  undoLastSpawn(): void {
    if (this.state.mode !== "deathmatch" || this.state.general.length === 0) return;
    this.pushUndo();
    this.state.general.pop();
    this.emit();
  }

  clearSpawns(): void {
    this.pushUndo();
    this.state.general = [];
    this.state.ghostAnchor = undefined;
    this.state.sentinelAnchor = undefined;
    this.selected = null;
    this.emit();
  }

  resize(): void {
    this.draw();
  }

  private toSpecInput(): unknown {
    const env = this.state.envelope
      ? envelopeFromCorners(
          this.state.envelope.x0,
          this.state.envelope.z0,
          this.state.envelope.x1,
          this.state.envelope.z1,
        )
      : undefined;
    return {
      version: 1,
      mode: this.state.mode,
      envelope: env,
      brief: this.state.brief,
      spawnSetup:
        this.state.mode === "search_destroy"
          ? {
              kind: "search_destroy",
              ghostAnchor: this.state.ghostAnchor,
              sentinelAnchor: this.state.sentinelAnchor,
            }
          : { kind: "deathmatch", general: this.state.general },
    };
  }

  private pushUndo(): void {
    this.undoStack.push(structuredClone(this.state));
    if (this.undoStack.length > 40) this.undoStack.shift();
  }

  private emit(): void {
    this.draw();
    this.onChange();
  }

  private worldFromEvent(e: MouseEvent): ArenaPoint {
    const rect = this.canvas.getBoundingClientRect();
    const cssW = Math.max(1, rect.width);
    const cssH = Math.max(1, rect.height);
    const size = Math.min(cssW, cssH) - MARGIN * 2;
    const originX = (cssW - size) / 2;
    const originY = (cssH - size) / 2;
    const nx = (e.clientX - rect.left - originX) / size;
    const nz = (e.clientY - rect.top - originY) / size;
    return {
      x: snapWorld(-WORLD_HALF + nx * WORLD_HALF * 2),
      z: snapWorld(-WORLD_HALF + nz * WORLD_HALF * 2),
    };
  }

  private onPointer(e: MouseEvent, phase: "down" | "move" | "up"): void {
    e.preventDefault();
    const p = this.worldFromEvent(e);
    this.hover = p;
    if (phase === "down") {
      if (this.tool === "envelope") {
        this.drag = { x0: p.x, z0: p.z, x1: p.x, z1: p.z };
      } else if (this.tool === "ghost") {
        this.pushUndo();
        this.state.ghostAnchor = p;
        this.selected = { kind: "ghost" };
        this.emit();
        return;
      } else if (this.tool === "sentinel") {
        this.pushUndo();
        this.state.sentinelAnchor = p;
        this.selected = { kind: "sentinel" };
        this.emit();
        return;
      } else if (this.tool === "deathmatch") {
        const hit = this.hitGeneral(p);
        this.pushUndo();
        if (hit >= 0) this.state.general.splice(hit, 1);
        else if (this.state.general.length < DEATHMATCH_MAX_SPAWNS) this.state.general.push(p);
        this.emit();
        return;
      } else if (this.tool === "select") {
        this.selected = this.hitMarker(p);
        this.draw();
      }
    }
    if (phase === "move" && this.drag) {
      this.drag.x1 = p.x;
      this.drag.z1 = p.z;
      this.draw();
    }
    if (phase === "up" && this.drag) {
      this.pushUndo();
      this.state.envelope = {
        x0: this.drag.x0,
        z0: this.drag.z0,
        x1: this.drag.x1,
        z1: this.drag.z1,
      };
      this.drag = null;
      this.emit();
      return;
    }
    this.draw();
  }

  private hitGeneral(p: ArenaPoint): number {
    return this.state.general.findIndex((g) => Math.hypot(g.x - p.x, g.z - p.z) < 1.2);
  }

  private hitMarker(p: ArenaPoint): ArenaSetupEditor["selected"] {
    if (this.state.ghostAnchor && Math.hypot(this.state.ghostAnchor.x - p.x, this.state.ghostAnchor.z - p.z) < 1.4) {
      return { kind: "ghost" };
    }
    if (
      this.state.sentinelAnchor &&
      Math.hypot(this.state.sentinelAnchor.x - p.x, this.state.sentinelAnchor.z - p.z) < 1.4
    ) {
      return { kind: "sentinel" };
    }
    const dm = this.hitGeneral(p);
    if (dm >= 0) return { kind: "dm", index: dm };
    return null;
  }

  private draw(): void {
    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = Math.max(1, this.canvas.clientWidth);
    const cssH = Math.max(1, this.canvas.clientHeight);
    this.canvas.width = Math.floor(cssW * dpr);
    this.canvas.height = Math.floor(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.fillStyle = THEME.ink;
    ctx.fillRect(0, 0, cssW, cssH);

    const size = Math.min(cssW, cssH) - MARGIN * 2;
    const originX = (cssW - size) / 2;
    const originY = (cssH - size) / 2;
    const toX = (x: number) => originX + ((x + WORLD_HALF) / (WORLD_HALF * 2)) * size;
    const toY = (z: number) => originY + ((z + WORLD_HALF) / (WORLD_HALF * 2)) * size;
    const toW = (w: number) => (w / (WORLD_HALF * 2)) * size;

    ctx.strokeStyle = THEME.panelBorder;
    ctx.strokeRect(originX, originY, size, size);
    ctx.globalAlpha = 0.35;
    for (let m = -WORLD_HALF; m <= WORLD_HALF; m += 4) {
      ctx.beginPath();
      ctx.moveTo(toX(m), originY);
      ctx.lineTo(toX(m), originY + size);
      ctx.moveTo(originX, toY(m));
      ctx.lineTo(originX + size, toY(m));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = THEME.muted;
    ctx.font = "11px sans-serif";
    ctx.fillText("0,0", toX(0) + 4, toY(0) - 4);

    const live = this.drag ?? this.state.envelope;
    if (live) {
      const env = envelopeFromCorners(live.x0, live.z0, live.x1, live.z1);
      const bounds = resolveMapBounds({ bounds: env, boundsHalfSize: Math.max(env.halfWidth, env.halfDepth) });
      ctx.strokeStyle = THEME.accent;
      ctx.lineWidth = 2;
      ctx.strokeRect(
        toX(bounds.centerX - bounds.halfWidth),
        toY(bounds.centerZ - bounds.halfDepth),
        toW(bounds.halfWidth * 2),
        toW(bounds.halfDepth * 2),
      );
      ctx.fillStyle = "rgba(94,200,216,0.08)";
      ctx.fillRect(
        toX(bounds.centerX - bounds.halfWidth),
        toY(bounds.centerZ - bounds.halfDepth),
        toW(bounds.halfWidth * 2),
        toW(bounds.halfDepth * 2),
      );
      ctx.fillStyle = THEME.paper;
      ctx.fillText(
        `${(bounds.halfWidth * 2).toFixed(1)} × ${(bounds.halfDepth * 2).toFixed(1)} m`,
        toX(bounds.centerX - bounds.halfWidth) + 6,
        toY(bounds.centerZ - bounds.halfDepth) + 16,
      );
    }

    const drawAnchor = (p: ArenaPoint | undefined, color: string, label: string, selected: boolean) => {
      if (!p) return;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(toX(p.x), toY(p.z), selected ? 7 : 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = THEME.paper;
      ctx.fillText(label, toX(p.x) + 8, toY(p.z) - 6);
      if (this.state.mode === "search_destroy") {
        ctx.globalAlpha = 0.35;
        ctx.strokeStyle = color;
        for (const c of teamClusterPoints(p)) {
          ctx.beginPath();
          ctx.arc(toX(c.x), toY(c.z), 3, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
    };

    drawAnchor(this.state.ghostAnchor, "#5ec8d8", "GHOST", this.selected?.kind === "ghost");
    drawAnchor(this.state.sentinelAnchor, "#d4548a", "SENTINEL", this.selected?.kind === "sentinel");
    this.state.general.forEach((p, i) => {
      drawAnchor(p, "#e0a04a", `DM ${i + 1}`, this.selected?.kind === "dm" && this.selected.index === i);
    });

    if (this.hover) {
      ctx.fillStyle = THEME.muted;
      ctx.fillText(`${this.hover.x.toFixed(1)}, ${this.hover.z.toFixed(1)}`, 10, cssH - 10);
    }
    ctx.fillStyle = THEME.muted;
    ctx.fillText(this.tool, 10, 16);
  }
}
