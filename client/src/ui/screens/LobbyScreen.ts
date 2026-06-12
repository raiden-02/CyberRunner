import { BaseScreen } from "./BaseScreen.js";
import { api, type UserProfile } from "../../api/client.js";
import { THEME } from "../../theme.js";

export type GameModeId = "deathmatch" | "search_destroy";

export interface PlayAction {
  type: "quickplay" | "create" | "join";
  roomId?: string;
  joinCode?: string;
  gameMode?: GameModeId;
}

const GAME_MODES: Array<{ value: GameModeId; label: string; description: string }> = [
  { value: "deathmatch", label: "Deathmatch", description: "FFA - First to 30 kills" },
  { value: "search_destroy", label: "Search & Destroy", description: "3 lives per round" },
];

export class LobbyScreen extends BaseScreen {
  private user: UserProfile | null = null;
  private onPlay: (action: PlayAction) => void = () => {};
  private onLogout: () => void = () => {};
  private onEditProfile: () => void = () => {};
  private onSettings: () => void = () => {};
  private errorDiv!: HTMLDivElement;
  private joinCodeInput!: HTMLInputElement;
  private playerInfo!: HTMLDivElement;
  private gameModeSelect!: HTMLSelectElement;

  constructor() {
    super("lobby-screen");
    this.buildUI();
  }

