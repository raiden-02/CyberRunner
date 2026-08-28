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
    this.container.className = "cr-killfeed";
    document.body.appendChild(this.container);

    this.startUpdateLoop();
  }

  addKill(
    killerName: string,
    victimName: string,
    weaponId: string,
    isHeadshot: boolean = false,
    isLocalKiller: boolean = false,
    isLocalVictim: boolean = false,
  ): void {
    const entry = document.createElement("div");
    entry.className = "cr-killfeed__entry";
    if (isLocalKiller) entry.classList.add("cr-killfeed__entry--local");
    if (isLocalVictim) entry.classList.add("cr-killfeed__entry--victim");

    const killerSpan = document.createElement("span");
    killerSpan.textContent = killerName;
    if (isLocalKiller) killerSpan.className = "cr-scoreboard__you";

    const weaponSpan = document.createElement("span");
    const label = weaponLabel(weaponId);
    weaponSpan.textContent = isHeadshot ? `${label} HS` : label;
    weaponSpan.className = isHeadshot ? "cr-killfeed__weapon cr-killfeed__weapon--hs" : "cr-killfeed__weapon";

    const victimSpan = document.createElement("span");
    victimSpan.textContent = victimName;
    if (isLocalVictim) victimSpan.style.color = "var(--cr-danger)";
    if (isLocalVictim) victimSpan.style.fontWeight = "700";

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
