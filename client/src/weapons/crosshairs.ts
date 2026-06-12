export type CrosshairStyle = "cross" | "dot" | "circle" | "chevron";

export interface CrosshairConfig {
  style: CrosshairStyle;
  color: string;
  size: number;
  thickness: number;
  gap: number;
  opacity: number;
  dotSize?: number;
  outline?: boolean;
}

export const DEFAULT_CROSSHAIR: CrosshairConfig = {
  style: "cross",
  color: "#ede6d9",
  size: 16,
  thickness: 2,
  gap: 5,
  opacity: 0.9
};

export class WeaponCrosshair {
  private container: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private config: CrosshairConfig = DEFAULT_CROSSHAIR;
  private spread = 0;

  constructor() {
    this.container = document.createElement("div");
    this.container.style.cssText = `
      position: fixed;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      pointer-events: none;
      z-index: 500;
    `;

    this.canvas = document.createElement("canvas");
    this.canvas.width = 80;
    this.canvas.height = 80;
    this.canvas.style.cssText = `width: 80px; height: 80px;`;
    this.container.appendChild(this.canvas);
    document.body.appendChild(this.container);

    this.ctx = this.canvas.getContext("2d")!;
    this.render();
  }

  public setConfig(config: CrosshairConfig): void {
    this.config = config;
    this.render();
  }

  public setSpread(spread: number): void {
    this.spread = Math.min(20, Math.max(0, spread));
    this.render();
  }

  public setVisible(visible: boolean): void {
    this.container.style.display = visible ? "block" : "none";
  }

  public dispose(): void {
    this.container.remove();
  }

  private render(): void {
    const config = this.config;
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const cx = w / 2;
    const cy = h / 2;

    ctx.clearRect(0, 0, w, h);
    ctx.globalAlpha = config.opacity;

    const outlineColor = "rgba(0, 0, 0, 0.6)";

    switch (config.style) {
      case "cross":
        this.renderCross(ctx, cx, cy, config, outlineColor);
        break;
      case "dot":
        this.renderDot(ctx, cx, cy, config);
        break;
      case "circle":
        this.renderCircle(ctx, cx, cy, config);
        break;
      case "chevron":
        this.renderChevron(ctx, cx, cy, config, outlineColor);
        break;
    }

    ctx.globalAlpha = 1;
  }

  private renderCross(ctx: CanvasRenderingContext2D, cx: number, cy: number, config: CrosshairConfig, outlineColor: string): void {
    const { size, thickness, gap, color, outline } = config;
    const spreadGap = gap + this.spread;

    if (outline) {
      ctx.strokeStyle = outlineColor;
      ctx.lineWidth = thickness + 2;
      ctx.lineCap = "round";
      this.drawCrossLines(ctx, cx, cy, size, spreadGap);
    }

    ctx.strokeStyle = color;
    ctx.lineWidth = thickness;
    ctx.lineCap = "round";
    this.drawCrossLines(ctx, cx, cy, size, spreadGap);
  }

  private drawCrossLines(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, gap: number): void {
    ctx.beginPath();
    ctx.moveTo(cx, cy - gap);
    ctx.lineTo(cx, cy - gap - size / 2);
    ctx.moveTo(cx, cy + gap);
    ctx.lineTo(cx, cy + gap + size / 2);
    ctx.moveTo(cx - gap, cy);
    ctx.lineTo(cx - gap - size / 2, cy);
    ctx.moveTo(cx + gap, cy);
    ctx.lineTo(cx + gap + size / 2, cy);
    ctx.stroke();
  }

  private renderDot(ctx: CanvasRenderingContext2D, cx: number, cy: number, config: CrosshairConfig): void {
    const dotSize = config.dotSize || 4;
    ctx.fillStyle = config.color;
    ctx.shadowColor = config.color;
    ctx.shadowBlur = 4;
    ctx.beginPath();
    ctx.arc(cx, cy, dotSize / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  private renderCircle(ctx: CanvasRenderingContext2D, cx: number, cy: number, config: CrosshairConfig): void {
    const { size, thickness, color, dotSize } = config;

    ctx.strokeStyle = color;
    ctx.lineWidth = thickness;
    ctx.beginPath();
    ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
    ctx.stroke();

    if (dotSize) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(cx, cy, dotSize / 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private renderChevron(ctx: CanvasRenderingContext2D, cx: number, cy: number, config: CrosshairConfig, outlineColor: string): void {
    const { size, thickness, color, gap } = config;
    const spreadGap = gap + this.spread * 0.5;

    const drawChevron = () => {
      ctx.beginPath();
      ctx.moveTo(cx - size / 2, cy + spreadGap + size / 3);
      ctx.lineTo(cx, cy + spreadGap);
      ctx.lineTo(cx + size / 2, cy + spreadGap + size / 3);
      ctx.stroke();
    };

    ctx.strokeStyle = outlineColor;
    ctx.lineWidth = thickness + 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    drawChevron();

    ctx.strokeStyle = color;
    ctx.lineWidth = thickness;
    drawChevron();

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy - spreadGap, 2, 0, Math.PI * 2);
    ctx.fill();
  }

}
