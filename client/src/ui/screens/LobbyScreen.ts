import { getPublicMaps, type PublicMapInfo } from "@shared/world/map-registry.js";
import { quickPlayFollowThrough } from "@shared/net/quickplay-action.js";
import { api, type UserProfile } from "../../api/client.js";
import { THEME } from "../../theme.js";
import { BaseScreen } from "./BaseScreen.js";

export type GameModeId = "deathmatch" | "search_destroy";

export interface PlayAction {
  type: "quickplay" | "create" | "join";
  roomId?: string;
  joinCode?: string;
  gameMode?: GameModeId;
  mapId?: string;
  forgeMapId?: string;
}

const GAME_MODES: Array<{ value: GameModeId; label: string; description: string }> = [
  { value: "deathmatch", label: "Deathmatch", description: "FFA - First to 5 kills" },
  { value: "search_destroy", label: "Search & Destroy", description: "3 lives per round" },
];

export class LobbyScreen extends BaseScreen {
  private user: UserProfile | null = null;
  private onPlay: (action: PlayAction) => void = () => {};
  private onLogout: () => void = () => {};
  private onEditProfile: () => void = () => {};
  private onSettings: () => void = () => {};
  private onForge: () => void = () => {};
  private errorDiv!: HTMLDivElement;
  private joinCodeInput!: HTMLInputElement;
  private playerInfo!: HTMLDivElement;
  private gameModeSelect!: HTMLSelectElement;
  private mapList!: HTMLDivElement;
  private selectedMapId = getPublicMaps()[0]?.id ?? "shoot-house-neon";

  constructor() {
    super("lobby-screen");
    this.buildUI();
  }

