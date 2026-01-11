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
      font-family: monospace;
      font-size: 16px;
      background: rgba(0,0,0,0.5);
      padding: 10px;
      border-radius: 5px;
      pointer-events: none;
      white-space: pre-line;
    `;
    document.body.appendChild(this.element);
  }

  public setWeapon(weaponId: string): void {
    this.currentWeaponId = weaponId;
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
    let text = `Weapon: ${this.currentWeaponId}`;

    if (ammoInMag !== undefined && ammoReserve !== undefined) {
      if (isReloading) {
        text += `\nAmmo: RELOADING...`;
      } else {
        text += `\nAmmo: ${ammoInMag}/${ammoReserve}`;
      }
    }

    if (health !== undefined && maxHealth !== undefined) {
      const percent = Math.round((health / maxHealth) * 100);
      text += `\nHealth: ${health}/${maxHealth} (${percent}%)`;

      if (isDead && respawnTime !== undefined && respawnTime > 0) {
        text += `\nRespawn in: ${respawnTime.toFixed(1)}s`;
      } else if (isDead) {
        text += `\nDEAD - Respawning...`;
      }
    }

    this.element.textContent = text;
  }
}
