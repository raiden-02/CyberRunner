/**
 * F3 netcode overlay. Tick rate is the shared 60 Hz constant, not a live probe.
 */

import type { NetworkManager } from "../network/NetworkManager.js";
import { THEME } from "../theme.js";
import { FIXED_TICK_HZ } from "@shared/net/fixed-tick.js";
import { MovementState } from "@shared/movement/types.js";

const GRAPH_WIDTH = 220;
const GRAPH_HEIGHT = 40;
const HISTORY_SIZE = 120;

const MOVE_LABEL: Record<number, string> = {
  [MovementState.Walking]: "WALK",
  [MovementState.Crouching]: "CROUCH",
  [MovementState.Sliding]: "SLIDE",
  [MovementState.Prone]: "PRONE",
};

export function movementStateLabel(state: number | undefined): string {
  if (state === undefined) return "-";
  return MOVE_LABEL[state] ?? String(state);
}

export class Netgraph {
  private container: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private statsEl: HTMLDivElement;

  private visible = false;
  private network: NetworkManager;

  private pingHistory: number[] = [];
  private jitterHistory: number[] = [];
  private correctionHistory: number[] = [];

  private lastCorrectionMag = 0;
  private inputSeqLocal = 0;
  private lastAckedSeq = 0;
  private pendingInputCount = 0;
  private predMove: number | undefined;
  private serverMove: number | undefined;

  private fps = 0;
  private fpsFrames = 0;
  private fpsAccum = 0;

  private inputRate = 0;
  private rateSeq = 0;
  private rateAccum = 0;

  constructor(network: NetworkManager) {
    this.network = network;

    this.container = document.createElement("div");
    this.container.style.cssText = `
      position: fixed;
      top: 12px;
      left: 12px;
      background: ${THEME.hudBg};
      border: 1px solid ${THEME.panelBorder};
      border-left: 3px solid ${THEME.accent};
      border-radius: 3px;
      padding: 8px 10px;
      font-family: ${THEME.font};
      font-size: 12px;
      color: ${THEME.paper};
      z-index: 9999;
      pointer-events: none;
      display: none;
      line-height: 1.45;
      min-width: 236px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
    `;

    this.canvas = document.createElement("canvas");
    this.canvas.width = GRAPH_WIDTH;
    this.canvas.height = GRAPH_HEIGHT;
    this.canvas.style.cssText = `
      display: block;
      margin-bottom: 6px;
      image-rendering: pixelated;
    `;

    this.statsEl = document.createElement("div");

    this.container.appendChild(this.canvas);
    this.container.appendChild(this.statsEl);
    document.body.appendChild(this.container);

    this.ctx = this.canvas.getContext("2d")!;
  }

  get isVisible(): boolean {
    return this.visible;
  }

  setVisible(v: boolean): void {
    this.visible = v;
    this.container.style.display = v ? "block" : "none";
  }

  toggle(): void {
    this.setVisible(!this.visible);
  }

  updateStats(info: {
    correctionMag: number;
    inputSeqLocal: number;
    lastAckedSeq: number;
    pendingInputCount: number;
    predMove?: number;
    serverMove?: number;
  }): void {
    this.lastCorrectionMag = info.correctionMag;
    this.inputSeqLocal = info.inputSeqLocal;
    this.lastAckedSeq = info.lastAckedSeq;
    this.pendingInputCount = info.pendingInputCount;
    this.predMove = info.predMove;
    this.serverMove = info.serverMove;
  }