  private buildUI(): void {
    const panel = this.createPanel("520px");

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

    const playHead = sectionLabel("Play");
    playHead.style.marginTop = "0";
    panel.appendChild(playHead);

    const quickPlayBtn = this.createButton("⚡ QUICK PLAY");
    quickPlayBtn.style.fontSize = "18px";
    quickPlayBtn.style.padding = "18px 24px";
    quickPlayBtn.onclick = () => this.handleQuickPlay();
    panel.appendChild(quickPlayBtn);

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

    panel.appendChild(fieldLabel("Mode"));
    this.gameModeSelect = this.createSelect(
      GAME_MODES.map((m) => ({ value: m.value, label: `${m.label} - ${m.description}` })),
    );
    this.gameModeSelect.style.marginBottom = "12px";
    this.gameModeSelect.onchange = () => this.renderMapCards();
    panel.appendChild(this.gameModeSelect);

    panel.appendChild(fieldLabel("Map"));
    this.mapList = document.createElement("div");
    this.mapList.style.cssText = "display: flex; flex-direction: column; gap: 8px; margin: 4px 0 12px 0;";
    panel.appendChild(this.mapList);
    this.renderMapCards();

    const createBtn = this.createButton("Create Game", false);
    createBtn.onclick = () => this.handleCreate();
    panel.appendChild(createBtn);

    const joinRow = document.createElement("div");
    joinRow.style.cssText = "display: flex; gap: 8px; margin-top: 8px;";
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

    panel.appendChild(this.forgeCard());

    this.errorDiv = this.createError();
    panel.appendChild(this.errorDiv);

    const bottomRow = document.createElement("div");
    bottomRow.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 24px;
    `;

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
    settingsBtn.onmouseenter = () => {
      settingsBtn.style.borderColor = THEME.accent;
      settingsBtn.style.color = THEME.accent;
    };
    settingsBtn.onmouseleave = () => {
      settingsBtn.style.borderColor = "#444";
      settingsBtn.style.color = "#888";
    };
    settingsBtn.onclick = () => this.onSettings();
    bottomRow.appendChild(settingsBtn);

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
    logoutBtn.onmouseenter = () => {
      logoutBtn.style.color = THEME.danger;
    };
    logoutBtn.onmouseleave = () => {
      logoutBtn.style.color = "#666";
    };
    logoutBtn.onclick = () => this.handleLogout();
    bottomRow.appendChild(logoutBtn);

    panel.appendChild(bottomRow);
    this.container.appendChild(panel);
  }

  private forgeCard(): HTMLDivElement {
    const card = document.createElement("div");
    card.style.cssText = `
      margin-top: 20px;
      padding: 14px 16px;
      border: 1px solid ${THEME.panelBorder};
      border-radius: 4px;
      background: ${THEME.accentDim};
    `;
    const kicker = document.createElement("div");
    kicker.textContent = "Arena Forge";
    kicker.style.cssText = `
      color: ${THEME.accent};
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    `;
    const sub = document.createElement("div");
    sub.textContent = "Agentic level design";
    sub.style.cssText = `color: ${THEME.paper}; font-size: 15px; font-weight: 600; margin: 4px 0 6px 0;`;
    const steps = document.createElement("div");
    steps.textContent = "Edit → evaluate → playtest → revise";
    steps.style.cssText = `color: ${THEME.muted}; font-size: 12px; margin-bottom: 10px;`;
    const open = this.createButton("Open Forge", false);
    open.style.margin = "0";
    open.onclick = () => this.onForge();
    card.appendChild(kicker);
    card.appendChild(sub);
    card.appendChild(steps);
    card.appendChild(open);
    return card;
  }

  private renderMapCards(): void {
    const maps = getPublicMaps();
    const mode = this.gameModeSelect.value as GameModeId;
    this.mapList.replaceChildren();
    for (const map of maps) {
      this.mapList.appendChild(this.mapCard(map, mode));
    }
  }

  private mapCard(map: PublicMapInfo, mode: GameModeId): HTMLButtonElement {
    const selected = map.id === this.selectedMapId;
    const supports = map.modes.includes(mode);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.style.cssText = `
      width: 100%;
      text-align: left;
      padding: 12px 14px;
      border: 1px solid ${selected ? THEME.accent : THEME.panelBorder};
      border-radius: 3px;
      background: ${selected ? THEME.accentDim : "transparent"};
      color: ${THEME.paper};
      cursor: pointer;
    `;
    const modes = map.modes
      .map((m) => (m === "deathmatch" ? "Deathmatch" : "Search & Destroy"))
      .join(" · ");
    btn.innerHTML = `
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:center;">
        <div>
          <div style="font-weight:600;letter-spacing:0.03em;text-transform:uppercase;">${map.title}</div>
          <div style="color:${THEME.muted};font-size:12px;margin-top:4px;">${map.blurb}</div>
          <div style="color:${THEME.muted};font-size:11px;margin-top:4px;">${modes}</div>
        </div>
        <div style="color:${selected ? THEME.accent : THEME.muted};font-size:11px;letter-spacing:0.06em;text-transform:uppercase;">
          ${selected ? "Selected" : supports ? "Select" : "Mode mismatch"}
        </div>
      </div>
    `;
    btn.onclick = () => {
      this.selectedMapId = map.id;
      this.errorDiv.textContent = "";
      this.renderMapCards();
    };
    return btn;
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

  setOnForge(callback: () => void): void {
    this.onForge = callback;
  }

  selectedPublicMapId(): string {
    return this.selectedMapId;
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
    this.renderMapCards();
  }

  private selectedCreate(): { gameMode: GameModeId; mapId: string } | undefined {
    const gameMode = this.gameModeSelect.value as GameModeId;
    const map = getPublicMaps().find((m) => m.id === this.selectedMapId);
    if (!map) {
      this.errorDiv.textContent = "Choose a production map.";
      return undefined;
    }
    if (!map.modes.includes(gameMode)) {
      this.errorDiv.textContent = `${map.title} does not support that mode.`;
      return undefined;
    }
    return { gameMode, mapId: map.id };
  }

  private async handleQuickPlay(): Promise<void> {
    this.errorDiv.textContent = "";
    const selected = this.selectedCreate();
    if (!selected) return;

    try {
      const result = await api.quickPlay({
        gameMode: selected.gameMode,
        mapId: selected.mapId,
      });
      const follow = quickPlayFollowThrough(result);
      if (follow === "join") {
        this.onPlay({ type: "join", roomId: result.roomId!, joinCode: result.joinCode || undefined });
        return;
      }
      if (follow === "create") {
        this.onPlay({
          type: "create",
          gameMode: selected.gameMode,
          mapId: selected.mapId,
        });
        return;
      }
      this.errorDiv.textContent = "Quick Play did not return a room.";
    } catch (err: any) {
      this.errorDiv.textContent = err.message || "Quick Play failed.";
    }
  }

  private handleCreate(): void {
    this.errorDiv.textContent = "";
    const selected = this.selectedCreate();
    if (!selected) return;
    this.onPlay({ type: "create", gameMode: selected.gameMode, mapId: selected.mapId });
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

function sectionLabel(text: string): HTMLDivElement {
  const el = document.createElement("div");
  el.textContent = text;
  el.style.cssText = `
    color: ${THEME.paper};
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    margin: 8px 0 8px 0;
  `;
  return el;
}

function fieldLabel(text: string): HTMLDivElement {
  const el = document.createElement("div");
  el.textContent = text;
  el.style.cssText = `
    color: #888;
    font-size: 12px;
    margin-bottom: 4px;
    text-transform: uppercase;
  `;
  return el;
}
