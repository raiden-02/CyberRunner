import { BaseScreen } from "./BaseScreen.js";
import {
  SettingsManager,
  type KeybindSettings,
  type KeybindSettingsAlt,
  type GraphicsSettings,
  DEFAULT_KEYBINDS,
  DEFAULT_KEYBINDS_ALT,
} from "../../settings/SettingsManager.js";

type TabId = "controls" | "graphics";
type RebindSlot = "primary" | "secondary";

export class SettingsScreen extends BaseScreen {
  private panel: HTMLDivElement;
  private tabBar: HTMLDivElement;
  private contentArea: HTMLDivElement;
  
  private controlsContent: HTMLDivElement;
  private graphicsContent: HTMLDivElement;
  
  private rebindingAction: keyof KeybindSettings | null = null;
  private rebindingSlot: RebindSlot = "primary";
  private rebindingElement: HTMLDivElement | null = null;
  private pendingKeybinds: KeybindSettings;
  private pendingKeybindsAlt: KeybindSettingsAlt;
  private pendingGraphics: GraphicsSettings;
  
  private onClose: (() => void) | null = null;
  private keydownHandler: (e: KeyboardEvent) => void;
  private wheelHandler: (e: WheelEvent) => void;

  constructor() {
    super("settings-screen");
    
    const settings = SettingsManager.getInstance();
    this.pendingKeybinds = settings.getKeybinds();
    this.pendingKeybindsAlt = settings.getKeybindsAlt();
    this.pendingGraphics = settings.getGraphics();
    
    this.panel = this.createPanel("700px");
    this.panel.style.maxHeight = "80vh";
    this.panel.style.overflow = "hidden";
    this.panel.style.display = "flex";
    this.panel.style.flexDirection = "column";
    
    const title = this.createTitle("Settings");
    this.panel.appendChild(title);
    
    this.tabBar = this.createTabBar();
    this.panel.appendChild(this.tabBar);
    
    this.contentArea = document.createElement("div");
    this.contentArea.style.cssText = `
      flex: 1;
      overflow-y: auto;
      padding: 16px 0;
    `;
    this.panel.appendChild(this.contentArea);
    
    this.controlsContent = this.createControlsContent();
    this.graphicsContent = this.createGraphicsContent();
    
    this.contentArea.appendChild(this.controlsContent);
    this.contentArea.appendChild(this.graphicsContent);
    
    const buttonRow = this.createButtonRow();
    this.panel.appendChild(buttonRow);
    
    this.container.appendChild(this.panel);
    
    this.showTab("controls");
    
    this.keydownHandler = this.handleKeydown.bind(this);
    this.wheelHandler = this.handleWheel.bind(this);
  }

  private createTabBar(): HTMLDivElement {
    const tabBar = document.createElement("div");
    tabBar.style.cssText = `
      display: flex;
      border-bottom: 2px solid #4a433a;
      margin-bottom: 16px;
    `;
    
    const controlsTab = this.createTab("Controls", "controls");
    const graphicsTab = this.createTab("Graphics", "graphics");
    
    tabBar.appendChild(controlsTab);
    tabBar.appendChild(graphicsTab);
    
    return tabBar;
  }

  private createTab(label: string, tabId: TabId): HTMLButtonElement {
    const tab = document.createElement("button");
    tab.textContent = label;
    tab.dataset.tabId = tabId;
    tab.style.cssText = `
      flex: 1;
      padding: 12px 24px;
      border: none;
      background: transparent;
      color: #aaa;
      font-size: 16px;
      cursor: pointer;
      transition: all 0.2s;
      border-bottom: 3px solid transparent;
    `;
    
    tab.addEventListener("click", () => this.showTab(tabId));
    
    return tab;
  }

