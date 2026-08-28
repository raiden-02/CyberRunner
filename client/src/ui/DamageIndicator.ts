interface DamageIndicatorConfig {
  color: string;
  fadeTime: number;
  size: number;
  distance: number;
}

const DEFAULT_CONFIG: DamageIndicatorConfig = {
  color: "#d4544a",
  fadeTime: 1000,
  size: 60,
  distance: 80,
};

interface ActiveIndicator {
  element: HTMLDivElement;
  angle: number;
  startTime: number;
}

export class DamageIndicator {
  private container: HTMLDivElement;
  private config: DamageIndicatorConfig;
  private indicators: ActiveIndicator[] = [];
  private playerYaw: number = 0;
  private animationFrameId: number | null = null;

  constructor(config: Partial<DamageIndicatorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    this.container = document.createElement("div");
    this.container.id = "damage-indicators";
    this.container.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 450;
    `;
    document.body.appendChild(this.container);
    
    this.startUpdateLoop();
  }

  showDamage(
    attackerX: number,
    attackerZ: number,
    playerX: number,
    playerZ: number
  ): void {
    const dx = attackerX - playerX;
    const dz = attackerZ - playerZ;
    const worldAngle = Math.atan2(dx, dz);
    
    this.addIndicator(worldAngle);
  }

  showDamageFromAngle(worldAngle: number): void {
    this.addIndicator(worldAngle);
  }

  private addIndicator(worldAngle: number): void {
    const indicator = document.createElement("div");
    indicator.className = "damage-indicator";
    indicator.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      width: ${this.config.size}px;
      height: ${this.config.size / 2}px;
      transform-origin: center center;
      opacity: 0.8;
    `;
    
    indicator.innerHTML = `
      <svg width="${this.config.size}" height="${this.config.size / 2}" viewBox="0 0 60 30">
        <polygon points="30,0 45,30 30,20 15,30" fill="${this.config.color}" opacity="0.9"/>
      </svg>
    `;
    
    this.container.appendChild(indicator);
    
    this.indicators.push({
      element: indicator,
      angle: worldAngle,
      startTime: performance.now(),
    });
  }

  setPlayerYaw(yaw: number): void {
    this.playerYaw = yaw;
  }

  private startUpdateLoop(): void {
    const update = () => {
      const now = performance.now();
      
      for (let i = this.indicators.length - 1; i >= 0; i--) {
        const indicator = this.indicators[i];
        const elapsed = now - indicator.startTime;
        
        if (elapsed >= this.config.fadeTime) {
          indicator.element.remove();
          this.indicators.splice(i, 1);
          continue;
        }
        
        const relativeAngle = indicator.angle - this.playerYaw;
        const screenAngle = -relativeAngle * (180 / Math.PI) - 90;
        
        const opacity = 0.8 * (1 - elapsed / this.config.fadeTime);
        
        const translateX = Math.sin(relativeAngle) * this.config.distance;
        const translateY = -Math.cos(relativeAngle) * this.config.distance;
        
        indicator.element.style.transform = `
          translate(calc(-50% + ${translateX}px), calc(-50% + ${translateY}px))
          rotate(${screenAngle}deg)
        `;
        indicator.element.style.opacity = String(opacity);
      }
      
      this.animationFrameId = requestAnimationFrame(update);
    };
    
    this.animationFrameId = requestAnimationFrame(update);
  }

  dispose(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }
    this.container.remove();
  }
}
