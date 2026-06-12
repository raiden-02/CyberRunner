import { WEAPON_DEFINITIONS } from "../weapons/definitions.js";

interface KillFeedEntry {
  element: HTMLDivElement;
  timestamp: number;
}

interface KillFeedConfig {
  maxEntries: number;
  displayTime: number;
  fadeTime: number;
}

const DEFAULT_CONFIG: KillFeedConfig = {
  maxEntries: 5,
  displayTime: 5000,
  fadeTime: 500,
};

function weaponLabel(weaponId: string): string {
  return WEAPON_DEFINITIONS[weaponId]?.name ?? weaponId.replaceAll("_", "-");
}

export class KillFeed {
  private container: HTMLDivElement;
  private entries: KillFeedEntry[] = [];
  private config: KillFeedConfig;
  private updateInterval: number | null = null;

  constructor(config: Partial<KillFeedConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    this.container = document.createElement("div");
    this.container.id = "kill-feed";
    this.container.style.cssText = `
      position: fixed;
      top: 80px;
      right: 20px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      pointer-events: none;
      z-index: 600;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    `;
    document.body.appendChild(this.container);
    
    this.startUpdateLoop();
  }

  addKill(
    killerName: string,
    victimName: string,
    weaponId: string,
    isHeadshot: boolean = false,
    isLocalKiller: boolean = false,
    isLocalVictim: boolean = false
  ): void {
    const entry = document.createElement("div");
    entry.className = "kill-feed-entry";
    
    const bgColor = isLocalKiller 
      ? "rgba(74, 139, 138, 0.18)" 
      : isLocalVictim 
        ? "rgba(196, 92, 58, 0.18)" 
        : "rgba(26, 24, 20, 0.72)";
    
    const borderColor = isLocalKiller 
      ? "#4a8b8a" 
      : isLocalVictim 
        ? "#c45c3a" 
        : "#4a433a";
    
    entry.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      background: ${bgColor};
      border: 1px solid ${borderColor};
      border-radius: 4px;
      backdrop-filter: blur(4px);
      animation: killFeedSlideIn 0.2s ease-out;
      transition: opacity 0.3s ease-out;
    `;
    
    const killerSpan = document.createElement("span");
    killerSpan.textContent = killerName;
    killerSpan.style.cssText = `
      color: ${isLocalKiller ? "#4a8b8a" : "#ede6d9"};
      font-weight: ${isLocalKiller ? "700" : "500"};
      font-size: 13px;
      max-width: 100px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    `;
    
    const weaponSpan = document.createElement("span");
    const label = weaponLabel(weaponId);
    weaponSpan.textContent = isHeadshot ? `${label} HS` : label;
    weaponSpan.style.cssText = `
      color: ${isHeadshot ? "#c45c3a" : "#9a9286"};
      font-size: 12px;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    `;
    
    const victimSpan = document.createElement("span");
    victimSpan.textContent = victimName;
    victimSpan.style.cssText = `
      color: ${isLocalVictim ? "#c45c3a" : "#9a9286"};
      font-weight: ${isLocalVictim ? "700" : "400"};
      font-size: 13px;
      max-width: 100px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    `;
    
    entry.appendChild(killerSpan);
    entry.appendChild(weaponSpan);
    entry.appendChild(victimSpan);
    
    this.container.insertBefore(entry, this.container.firstChild);
    
    this.entries.unshift({
      element: entry,
      timestamp: performance.now(),
    });
    
    while (this.entries.length > this.config.maxEntries) {
      const removed = this.entries.pop();
      removed?.element.remove();
    }
  }

  private startUpdateLoop(): void {
    this.updateInterval = window.setInterval(() => {
      const now = performance.now();
      
      for (let i = this.entries.length - 1; i >= 0; i--) {
        const entry = this.entries[i];
        const elapsed = now - entry.timestamp;
        
        if (elapsed >= this.config.displayTime + this.config.fadeTime) {
          entry.element.remove();
          this.entries.splice(i, 1);
        } else if (elapsed >= this.config.displayTime) {
          const fadeProgress = (elapsed - this.config.displayTime) / this.config.fadeTime;
          entry.element.style.opacity = String(1 - fadeProgress);
        }
      }
    }, 100);
  }

  hide(): void {
    this.container.style.display = "none";
  }

  show(): void {
    this.container.style.display = "flex";
  }

  clear(): void {
    for (const entry of this.entries) {
      entry.element.remove();
    }
    this.entries = [];
  }

  dispose(): void {
    if (this.updateInterval !== null) {
      clearInterval(this.updateInterval);
    }
    this.container.remove();
  }
}

const style = document.createElement("style");
style.textContent = `
  @keyframes killFeedSlideIn {
    from {
      transform: translateX(50px);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }
`;
document.head.appendChild(style);