  private showTab(tabId: TabId): void {
    const tabs = this.tabBar.querySelectorAll("button");
    tabs.forEach((tab) => {
      const isActive = tab.dataset.tabId === tabId;
      tab.style.color = isActive ? "#d4893a" : "#aaa";
      tab.style.borderBottomColor = isActive ? "#d4893a" : "transparent";
    });
    
    this.controlsContent.style.display = tabId === "controls" ? "block" : "none";
    this.graphicsContent.style.display = tabId === "graphics" ? "block" : "none";
  }

  private createControlsContent(): HTMLDivElement {
    const content = document.createElement("div");
    
    const keybindsHeader = document.createElement("h3");
    keybindsHeader.textContent = "Keybinds";
    keybindsHeader.style.cssText = "color: #d4893a; margin: 0 0 12px 0; font-size: 16px;";
    content.appendChild(keybindsHeader);
    
    const headerRow = document.createElement("div");
    headerRow.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 6px 12px;
      margin-bottom: 4px;
      color: #888;
      font-size: 12px;
    `;
    const actionLabel = document.createElement("span");
    actionLabel.textContent = "Action";
    actionLabel.style.flex = "1";
    const primaryLabel = document.createElement("span");
    primaryLabel.textContent = "Primary";
    primaryLabel.style.cssText = "width: 100px; text-align: center;";
    const secondaryLabel = document.createElement("span");
    secondaryLabel.textContent = "Secondary";
    secondaryLabel.style.cssText = "width: 100px; text-align: center;";
    headerRow.appendChild(actionLabel);
    headerRow.appendChild(primaryLabel);
    headerRow.appendChild(secondaryLabel);
    content.appendChild(headerRow);
    
    const actions: (keyof KeybindSettings)[] = [
      "moveForward", "moveBack", "moveLeft", "moveRight",
      "sprint", "crouch", "jump",
      "reload", "interact",
      "primaryWeapon", "secondaryWeapon", "toggleWeapon",
      "scoreboard",
    ];
    
    for (const action of actions) {
      const row = this.createKeybindRow(action);
      content.appendChild(row);
    }
    
    const resetKeybindsBtn = this.createButton("Reset Keybinds", false);
    resetKeybindsBtn.style.marginTop = "12px";
    resetKeybindsBtn.addEventListener("click", () => {
      this.pendingKeybinds = { ...DEFAULT_KEYBINDS };
      this.pendingKeybindsAlt = { ...DEFAULT_KEYBINDS_ALT };
      this.refreshKeybindsDisplay();
    });
    content.appendChild(resetKeybindsBtn);
    
    const divider = document.createElement("hr");
    divider.style.cssText = "border: none; border-top: 1px solid #333; margin: 24px 0;";
    content.appendChild(divider);
    
    const sensitivityHeader = document.createElement("h3");
    sensitivityHeader.textContent = "Sensitivity";
    sensitivityHeader.style.cssText = "color: #d4893a; margin: 0 0 12px 0; font-size: 16px;";
    content.appendChild(sensitivityHeader);
    
    content.appendChild(this.createSliderRow("Mouse Sensitivity", "mouseSensitivity", 0.1, 2.0, 0.1));
    content.appendChild(this.createSliderRow("ADS Sensitivity", "adsSensitivityMultiplier", 0.1, 1.5, 0.05));
    content.appendChild(this.createSliderRow("Scope Sensitivity", "scopeSensitivityMultiplier", 0.1, 1.5, 0.05));
    
    return content;
  }

  private createKeybindRow(action: keyof KeybindSettings): HTMLDivElement {
    const settings = SettingsManager.getInstance();
    const row = document.createElement("div");
    row.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 12px;
      margin: 4px 0;
      background: rgba(0, 0, 0, 0.3);
      border-radius: 6px;
      border: 1px solid transparent;
    `;
    row.dataset.action = action;
    
    const label = document.createElement("span");
    label.textContent = settings.getActionDisplayName(action);
    label.style.cssText = "color: #fff; flex: 1;";
    
    const createKeyDisplay = (slot: RebindSlot): HTMLDivElement => {
      const keyDisplay = document.createElement("div");
      keyDisplay.className = `key-display key-display-${slot}`;
      keyDisplay.style.cssText = `
        width: 90px;
        padding: 8px 12px;
        background: rgba(0, 255, 255, 0.1);
        border: 1px solid #d4893a;
        border-radius: 4px;
        color: #d4893a;
        text-align: center;
        cursor: pointer;
        transition: all 0.2s;
        margin-left: 8px;
        font-size: 13px;
      `;
      const keyValue = slot === "primary" ? this.pendingKeybinds[action] : this.pendingKeybindsAlt[action];
      keyDisplay.textContent = settings.getKeyDisplayName(keyValue);
      
      keyDisplay.addEventListener("click", () => this.startRebinding(action, row, keyDisplay, slot));
      keyDisplay.addEventListener("mouseenter", () => {
        keyDisplay.style.background = "rgba(0, 255, 255, 0.2)";
      });
      keyDisplay.addEventListener("mouseleave", () => {
        if (!(this.rebindingAction === action && this.rebindingSlot === slot)) {
          keyDisplay.style.background = "rgba(0, 255, 255, 0.1)";
        }
      });
      
      return keyDisplay;
    };
    
    row.appendChild(label);
    row.appendChild(createKeyDisplay("primary"));
    row.appendChild(createKeyDisplay("secondary"));
    
    return row;
  }

