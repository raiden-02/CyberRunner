import * as THREE from "three";
import { AudioContext as ThreeAudioContext } from "three";
import { SettingsManager } from "../settings/SettingsManager.js";

export type SoundCategory = "weapon" | "footstep" | "ui" | "ambient";

interface SoundConfig {
  buffer: AudioBuffer;
  volume: number;
  category: SoundCategory;
}

const FOOTSTEP_INTERVAL_WALK = 0.45;
const FOOTSTEP_INTERVAL_SPRINT = 0.3;
const FOOTSTEP_INTERVAL_CROUCH = 0.6;

function fillBurst(
  ctx: AudioContext,
  seconds: number,
  tone: number,
  decay: number,
  noise: number,
): AudioBuffer {
  const rate = ctx.sampleRate;
  const n = Math.max(1, Math.floor(seconds * rate));
  const buffer = ctx.createBuffer(1, n, rate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const env = Math.exp(-t * decay);
    data[i] = (Math.sin(2 * Math.PI * tone * t) * (1 - noise) + (Math.random() * 2 - 1) * noise) * env;
  }
  return buffer;
}

export class AudioManager {
  private listener: THREE.AudioListener;
  private sounds: Map<string, SoundConfig> = new Map();
  private camera: THREE.Camera;
  private initialized = false;
  private masterVolume = 1.0;
  private categoryVolumes: Record<SoundCategory, number> = {
    weapon: 0.7,
    footstep: 0.4,
    ui: 0.5,
    ambient: 0.3,
  };

  private footstepTimer = 0;

  constructor(camera: THREE.Camera) {
    this.camera = camera;
    this.listener = new THREE.AudioListener();
    this.camera.add(this.listener);

    const settings = SettingsManager.getInstance().getGraphics();
    this.masterVolume = settings.masterVolume ?? 1.0;
    this.categoryVolumes.weapon = settings.sfxVolume ?? 0.7;
    this.categoryVolumes.footstep = settings.sfxVolume ?? 0.4;
    this.categoryVolumes.ui = settings.uiVolume ?? 0.5;

    SettingsManager.getInstance().addChangeListener(() => {
      const s = SettingsManager.getInstance().getGraphics();
      this.masterVolume = s.masterVolume ?? 1.0;
      this.categoryVolumes.weapon = s.sfxVolume ?? 0.7;
      this.categoryVolumes.footstep = s.sfxVolume ?? 0.4;
      this.categoryVolumes.ui = s.uiVolume ?? 0.5;
    });
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    const ctx = ThreeAudioContext.getContext();
    this.sounds.set("ar_shot", {
      buffer: fillBurst(ctx, 0.12, 180, 28, 0.72),
      volume: 0.6,
      category: "weapon",
    });
    this.sounds.set("sniper_shot", {
      buffer: fillBurst(ctx, 0.22, 90, 14, 0.55),
      volume: 0.7,
      category: "weapon",
    });
    this.sounds.set("generic_shot", {
      buffer: fillBurst(ctx, 0.14, 140, 22, 0.65),
      volume: 0.6,
      category: "weapon",
    });
    const step = fillBurst(ctx, 0.08, 70, 40, 0.85);
    for (const name of ["footstep_1", "footstep_2", "footstep_3", "footstep_4"]) {
      this.sounds.set(name, { buffer: step, volume: 0.01, category: "footstep" });
    }
    this.initialized = true;
  }

  private getEffectiveVolume(config: SoundConfig): number {
    return config.volume * this.categoryVolumes[config.category] * this.masterVolume;
  }

  play(soundName: string, volumeMultiplier = 1.0): void {
    const config = this.sounds.get(soundName);
    if (!config) return;

    const sound = new THREE.Audio(this.listener);
    sound.setBuffer(config.buffer);

    const volume = this.getEffectiveVolume(config) * volumeMultiplier;
    if (sound.gain) {
      sound.gain.gain.value = volume;
    }

    sound.play();

    sound.onEnded = () => {
      sound.disconnect();
    };
  }

  playPositional(
    soundName: string,
    position: { x: number; y: number; z: number },
    volumeMultiplier = 1.0
  ): void {
    const config = this.sounds.get(soundName);
    if (!config) return;

    const sound = new THREE.PositionalAudio(this.listener);
    sound.setBuffer(config.buffer);

    const volume = this.getEffectiveVolume(config) * volumeMultiplier;
    if (sound.gain) {
      sound.gain.gain.value = volume;
    }

    sound.setRefDistance(5);
    sound.setRolloffFactor(1.5);
    sound.setMaxDistance(50);

    const soundObj = new THREE.Object3D();
    soundObj.position.set(position.x, position.y, position.z);
    soundObj.add(sound);
    this.camera.parent?.add(soundObj);

    sound.play();

    sound.onEnded = () => {
      sound.disconnect();
      soundObj.removeFromParent();
    };
  }

  playGunshot(weaponId: string, isLocal: boolean, position?: { x: number; y: number; z: number }): void {
    let soundName = "generic_shot";

    if (weaponId.startsWith("AR_")) soundName = "ar_shot";
    else if (weaponId.startsWith("SNIPER_")) soundName = "sniper_shot";

    if (!this.sounds.has(soundName)) {
      soundName = "generic_shot";
    }

    if (isLocal || !position) {
      this.play(soundName, isLocal ? 0.8 : 1.0);
    } else {
      this.playPositional(soundName, position, 1.0);
    }
  }

  updateFootsteps(
    dt: number,
    isMoving: boolean,
    isGrounded: boolean,
    isSprinting: boolean,
    isCrouching: boolean
  ): void {
    if (!isMoving || !isGrounded) {
      this.footstepTimer = 0;
      return;
    }

    let interval = FOOTSTEP_INTERVAL_WALK;
    if (isSprinting) interval = FOOTSTEP_INTERVAL_SPRINT;
    else if (isCrouching) interval = FOOTSTEP_INTERVAL_CROUCH;

    this.footstepTimer += dt;

    if (this.footstepTimer >= interval) {
      this.footstepTimer = 0;
      this.playFootstep(isSprinting ? 1.2 : isCrouching ? 0.6 : 1.0);
    }
  }

  private playFootstep(volumeMultiplier: number): void {
    const stepIndex = Math.floor(Math.random() * 4) + 1;
    this.play(`footstep_${stepIndex}`, volumeMultiplier);
  }

  playUIClick(): void {
    this.play("ui_click");
  }

  playUIHover(): void {
    this.play("ui_hover", 0.5);
  }

  playUIBack(): void {
    this.play("ui_back");
  }

  playHitMarker(): void {
    this.play("hit_marker");
  }

  playKillConfirm(): void {
    this.play("kill_confirm");
  }

  playHeadshot(): void {
    this.play("headshot");
  }

  playReload(): void {
    this.play("reload");
  }

  playEmptyClick(): void {
    this.play("empty_click");
  }

  dispose(): void {
    this.camera.remove(this.listener);
    this.sounds.clear();
  }
}

let globalAudioManager: AudioManager | null = null;

export function getAudioManager(): AudioManager | null {
  return globalAudioManager;
}

export function setAudioManager(manager: AudioManager): void {
  globalAudioManager = manager;
}
