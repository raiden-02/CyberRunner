/**
 * Netgraph HUD - in-game network stats overlay (lagometer).
 *
 * Inspired by Quake/Source engine "net_graph" overlays.
 * Shows real-time: ping, jitter, packet timing, reconciliation error.
 * Toggle with F3 (debug key).
 */

import type { NetworkManager } from "../network/NetworkManager.js";

const GRAPH_WIDTH = 200;
const GRAPH_HEIGHT = 40;
const HISTORY_SIZE = 120;  // ~2 seconds at 60fps

export class Netgraph {
  private container: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private statsEl: HTMLDivElement;

  private visible = false;
  private network: NetworkManager;

  // History buffers for graphing
  private pingHistory: number[] = [];
  private jitterHistory: number[] = [];
  private correctionHistory: number[] = [];

  // Stats
  private lastCorrectionMag = 0;
  private inputSeqLocal = 0;
  private lastAckedSeq = 0;
  private pendingInputCount = 0;
  private fps = 0;
  private fpsFrames = 0;
  private fpsAccum = 0;

  constructor(network: NetworkManager) {
    this.network = network;

    this.container = document.createElement("div");
    this.container.style.cssText = `
      position: fixed;
      bottom: 8px;
      right: 8px;
      background: rgba(0, 0, 0, 0.75);
      border: 1px solid rgba(0, 255, 255, 0.3);
      border-radius: 4px;
      padding: 6px 8px;
      font-family: 'Courier New', monospace;
      font-size: 11px;
      color: #00ffcc;
      z-index: 9999;
      pointer-events: none;
      display: none;
      line-height: 1.4;
    `;

    this.canvas = document.createElement("canvas");
    this.canvas.width = GRAPH_WIDTH;
    this.canvas.height = GRAPH_HEIGHT;
    this.canvas.style.cssText = `
      display: block;
      margin-bottom: 4px;
      image-rendering: pixelated;
    `;

    this.statsEl = document.createElement("div");

    this.container.appendChild(this.canvas);
    this.container.appendChild(this.statsEl);
    document.body.appendChild(this.container);

    this.ctx = this.canvas.getContext("2d")!;
  }

  setVisible(v: boolean): void {
    this.visible = v;
    this.container.style.display = v ? "block" : "none";
  }

  toggle(): void {
    this.setVisible(!this.visible);
  }

  /** Called by Game.ts with reconciliation info each frame */
  updateStats(info: {
    correctionMag: number;
    inputSeqLocal: number;
    lastAckedSeq: number;
    pendingInputCount: number;
  }): void {
    this.lastCorrectionMag = info.correctionMag;
    this.inputSeqLocal = info.inputSeqLocal;
    this.lastAckedSeq = info.lastAckedSeq;
    this.pendingInputCount = info.pendingInputCount;
  }

  update(dt: number): void {
    if (!this.visible) return;

    // FPS
    this.fpsAccum += dt;
    this.fpsFrames++;
    if (this.fpsAccum >= 0.5) {
      this.fps = Math.round(this.fpsFrames / this.fpsAccum);
      this.fpsAccum = 0;
      this.fpsFrames = 0;
    }

    const ping = Math.round(this.network.latencyMs * 2); // RTT
    const jitter = Math.round(this.network.jitterMs);

    // Push to history
    this.pingHistory.push(ping);
    this.jitterHistory.push(jitter);
    this.correctionHistory.push(this.lastCorrectionMag * 100); // cm

    while (this.pingHistory.length > HISTORY_SIZE) this.pingHistory.shift();
    while (this.jitterHistory.length > HISTORY_SIZE) this.jitterHistory.shift();
    while (this.correctionHistory.length > HISTORY_SIZE) this.correctionHistory.shift();

    this.drawGraph();
    this.drawStats(ping, jitter);
  }

  private drawGraph(): void {
    const ctx = this.ctx;
    const w = GRAPH_WIDTH;
    const h = GRAPH_HEIGHT;

    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.fillRect(0, 0, w, h);

    // Max for scaling
    const maxPing = Math.max(100, ...this.pingHistory);

    // Draw ping bars (cyan)
    const barW = w / HISTORY_SIZE;
    for (let i = 0; i < this.pingHistory.length; i++) {
      const val = this.pingHistory[i];
      const barH = (val / maxPing) * h;
      const x = i * barW;

      // Color by severity
      if (val < 50) ctx.fillStyle = "rgba(0, 255, 200, 0.6)";
      else if (val < 100) ctx.fillStyle = "rgba(255, 255, 0, 0.6)";
      else ctx.fillStyle = "rgba(255, 80, 80, 0.6)";

      ctx.fillRect(x, h - barH, barW, barH);
    }

    // Draw correction overlay (magenta dots)
    ctx.fillStyle = "rgba(255, 0, 255, 0.9)";
    for (let i = 0; i < this.correctionHistory.length; i++) {
      const val = this.correctionHistory[i];
      if (val > 0.5) { // Only show if > 0.5cm
        const dotH = Math.min(h, (val / 20) * h); // 20cm = full height
        const x = i * barW;
        ctx.fillRect(x, h - dotH, Math.max(1, barW), 2);
      }
    }

    // Scale labels
    ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
    ctx.font = "8px monospace";
    ctx.fillText(`${maxPing}ms`, 2, 8);
    ctx.fillText("0", 2, h - 2);
  }

  private drawStats(ping: number, jitter: number): void {
    const pingColor = ping < 50 ? "#00ffcc" : ping < 100 ? "#ffff00" : "#ff5050";

    this.statsEl.innerHTML = `
      <span style="color:${pingColor}">PING ${ping}ms</span>
      <span style="color:#888"> | </span>
      <span style="color:#aaa">JITTER ${jitter}ms</span>
      <span style="color:#888"> | </span>
      <span style="color:#aaa">FPS ${this.fps}</span>
      <br>
      <span style="color:#888">SEQ ${this.inputSeqLocal}</span>
      <span style="color:#888"> ACK ${this.lastAckedSeq}</span>
      <span style="color:#888"> PEND ${this.pendingInputCount}</span>
      <span style="color:#888"> ERR ${(this.lastCorrectionMag * 100).toFixed(1)}cm</span>
    `;
  }

  destroy(): void {
    this.container.remove();
  }
}
