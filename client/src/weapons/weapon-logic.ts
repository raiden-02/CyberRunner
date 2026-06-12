import {
  ATTACHMENT_DEFINITIONS,
  type WeaponDefinition,
  type WeaponStats,
  resolveWeaponDefinition
} from "./definitions.js";
import { BaseScopeOverlay, SniperScopeOverlay } from "./scope-overlays.js";
import { type CrosshairConfig, DEFAULT_CROSSHAIR } from "./crosshairs.js";

export interface ShotRequest {
  weaponId: string;
  time: number;
}

export abstract class BaseWeapon {
  public readonly id: string;
  public readonly def: WeaponDefinition;
  public readonly stats: WeaponStats;
  public ammoInMag: number;
  public ammoReserve: number;
  public isReloading = false;
  public reloadEndTime = 0;

  protected lastShotTime = -Infinity;
  protected burstRemaining = 0;
  protected nextBurstTime = 0;

  constructor(def: WeaponDefinition) {
    this.def = def;
    this.id = def.id;
    this.stats = this.applyAttachmentStats(def.stats, def.attachments);
    this.ammoInMag = this.stats.magSize;
    this.ammoReserve = this.stats.reserveMax;
  }

  protected applyAttachmentStats(stats: WeaponStats, attachments: string[]): WeaponStats {
    let out = { ...stats, recoil: { ...stats.recoil }, ads: { ...stats.ads } };
    for (const id of attachments) {
      const mod = ATTACHMENT_DEFINITIONS[id]?.statMods;
      if (!mod) continue;
      out = {
        ...out,
        ...mod,
        recoil: { ...out.recoil, ...(mod.recoil || {}) },
        ads: { ...out.ads, ...(mod.ads || {}) }
      };
    }
    return out;
  }

  public update(now: number): void {
    if (this.isReloading && now >= this.reloadEndTime) {
      this.finishReload();
    }
  }

  public startReload(now: number): boolean {
    if (this.isReloading) return false;
    if (this.ammoInMag >= this.stats.magSize) return false;
    if (this.ammoReserve <= 0) return false;
    this.isReloading = true;
    this.reloadEndTime = now + this.stats.reloadTime;
    return true;
  }

  protected finishReload(): void {
    const needed = this.stats.magSize - this.ammoInMag;
    const taken = Math.min(needed, this.ammoReserve);
    this.ammoInMag += taken;
    this.ammoReserve -= taken;
    this.isReloading = false;
  }

  public canShoot(now: number): boolean {
    if (this.isReloading) return false;
    if (this.ammoInMag <= 0) return false;
    const shotInterval = 60 / this.stats.rpm;
    if (this.stats.fireMode === "burst") {
      if (this.burstRemaining > 0) {
        return now >= this.nextBurstTime;
      }
      return now >= this.lastShotTime + shotInterval;
    }
    return now >= this.lastShotTime + shotInterval;
  }

  public tryShoot(now: number): ShotRequest | null {
    if (!this.canShoot(now)) return null;
    if (this.stats.fireMode === "burst") {
      if (this.burstRemaining === 0) {
        this.burstRemaining = this.stats.burstCount || 3;
        this.nextBurstTime = now;
      }
      if (now < this.nextBurstTime) return null;
      this.burstRemaining -= 1;
      this.nextBurstTime = now + (this.stats.burstInterval || 0.08);
    }
    this.lastShotTime = now;
    this.ammoInMag = Math.max(0, this.ammoInMag - 1);
    return { weaponId: this.id, time: now };
  }

  public createScopeOverlay(): BaseScopeOverlay | null {
    return null;
  }

  public getCrosshairConfig(): CrosshairConfig {
    return DEFAULT_CROSSHAIR;
  }

  public hasMagnifiedOptic(): boolean {
    return this.def.attachments.includes("SCOPE_4X");
  }
}

export class AssaultRifleWeapon extends BaseWeapon {
  public override getCrosshairConfig(): CrosshairConfig {
    return { style: "cross", color: "#ede6d9", size: 18, thickness: 2, gap: 6, opacity: 0.9, outline: true };
  }
}

export class SMGWeapon extends BaseWeapon {
  public override getCrosshairConfig(): CrosshairConfig {
    return { style: "chevron", color: "#d4893a", size: 16, thickness: 2, gap: 4, opacity: 0.9 };
  }
}

export class LMGWeapon extends BaseWeapon {
  public override getCrosshairConfig(): CrosshairConfig {
    return { style: "cross", color: "#ede6d9", size: 22, thickness: 3, gap: 8, opacity: 0.85, outline: true };
  }
}

