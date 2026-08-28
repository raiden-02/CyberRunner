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
  private killerName = "";
  private weaponName = "";
  private isHeadshot = false;
  private hideTimeout: number | null = null;

  constructor(config: Partial<DeathCamConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    this.container = document.createElement("div");
    this.container.id = "death-cam";
    this.container.className = "cr-deathcam";
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
    const hs = this.isHeadshot ? `<span class="cr-hud-label" style="color:var(--cr-warning)">Headshot</span>` : "";
    return `
      <div class="cr-deathcam__panel">
        <div class="cr-hud-label">Killed by</div>
        <div class="cr-hud-value">${this.escapeHtml(this.killerName)}</div>
        <div class="cr-hud-label">${this.escapeHtml(this.weaponName)}</div>
        ${hs}
      </div>
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
