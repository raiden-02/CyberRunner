import * as THREE from "three";
import type { AttachmentDefinition, SocketName, WeaponDefinition } from "./definitions.js";
import {
  createBox,
  createCylinder,
  createCone,
  createMaterialSet,
  addRail,
  addVentCuts,
  addHeatSink,
  addNeonStripe,
  addAngularAccent,
  setFirstPersonMaterialFlags,
  setThirdPersonMaterialFlags,
  type MaterialSet
} from "./procedural-kit.js";

export interface WeaponViewOptions {
  thirdPerson?: boolean;
}

export class WeaponViewModel {
  public readonly viewRoot: THREE.Object3D;
  public readonly weaponRoot: THREE.Object3D;
  public readonly sockets = new Map<SocketName, THREE.Object3D>();
  public readonly opticEye?: THREE.Object3D;
  public readonly hipOffset: THREE.Vector3;
  private opticReticle?: THREE.Object3D;
  private ironSightEye?: THREE.Object3D;

  private readonly hipRotation: THREE.Euler;
  private readonly adsOffset: THREE.Vector3;
  private readonly adsRotation: THREE.Euler;
  private computedAdsOffset: THREE.Vector3;

  private recoilKick = 0;
  private currentSway = 0;
  private lastAdsProgress = 0;

  constructor(def: WeaponDefinition, attachments: AttachmentDefinition[], options: WeaponViewOptions = {}) {
    this.viewRoot = new THREE.Object3D();
    this.weaponRoot = new THREE.Object3D();
    this.viewRoot.add(this.weaponRoot);

    this.hipOffset = this.getHipOffset(def.family);
    this.hipRotation = this.getHipRotation(def.family);
    this.adsOffset = this.getADSOffset(def.family);
    this.adsRotation = this.getADSRotation(def.family);
    this.computedAdsOffset = this.adsOffset.clone();

    this.weaponRoot.position.copy(this.hipOffset);
    this.weaponRoot.rotation.copy(this.hipRotation);

    if (!options.thirdPerson) {
      this.weaponRoot.scale.setScalar(this.getFirstPersonScale(def.family));
    }

    const receiverRoot = new THREE.Object3D();
    this.weaponRoot.add(receiverRoot);

    const mats = createMaterialSet(def.colorVariant);
    this.buildWeaponGeometry(def, receiverRoot, mats);
    this.createSockets(receiverRoot, def.family);
    const attachmentResult = this.attachAttachments(attachments, mats, options.thirdPerson || false);
    this.opticEye = attachmentResult.eye;
    this.opticReticle = attachmentResult.reticle;
    if (this.opticReticle) {
      this.setAdsReticleAlpha(0);
    }

    if (!options.thirdPerson) {
      this.computeAdsAlignment();
    }

    if (options.thirdPerson) {
      setThirdPersonMaterialFlags(this.viewRoot);
    } else {
      setFirstPersonMaterialFlags(this.viewRoot);
    }
  }

  private computeAdsAlignment(): void {
    const eyeSocket = this.opticEye || this.ironSightEye;
    
    if (!eyeSocket) {
      this.computedAdsOffset = this.adsOffset.clone();
      return;
    }

    const eyeLocalPos = new THREE.Vector3();
    const savedPosition = this.weaponRoot.position.clone();
    const savedRotation = this.weaponRoot.rotation.clone();
    this.weaponRoot.position.set(0, 0, 0);
    this.weaponRoot.rotation.set(0, 0, 0);
    this.weaponRoot.updateMatrixWorld(true);
    eyeSocket.getWorldPosition(eyeLocalPos);
    this.weaponRoot.position.copy(savedPosition);
    this.weaponRoot.rotation.copy(savedRotation);
    
    const adsDepth = 0.3;
    this.computedAdsOffset = new THREE.Vector3(
      -eyeLocalPos.x,
      -eyeLocalPos.y,
      -adsDepth - eyeLocalPos.z
    );
  }

  public update(dt: number, now: number, adsAlpha = 0): void {
    const swayScale = 1 - Math.min(1, adsAlpha * 0.85);
    const targetSway = Math.sin(now * 6) * 0.004 * swayScale;
    this.currentSway = THREE.MathUtils.lerp(this.currentSway, targetSway, Math.min(1, dt * 8));

    if (this.recoilKick > 0.0001) {
      this.recoilKick *= Math.max(0, 1 - dt * 20);
    } else {
      this.recoilKick = 0;
    }

    const baseRx = THREE.MathUtils.lerp(this.hipRotation.x, this.adsRotation.x, this.lastAdsProgress);
    const baseRy = THREE.MathUtils.lerp(this.hipRotation.y, this.adsRotation.y, this.lastAdsProgress);
    const baseRz = THREE.MathUtils.lerp(this.hipRotation.z, this.adsRotation.z, this.lastAdsProgress);

    this.weaponRoot.rotation.set(baseRx - this.recoilKick, baseRy + this.currentSway, baseRz);
  }

  public applyRecoil(kick: number): void {
    this.recoilKick = Math.min(0.08, this.recoilKick + kick);
  }

  public setVisible(visible: boolean): void {
    this.viewRoot.visible = visible;
  }