export class ShotgunWeapon extends BaseWeapon {
  public override getCrosshairConfig(): CrosshairConfig {
    return { style: "circle", color: "#ffffff", size: 28, thickness: 2, gap: 0, opacity: 0.9, dotSize: 3 };
  }
}

export class MarksmanRifleWeapon extends BaseWeapon {
  public override getCrosshairConfig(): CrosshairConfig {
    return { style: "dot", color: "#d4893a", size: 4, thickness: 0, gap: 0, opacity: 1.0, dotSize: 4 };
  }
}

export class SniperRifleWeapon extends BaseWeapon {
  public override createScopeOverlay(): BaseScopeOverlay | null {
    if (this.hasMagnifiedOptic()) {
      return new SniperScopeOverlay(this.def.name, "4.0x");
    }
    return null;
  }

  public override getCrosshairConfig(): CrosshairConfig {
    return { style: "dot", color: "#d4893a", size: 4, thickness: 0, gap: 0, opacity: 1.0, dotSize: 4 };
  }
}

export class PistolWeapon extends BaseWeapon {
  public override getCrosshairConfig(): CrosshairConfig {
    return { style: "circle", color: "#ffffff", size: 14, thickness: 1.5, gap: 0, opacity: 0.9, dotSize: 2 };
  }
}

export class MachinePistolWeapon extends BaseWeapon {
  public override getCrosshairConfig(): CrosshairConfig {
    return { style: "chevron", color: "#d4893a", size: 16, thickness: 2, gap: 4, opacity: 0.9 };
  }
}

export abstract class LauncherWeapon extends BaseWeapon {}

export class RocketLauncherWeapon extends LauncherWeapon {
  public override getCrosshairConfig(): CrosshairConfig {
    return { style: "circle", color: "#c45c3a", size: 32, thickness: 2, gap: 0, opacity: 0.9, dotSize: 4 };
  }
}

export class GrenadeLauncherWeapon extends LauncherWeapon {
  public override getCrosshairConfig(): CrosshairConfig {
    return { style: "circle", color: "#c45c3a", size: 26, thickness: 2, gap: 0, opacity: 0.9, dotSize: 3 };
  }
}

export class MeleeWeapon extends BaseWeapon {
  public override getCrosshairConfig(): CrosshairConfig {
    return { style: "dot", color: "#ffffff", size: 6, thickness: 0, gap: 0, opacity: 0.8, dotSize: 6 };
  }
}

export class EnergyWeapon extends BaseWeapon {
  public override getCrosshairConfig(): CrosshairConfig {
    return { style: "cross", color: "#ede6d9", size: 18, thickness: 2, gap: 6, opacity: 0.9, outline: true };
  }
}

export class ChargeWeapon extends BaseWeapon {
  public override getCrosshairConfig(): CrosshairConfig {
    return { style: "circle", color: "#d4893a", size: 20, thickness: 2, gap: 0, opacity: 0.9, dotSize: 3 };
  }
}

export class BeamWeapon extends BaseWeapon {
  public override getCrosshairConfig(): CrosshairConfig {
    return { style: "dot", color: "#d4893a", size: 6, thickness: 0, gap: 0, opacity: 1.0, dotSize: 6 };
  }
}

export class BowWeapon extends BaseWeapon {
  public override getCrosshairConfig(): CrosshairConfig {
    return { style: "chevron", color: "#ede6d9", size: 18, thickness: 2, gap: 5, opacity: 0.9 };
  }
}

export function createWeapon(weaponId: string): BaseWeapon {
  const def = resolveWeaponDefinition(weaponId);
  if (!def) {
    throw new Error(`Unknown weapon ID: ${weaponId}`);
  }
  switch (def.family) {
    case "AssaultRifle":
      return new AssaultRifleWeapon(def);
    case "SMG":
      return new SMGWeapon(def);
    case "Sniper":
      return new SniperRifleWeapon(def);
    case "GrenadeLauncher":
      return new GrenadeLauncherWeapon(def);
    case "LMG":
      return new LMGWeapon(def);
    case "Shotgun":
      return new ShotgunWeapon(def);
    case "DMR":
      return new MarksmanRifleWeapon(def);
    case "Pistol":
      return new PistolWeapon(def);
    case "MachinePistol":
      return new MachinePistolWeapon(def);
    case "Launcher":
    case "RocketLauncher":
      return new RocketLauncherWeapon(def);
    case "Melee":
      return new MeleeWeapon(def);
    case "Energy":
      return new EnergyWeapon(def);
    case "Charge":
      return new ChargeWeapon(def);
    case "Beam":
      return new BeamWeapon(def);
    case "Bow":
      return new BowWeapon(def);
    default:
      return new AssaultRifleWeapon(def);
  }
}
