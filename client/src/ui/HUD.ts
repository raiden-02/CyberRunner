import { WEAPON_DEFINITIONS } from "../weapons/definitions.js";

export class HUD {
  private element: HTMLDivElement;
  private currentWeaponId = "AR_1";

  constructor() {
    this.element = document.createElement("div");
    this.element.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      color: #fff;
      font-family: 'Segoe UI', system-ui, sans-serif;
      font-size: 13px;
      background: linear-gradient(135deg, rgba(0,20,40,0.85) 0%, rgba(0,10,20,0.9) 100%);
      padding: 14px 18px;
      border-radius: 4px;
      border-left: 3px solid #00ffff;
      pointer-events: none;
      min-width: 200px;
      box-shadow: 0 4px 20px rgba(0,255,255,0.15);
      line-height: 1.6;
    `;
    document.body.appendChild(this.element);
  }

  public setWeapon(weaponId: string): void {
    this.currentWeaponId = weaponId;
  }

  private getWeaponDisplayName(weaponId: string): string {
    const def = WEAPON_DEFINITIONS[weaponId];
    return def ? def.name : weaponId;
  }

  private getWeaponFamily(weaponId: string): string {
    const def = WEAPON_DEFINITIONS[weaponId];
    if (!def) return "";
    const family = def.family;
    switch (family) {
      case "AssaultRifle": return "Assault Rifle";
      case "SMG": return "SMG";
      case "LMG": return "LMG";
      case "DMR": return "DMR";
      case "Sniper": return "Sniper Rifle";
      case "Shotgun": return "Shotgun";
      case "Pistol": return "Pistol";
      case "MachinePistol": return "Machine Pistol";
      case "RocketLauncher": return "Rocket Launcher";
      case "GrenadeLauncher": return "Grenade Launcher";
      case "Launcher": return "Launcher";
      case "Melee": return "Melee";
      case "Energy": return "Energy";
      case "Charge": return "Charge";
      case "Beam": return "Beam";
      case "Bow": return "Bow";
      default: return family;
    }
  }

  public update(
    ammoInMag?: number,
    ammoReserve?: number,
    health?: number,
    maxHealth?: number,
    isDead?: boolean,
    respawnTime?: number,
    isReloading?: boolean
  ): void {
    const weaponName = this.getWeaponDisplayName(this.currentWeaponId);
    const weaponType = this.getWeaponFamily(this.currentWeaponId);
    
    let html = `<div style="color:#00ffff;font-weight:500;margin-bottom:6px;">WEAPON</div>`;
    html += `<div style="margin-bottom:10px;">${weaponName} <span style="color:#888;">(${weaponType})</span></div>`;

    if (ammoInMag !== undefined && ammoReserve !== undefined) {
      html += `<div style="color:#00ffff;font-weight:500;margin-bottom:4px;">AMMO</div>`;
      if (isReloading) {
        html += `<div style="color:#ffcc00;margin-bottom:10px;">RELOADING...</div>`;
      } else {
        html += `<div style="margin-bottom:10px;">${ammoInMag} / ${ammoReserve}</div>`;
      }
    }

    if (health !== undefined && maxHealth !== undefined) {
      html += `<div style="color:#00ffff;font-weight:500;margin-bottom:4px;">HEALTH</div>`;
      const percent = Math.round((health / maxHealth) * 100);
      const healthBar = this.createHealthBar(percent);
      html += `<div>${health} / ${maxHealth} ${healthBar}</div>`;

      if (isDead && respawnTime !== undefined && respawnTime > 0) {
        html += `<div style="color:#ff4444;margin-top:8px;font-weight:500;">DEAD - Respawn: ${respawnTime.toFixed(1)}s</div>`;
      } else if (isDead) {
        html += `<div style="color:#ff4444;margin-top:8px;font-weight:500;">DEAD</div>`;
      }
    }

    this.element.innerHTML = html;
  }

  private createHealthBar(percent: number): string {
    const filled = Math.round(percent / 10);
    const empty = 10 - filled;
    const color = percent > 60 ? '#0f0' : percent > 30 ? '#ff0' : '#f00';
    return `<span style="color:${color}">${'█'.repeat(filled)}${'░'.repeat(empty)}</span>`;
  }
}
