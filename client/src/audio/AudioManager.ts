import * as THREE from "three";
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

export class AudioManager {
  private listener: THREE.AudioListener;
  private audioLoader: THREE.AudioLoader;
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
    this.audioLoader = new THREE.AudioLoader();
    
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
    
    const soundsToLoad: Array<{ name: string; path: string; volume: number; category: SoundCategory }> = [
      { name: "ar_shot", path: "/sounds/weapons/ar_shot.wav", volume: 0.6, category: "weapon" },
      { name: "pistol_shot", path: "/sounds/weapons/pistol_shot.ogg", volume: 0.5, category: "weapon" },
      { name: "smg_shot", path: "/sounds/weapons/smg_shot.ogg", volume: 0.55, category: "weapon" },
      { name: "sniper_shot", path: "/sounds/weapons/sniper_shot.wav", volume: 0.7, category: "weapon" },
      { name: "shotgun_shot", path: "/sounds/weapons/shotgun_shot.ogg", volume: 0.75, category: "weapon" },
      { name: "rocket_shot", path: "/sounds/weapons/rocket_shot.ogg", volume: 0.8, category: "weapon" },
      { name: "generic_shot", path: "/sounds/weapons/generic_shot.wav", volume: 0.6, category: "weapon" },
      
      { name: "footstep_1", path: "/sounds/footsteps/footstep.wav", volume: 0.01, category: "footstep" },
      { name: "footstep_2", path: "/sounds/footsteps/footstep.wav", volume: 0.01, category: "footstep" },
      { name: "footstep_3", path: "/sounds/footsteps/footstep.wav", volume: 0.01, category: "footstep" },
      { name: "footstep_4", path: "/sounds/footsteps/footstep.wav", volume: 0.01, category: "footstep" },
      
      { name: "ui_click", path: "/sounds/ui/click.ogg", volume: 0.4, category: "ui" },
      { name: "ui_hover", path: "/sounds/ui/hover.ogg", volume: 0.2, category: "ui" },
      { name: "ui_back", path: "/sounds/ui/back.ogg", volume: 0.3, category: "ui" },
      
      { name: "hit_marker", path: "/sounds/ui/hit_marker.ogg", volume: 0.5, category: "ui" },
      { name: "kill_confirm", path: "/sounds/ui/kill_confirm.ogg", volume: 0.6, category: "ui" },
      { name: "headshot", path: "/sounds/ui/headshot.ogg", volume: 0.7, category: "ui" },
      
      { name: "reload", path: "/sounds/weapons/reload.ogg", volume: 0.5, category: "weapon" },
      { name: "empty_click", path: "/sounds/weapons/empty_click.ogg", volume: 0.3, category: "weapon" },
    ];
    
    const loadPromises = soundsToLoad.map(async (sound) => {
      try {
        const buffer = await this.loadSound(sound.path);
        this.sounds.set(sound.name, {
          buffer,
          volume: sound.volume,
          category: sound.category,
        });
      } catch (e) {
        console.warn(`[AudioManager] Failed to load sound: ${sound.path}`);
      }
    });
    
    await Promise.allSettled(loadPromises);
    this.initialized = true;
    console.log(`[AudioManager] Loaded ${this.sounds.size} sounds`);
  }

  private loadSound(path: string): Promise<AudioBuffer> {
    return new Promise((resolve, reject) => {
      this.audioLoader.load(path, resolve, undefined, reject);
    });
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
    else if (weaponId.startsWith("PISTOL_")) soundName = "pistol_shot";
    else if (weaponId.startsWith("SMG_")) soundName = "smg_shot";
    else if (weaponId.startsWith("SNIPER_")) soundName = "sniper_shot";
    else if (weaponId.startsWith("SHOTGUN_")) soundName = "shotgun_shot";
    else if (weaponId.startsWith("ROCKET_") || weaponId.startsWith("GL_")) soundName = "rocket_shot";
    
    // Fall back to generic_shot if the specific weapon sound isn't loaded
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
