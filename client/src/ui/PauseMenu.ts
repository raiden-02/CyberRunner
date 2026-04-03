import { SettingsScreen } from "./screens/SettingsScreen.js";

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
      background: rgba(0, 0, 0, 0.8);
      z-index: 999;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
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
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      border: 2px solid #0f3460;
      border-radius: 12px;
      padding: 32px;
      width: 300px;
      box-shadow: 0 0 40px rgba(0, 255, 255, 0.1);
    `;
    
    const title = document.createElement("h1");
    title.textContent = "Paused";
    title.style.cssText = `
      margin: 0 0 24px 0;
      color: #00ffff;
      font-size: 28px;
      text-align: center;
      text-shadow: 0 0 10px rgba(0, 255, 255, 0.5);
    `;
    panel.appendChild(title);
    
    const resumeBtn = this.createButton("Resume", true);
    resumeBtn.addEventListener("click", () => this.resume());
    panel.appendChild(resumeBtn);
    
    const settingsBtn = this.createButton("Settings", false);
    settingsBtn.addEventListener("click", () => this.openSettings());
    panel.appendChild(settingsBtn);
    
    const leaveBtn = this.createButton("Leave Game", false);
    leaveBtn.style.borderColor = "#ff4444";
    leaveBtn.style.color = "#ff4444";
    leaveBtn.addEventListener("click", () => this.leaveGame());
    leaveBtn.addEventListener("mouseenter", () => {
      leaveBtn.style.background = "rgba(255, 68, 68, 0.2)";
    });
    leaveBtn.addEventListener("mouseleave", () => {
      leaveBtn.style.background = "transparent";
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
      border: 2px solid ${primary ? "#00ffff" : "#666"};
      border-radius: 8px;
      background: ${primary ? "linear-gradient(135deg, #00ffff22, #00ffff11)" : "transparent"};
      color: ${primary ? "#00ffff" : "#aaa"};
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    `;
    button.addEventListener("mouseenter", () => {
      if (primary) {
        button.style.background = "linear-gradient(135deg, #00ffff44, #00ffff22)";
      } else {
        button.style.background = "rgba(255,255,255,0.1)";
      }
      button.style.transform = "scale(1.02)";
    });
    button.addEventListener("mouseleave", () => {
      if (primary) {
        button.style.background = "linear-gradient(135deg, #00ffff22, #00ffff11)";
      } else {
        button.style.background = "transparent";
      }
      button.style.transform = "scale(1)";
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