  private buildUI(): void {
    const panel = this.createPanel("450px");
    
    const title = this.createTitle("CYBER RUNNER");
    panel.appendChild(title);

    const netHint = document.createElement("p");
    netHint.textContent = "Same live room. Two tabs is enough to see prediction and remote players.";
    netHint.style.cssText = `
      color: ${THEME.muted};
      text-align: center;
      margin: -8px 0 20px 0;
      font-size: 13px;
      line-height: 1.4;
    `;
    panel.appendChild(netHint);

    // Player info section
    this.playerInfo = document.createElement("div");
    this.playerInfo.style.cssText = `
      background: ${THEME.accentDim};
      border: 1px solid ${THEME.panelBorder};
      border-radius: 8px;
      padding: 12px 16px;
      margin-bottom: 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    `;
    panel.appendChild(this.playerInfo);

    // Quick Play button
    const quickPlayBtn = this.createButton("⚡ QUICK PLAY");
    quickPlayBtn.style.fontSize = "18px";
    quickPlayBtn.style.padding = "18px 24px";
    quickPlayBtn.onclick = () => this.handleQuickPlay();
    panel.appendChild(quickPlayBtn);

    // Separator
    const separator = document.createElement("div");
    separator.style.cssText = `
      display: flex;
      align-items: center;
      margin: 20px 0;
      color: #666;
    `;
    separator.innerHTML = `
      <div style="flex: 1; height: 1px; background: #333;"></div>
      <span style="padding: 0 16px;">OR</span>
      <div style="flex: 1; height: 1px; background: #333;"></div>
    `;
    panel.appendChild(separator);

    // Game Mode selector
    const modeLabel = document.createElement("div");
    modeLabel.textContent = "Game Mode";
    modeLabel.style.cssText = `
      color: #888;
      font-size: 12px;
      margin-bottom: 4px;
      text-transform: uppercase;
    `;
    panel.appendChild(modeLabel);
    
    this.gameModeSelect = this.createSelect(GAME_MODES.map(m => ({ value: m.value, label: `${m.label} - ${m.description}` })));
    this.gameModeSelect.style.marginBottom = "12px";
    panel.appendChild(this.gameModeSelect);

    // Create Game button
    const createBtn = this.createButton("Create Game", false);
    createBtn.onclick = () => this.handleCreate();
    panel.appendChild(createBtn);

    // Join by code
    const joinRow = document.createElement("div");
    joinRow.style.cssText = `
      display: flex;
      gap: 8px;
      margin-top: 8px;
    `;
    
    this.joinCodeInput = this.createInput("Enter join code...");
    this.joinCodeInput.style.flex = "1";
    this.joinCodeInput.style.textTransform = "uppercase";
    this.joinCodeInput.maxLength = 6;
    joinRow.appendChild(this.joinCodeInput);
    
    const joinBtn = this.createButton("Join", false);
    joinBtn.style.width = "auto";
    joinBtn.style.padding = "12px 24px";
    joinBtn.onclick = () => this.handleJoin();
    joinRow.appendChild(joinBtn);
    
    panel.appendChild(joinRow);

    this.errorDiv = this.createError();
    panel.appendChild(this.errorDiv);

    // Bottom buttons row
    const bottomRow = document.createElement("div");
    bottomRow.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 24px;
    `;

    // Settings button
    const settingsBtn = document.createElement("button");
    settingsBtn.textContent = "Settings";
    settingsBtn.style.cssText = `
      padding: 8px 16px;
      border: 1px solid #444;
      background: transparent;
      color: #888;
      font-size: 14px;
      cursor: pointer;
      border-radius: 4px;
    `;
    settingsBtn.onmouseenter = () => { settingsBtn.style.borderColor = THEME.accent; settingsBtn.style.color = THEME.accent; };
    settingsBtn.onmouseleave = () => { settingsBtn.style.borderColor = "#444"; settingsBtn.style.color = "#888"; };
    settingsBtn.onclick = () => this.onSettings();
    bottomRow.appendChild(settingsBtn);

    // Logout button
    const logoutBtn = document.createElement("button");
    logoutBtn.textContent = "Sign Out";
    logoutBtn.style.cssText = `
      padding: 8px 16px;
      border: none;
      background: transparent;
      color: #666;
      font-size: 14px;
      cursor: pointer;
    `;
    logoutBtn.onmouseenter = () => { logoutBtn.style.color = THEME.danger; };
    logoutBtn.onmouseleave = () => { logoutBtn.style.color = "#666"; };
    logoutBtn.onclick = () => this.handleLogout();
    bottomRow.appendChild(logoutBtn);

    panel.appendChild(bottomRow);

    this.container.appendChild(panel);
  }

  setUser(user: UserProfile): void {
    this.user = user;
    this.updatePlayerInfo();
  }

  setOnPlay(callback: (action: PlayAction) => void): void {
    this.onPlay = callback;
  }

  setOnLogout(callback: () => void): void {
    this.onLogout = callback;
  }

  setOnEditProfile(callback: () => void): void {
    this.onEditProfile = callback;
  }

  setOnSettings(callback: () => void): void {
    this.onSettings = callback;
  }

  private updatePlayerInfo(): void {
    if (!this.user) return;
    const primary = this.user.primaryWeaponId?.replace("_1", "") || "AR";
    const secondary = this.user.secondaryWeaponId?.replace("_1", "") || "PISTOL";
    this.playerInfo.innerHTML = `
      <div style="flex: 1;">
        <div style="color: ${THEME.accent}; font-weight: 600;">${this.user.displayName || "Player"}</div>
        <div style="color: ${THEME.muted}; font-size: 12px;">Loadout: ${primary} / ${secondary}</div>
      </div>
      <div style="display: flex; align-items: center; gap: 12px;">
        <button id="edit-profile-btn" style="
          background: transparent;
          border: 1px solid ${THEME.panelBorder};
          color: ${THEME.paper};
          padding: 6px 12px;
          border-radius: 3px;
          font-size: 12px;
          cursor: pointer;
        ">Edit</button>
        <div style="color: ${THEME.teammate}; font-size: 12px;">● Online</div>
      </div>
    `;
    
    const editBtn = this.playerInfo.querySelector("#edit-profile-btn");
    if (editBtn) {
      editBtn.addEventListener("click", () => this.onEditProfile());
    }
  }

  protected override onShow(): void {
    this.errorDiv.textContent = "";
    this.joinCodeInput.value = "";
    this.updatePlayerInfo();
  }

  private isGuest(): boolean {
    return this.user?.id.startsWith("guest-") ?? false;
  }

  private async handleQuickPlay(): Promise<void> {
    this.errorDiv.textContent = "";
    const gameMode = this.gameModeSelect.value as GameModeId;
    
    if (this.isGuest()) {
      this.onPlay({ type: "quickplay", gameMode });
      return;
    }
    
    try {
      const result = await api.quickPlay();
      if (result.action === "join" && result.roomId) {
        this.onPlay({ type: "join", roomId: result.roomId, joinCode: result.joinCode || undefined });
      } else {
        this.onPlay({ type: "create", gameMode });
      }
    } catch (err: any) {
      this.errorDiv.textContent = err.message || "Quick play failed";
    }
  }

  private handleCreate(): void {
    this.errorDiv.textContent = "";
    const gameMode = this.gameModeSelect.value as GameModeId;
    this.onPlay({ type: "create", gameMode });
  }

  private async handleJoin(): Promise<void> {
    const code = this.joinCodeInput.value.trim().toUpperCase();
    if (code.length !== 6) {
      this.errorDiv.textContent = "Join code must be 6 characters";
      return;
    }

    this.errorDiv.textContent = "";
    
    try {
      const result = await api.joinByCode(code);
      this.onPlay({ type: "join", roomId: result.roomId, joinCode: code });
    } catch (err: any) {
      this.errorDiv.textContent = err.message || "Failed to join room";
    }
  }

  private async handleLogout(): Promise<void> {
    try {
      await api.logout();
    } catch {
      // Ignore logout errors
    }
    this.onLogout();
  }
}
