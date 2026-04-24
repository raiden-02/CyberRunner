import { getAudioManager } from "../audio/AudioManager.js";

interface HitMarkerConfig {
  normalColor: string;
  headshotColor: string;
  killColor: string;
  size: number;
  duration: number;
}

const DEFAULT_CONFIG: HitMarkerConfig = {
  normalColor: "#ffffff",
  headshotColor: "#ff4444",
  killColor: "#ffcc00",
  size: 24,
  duration: 150,
};

export class HitMarker {
  private container: HTMLDivElement;
  private config: HitMarkerConfig;
  private hideTimeout: number | null = null;

  constructor(config: Partial<HitMarkerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    this.container = document.createElement("div");
    this.container.id = "hit-marker";
    this.container.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      pointer-events: none;
      z-index: 500;
      opacity: 0;
      transition: opacity 0.05s ease-out;
    `;
    
    this.container.innerHTML = this.createMarkerSVG();
    document.body.appendChild(this.container);
  }

  private createMarkerSVG(): string {
    const size = this.config.size;
    const gap = 4;
    const lineLength = 8;
    const center = size / 2;
    
    return `
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="transform: rotate(45deg);">
        <line class="hit-line" x1="${center - gap - lineLength}" y1="${center}" x2="${center - gap}" y2="${center}" stroke="currentColor" stroke-width="2"/>
        <line class="hit-line" x1="${center + gap}" y1="${center}" x2="${center + gap + lineLength}" y2="${center}" stroke="currentColor" stroke-width="2"/>
        <line class="hit-line" x1="${center}" y1="${center - gap - lineLength}" x2="${center}" y2="${center - gap}" stroke="currentColor" stroke-width="2"/>
        <line class="hit-line" x1="${center}" y1="${center + gap}" x2="${center}" y2="${center + gap + lineLength}" stroke="currentColor" stroke-width="2"/>
      </svg>
    `;
  }

  show(isHeadshot: boolean = false, isKill: boolean = false): void {
    if (this.hideTimeout !== null) {
      clearTimeout(this.hideTimeout);
    }
    
    let color = this.config.normalColor;
    if (isKill) {
      color = this.config.killColor;
      getAudioManager()?.playKillConfirm();
    } else if (isHeadshot) {
      color = this.config.headshotColor;
      getAudioManager()?.playHeadshot();
    } else {
      getAudioManager()?.playHitMarker();
    }
    
    this.container.style.color = color;
    this.container.style.opacity = "1";
    this.container.style.transform = "translate(-50%, -50%) scale(1.2)";
    
    requestAnimationFrame(() => {
      this.container.style.transition = "opacity 0.1s ease-out, transform 0.1s ease-out";
      this.container.style.transform = "translate(-50%, -50%) scale(1)";
    });
    
    this.hideTimeout = window.setTimeout(() => {
      this.container.style.opacity = "0";
      this.hideTimeout = null;
    }, this.config.duration);
  }

  dispose(): void {
    if (this.hideTimeout !== null) {
      clearTimeout(this.hideTimeout);
    }
    this.container.remove();
  }
}