  private startRebinding(action: keyof KeybindSettings, row: HTMLDivElement, keyDisplay: HTMLDivElement, slot: RebindSlot = "primary"): void {
    if (this.rebindingAction) {
      this.cancelRebinding();
    }
    
    this.rebindingAction = action;
    this.rebindingSlot = slot;
    this.rebindingElement = keyDisplay;
    
    keyDisplay.textContent = "Press key...";
    keyDisplay.style.background = "rgba(255, 255, 0, 0.2)";
    keyDisplay.style.borderColor = "#ffff00";
    keyDisplay.style.color = "#ffff00";
    row.style.borderColor = "#ffff00";
    
    document.addEventListener("keydown", this.keydownHandler);
    document.addEventListener("wheel", this.wheelHandler);
  }

  private handleWheel(e: WheelEvent): void {
    if (!this.rebindingAction || !this.rebindingElement) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const wheelCode = e.deltaY < 0 ? "WheelUp" : "WheelDown";
    this.applyRebind(wheelCode);
  }

  private handleKeydown(e: KeyboardEvent): void {
    e.preventDefault();
    e.stopPropagation();
    
    if (!this.rebindingAction || !this.rebindingElement) return;
    
    if (e.code === "Escape") {
      this.cancelRebinding();
      return;
    }
    
    this.applyRebind(e.code);
  }

  private applyRebind(code: string): void {
    if (!this.rebindingAction || !this.rebindingElement) return;
    
    const settings = SettingsManager.getInstance();
    const action = this.rebindingAction;
    const slot = this.rebindingSlot;
    const keyDisplay = this.rebindingElement;
    const row = keyDisplay.parentElement as HTMLDivElement;
    
    if (slot === "primary") {
      this.pendingKeybinds[action] = code;
    } else {
      this.pendingKeybindsAlt[action] = code;
    }
    
    keyDisplay.textContent = settings.getKeyDisplayName(code);
    keyDisplay.style.background = "rgba(0, 255, 255, 0.1)";
    keyDisplay.style.borderColor = "#d4893a";
    keyDisplay.style.color = "#d4893a";
    row.style.borderColor = "transparent";
    
    this.rebindingAction = null;
    this.rebindingElement = null;
    document.removeEventListener("keydown", this.keydownHandler);
    document.removeEventListener("wheel", this.wheelHandler);
    
    this.refreshKeybindsDisplay();
  }