  public setAdsReticleAlpha(alpha: number): void {
    if (!this.opticReticle) return;
    const clamped = Math.min(1, Math.max(0, alpha));
    this.opticReticle.visible = clamped > 0.05;
    this.opticReticle.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        mats.forEach((mat) => {
          if ("opacity" in mat) {
            (mat as THREE.MeshBasicMaterial).opacity = clamped;
            (mat as THREE.MeshBasicMaterial).transparent = clamped < 1;
          }
        });
      }
    });
  }

  public getSocket(name: SocketName): THREE.Object3D {
    return this.sockets.get(name) || new THREE.Object3D();
  }

  public applyADSProgress(progress: number): void {
    this.lastAdsProgress = progress;
    this.weaponRoot.position.lerpVectors(this.hipOffset, this.computedAdsOffset, progress);
  }

  private getHipOffset(family: WeaponDefinition["family"]): THREE.Vector3 {
    switch (family) {
      case "SMG":
      case "MachinePistol":
        return new THREE.Vector3(0.58, -0.52, -1.1);
      case "Pistol":
        return new THREE.Vector3(0.5, -0.48, -0.9);
      case "Sniper":
        return new THREE.Vector3(0.72, -0.68, -1.7);
      case "LMG":
        return new THREE.Vector3(0.75, -0.72, -1.5);
      case "Shotgun":
        return new THREE.Vector3(0.65, -0.6, -1.3);
      case "RocketLauncher":
        return new THREE.Vector3(0.8, -0.75, -1.8);
      case "GrenadeLauncher":
        return new THREE.Vector3(0.68, -0.65, -1.5);
      default:
        return new THREE.Vector3(0.65, -0.58, -1.3);
    }
  }

  private getHipRotation(_family: WeaponDefinition["family"]): THREE.Euler {
    return new THREE.Euler(0, 0, 0);
  }

  private getADSOffset(family: WeaponDefinition["family"]): THREE.Vector3 {
    switch (family) {
      case "SMG":
      case "MachinePistol":
        return new THREE.Vector3(0, -0.2, -0.55);
      case "Pistol":
        return new THREE.Vector3(0, -0.14, -0.45);
      case "Sniper":
        return new THREE.Vector3(0, -0.22, -0.48);
      case "LMG":
        return new THREE.Vector3(0, -0.24, -0.6);
      case "Shotgun":
        return new THREE.Vector3(0, -0.17, -0.5);
      case "RocketLauncher":
        return new THREE.Vector3(0, -0.18, -0.65);
      case "GrenadeLauncher":
        return new THREE.Vector3(0, -0.2, -0.58);
      default:
        return new THREE.Vector3(0, -0.22, -0.5);
    }
  }

  private getADSRotation(_family: WeaponDefinition["family"]): THREE.Euler {
    return new THREE.Euler(0, 0, 0);
  }

  private getFirstPersonScale(family: WeaponDefinition["family"]): number {
    switch (family) {
      case "Pistol": return 0.75;
      case "MachinePistol": return 0.8;
      case "SMG": return 0.88;
      case "AssaultRifle":
      case "DMR": return 1.0;
      case "Shotgun": return 1.05;
      case "LMG": return 1.15;
      case "Sniper": return 1.1;
      case "RocketLauncher":
      case "Launcher": return 1.2;
      case "GrenadeLauncher": return 1.05;
      case "Melee": return 0.85;
      default: return 1.0;
    }
  }

  private buildWeaponGeometry(def: WeaponDefinition, root: THREE.Object3D, mats: MaterialSet): void {
    switch (def.family) {
      case "AssaultRifle":
        this.buildAssaultRifle(root, mats);
        break;
      case "SMG":
        this.buildSMG(root, mats);
        break;
      case "LMG":
        this.buildLMG(root, mats);
        break;
      case "Shotgun":
        this.buildShotgun(root, mats);
        break;
      case "Sniper":
        this.buildSniper(root, mats);
        break;
      case "Pistol":
        this.buildPistol(root, mats);
        break;
      case "RocketLauncher":
        this.buildRocketLauncher(root, mats);
        break;
      case "GrenadeLauncher":
        this.buildGrenadeLauncher(root, mats);
        break;
      default:
        this.buildAssaultRifle(root, mats);
    }
  }

  private buildAssaultRifle(root: THREE.Object3D, mats: MaterialSet): void {
    const receiver = createBox(new THREE.Vector3(0.2, 0.11, 0.48), mats.darkMetal);
    receiver.position.set(0, 0, -0.14);
    root.add(receiver);

    const upper = createBox(new THREE.Vector3(0.17, 0.06, 0.4), mats.midMetal);
    upper.position.set(0, 0.07, -0.16);
    root.add(upper);

    const barrel = createCylinder(0.022, 0.52, mats.midMetal);
    barrel.position.set(0, 0.02, -0.58);
    root.add(barrel);

    const shroud = createBox(new THREE.Vector3(0.08, 0.06, 0.28), mats.lightMetal);
    shroud.position.set(0, 0.02, -0.48);
    root.add(shroud);

    const stock = createBox(new THREE.Vector3(0.06, 0.1, 0.2), mats.midMetal);
    stock.position.set(0, 0, 0.2);
    root.add(stock);

    const mag = createBox(new THREE.Vector3(0.06, 0.16, 0.1), mats.darkMetal);
    mag.position.set(0, -0.12, -0.06);
    mag.rotation.x = -0.12;
    root.add(mag);

    const grip = createBox(new THREE.Vector3(0.055, 0.12, 0.07), mats.midMetal);
    grip.position.set(0, -0.11, 0.05);
    grip.rotation.x = 0.22;
    root.add(grip);

    const railBase = new THREE.Object3D();
    railBase.position.set(0, 0.095, -0.14);
    addRail(railBase, 0.38, mats.midMetal);
    root.add(railBase);

    addNeonStripe(root, 0.32, mats.neon, 0.03);
    addVentCuts(root, 5, 0.045);
    addAngularAccent(root, mats.neonDim);
  }

  private buildSMG(root: THREE.Object3D, mats: MaterialSet): void {
    const receiver = createBox(new THREE.Vector3(0.16, 0.08, 0.32), mats.darkMetal);
    receiver.position.set(0, -0.01, -0.08);
    root.add(receiver);

    const upper = createBox(new THREE.Vector3(0.14, 0.035, 0.28), mats.midMetal);
    upper.position.set(0, 0.04, -0.1);
    root.add(upper);

    const barrel = createCylinder(0.018, 0.32, mats.midMetal);
    barrel.position.set(0, 0.02, -0.38);
    root.add(barrel);

    const stock = createBox(new THREE.Vector3(0.04, 0.08, 0.14), mats.lightMetal);
    stock.position.set(0, 0.02, 0.16);
    root.add(stock);

    const mag = createBox(new THREE.Vector3(0.05, 0.18, 0.08), mats.darkMetal);
    mag.position.set(0, -0.12, -0.02);
    mag.rotation.x = -0.08;
    root.add(mag);

    const grip = createBox(new THREE.Vector3(0.05, 0.1, 0.06), mats.midMetal);
    grip.position.set(0, -0.1, 0.06);
    grip.rotation.x = 0.25;
    root.add(grip);

    const foregrip = createBox(new THREE.Vector3(0.04, 0.08, 0.04), mats.lightMetal);
    foregrip.position.set(0, -0.06, -0.22);
    root.add(foregrip);

    const railBase = new THREE.Object3D();
    railBase.position.set(0, 0.075, -0.08);
    addRail(railBase, 0.26, mats.midMetal);
    root.add(railBase);

    addNeonStripe(root, 0.22, mats.neon, 0.025);
    
    const magGlow = createBox(new THREE.Vector3(0.02, 0.12, 0.02), mats.neon);
    magGlow.position.set(0.035, -0.1, -0.02);
    root.add(magGlow);
  }

  private buildLMG(root: THREE.Object3D, mats: MaterialSet): void {
    const receiver = createBox(new THREE.Vector3(0.24, 0.14, 0.55), mats.darkMetal);
    receiver.position.set(0, 0, -0.12);
    root.add(receiver);

    const upper = createBox(new THREE.Vector3(0.2, 0.08, 0.48), mats.midMetal);
    upper.position.set(0, 0.09, -0.14);
    root.add(upper);

    const barrel = createCylinder(0.032, 0.7, mats.midMetal);
    barrel.position.set(0, 0.02, -0.62);
    root.add(barrel);

    const shroud = createBox(new THREE.Vector3(0.1, 0.08, 0.35), mats.lightMetal);
    shroud.position.set(0, 0.02, -0.52);
    root.add(shroud);

    const mag = createBox(new THREE.Vector3(0.12, 0.14, 0.16), mats.darkMetal);
    mag.position.set(0, -0.14, -0.06);
    root.add(mag);

    const belt = createBox(new THREE.Vector3(0.08, 0.04, 0.06), mats.neonDim);
    belt.position.set(0.08, -0.1, -0.02);
    root.add(belt);

    const stock = createBox(new THREE.Vector3(0.08, 0.12, 0.24), mats.midMetal);
    stock.position.set(0, 0, 0.24);
    root.add(stock);

    const bipodL = createCylinder(0.012, 0.12, mats.lightMetal);
    bipodL.position.set(-0.06, -0.08, -0.35);
    bipodL.rotation.z = 0.3;
    root.add(bipodL);
    const bipodR = createCylinder(0.012, 0.12, mats.lightMetal);
    bipodR.position.set(0.06, -0.08, -0.35);
    bipodR.rotation.z = -0.3;
    root.add(bipodR);

    const grip = createBox(new THREE.Vector3(0.06, 0.12, 0.08), mats.midMetal);
    grip.position.set(0, -0.11, 0.08);
    grip.rotation.x = 0.2;
    root.add(grip);

    const railBase = new THREE.Object3D();
    railBase.position.set(0, 0.11, -0.1);
    addRail(railBase, 0.45, mats.midMetal);
    root.add(railBase);

    addHeatSink(root, 4, mats.lightMetal);

    const warn = createBox(new THREE.Vector3(0.22, 0.01, 0.06), mats.danger);
    warn.position.set(0, 0.1, -0.35);
    root.add(warn);
  }

  private buildShotgun(root: THREE.Object3D, mats: MaterialSet): void {
    const receiver = createBox(new THREE.Vector3(0.18, 0.13, 0.4), mats.darkMetal);
    receiver.position.set(0, 0, -0.08);
    root.add(receiver);

    const barrel = createCylinder(0.028, 0.5, mats.midMetal);
    barrel.position.set(0, 0.02, -0.48);
    root.add(barrel);

    const magTube = createCylinder(0.024, 0.4, mats.darkMetal);
    magTube.position.set(0, -0.04, -0.4);
    root.add(magTube);

    const pump = createBox(new THREE.Vector3(0.08, 0.08, 0.12), mats.lightMetal);
    pump.position.set(0, -0.02, -0.3);
    root.add(pump);

    const stock = createBox(new THREE.Vector3(0.07, 0.1, 0.22), mats.midMetal);
    stock.position.set(0, 0, 0.2);
    root.add(stock);

    const grip = createBox(new THREE.Vector3(0.055, 0.11, 0.07), mats.midMetal);
    grip.position.set(0, -0.1, 0.06);
    grip.rotation.x = 0.25;
    root.add(grip);

    for (let i = 0; i < 4; i++) {
      const shell = createCylinder(0.014, 0.06, mats.danger);
      shell.position.set(0.1, 0.02, 0.02 - i * 0.05);
      shell.rotation.x = 0;
      shell.rotation.z = Math.PI / 2;
      root.add(shell);
    }

    const neon = createBox(new THREE.Vector3(0.01, 0.04, 0.1), mats.neon);
    neon.position.set(0.09, 0.02, -0.1);
    root.add(neon);
  }

  private buildSniper(root: THREE.Object3D, mats: MaterialSet): void {
    // All geometry stays below Y=0.08 to not block scope at Y=0.14+
    const lowerReceiver = createBox(new THREE.Vector3(0.16, 0.08, 0.5), mats.darkMetal);
    lowerReceiver.position.set(0, -0.04, -0.1);
    root.add(lowerReceiver);

    const upperReceiver = createBox(new THREE.Vector3(0.12, 0.025, 0.4), mats.midMetal);
    upperReceiver.position.set(0, 0.02, -0.12);
    root.add(upperReceiver);

    const scopeMount = createBox(new THREE.Vector3(0.08, 0.015, 0.25), mats.lightMetal);
    scopeMount.position.set(0, 0.04, -0.15);
    root.add(scopeMount);

    const barrel = createCylinder(0.024, 0.9, mats.midMetal);
    barrel.position.set(0, 0, -0.7);
    root.add(barrel);

    const shroud = createBox(new THREE.Vector3(0.065, 0.05, 0.3), mats.lightMetal);
    shroud.position.set(0, 0, -0.45);
    root.add(shroud);

    for (let i = 0; i < 5; i++) {
      const ventL = createBox(new THREE.Vector3(0.008, 0.03, 0.025), mats.darkMetal);
      ventL.position.set(-0.035, 0.01, -0.35 - i * 0.05);
      root.add(ventL);
      const ventR = createBox(new THREE.Vector3(0.008, 0.03, 0.025), mats.darkMetal);
      ventR.position.set(0.035, 0.01, -0.35 - i * 0.05);
      root.add(ventR);
    }

    const muzzleBrake = createCylinder(0.032, 0.1, mats.darkMetal);
    muzzleBrake.position.set(0, 0, -1.2);
    root.add(muzzleBrake);
    
    for (let i = 0; i < 3; i++) {
      const ring = createCylinder(0.036, 0.012, mats.lightMetal);
      ring.position.set(0, 0, -1.15 - i * 0.025);
      root.add(ring);
    }

    const stockMain = createBox(new THREE.Vector3(0.06, 0.09, 0.28), mats.midMetal);
    stockMain.position.set(0, -0.02, 0.26);
    root.add(stockMain);

    const cheekPiece = createBox(new THREE.Vector3(0.045, 0.02, 0.1), mats.lightMetal);
    cheekPiece.position.set(0, 0.035, 0.3);
    root.add(cheekPiece);

    const buttpad = createBox(new THREE.Vector3(0.05, 0.08, 0.02), mats.darkMetal);
    buttpad.position.set(0, -0.01, 0.41);
    root.add(buttpad);

    const grip = createBox(new THREE.Vector3(0.045, 0.1, 0.06), mats.midMetal);
    grip.position.set(0, -0.1, 0.08);
    grip.rotation.x = 0.25;
    root.add(grip);

    const triggerGuard = createBox(new THREE.Vector3(0.05, 0.02, 0.08), mats.darkMetal);
    triggerGuard.position.set(0, -0.08, 0.02);
    root.add(triggerGuard);

    const mag = createBox(new THREE.Vector3(0.05, 0.1, 0.08), mats.darkMetal);
    mag.position.set(0, -0.1, -0.04);
    mag.rotation.x = -0.08;
    root.add(mag);

    const magRelease = createBox(new THREE.Vector3(0.01, 0.02, 0.02), mats.neon);
    magRelease.position.set(0.075, -0.06, -0.04);
    root.add(magRelease);

    const bipodMount = createBox(new THREE.Vector3(0.04, 0.015, 0.04), mats.lightMetal);
    bipodMount.position.set(0, -0.045, -0.38);
    root.add(bipodMount);

    const bipodLegL = createCylinder(0.008, 0.12, mats.lightMetal);
    bipodLegL.position.set(-0.03, -0.1, -0.38);
    bipodLegL.rotation.z = 0.2;
    root.add(bipodLegL);

    const bipodLegR = createCylinder(0.008, 0.12, mats.lightMetal);
    bipodLegR.position.set(0.03, -0.1, -0.38);
    bipodLegR.rotation.z = -0.2;
    root.add(bipodLegR);

    const footL = createBox(new THREE.Vector3(0.015, 0.01, 0.025), mats.darkMetal);
    footL.position.set(-0.045, -0.16, -0.38);
    root.add(footL);
    const footR = createBox(new THREE.Vector3(0.015, 0.01, 0.025), mats.darkMetal);
    footR.position.set(0.045, -0.16, -0.38);
    root.add(footR);

    const neonStripL = createBox(new THREE.Vector3(0.008, 0.012, 0.35), mats.neon);
    neonStripL.position.set(-0.075, 0, -0.15);
    root.add(neonStripL);

    const neonStripR = createBox(new THREE.Vector3(0.008, 0.012, 0.35), mats.neon);
    neonStripR.position.set(0.075, 0, -0.15);
    root.add(neonStripR);

    for (let i = 0; i < 3; i++) {
      const ledL = createBox(new THREE.Vector3(0.006, 0.006, 0.006), mats.neon);
      ledL.position.set(-0.08, -0.01, 0.02 - i * 0.04);
      root.add(ledL);
    }

    const accentPlateL = createBox(new THREE.Vector3(0.006, 0.025, 0.08), mats.neonDim);
    accentPlateL.position.set(-0.082, -0.02, -0.06);
    accentPlateL.rotation.z = 0.15;
    root.add(accentPlateL);

    const accentPlateR = createBox(new THREE.Vector3(0.006, 0.025, 0.08), mats.neonDim);
    accentPlateR.position.set(0.082, -0.02, -0.06);
    accentPlateR.rotation.z = -0.15;
    root.add(accentPlateR);

    const stabFin = createBox(new THREE.Vector3(0.14, 0.008, 0.06), mats.neonDim);
    stabFin.position.set(0, 0.02, 0.38);
    root.add(stabFin);

    const boltHandle = createCylinder(0.012, 0.04, mats.lightMetal);
    boltHandle.position.set(0.085, 0.01, -0.02);
    boltHandle.rotation.z = Math.PI / 2;
    root.add(boltHandle);

    const boltKnob = createBox(new THREE.Vector3(0.02, 0.015, 0.025), mats.midMetal);
    boltKnob.position.set(0.11, 0.01, -0.02);
    root.add(boltKnob);
  }

  private buildPistol(root: THREE.Object3D, mats: MaterialSet): void {
    const slide = createBox(new THREE.Vector3(0.09, 0.07, 0.2), mats.midMetal);
    slide.position.set(0, 0.02, -0.06);
    root.add(slide);

    const frame = createBox(new THREE.Vector3(0.08, 0.05, 0.16), mats.darkMetal);
    frame.position.set(0, -0.02, -0.04);
    root.add(frame);

    const barrel = createCylinder(0.012, 0.12, mats.lightMetal);
    barrel.position.set(0, 0.015, -0.2);
    root.add(barrel);

    const grip = createBox(new THREE.Vector3(0.065, 0.1, 0.055), mats.midMetal);
    grip.position.set(0, -0.08, 0.02);
    grip.rotation.x = 0.15;
    root.add(grip);

    const mag = createBox(new THREE.Vector3(0.045, 0.08, 0.04), mats.darkMetal);
    mag.position.set(0, -0.1, 0.02);
    root.add(mag);

    const guard = createBox(new THREE.Vector3(0.06, 0.025, 0.06), mats.darkMetal);
    guard.position.set(0, -0.04, -0.02);
    root.add(guard);

    const sight = createBox(new THREE.Vector3(0.06, 0.008, 0.008), mats.neon);
    sight.position.set(0, 0.06, -0.04);
    root.add(sight);

    const rearSight = createBox(new THREE.Vector3(0.04, 0.015, 0.01), mats.lightMetal);
    rearSight.position.set(0, 0.055, 0.04);
    root.add(rearSight);
  }

  private buildRocketLauncher(root: THREE.Object3D, mats: MaterialSet): void {
    const tube = createCylinder(0.08, 0.7, mats.darkMetal, true);
    tube.position.set(0, 0, -0.2);
    root.add(tube);

    const innerMat = mats.midMetal.clone();
    innerMat.side = THREE.BackSide;
    const inner = createCylinder(0.06, 0.68, innerMat, true);
    inner.position.set(0, 0, -0.2);
    root.add(inner);

    const frontRing = createCylinder(0.09, 0.04, mats.lightMetal, true);
    frontRing.position.set(0, 0, -0.58);
    root.add(frontRing);

    const rearRing = createCylinder(0.09, 0.04, mats.lightMetal, true);
    rearRing.position.set(0, 0, 0.18);
    root.add(rearRing);

    const gripHousing = createBox(new THREE.Vector3(0.1, 0.12, 0.2), mats.midMetal);
    gripHousing.position.set(0, -0.1, 0.02);
    root.add(gripHousing);

    const grip = createBox(new THREE.Vector3(0.06, 0.12, 0.07), mats.darkMetal);
    grip.position.set(0, -0.18, 0.04);
    grip.rotation.x = 0.25;
    root.add(grip);

    const guard = createBox(new THREE.Vector3(0.08, 0.03, 0.08), mats.darkMetal);
    guard.position.set(0, -0.14, -0.02);
    root.add(guard);

    const frontSight = createBox(new THREE.Vector3(0.02, 0.04, 0.02), mats.neon);
    frontSight.position.set(0, 0.09, -0.45);
    root.add(frontSight);

    const rearSight = createBox(new THREE.Vector3(0.05, 0.03, 0.02), mats.lightMetal);
    rearSight.position.set(0, 0.085, 0.1);
    root.add(rearSight);

    const warn1 = createBox(new THREE.Vector3(0.01, 0.02, 0.6), mats.danger);
    warn1.position.set(0.075, 0.02, -0.2);
    root.add(warn1);
    const warn2 = createBox(new THREE.Vector3(0.01, 0.02, 0.6), mats.danger);
    warn2.position.set(-0.075, 0.02, -0.2);
    root.add(warn2);

    const exhaust = createCone(0.06, 0.08, mats.darkMetal);
    exhaust.position.set(0, 0, 0.24);
    exhaust.rotation.x = Math.PI;
    root.add(exhaust);
  }

  private buildGrenadeLauncher(root: THREE.Object3D, mats: MaterialSet): void {
    const receiver = createBox(new THREE.Vector3(0.18, 0.09, 0.38), mats.darkMetal);
    receiver.position.set(0, -0.02, -0.06);
    root.add(receiver);

    const drum = createCylinder(0.08, 0.12, mats.midMetal);
    drum.position.set(0, -0.1, -0.08);
    drum.rotation.z = 0;
    root.add(drum);

    const drumCap = createCylinder(0.075, 0.02, mats.lightMetal);
    drumCap.position.set(0, -0.1, -0.02);
    drumCap.rotation.z = 0;
    root.add(drumCap);

    const barrel = createCylinder(0.035, 0.35, mats.midMetal);
    barrel.position.set(0, 0, -0.42);
    root.add(barrel);

    const stock = createBox(new THREE.Vector3(0.06, 0.1, 0.18), mats.midMetal);
    stock.position.set(0, 0, 0.2);
    root.add(stock);

    const grip = createBox(new THREE.Vector3(0.055, 0.11, 0.07), mats.midMetal);
    grip.position.set(0, -0.1, 0.06);
    grip.rotation.x = 0.22;
    root.add(grip);

    const railBase = new THREE.Object3D();
    railBase.position.set(0, 0.075, -0.04);
    addRail(railBase, 0.28, mats.midMetal);
    root.add(railBase);

    const hazard = createBox(new THREE.Vector3(0.16, 0.008, 0.04), mats.danger);
    hazard.position.set(0, 0.05, -0.06);
    root.add(hazard);

    const indicator = createBox(new THREE.Vector3(0.01, 0.06, 0.01), mats.neon);
    indicator.position.set(0.075, -0.08, -0.08);
    root.add(indicator);
  }

  private createSockets(root: THREE.Object3D, family: WeaponDefinition["family"]): void {
    const railTop = new THREE.Object3D();
    const muzzle = new THREE.Object3D();
    const underbarrel = new THREE.Object3D();
    const magwell = new THREE.Object3D();
    const stock = new THREE.Object3D();
    const grip = new THREE.Object3D();
    const sideLeft = new THREE.Object3D();
    const sideRight = new THREE.Object3D();

    switch (family) {
      case "Pistol":
        railTop.position.set(0, 0.08, -0.02);
        muzzle.position.set(0, 0.015, -0.28);
        break;
      case "SMG":
        railTop.position.set(0, 0.12, -0.08);
        muzzle.position.set(0, 0.02, -0.56);
        break;
      case "Sniper":
        railTop.position.set(0, 0.14, -0.12);
        muzzle.position.set(0, 0.02, -1.22);
        break;
      case "LMG":
        railTop.position.set(0, 0.16, -0.1);
        muzzle.position.set(0, 0.02, -1.0);
        break;
      case "Shotgun":
        railTop.position.set(0, 0.1, -0.08);
        muzzle.position.set(0, 0.02, -0.76);
        break;
      case "RocketLauncher":
        railTop.position.set(0, 0.12, 0);
        muzzle.position.set(0, 0, -0.62);
        break;
      case "GrenadeLauncher":
        railTop.position.set(0, 0.12, -0.04);
        muzzle.position.set(0, 0.02, -0.62);
        break;
      default:
        railTop.position.set(0, 0.14, -0.14);
        muzzle.position.set(0, 0.02, -0.86);
    }

    underbarrel.position.set(0, -0.02, -0.35);
    magwell.position.set(0, -0.1, -0.04);
    stock.position.set(0, 0, 0.28);
    grip.position.set(0, -0.08, 0.04);
    sideLeft.position.set(-0.1, 0.02, -0.12);
    sideRight.position.set(0.1, 0.02, -0.12);

    this.sockets.set("rail_top", railTop);
    this.sockets.set("muzzle", muzzle);
    this.sockets.set("underbarrel", underbarrel);
    this.sockets.set("magwell", magwell);
    this.sockets.set("stock", stock);
    this.sockets.set("grip", grip);
    this.sockets.set("side_left", sideLeft);
    this.sockets.set("side_right", sideRight);

    for (const socket of this.sockets.values()) {
      root.add(socket);
    }

    this.ironSightEye = new THREE.Object3D();
    switch (family) {
      case "Pistol":
        this.ironSightEye.position.set(0, 0.055, 0.08);
        break;
      case "Shotgun":
        this.ironSightEye.position.set(0, 0.08, 0.1);
        break;
      case "RocketLauncher":
        this.ironSightEye.position.set(0, 0.09, 0.16);
        break;
      case "GrenadeLauncher":
        this.ironSightEye.position.set(0, 0.1, 0.08);
        break;
      default:
        this.ironSightEye.position.set(0, 0.1, 0.08);
    }
    root.add(this.ironSightEye);
  }

  private attachAttachments(
    attachments: AttachmentDefinition[],
    mats: MaterialSet,
    thirdPerson: boolean
  ): { eye?: THREE.Object3D; reticle?: THREE.Object3D } {
    let opticEye: THREE.Object3D | undefined;
    let opticReticle: THREE.Object3D | undefined;
    for (const attachment of attachments) {
      const socket = this.getSocket(attachment.mountSocket);
      const view = buildAttachmentView(attachment, mats, thirdPerson);
      socket.add(view.root);
      if (view.eye) opticEye = view.eye;
      if (view.reticle) opticReticle = view.reticle;
    }
    return { eye: opticEye, reticle: opticReticle };
  }
}

