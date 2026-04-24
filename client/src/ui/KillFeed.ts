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

const WEAPON_ICONS: Record<string, string> = {
  AR_1: "🔫",
  PISTOL_1: "🔫",
  SMG_1: "🔫",
  SNIPER_1: "🎯",
  SHOTGUN_1: "💥",
  ROCKET_1: "🚀",
  GL_1: "💣",
};

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
      ? "rgba(0, 255, 100, 0.15)" 
      : isLocalVictim 
        ? "rgba(255, 50, 50, 0.15)" 
        : "rgba(0, 0, 0, 0.6)";
    
    const borderColor = isLocalKiller 
      ? "#00ff66" 
      : isLocalVictim 
        ? "#ff4444" 
        : "#333";
    
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
      color: ${isLocalKiller ? "#00ff66" : "#ffffff"};
      font-weight: ${isLocalKiller ? "700" : "500"};
      font-size: 13px;
      max-width: 100px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    `;
    
    const weaponSpan = document.createElement("span");
    const icon = WEAPON_ICONS[weaponId] || "🔫";
    weaponSpan.textContent = isHeadshot ? `${icon}💀` : icon;
    weaponSpan.style.cssText = `
      color: ${isHeadshot ? "#ff4444" : "#888"};
      font-size: 14px;
    `;
    
    const victimSpan = document.createElement("span");
    victimSpan.textContent = victimName;
    victimSpan.style.cssText = `
      color: ${isLocalVictim ? "#ff4444" : "#aaaaaa"};
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
