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
    this.container.className = "cr-pause";
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
    panel.className = "cr-panel";
    panel.style.width = "320px";

    const title = document.createElement("h1");
    title.className = "cr-title";
    title.textContent = "Paused";
    panel.appendChild(title);

    const resumeBtn = this.createButton("Resume", true);
    resumeBtn.addEventListener("click", () => this.resume());
    panel.appendChild(resumeBtn);

    const settingsBtn = this.createButton("Settings", false);
    settingsBtn.addEventListener("click", () => this.openSettings());
    panel.appendChild(settingsBtn);

    const leaveBtn = this.createButton("Leave Match", false);
    leaveBtn.classList.add("cr-button--danger");
    leaveBtn.addEventListener("click", () => this.leaveGame());
    panel.appendChild(leaveBtn);
    
    return panel;
  }

  private createButton(text: string, primary: boolean): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = primary ? "cr-button cr-button--primary" : "cr-button";
    button.textContent = text;
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