  private cancelRebinding(): void {
    if (!this.rebindingAction || !this.rebindingElement) return;
    
    const settings = SettingsManager.getInstance();
    const action = this.rebindingAction;
    const slot = this.rebindingSlot;
    const keyDisplay = this.rebindingElement;
    const row = keyDisplay.parentElement as HTMLDivElement;
    
    const keyValue = slot === "primary" ? this.pendingKeybinds[action] : this.pendingKeybindsAlt[action];
    keyDisplay.textContent = settings.getKeyDisplayName(keyValue);
    keyDisplay.style.background = "rgba(0, 255, 255, 0.1)";
    keyDisplay.style.borderColor = "#d4893a";
    keyDisplay.style.color = "#d4893a";
    row.style.borderColor = "transparent";
    
    this.rebindingAction = null;
    this.rebindingElement = null;
    document.removeEventListener("keydown", this.keydownHandler);
    document.removeEventListener("wheel", this.wheelHandler);
  }

  private refreshKeybindsDisplay(): void {
    const settings = SettingsManager.getInstance();
    const rows = this.controlsContent.querySelectorAll("[data-action]");
    
    for (const row of rows) {
      const action = row.getAttribute("data-action") as keyof KeybindSettings;
      const primaryDisplay = row.querySelector(".key-display-primary") as HTMLDivElement;
      const secondaryDisplay = row.querySelector(".key-display-secondary") as HTMLDivElement;
      
      if (primaryDisplay && action) {
        const key = this.pendingKeybinds[action];
        primaryDisplay.textContent = settings.getKeyDisplayName(key);
        primaryDisplay.style.borderColor = "#d4893a";
        primaryDisplay.style.color = "#d4893a";
      }
      
      if (secondaryDisplay && action) {
        const key = this.pendingKeybindsAlt[action];
        secondaryDisplay.textContent = settings.getKeyDisplayName(key);
        secondaryDisplay.style.borderColor = "#d4893a";
        secondaryDisplay.style.color = "#d4893a";
      }
    }
  }

  private createGraphicsContent(): HTMLDivElement {
    const content = document.createElement("div");
    
    const presetLabel = this.createLabel("Quality Preset");
    content.appendChild(presetLabel);
    
    const presetSelect = this.createSelect([
      { value: "low", label: "Low" },
      { value: "medium", label: "Medium" },
      { value: "high", label: "High" },
      { value: "ultra", label: "Ultra" },
    ]);
    presetSelect.value = this.pendingGraphics.qualityPreset;
    presetSelect.addEventListener("change", () => {
      const preset = presetSelect.value as GraphicsSettings["qualityPreset"];
      this.applyPresetToPending(preset);
      this.refreshGraphicsDisplay();
    });
    presetSelect.id = "graphics-preset";
    content.appendChild(presetSelect);
    
    const divider = document.createElement("hr");
    divider.style.cssText = "border: none; border-top: 1px solid #333; margin: 20px 0;";
    content.appendChild(divider);
    
    content.appendChild(this.createToggleRow("Bloom", "bloomEnabled"));
    content.appendChild(this.createSliderRow("Bloom Strength", "bloomStrength", 0, 1, 0.05));
    content.appendChild(this.createToggleRow("Shadows", "shadowsEnabled"));
    content.appendChild(this.createShadowQualityRow());
    content.appendChild(this.createToggleRow("Anti-aliasing", "antialiasing"));
    
    const divider2 = document.createElement("hr");
    divider2.style.cssText = "border: none; border-top: 1px solid #333; margin: 20px 0;";
    content.appendChild(divider2);
    
    content.appendChild(this.createSliderRow("Field of View", "fov", 60, 120, 5));
    
    const resetBtn = this.createButton("Reset to Defaults", false);
    resetBtn.style.marginTop = "16px";
    resetBtn.addEventListener("click", () => {
      this.pendingGraphics = SettingsManager.getInstance().getGraphics();
      SettingsManager.getInstance().resetGraphicsToDefaults();
      this.pendingGraphics = SettingsManager.getInstance().getGraphics();
      this.refreshGraphicsDisplay();
    });
    content.appendChild(resetBtn);
    
    return content;
  }

