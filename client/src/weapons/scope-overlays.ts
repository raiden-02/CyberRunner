export abstract class BaseScopeOverlay {
  protected container: HTMLDivElement;
  protected canvas: HTMLCanvasElement;
  protected ctx: CanvasRenderingContext2D;
  protected visible = false;
  protected alpha = 0;

  constructor() {
    this.container = document.createElement("div");
    this.container.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      pointer-events: none;
      z-index: 100;
      display: none;
    `;

    this.canvas = document.createElement("canvas");
    this.canvas.style.cssText = `width: 100%; height: 100%;`;
    this.container.appendChild(this.canvas);
    document.body.appendChild(this.container);

    this.ctx = this.canvas.getContext("2d")!;
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  protected resize(): void {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  public update(scopeAlpha: number): void {
    this.alpha = scopeAlpha;
    
    if (scopeAlpha > 0.01) {
      this.container.style.display = "block";
      this.visible = true;
      this.render();
    } else if (this.visible) {
      this.container.style.display = "none";
      this.visible = false;
    }
  }

  protected abstract render(): void;
  public abstract shouldHideWeapon(): boolean;

  public getActivationThreshold(): number {
    return 0.7;
  }

  public dispose(): void {
    this.container.remove();
  }
}

export class SniperScopeOverlay extends BaseScopeOverlay {
  private weaponName: string;
  private magnification: string;

  constructor(weaponName = "SPECTER SR-X", magnification = "4.0x") {
    super();
    this.weaponName = weaponName;
    this.magnification = magnification;
  }

  public shouldHideWeapon(): boolean {
    return this.alpha > 0.9;
  }

  protected render(): void {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.min(w, h) * 0.42;

    ctx.clearRect(0, 0, w, h);
    ctx.globalAlpha = this.alpha;

    // Scope vignette
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.arc(cx, cy, radius, 0, Math.PI * 2, true);
    ctx.fill();

    // Rim glow
    ctx.strokeStyle = "#4a433a";
    ctx.lineWidth = 3;
    ctx.shadowColor = "#d4893a";
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.strokeStyle = "#2a2620";
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(cx, cy, radius - 5, 0, Math.PI * 2);
    ctx.stroke();

    // Reticle
    ctx.strokeStyle = "#d4893a";
    ctx.lineWidth = 1.5;
    ctx.shadowColor = "#d4893a";
    ctx.shadowBlur = 8;

    const gap = 30;
    const lineLen = radius * 0.7;
    
    ctx.beginPath();
    ctx.moveTo(cx - lineLen, cy);
    ctx.lineTo(cx - gap, cy);
    ctx.moveTo(cx + gap, cy);
    ctx.lineTo(cx + lineLen, cy);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx, cy - lineLen);
    ctx.lineTo(cx, cy - gap);
    ctx.moveTo(cx, cy + gap);
    ctx.lineTo(cx, cy + lineLen);
    ctx.stroke();

    ctx.fillStyle = "#d4893a";
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fill();

    // Range markers
    ctx.lineWidth = 1;
    const markerSpacing = 50;
    for (let i = 1; i <= 5; i++) {
      const x = cx + i * markerSpacing;
      const x2 = cx - i * markerSpacing;
      const markH = i % 2 === 0 ? 12 : 8;
      
      ctx.beginPath();
      ctx.moveTo(x, cy - markH);
      ctx.lineTo(x, cy + markH);
      ctx.moveTo(x2, cy - markH);
      ctx.lineTo(x2, cy + markH);
      ctx.stroke();
    }

    for (let i = 1; i <= 6; i++) {
      const y = cy + i * markerSpacing;
      const markW = i % 2 === 0 ? 15 : 8;
      
      ctx.beginPath();
      ctx.moveTo(cx - markW, y);
      ctx.lineTo(cx + markW, y);
      ctx.stroke();

      if (i % 2 === 0) {
        ctx.font = "10px monospace";
        ctx.fillStyle = "#d4893a";
        ctx.textAlign = "left";
        ctx.fillText(`${i * 100}`, cx + markW + 5, y + 4);
      }
    }

    // Chevron
    ctx.lineWidth = 2;
    const chevY = cy - 80;
    ctx.beginPath();
    ctx.moveTo(cx - 15, chevY);
    ctx.lineTo(cx, chevY - 10);
    ctx.lineTo(cx + 15, chevY);
    ctx.stroke();

    // Corner brackets
    ctx.strokeStyle = "#006666";
    ctx.lineWidth = 2;
    const bracketSize = 40;
    const bracketOffset = radius * 0.65;

    ctx.beginPath();
    ctx.moveTo(cx - bracketOffset, cy - bracketOffset + bracketSize);
    ctx.lineTo(cx - bracketOffset, cy - bracketOffset);
    ctx.lineTo(cx - bracketOffset + bracketSize, cy - bracketOffset);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx + bracketOffset - bracketSize, cy - bracketOffset);
    ctx.lineTo(cx + bracketOffset, cy - bracketOffset);
    ctx.lineTo(cx + bracketOffset, cy - bracketOffset + bracketSize);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx - bracketOffset, cy + bracketOffset - bracketSize);
    ctx.lineTo(cx - bracketOffset, cy + bracketOffset);
    ctx.lineTo(cx - bracketOffset + bracketSize, cy + bracketOffset);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx + bracketOffset - bracketSize, cy + bracketOffset);
    ctx.lineTo(cx + bracketOffset, cy + bracketOffset);
    ctx.lineTo(cx + bracketOffset, cy + bracketOffset - bracketSize);
    ctx.stroke();

    // Data readouts
    ctx.shadowBlur = 0;
    ctx.font = "11px monospace";
    ctx.fillStyle = "#d4893a";
    ctx.textAlign = "left";
    ctx.fillText(this.weaponName, cx - radius + 30, cy - radius + 40);
    ctx.fillText(`${this.magnification} MAG`, cx - radius + 30, cy - radius + 55);
    
    ctx.textAlign = "right";
    ctx.fillText("RNG: ---m", cx + radius - 30, cy - radius + 40);
    ctx.fillText("WND: 0.0", cx + radius - 30, cy - radius + 55);

    ctx.globalAlpha = 1;
  }
}

export class RedDotOverlay extends BaseScopeOverlay {
  public shouldHideWeapon(): boolean {
    return false;
  }

  public getActivationThreshold(): number {
    return 1.0;
  }

  protected render(): void {}
}