  update(dt: number): void {
    this.fpsAccum += dt;
    this.fpsFrames++;
    if (this.fpsAccum >= 0.5) {
      this.fps = Math.round(this.fpsFrames / this.fpsAccum);
      this.fpsAccum = 0;
      this.fpsFrames = 0;
    }

    this.rateAccum += dt;
    if (this.rateAccum >= 0.5) {
      const dSeq = this.inputSeqLocal - this.rateSeq;
      this.inputRate = this.rateAccum > 0 ? dSeq / this.rateAccum : 0;
      this.rateSeq = this.inputSeqLocal;
      this.rateAccum = 0;
    }

    if (!this.visible) return;

    const rtt = Math.round(this.network.rttMs);
    const jitter = Math.round(this.network.jitterMs);

    this.pingHistory.push(rtt);
    this.jitterHistory.push(jitter);
    this.correctionHistory.push(this.lastCorrectionMag * 100);

    while (this.pingHistory.length > HISTORY_SIZE) this.pingHistory.shift();
    while (this.jitterHistory.length > HISTORY_SIZE) this.jitterHistory.shift();
    while (this.correctionHistory.length > HISTORY_SIZE) this.correctionHistory.shift();

    this.drawGraph();
    this.drawStats(rtt, jitter);
  }

  private drawGraph(): void {
    const ctx = this.ctx;
    const w = GRAPH_WIDTH;
    const h = GRAPH_HEIGHT;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
    ctx.fillRect(0, 0, w, h);

    const maxPing = Math.max(100, ...this.pingHistory);
    const barW = w / HISTORY_SIZE;
    for (let i = 0; i < this.pingHistory.length; i++) {
      const val = this.pingHistory[i];
      const barH = (val / maxPing) * h;
      const x = i * barW;
      if (val < 50) ctx.fillStyle = "rgba(74, 139, 138, 0.75)";
      else if (val < 100) ctx.fillStyle = "rgba(212, 137, 58, 0.75)";
      else ctx.fillStyle = "rgba(196, 92, 58, 0.75)";
      ctx.fillRect(x, h - barH, barW, barH);
    }

    ctx.fillStyle = "rgba(196, 92, 58, 0.95)";
    for (let i = 0; i < this.correctionHistory.length; i++) {
      const val = this.correctionHistory[i];
      if (val > 0.5) {
        const dotH = Math.min(h, (val / 20) * h);
        ctx.fillRect(i * barW, h - dotH, Math.max(1, barW), 2);
      }
    }

    ctx.fillStyle = "rgba(237, 230, 217, 0.45)";
    ctx.font = "10px Segoe UI, sans-serif";
    ctx.fillText(`${maxPing} ms RTT`, 4, 12);
  }

  private drawStats(rtt: number, jitter: number): void {
    const pingColor = rtt < 50 ? THEME.teammate : rtt < 100 ? THEME.accent : THEME.danger;
    const corrCm = this.lastCorrectionMag * 100;
    const corrColor = corrCm < 5 ? THEME.muted : corrCm < 20 ? THEME.accent : THEME.danger;

    this.statsEl.innerHTML = `
      <div style="color:${THEME.accent};font-weight:600;letter-spacing:0.04em;margin-bottom:4px;">NETCODE <span style="color:${THEME.muted};font-weight:400;">F3</span></div>
      <div>
        <span style="color:${pingColor}">RTT ${rtt} ms</span>
        <span style="color:${THEME.muted}"> · </span>
        <span style="color:${THEME.muted}">jitter ${jitter} ms</span>
        <span style="color:${THEME.muted}"> · </span>
        <span style="color:${THEME.paper}">${this.fps} fps</span>
      </div>
      <div style="color:${THEME.muted}">tick ${FIXED_TICK_HZ} Hz (fixed) · in ${this.inputRate.toFixed(0)}/s</div>
      <div style="color:${THEME.muted}">seq ${this.inputSeqLocal} · ack ${this.lastAckedSeq} · pend ${this.pendingInputCount}</div>
      <div style="color:${corrColor}">corr ${corrCm.toFixed(1)} cm</div>
      <div style="color:${THEME.paper}">move pred ${movementStateLabel(this.predMove)} · svr ${movementStateLabel(this.serverMove)}</div>
      <div style="color:${THEME.muted};margin-top:6px;font-size:11px;">
        teal pred · orange server · teal aim · orange/red last shot
      </div>
    `;
  }

  destroy(): void {
    this.container.remove();
  }
}
