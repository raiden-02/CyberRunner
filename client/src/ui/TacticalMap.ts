import type { ArenaMapDiff } from "@shared/world/arena-map-view.js";
import type {
  ForgePlaytestReplay,
  ForgePlaytestSummary,
  ForgePublicMapView,
} from "../api/client.js";
import { THEME } from "../theme.js";

export type TacticalMapState = {
  map: ForgePublicMapView;
  diff?: ArenaMapDiff;
  hotspot?: ForgePlaytestSummary["firstContact"]["hotspot"];
  replay?: ForgePlaytestReplay;
  replayProgress: number;
};

const SOLID_COLOR: Record<string, string> = {
  unchanged: "#3a4654",
  added: "#5ec8d8",
  removed: "#d4544a",
  changed: "#e0a04a",
};

export class TacticalMap {
  readonly canvas: HTMLCanvasElement;
  private state: TacticalMapState | null = null;

  constructor() {
    this.canvas = document.createElement("canvas");
    this.canvas.style.cssText = "display:block;width:100%;height:100%;";
  }

  setState(state: TacticalMapState): void {
    this.state = state;
    this.draw();
  }

  resize(): void {
    this.draw();
  }

  private draw(): void {
    const ctx = this.canvas.getContext("2d");
    const state = this.state;
    if (!ctx || !state) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = Math.max(1, this.canvas.clientWidth);
    const cssH = Math.max(1, this.canvas.clientHeight);
    this.canvas.width = Math.floor(cssW * dpr);
    this.canvas.height = Math.floor(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.fillStyle = THEME.ink;
    ctx.fillRect(0, 0, cssW, cssH);

    const half = state.map.boundsHalfSize;
    const pad = 16;
    const size = Math.min(cssW, cssH) - pad * 2;
    const originX = (cssW - size) / 2;
    const originY = (cssH - size) / 2;
    const toX = (x: number) => originX + ((x + half) / (half * 2)) * size;
    const toY = (z: number) => originY + ((z + half) / (half * 2)) * size;
    const toW = (w: number) => (w / (half * 2)) * size;

    ctx.strokeStyle = THEME.panelBorder;
    ctx.lineWidth = 1;
    ctx.strokeRect(originX, originY, size, size);

    const solidKind = new Map((state.diff?.solids ?? []).map((d) => [d.id, d.kind]));
    for (const solid of state.map.solids) {
      const kind = solidKind.get(solid.id) ?? "unchanged";
      ctx.fillStyle = SOLID_COLOR[kind] ?? SOLID_COLOR.unchanged;
      ctx.globalAlpha = kind === "added" || kind === "changed" ? 0.95 : 0.7;
      ctx.fillRect(toX(solid.x - solid.hx), toY(solid.z - solid.hz), toW(solid.hx * 2), toW(solid.hz * 2));
    }
    ctx.globalAlpha = 1;

    for (const spawn of state.map.spawns) {
      if (spawn.role === "general") continue;
      ctx.fillStyle = spawn.role === "ghost" ? THEME.ghosts : THEME.sentinels;
      ctx.beginPath();
      ctx.arc(toX(spawn.x), toY(spawn.z), 4, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const obj of state.map.objectives) {
      ctx.strokeStyle = obj.id === "A" ? THEME.warning : THEME.sentinels;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(toX(obj.x), toY(obj.z), Math.max(6, toW(obj.radius)), 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = THEME.paper;
      ctx.font = "11px Segoe UI, sans-serif";
      ctx.fillText(obj.id, toX(obj.x) - 4, toY(obj.z) + 4);
    }

    if (state.replay) {
      drawPath(ctx, state.replay.ghost?.path ?? [], toX, toY, THEME.ghosts);
      drawPath(ctx, state.replay.sentinel?.path ?? [], toX, toY, THEME.sentinels);
      drawRunner(ctx, state.replay.ghost?.path ?? [], state.replayProgress, toX, toY, THEME.ghosts);
      drawRunner(ctx, state.replay.sentinel?.path ?? [], state.replayProgress, toX, toY, THEME.sentinels);
    }

    if (state.hotspot) {
      ctx.strokeStyle = THEME.paper;
      ctx.fillStyle = "rgba(232, 238, 244, 0.14)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(toX(state.hotspot.x), toY(state.hotspot.z), 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = THEME.paper;
      ctx.font = "10px Segoe UI, sans-serif";
      ctx.fillText("first contact", toX(state.hotspot.x) + 10, toY(state.hotspot.z) - 8);
    }
  }
}

function drawPath(
  ctx: CanvasRenderingContext2D,
  path: Array<{ x: number; z: number }>,
  toX: (n: number) => number,
  toY: (n: number) => number,
  color: string,
): void {
  if (path.length < 2) return;
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(toX(path[0]!.x), toY(path[0]!.z));
  for (const p of path) ctx.lineTo(toX(p.x), toY(p.z));
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawRunner(
  ctx: CanvasRenderingContext2D,
  path: Array<{ x: number; z: number }>,
  progress: number,
  toX: (n: number) => number,
  toY: (n: number) => number,
  color: string,
): void {
  if (path.length === 0) return;
  const t = Math.max(0, Math.min(1, progress));
  const idx = Math.min(path.length - 1, Math.floor(t * (path.length - 1)));
  const p = path[idx]!;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(toX(p.x), toY(p.z), 3.5, 0, Math.PI * 2);
  ctx.fill();
}