  private createToggleRow(label: string, key: keyof GraphicsSettings): HTMLDivElement {
    const row = document.createElement("div");
    row.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 0;
    `;
    
    const labelEl = document.createElement("span");
    labelEl.textContent = label;
    labelEl.style.color = "#fff";
    
    const toggle = document.createElement("button");
    toggle.className = `toggle-${key}`;
    const isOn = this.pendingGraphics[key] as boolean;
    toggle.textContent = isOn ? "ON" : "OFF";
    toggle.style.cssText = `
      padding: 8px 20px;
      border: 2px solid ${isOn ? "#d4893a" : "#666"};
      border-radius: 4px;
      background: ${isOn ? "rgba(0, 255, 255, 0.2)" : "transparent"};
      color: ${isOn ? "#d4893a" : "#aaa"};
      cursor: pointer;
      min-width: 60px;
    `;
    
    toggle.addEventListener("click", () => {
      (this.pendingGraphics as unknown as Record<string, unknown>)[key] = !this.pendingGraphics[key];
      this.refreshGraphicsDisplay();
    });
    
    row.appendChild(labelEl);
    row.appendChild(toggle);
    
    return row;
  }

  private createSliderRow(label: string, key: keyof GraphicsSettings, min: number, max: number, step: number): HTMLDivElement {
    const row = document.createElement("div");
    row.style.cssText = `
      padding: 10px 0;
    `;
    
    const labelRow = document.createElement("div");
    labelRow.style.cssText = `
      display: flex;
      justify-content: space-between;
      margin-bottom: 8px;
    `;
    
    const labelEl = document.createElement("span");
    labelEl.textContent = label;
    labelEl.style.color = "#fff";
    
    const valueEl = document.createElement("span");
    valueEl.className = `value-${key}`;
    valueEl.style.color = "#d4893a";
    valueEl.textContent = String(this.pendingGraphics[key]);
    
    labelRow.appendChild(labelEl);
    labelRow.appendChild(valueEl);
    row.appendChild(labelRow);
    
    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = String(min);
    slider.max = String(max);
    slider.step = String(step);
    slider.value = String(this.pendingGraphics[key]);
    slider.className = `slider-${key}`;
    slider.style.cssText = `
      width: 100%;
      accent-color: #d4893a;
    `;
    
    slider.addEventListener("input", () => {
      const value = parseFloat(slider.value);
      (this.pendingGraphics as unknown as Record<string, unknown>)[key] = value;
      const isDecimalKey = key === "bloomStrength" || key === "mouseSensitivity"
        || key === "adsSensitivityMultiplier" || key === "scopeSensitivityMultiplier";
      valueEl.textContent = isDecimalKey ? value.toFixed(2) : String(value);
    });
    
    row.appendChild(slider);
    
    return row;
  }

  private createShadowQualityRow(): HTMLDivElement {
    const row = document.createElement("div");
    row.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 0;
    `;
    
    const label = document.createElement("span");
    label.textContent = "Shadow Quality";
    label.style.color = "#fff";
    
    const select = this.createSelect([
      { value: "low", label: "Low" },
      { value: "medium", label: "Medium" },
      { value: "high", label: "High" },
    ]);
    select.value = this.pendingGraphics.shadowQuality;
    select.className = "select-shadowQuality";
    select.style.width = "120px";
    
    select.addEventListener("change", () => {
      this.pendingGraphics.shadowQuality = select.value as GraphicsSettings["shadowQuality"];
    });
    
    row.appendChild(label);
    row.appendChild(select);
    
    return row;
  }