interface AttachmentView {
  root: THREE.Object3D;
  eye?: THREE.Object3D;
  reticle?: THREE.Object3D;
}

function createReticleCross(size: number, thickness: number, material: THREE.Material): THREE.Object3D {
  const root = new THREE.Object3D();
  const h = createBox(new THREE.Vector3(size, thickness, 0.001), material);
  const v = createBox(new THREE.Vector3(thickness, size, 0.001), material);
  h.userData.isReticle = true;
  v.userData.isReticle = true;
  root.add(h);
  root.add(v);
  return root;
}

function createReticleDot(size: number, material: THREE.Material): THREE.Object3D {
  const root = new THREE.Object3D();
  const dot = createBox(new THREE.Vector3(size, size, 0.001), material);
  dot.userData.isReticle = true;
  root.add(dot);
  return root;
}

function createReticleChevron(size: number, thickness: number, material: THREE.Material): THREE.Object3D {
  const root = new THREE.Object3D();
  const left = createBox(new THREE.Vector3(size * 0.6, thickness, 0.001), material);
  left.position.set(-size * 0.2, -size * 0.15, 0);
  left.rotation.z = 0.5;
  left.userData.isReticle = true;
  root.add(left);
  const right = createBox(new THREE.Vector3(size * 0.6, thickness, 0.001), material);
  right.position.set(size * 0.2, -size * 0.15, 0);
  right.rotation.z = -0.5;
  right.userData.isReticle = true;
  root.add(right);
  const dot = createBox(new THREE.Vector3(thickness * 2, thickness * 2, 0.001), material);
  dot.userData.isReticle = true;
  root.add(dot);
  return root;
}

