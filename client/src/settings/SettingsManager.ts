export interface KeybindSettings {
  moveForward: string;
  moveBack: string;
  moveLeft: string;
  moveRight: string;
  sprint: string;
  crouch: string;
  jump: string;
  reload: string;
  interact: string;
  primaryWeapon: string;
  secondaryWeapon: string;
  toggleWeapon: string;
  scoreboard: string;
}

export interface GraphicsSettings {
  qualityPreset: "low" | "medium" | "high" | "ultra";
  bloomEnabled: boolean;
  bloomStrength: number;
  shadowsEnabled: boolean;
  shadowQuality: "low" | "medium" | "high";
  antialiasing: boolean;
  fov: number;
  mouseSensitivity: number;
  adsSensitivityMultiplier: number;
  scopeSensitivityMultiplier: number;
}

export interface AllSettings {
  version: number;
  keybinds: KeybindSettings;
  graphics: GraphicsSettings;
}

export const DEFAULT_KEYBINDS: KeybindSettings = {
  moveForward: "KeyW",
  moveBack: "KeyS",
  moveLeft: "KeyA",
  moveRight: "KeyD",
  sprint: "ShiftLeft",
  crouch: "KeyC",
  jump: "Space",
  reload: "KeyR",
  interact: "KeyE",
  primaryWeapon: "Digit1",
  secondaryWeapon: "Digit2",
  toggleWeapon: "KeyQ",
  scoreboard: "Tab",
};

export const DEFAULT_GRAPHICS: GraphicsSettings = {
  qualityPreset: "high",
  bloomEnabled: true,
  bloomStrength: 0.35,
  shadowsEnabled: true,
  shadowQuality: "medium",
  antialiasing: true,
  fov: 75,
  mouseSensitivity: 1.0,
  adsSensitivityMultiplier: 0.8,
  scopeSensitivityMultiplier: 0.5,
};

export const QUALITY_PRESETS: Record<GraphicsSettings["qualityPreset"], Partial<GraphicsSettings>> = {
  low: {
    bloomEnabled: false,
    bloomStrength: 0,
    shadowsEnabled: false,
    shadowQuality: "low",
    antialiasing: false,
  },
  medium: {
    bloomEnabled: true,
    bloomStrength: 0.2,
    shadowsEnabled: true,
    shadowQuality: "low",
    antialiasing: true,
  },
  high: {
    bloomEnabled: true,
    bloomStrength: 0.35,
    shadowsEnabled: true,
    shadowQuality: "medium",
    antialiasing: true,
  },
  ultra: {
    bloomEnabled: true,
    bloomStrength: 0.5,
    shadowsEnabled: true,
    shadowQuality: "high",
    antialiasing: true,
  },
};

const STORAGE_KEY = "cyberrunner_settings";
const CURRENT_VERSION = 1;

export type SettingsChangedCallback = (settings: AllSettings) => void;

export class SettingsManager {
  private static instance: SettingsManager | null = null;
  
  private settings: AllSettings;
  private listeners: SettingsChangedCallback[] = [];

  private constructor() {
    this.settings = this.load();
  }

  static getInstance(): SettingsManager {
    if (!SettingsManager.instance) {
      SettingsManager.instance = new SettingsManager();
    }
    return SettingsManager.instance;
  }