  private applyPresetToPending(preset: GraphicsSettings["qualityPreset"]): void {
    const presets: Record<GraphicsSettings["qualityPreset"], Partial<GraphicsSettings>> = {
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
    
    this.pendingGraphics = {
      ...this.pendingGraphics,
      ...presets[preset],
      qualityPreset: preset,
    };
  }

  private refreshGraphicsDisplay(): void {
    const presetSelect = this.graphicsContent.querySelector("#graphics-preset") as HTMLSelectElement;
    if (presetSelect) presetSelect.value = this.pendingGraphics.qualityPreset;
    
    const toggleKeys: (keyof GraphicsSettings)[] = ["bloomEnabled", "shadowsEnabled", "antialiasing"];
    for (const key of toggleKeys) {
      const toggle = this.graphicsContent.querySelector(`.toggle-${key}`) as HTMLButtonElement;
      if (toggle) {
        const isOn = this.pendingGraphics[key] as boolean;
        toggle.textContent = isOn ? "ON" : "OFF";
        toggle.style.borderColor = isOn ? "#d4893a" : "#666";
        toggle.style.background = isOn ? "rgba(0, 255, 255, 0.2)" : "transparent";
        toggle.style.color = isOn ? "#d4893a" : "#aaa";
      }
    }
    
    const graphicsSliderKeys: (keyof GraphicsSettings)[] = ["bloomStrength", "fov"];
    for (const key of graphicsSliderKeys) {
      const slider = this.graphicsContent.querySelector(`.slider-${key}`) as HTMLInputElement;
      const value = this.graphicsContent.querySelector(`.value-${key}`) as HTMLSpanElement;
      if (slider && value) {
        slider.value = String(this.pendingGraphics[key]);
        value.textContent = key === "bloomStrength"
          ? (this.pendingGraphics[key] as number).toFixed(2)
          : String(this.pendingGraphics[key]);
      }
    }
    
    const shadowSelect = this.graphicsContent.querySelector(".select-shadowQuality") as HTMLSelectElement;
    if (shadowSelect) shadowSelect.value = this.pendingGraphics.shadowQuality;
    
    this.refreshSensitivityDisplay();
  }
  
  private refreshSensitivityDisplay(): void {
    const sensitivityKeys: (keyof GraphicsSettings)[] = [
      "mouseSensitivity", "adsSensitivityMultiplier", "scopeSensitivityMultiplier"
    ];
    for (const key of sensitivityKeys) {
      const slider = this.controlsContent.querySelector(`.slider-${key}`) as HTMLInputElement;
      const value = this.controlsContent.querySelector(`.value-${key}`) as HTMLSpanElement;
      if (slider && value) {
        slider.value = String(this.pendingGraphics[key]);
        value.textContent = (this.pendingGraphics[key] as number).toFixed(2);
      }
    }
  }

  private createButtonRow(): HTMLDivElement {
    const row = document.createElement("div");
    row.style.cssText = `
      display: flex;
      gap: 12px;
      padding-top: 16px;
      border-top: 1px solid #333;
      margin-top: 16px;
    `;
    
    const applyBtn = this.createButton("Apply", true);
    applyBtn.addEventListener("click", () => this.applySettings());
    
    const cancelBtn = this.createButton("Cancel", false);
    cancelBtn.addEventListener("click", () => this.cancelSettings());
    
    row.appendChild(applyBtn);
    row.appendChild(cancelBtn);
    
    return row;
  }

  private applySettings(): void {
    const settings = SettingsManager.getInstance();
    settings.setAllKeybinds(this.pendingKeybinds);
    settings.setAllKeybindsAlt(this.pendingKeybindsAlt);
    settings.setGraphics(this.pendingGraphics);
    this.hide();
  }

  private cancelSettings(): void {
    const settings = SettingsManager.getInstance();
    this.pendingKeybinds = settings.getKeybinds();
    this.pendingGraphics = settings.getGraphics();
    this.hide();
  }

  setOnClose(callback: () => void): void {
    this.onClose = callback;
  }

  protected override onShow(): void {
    const settings = SettingsManager.getInstance();
    this.pendingKeybinds = settings.getKeybinds();
    this.pendingGraphics = settings.getGraphics();
    this.refreshKeybindsDisplay();
    this.refreshGraphicsDisplay();
    this.showTab("controls");
  }

  protected override onHide(): void {
    this.cancelRebinding();
    if (this.onClose) {
      this.onClose();
    }
  }
}