function createReticleMildot(size: number, thickness: number, material: THREE.Material): THREE.Object3D {
  const root = new THREE.Object3D();
  const h = createBox(new THREE.Vector3(size, thickness, 0.001), material);
  h.userData.isReticle = true;
  root.add(h);
  const v = createBox(new THREE.Vector3(thickness, size, 0.001), material);
  v.userData.isReticle = true;
  root.add(v);
  for (let i = -2; i <= 2; i++) {
    if (i === 0) continue;
    const dot = createBox(new THREE.Vector3(thickness * 1.5, thickness * 1.5, 0.001), material);
    dot.position.set(i * size * 0.2, 0, 0);
    dot.userData.isReticle = true;
    root.add(dot);
  }
  for (let i = 1; i <= 3; i++) {
    const mark = createBox(new THREE.Vector3(thickness * 3, thickness, 0.001), material);
    mark.position.set(0, -i * size * 0.15, 0);
    mark.userData.isReticle = true;
    root.add(mark);
  }
  return root;
}

function buildAttachmentView(
  attachment: AttachmentDefinition,
  mats: MaterialSet,
  thirdPerson: boolean
): AttachmentView {
  const root = new THREE.Object3D();
  let eye: THREE.Object3D | undefined;

  const reticleMat = new THREE.MeshBasicMaterial({
    color: 0x00ffff,
    transparent: true,
    opacity: 1,
    depthTest: false
  });

  switch (attachment.id) {
    case "HOLO_SIGHT": {
      const base = createBox(new THREE.Vector3(0.08, 0.015, 0.08), mats.midMetal);
      base.position.set(0, 0.01, 0);
      root.add(base);

      const left = createBox(new THREE.Vector3(0.006, 0.04, 0.05), mats.darkMetal);
      left.position.set(-0.035, 0.032, -0.01);
      root.add(left);

      const right = createBox(new THREE.Vector3(0.006, 0.04, 0.05), mats.darkMetal);
      right.position.set(0.035, 0.032, -0.01);
      root.add(right);

      const topBack = createBox(new THREE.Vector3(0.076, 0.006, 0.006), mats.darkMetal);
      topBack.position.set(0, 0.054, 0.018);
      root.add(topBack);

      const frontLip = createBox(new THREE.Vector3(0.076, 0.006, 0.004), mats.darkMetal);
      frontLip.position.set(0, 0.054, -0.032);
      root.add(frontLip);

      const trim = createBox(new THREE.Vector3(0.06, 0.003, 0.003), mats.neon);
      trim.position.set(0, 0.058, 0.018);
      root.add(trim);

      eye = new THREE.Object3D();
      eye.name = "socket_eye";
      eye.position.set(0, 0.032, 0.045);
      root.add(eye);

      if (!thirdPerson) {
        const reticleRoot = new THREE.Object3D();
        reticleRoot.name = "socket_reticle";
        reticleRoot.position.set(0, 0.032, -0.01);
        const reticle = createReticleChevron(0.02, 0.0012, reticleMat);
        reticleRoot.add(reticle);
        root.add(reticleRoot);
        return { root, eye, reticle: reticleRoot };
      }
      break;
    }
    
    case "REFLEX_SIGHT": {
      const base = createBox(new THREE.Vector3(0.06, 0.012, 0.06), mats.midMetal);
      base.position.set(0, 0.008, 0);
      root.add(base);

      const postLeft = createBox(new THREE.Vector3(0.006, 0.032, 0.006), mats.darkMetal);
      postLeft.position.set(-0.025, 0.026, -0.02);
      root.add(postLeft);

      const postRight = createBox(new THREE.Vector3(0.006, 0.032, 0.006), mats.darkMetal);
      postRight.position.set(0.025, 0.026, -0.02);
      root.add(postRight);

      const topBar = createBox(new THREE.Vector3(0.056, 0.005, 0.006), mats.darkMetal);
      topBar.position.set(0, 0.044, -0.02);
      root.add(topBar);

      const rim = createBox(new THREE.Vector3(0.05, 0.002, 0.002), mats.neon);
      rim.position.set(0, 0.048, -0.02);
      root.add(rim);

      eye = new THREE.Object3D();
      eye.name = "socket_eye";
      eye.position.set(0, 0.026, 0.035);
      root.add(eye);

      if (!thirdPerson) {
        const reticleRoot = new THREE.Object3D();
        reticleRoot.name = "socket_reticle";
        reticleRoot.position.set(0, 0.026, -0.008);
        const reticle = createReticleCross(0.016, 0.001, reticleMat);
        reticleRoot.add(reticle);
        root.add(reticleRoot);
        return { root, eye, reticle: reticleRoot };
      }
      break;
    }
    
    case "SCOPE_4X": {
      const tubeOuter = createCylinder(0.038, 0.28, mats.midMetal, true);
      tubeOuter.position.set(0, 0.038, -0.02);
      root.add(tubeOuter);

      const neonRingFront = createCylinder(0.04, 0.008, mats.neon, true);
      neonRingFront.position.set(0, 0.038, -0.16);
      root.add(neonRingFront);

      const neonRingRear = createCylinder(0.04, 0.008, mats.neon, true);
      neonRingRear.position.set(0, 0.038, 0.12);
      root.add(neonRingRear);

      eye = new THREE.Object3D();
      eye.name = "socket_eye";
      eye.position.set(0, 0.038, 0.1);
      root.add(eye);

      if (!thirdPerson) {
        const reticleRoot = new THREE.Object3D();
        reticleRoot.name = "socket_reticle";
        reticleRoot.position.set(0, 0.038, -0.02);
        
        const reticleMat = new THREE.MeshBasicMaterial({
          color: 0x00ffaa,
          transparent: true,
          opacity: 1,
          depthTest: false
        });
        const reticle = createReticleMildot(0.04, 0.001, reticleMat);
        reticleRoot.add(reticle);
        root.add(reticleRoot);

        return { root, eye, reticle: reticleRoot };
      }
      break;
    }
    
    case "COMPENSATOR": {
      const comp = createCylinder(0.028, 0.075, mats.midMetal);
      comp.position.set(0, 0, -0.02);
      root.add(comp);
      
      for (let i = 0; i < 3; i++) {
        const slot = createBox(new THREE.Vector3(0.025, 0.008, 0.012), mats.darkMetal);
        slot.position.set(0, 0.018, -0.01 - i * 0.018);
        root.add(slot);
      }
      
      const accent = createBox(new THREE.Vector3(0.01, 0.008, 0.06), mats.neon);
      accent.position.set(0.02, 0.01, -0.02);
      root.add(accent);
      break;
    }
    
    case "SUPPRESSOR": {
      const can = createCylinder(0.032, 0.18, mats.darkMetal);
      can.position.set(0, 0, -0.06);
      root.add(can);
      
      const ring1 = createCylinder(0.035, 0.015, mats.midMetal);
      ring1.position.set(0, 0, 0.02);
      root.add(ring1);
      
      const ring2 = createCylinder(0.035, 0.015, mats.midMetal);
      ring2.position.set(0, 0, -0.14);
      root.add(ring2);
      
      const glow = createCylinder(0.033, 0.004, mats.neonDim);
      glow.position.set(0, 0, -0.06);
      root.add(glow);
      break;
    }
    
    case "IRON_SIGHT": {
      const base = createBox(new THREE.Vector3(0.04, 0.012, 0.05), mats.midMetal);
      base.position.set(0, 0.008, 0);
      root.add(base);

      const post = createBox(new THREE.Vector3(0.008, 0.025, 0.008), mats.darkMetal);
      post.position.set(0, 0.022, -0.015);
      root.add(post);

      eye = new THREE.Object3D();
      eye.name = "socket_eye";
      eye.position.set(0, 0.022, 0.03);
      root.add(eye);

      if (!thirdPerson) {
        const reticleRoot = new THREE.Object3D();
        reticleRoot.name = "socket_reticle";
        reticleRoot.position.set(0, 0.022, -0.01);
        const reticle = createReticleDot(0.006, reticleMat);
        reticleRoot.add(reticle);
        root.add(reticleRoot);
        return { root, eye, reticle: reticleRoot };
      }
      break;
    }
    
    default: {
      const stub = createBox(new THREE.Vector3(0.04, 0.04, 0.04), mats.midMetal);
      root.add(stub);
      break;
    }
  }

  return { root, eye };
}
