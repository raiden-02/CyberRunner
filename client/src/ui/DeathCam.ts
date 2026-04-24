interface DeathCamConfig {
  duration: number;
  fadeInTime: number;
  fadeOutTime: number;
}

const DEFAULT_CONFIG: DeathCamConfig = {
  duration: 3000,
  fadeInTime: 300,
  fadeOutTime: 500,
};

export class DeathCam {
  private container: HTMLDivElement;
  private config: DeathCamConfig;
  private visible = false;
  private killerName: string = "";
  private weaponName: string = "";
  private isHeadshot: boolean = false;
  private hideTimeout: number | null = null;

  constructor(config: Partial<DeathCamConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    this.container = document.createElement("div");
    this.container.id = "death-cam";
    this.container.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 800;
      display: none;
      justify-content: center;
      align-items: center;
      flex-direction: column;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    `;
    
    document.body.appendChild(this.container);
  }

  show(killerName: string, weaponName: string, isHeadshot: boolean): void {
    if (this.hideTimeout !== null) {
      clearTimeout(this.hideTimeout);
      this.hideTimeout = null;
    }
    
    this.killerName = killerName;
    this.weaponName = weaponName;
    this.isHeadshot = isHeadshot;
    this.visible = true;
    
    this.container.innerHTML = this.createContent();
    this.container.style.display = "flex";
    this.container.style.opacity = "0";
    
    requestAnimationFrame(() => {
      this.container.style.transition = `opacity ${this.config.fadeInTime}ms ease-out`;
      this.container.style.opacity = "1";
    });
    
    this.hideTimeout = window.setTimeout(() => {
      this.fadeOut();
    }, this.config.duration);
  }

  private createContent(): string {
    const headshotText = this.isHeadshot ? '<span style="color: #ff4444; font-size: 14px; margin-left: 8px;">HEADSHOT</span>' : '';
    
    return `
      <div style="
        background: linear-gradient(135deg, rgba(20, 0, 0, 0.85) 0%, rgba(40, 0, 0, 0.75) 100%);
        border: 2px solid #ff2222;
        border-radius: 12px;
        padding: 32px 48px;
        text-align: center;
        box-shadow: 0 0 60px rgba(255, 0, 0, 0.3);
        animation: deathCamPulse 1s ease-in-out infinite;
      ">
        <div style="
          color: #ff4444;
          font-size: 14px;
          text-transform: uppercase;
          letter-spacing: 3px;
          margin-bottom: 12px;
          opacity: 0.8;
        ">
          Killed By
        </div>
        <div style="
          color: #ffffff;
          font-size: 32px;
          font-weight: 700;
          text-shadow: 0 0 20px rgba(255, 68, 68, 0.5);
          margin-bottom: 8px;
        ">
          ${this.escapeHtml(this.killerName)}${headshotText}
        </div>
        <div style="
          color: #888;
          font-size: 14px;
        ">
          ${this.escapeHtml(this.weaponName)}
        </div>
      </div>
      
      <div style="
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        border: 4px solid rgba(255, 0, 0, 0.3);
        pointer-events: none;
        animation: deathCamVignette 0.5s ease-out;
      "></div>
    `;
  }

  private escapeHtml(text: string): string {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  private fadeOut(): void {
    this.container.style.transition = `opacity ${this.config.fadeOutTime}ms ease-out`;
    this.container.style.opacity = "0";
    
    setTimeout(() => {
      this.visible = false;
      this.container.style.display = "none";
    }, this.config.fadeOutTime);
  }

  hide(): void {
    if (this.hideTimeout !== null) {
      clearTimeout(this.hideTimeout);
      this.hideTimeout = null;
    }
    this.visible = false;
    this.container.style.display = "none";
    this.container.style.opacity = "0";
  }

  isVisible(): boolean {
    return this.visible;
  }

  getKillerInfo(): { name: string; weapon: string } | null {
    if (!this.visible) return null;
    return { name: this.killerName, weapon: this.weaponName };
  }

  dispose(): void {
    if (this.hideTimeout !== null) {
      clearTimeout(this.hideTimeout);
    }
    this.container.remove();
  }
}

const style = document.createElement("style");
style.textContent = `
  @keyframes deathCamPulse {
    0%, 100% { box-shadow: 0 0 60px rgba(255, 0, 0, 0.3); }
    50% { box-shadow: 0 0 80px rgba(255, 0, 0, 0.5); }
  }
  
  @keyframes deathCamVignette {
    from { border-width: 80px; opacity: 0.8; }
    to { border-width: 4px; opacity: 1; }
  }
`;
document.head.appendChild(style);