  private load(): AllSettings {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as AllSettings;
        if (parsed.version === CURRENT_VERSION) {
          return {
            version: CURRENT_VERSION,
            keybinds: { ...DEFAULT_KEYBINDS, ...parsed.keybinds },
            graphics: { ...DEFAULT_GRAPHICS, ...parsed.graphics },
          };
        }
      }
    } catch {
      // Invalid stored data, use defaults
    }
    return this.getDefaults();
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch {
      // localStorage may be unavailable
    }
  }

  private getDefaults(): AllSettings {
    return {
      version: CURRENT_VERSION,
      keybinds: { ...DEFAULT_KEYBINDS },
      graphics: { ...DEFAULT_GRAPHICS },
    };
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      listener(this.settings);
    }
  }

  getKeybinds(): KeybindSettings {
    return { ...this.settings.keybinds };
  }

  setKeybind(action: keyof KeybindSettings, key: string): void {
    this.settings.keybinds[action] = key;
    this.save();
    this.notifyListeners();
  }

  setAllKeybinds(keybinds: KeybindSettings): void {
    this.settings.keybinds = { ...keybinds };
    this.save();
    this.notifyListeners();
  }

  getGraphics(): GraphicsSettings {
    return { ...this.settings.graphics };
  }

  setGraphics(graphics: Partial<GraphicsSettings>): void {
    this.settings.graphics = { ...this.settings.graphics, ...graphics };
    this.save();
    this.notifyListeners();
  }

  applyQualityPreset(preset: GraphicsSettings["qualityPreset"]): void {
    const presetSettings = QUALITY_PRESETS[preset];
    this.settings.graphics = {
      ...this.settings.graphics,
      ...presetSettings,
      qualityPreset: preset,
    };
    this.save();
    this.notifyListeners();
  }

  getAllSettings(): AllSettings {
    return {
      version: this.settings.version,
      keybinds: { ...this.settings.keybinds },
      graphics: { ...this.settings.graphics },
    };
  }

  resetKeybindsToDefaults(): void {
    this.settings.keybinds = { ...DEFAULT_KEYBINDS };
    this.save();
    this.notifyListeners();
  }

  resetGraphicsToDefaults(): void {
    this.settings.graphics = { ...DEFAULT_GRAPHICS };
    this.save();
    this.notifyListeners();
  }

  resetAllToDefaults(): void {
    this.settings = this.getDefaults();
    this.save();
    this.notifyListeners();
  }

  addChangeListener(callback: SettingsChangedCallback): void {
    this.listeners.push(callback);
  }

  removeChangeListener(callback: SettingsChangedCallback): void {
    const index = this.listeners.indexOf(callback);
    if (index !== -1) {
      this.listeners.splice(index, 1);
    }
  }

  getKeybindConflicts(action: keyof KeybindSettings, key: string): (keyof KeybindSettings)[] {
    const conflicts: (keyof KeybindSettings)[] = [];
    for (const [a, k] of Object.entries(this.settings.keybinds)) {
      if (a !== action && k === key) {
        conflicts.push(a as keyof KeybindSettings);
      }
    }
    return conflicts;
  }

  getKeyDisplayName(code: string): string {
    const displayNames: Record<string, string> = {
      KeyA: "A", KeyB: "B", KeyC: "C", KeyD: "D", KeyE: "E", KeyF: "F",
      KeyG: "G", KeyH: "H", KeyI: "I", KeyJ: "J", KeyK: "K", KeyL: "L",
      KeyM: "M", KeyN: "N", KeyO: "O", KeyP: "P", KeyQ: "Q", KeyR: "R",
      KeyS: "S", KeyT: "T", KeyU: "U", KeyV: "V", KeyW: "W", KeyX: "X",
      KeyY: "Y", KeyZ: "Z",
      Digit0: "0", Digit1: "1", Digit2: "2", Digit3: "3", Digit4: "4",
      Digit5: "5", Digit6: "6", Digit7: "7", Digit8: "8", Digit9: "9",
      Space: "Space", Tab: "Tab", Escape: "Esc", Enter: "Enter",
      ShiftLeft: "L-Shift", ShiftRight: "R-Shift",
      ControlLeft: "L-Ctrl", ControlRight: "R-Ctrl",
      AltLeft: "L-Alt", AltRight: "R-Alt",
      ArrowUp: "Up", ArrowDown: "Down", ArrowLeft: "Left", ArrowRight: "Right",
      Backquote: "`", Minus: "-", Equal: "=",
      BracketLeft: "[", BracketRight: "]", Backslash: "\\",
      Semicolon: ";", Quote: "'", Comma: ",", Period: ".", Slash: "/",
      CapsLock: "Caps", Backspace: "Backspace", Delete: "Delete",
      Insert: "Insert", Home: "Home", End: "End",
      PageUp: "PgUp", PageDown: "PgDn",
      F1: "F1", F2: "F2", F3: "F3", F4: "F4", F5: "F5", F6: "F6",
      F7: "F7", F8: "F8", F9: "F9", F10: "F10", F11: "F11", F12: "F12",
    };
    return displayNames[code] || code;
  }

  getActionDisplayName(action: keyof KeybindSettings): string {
    const displayNames: Record<keyof KeybindSettings, string> = {
      moveForward: "Move Forward",
      moveBack: "Move Backward",
      moveLeft: "Move Left",
      moveRight: "Move Right",
      sprint: "Sprint",
      crouch: "Crouch",
      jump: "Jump",
      reload: "Reload",
      interact: "Interact",
      primaryWeapon: "Primary Weapon",
      secondaryWeapon: "Secondary Weapon",
      toggleWeapon: "Toggle Weapon",
      scoreboard: "Scoreboard",
    };
    return displayNames[action];
  }
}
