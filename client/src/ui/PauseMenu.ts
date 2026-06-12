import { SettingsScreen } from "./screens/SettingsScreen.js";
import { THEME } from "../theme.js";

export class PauseMenu {
  private container: HTMLDivElement;
  private panel: HTMLDivElement;
  private settingsScreen: SettingsScreen;
  private visible = false;
  private settingsOpen = false;
  
  private onResume: (() => void) | null = null;
  private onLeaveGame: (() => void) | null = null;
  private escHandler: (e: KeyboardEvent) => void;

  constructor() {
    this.container = document.createElement("div");
    this.container.id = "pause-menu";
    this.container.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      display: none;
      justify-content: center;
      align-items: center;
      background: ${THEME.overlay};
      z-index: 999;
      font-family: ${THEME.font};
    `;
    document.body.appendChild(this.container);
    
    this.panel = this.createPanel();
    this.container.appendChild(this.panel);
    
    this.settingsScreen = new SettingsScreen();
    this.settingsScreen.setOnClose(() => {
      this.settingsOpen = false;
    });
    
    this.escHandler = (e: KeyboardEvent) => {
      if (e.code === "Escape" && this.visible) {
        e.preventDefault();
        if (this.settingsOpen) {
          this.settingsScreen.hide();
          this.settingsOpen = false;
        } else {
          this.resume();
        }
      }
    };
    document.addEventListener("keydown", this.escHandler);
  }

  private createPanel(): HTMLDivElement {
    const panel = document.createElement("div");
    panel.style.cssText = `
      background: ${THEME.panel};
      border: 1px solid ${THEME.panelBorder};
      border-radius: 4px;
      padding: 32px;
      width: 300px;
      box-shadow: 0 16px 48px rgba(0, 0, 0, 0.45);
    `;
    
    const title = document.createElement("h1");
    title.textContent = "Menu";
    title.style.cssText = `
      margin: 0 0 24px 0;
      color: ${THEME.paper};
      font-size: 26px;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-align: center;
    `;
    panel.appendChild(title);
    
    const resumeBtn = this.createButton("Return to Game", true);
    resumeBtn.addEventListener("click", () => this.resume());
    panel.appendChild(resumeBtn);
    
    const settingsBtn = this.createButton("Settings", false);
    settingsBtn.addEventListener("click", () => this.openSettings());
    panel.appendChild(settingsBtn);
    
    const leaveBtn = this.createButton("Leave Game", false);
    leaveBtn.style.borderColor = THEME.danger;
    leaveBtn.style.color = THEME.danger;
    leaveBtn.addEventListener("click", () => this.leaveGame());
    leaveBtn.addEventListener("mouseenter", () => {
      leaveBtn.style.background = "rgba(196, 92, 58, 0.18)";
      leaveBtn.style.borderColor = THEME.danger;
    });
    leaveBtn.addEventListener("mouseleave", () => {
      leaveBtn.style.background = "transparent";
      leaveBtn.style.borderColor = THEME.danger;
    });
    panel.appendChild(leaveBtn);
    
    return panel;
  }

  private createButton(text: string, primary: boolean): HTMLButtonElement {
    const button = document.createElement("button");
    button.textContent = text;
    button.style.cssText = `
      width: 100%;
      padding: 14px 24px;
      margin: 8px 0;
      border: 1px solid ${primary ? THEME.accent : THEME.panelBorder};
      border-radius: 3px;
      background: ${primary ? THEME.accent : "transparent"};
      color: ${primary ? THEME.ink : THEME.paper};
      font-size: 15px;
      font-weight: 600;
      letter-spacing: 0.03em;
      cursor: pointer;
      transition: background 0.15s, border-color 0.15s;
    `;
    button.addEventListener("mouseenter", () => {
      button.style.background = primary ? THEME.accentHover : "rgba(237, 230, 217, 0.08)";
      button.style.borderColor = THEME.accent;
    });
    button.addEventListener("mouseleave", () => {
      button.style.background = primary ? THEME.accent : "transparent";
      button.style.borderColor = primary ? THEME.accent : THEME.panelBorder;
    });
    return button;
  }

  show(): void {
    this.visible = true;
    this.container.style.display = "flex";
    document.exitPointerLock();
  }

  hide(): void {
    this.visible = false;
    this.settingsOpen = false;
    this.container.style.display = "none";
    this.settingsScreen.hide();
  }

  toggle(): void {
    if (this.settingsOpen) {
      this.settingsScreen.hide();
      this.settingsOpen = false;
      return;
    }
    
    if (this.visible) {
      this.hide();
      if (this.onResume) this.onResume();
    } else {
      this.show();
    }
  }

  isVisible(): boolean {
    return this.visible;
  }

  isSettingsOpen(): boolean {
    return this.settingsOpen;
  }

  private resume(): void {
    this.hide();
    if (this.onResume) this.onResume();
  }

  private openSettings(): void {
    this.settingsOpen = true;
    this.settingsScreen.show();
  }

  private leaveGame(): void {
    this.hide();
    if (this.onLeaveGame) this.onLeaveGame();
  }

  setOnResume(callback: () => void): void {
    this.onResume = callback;
  }

  setOnLeaveGame(callback: () => void): void {
    this.onLeaveGame = callback;
  }

  getSettingsScreen(): SettingsScreen {
    return this.settingsScreen;
  }

  destroy(): void {
    document.removeEventListener("keydown", this.escHandler);
    this.container.remove();
    this.settingsScreen.destroy();
  }
}
