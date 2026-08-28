import { getGameplayMap, getPublicMaps, type PublicMapInfo } from "@shared/world/map-registry.js";
import { quickPlayFollowThrough } from "@shared/net/quickplay-action.js";
import { lobbyModeCopy } from "@shared/ui/mode-copy.js";
import { api, type UserProfile } from "../../api/client.js";
import { MapShowcase } from "../../world/MapShowcase.js";
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
  private mapList!: HTMLDivElement;
  private previewHost!: HTMLDivElement;
  private previewTitle!: HTMLDivElement;
  private selectedMapId = getPublicMaps()[0]?.id ?? "shoot-house-neon";
  private selectedMode: GameModeId = "deathmatch";
  private modeButtons: HTMLButtonElement[] = [];
  private showcase = new MapShowcase();

  constructor() {
    super("lobby-screen", true);
    this.buildUI();
  }

  private buildUI(): void {
    const shell = document.createElement("div");
    shell.className = "cr-lobby";

    const top = document.createElement("div");
    top.className = "cr-lobby__top";
    const brand = document.createElement("div");
    brand.className = "cr-lobby__brand";
    brand.textContent = "CyberRunner";
    this.playerInfo = document.createElement("div");
    this.playerInfo.className = "cr-lobby__player";
    const actions = document.createElement("div");
    actions.className = "cr-row";
    const settingsBtn = this.createButton("Settings", false);
    settingsBtn.classList.add("cr-button--ghost");
    settingsBtn.onclick = () => this.onSettings();
    const logoutBtn = this.createButton("Sign Out", false);
    logoutBtn.classList.add("cr-button--ghost");
    logoutBtn.onclick = () => void this.handleLogout();
    actions.append(settingsBtn, logoutBtn);
    top.append(brand, this.playerInfo, actions);
    shell.appendChild(top);

    const body = document.createElement("div");
    body.className = "cr-lobby__body";

    const play = this.createPanel("cr-lobby__play");
    const playKicker = document.createElement("div");
    playKicker.className = "cr-kicker";
    playKicker.textContent = "Play";
    play.appendChild(playKicker);

    play.appendChild(this.label("Mode"));
    const modes = document.createElement("div");
    modes.className = "cr-segmented";
    for (const mode of ["deathmatch", "search_destroy"] as const) {
      const copy = lobbyModeCopy(mode);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cr-button cr-mode-btn";
      btn.dataset.mode = mode;
      btn.innerHTML = `<strong>${copy.title}</strong><span>${copy.detail}</span>`;
      btn.onclick = () => {
        this.selectedMode = mode;
        this.syncModeButtons();
        this.renderMapCards();
      };
      this.modeButtons.push(btn);
      modes.appendChild(btn);
    }
    play.appendChild(modes);

    play.appendChild(this.label("Map"));
    this.mapList = document.createElement("div");
    this.mapList.style.cssText = "display:flex;flex-direction:column;gap:8px;margin:4px 0 12px;";
    play.appendChild(this.mapList);

    const quick = this.createButton("Quick Play", true);
    quick.onclick = () => void this.handleQuickPlay();
    play.appendChild(quick);

    const create = this.createButton("Create Game", false);
    create.onclick = () => this.handleCreate();
    play.appendChild(create);

    play.appendChild(this.label("Join code"));
    const joinRow = document.createElement("div");
    joinRow.className = "cr-row";
    this.joinCodeInput = this.createInput("Enter join code");
    this.joinCodeInput.style.flex = "1";
    this.joinCodeInput.style.textTransform = "uppercase";
    this.joinCodeInput.maxLength = 6;
    this.joinCodeInput.setAttribute("aria-label", "Join code");
    const joinBtn = this.createButton("Join", false);
    joinBtn.classList.add("cr-button--inline");
    joinBtn.onclick = () => void this.handleJoin();
    joinRow.append(this.joinCodeInput, joinBtn);
    play.appendChild(joinRow);

    this.errorDiv = this.createError();
    play.appendChild(this.errorDiv);
    body.appendChild(play);

    const preview = document.createElement("div");
    preview.className = "cr-lobby__preview";
    this.previewHost = document.createElement("div");
    this.previewHost.style.cssText = "position:absolute;inset:0;";
    const meta = document.createElement("div");
    meta.className = "cr-lobby__preview-meta";
    this.previewTitle = document.createElement("div");
    this.previewTitle.className = "cr-lobby__preview-title";
    meta.appendChild(this.previewTitle);
    preview.append(this.previewHost, meta);
    body.appendChild(preview);
    shell.appendChild(body);

    const forge = this.createPanel("cr-lobby__forge");
    const forgeCopy = document.createElement("div");
    const fk = document.createElement("div");
    fk.className = "cr-kicker";
    fk.textContent = "Arena Forge";
    const ft = document.createElement("div");
    ft.textContent = "Design a Search & Destroy variant with a bounded agent.";
    ft.className = "cr-copy cr-copy--left";
    const steps = document.createElement("div");
    steps.className = "cr-copy cr-copy--left";
    steps.textContent = "Edit · Evaluate · Playtest · Revise";
    forgeCopy.append(fk, ft, steps);
    const open = this.createButton("Open Forge", false);
    open.classList.add("cr-button--inline");
    open.onclick = () => this.onForge();
    forge.append(forgeCopy, open);
    shell.appendChild(forge);

    this.container.appendChild(shell);
    this.syncModeButtons();
    this.renderMapCards();
  }

  private label(text: string): HTMLLabelElement {
    return this.createLabel(text);
  }

  private syncModeButtons(): void {
    for (const btn of this.modeButtons) {
      btn.classList.toggle("cr-button--primary", btn.dataset.mode === this.selectedMode);
    }
  }

  private renderMapCards(): void {
    const maps = getPublicMaps();
    this.mapList.replaceChildren();
    for (const map of maps) {
      this.mapList.appendChild(this.mapCard(map));
    }
    this.syncPreviewCopy();
  }

  private mapCard(map: PublicMapInfo): HTMLButtonElement {
    const selected = map.id === this.selectedMapId;
    const supports = map.modes.includes(this.selectedMode);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `cr-card${selected ? " is-selected" : ""}`;
    const modes = map.modes
      .map((m) => (m === "deathmatch" ? "Deathmatch" : "Search & Destroy"))
      .join("  ·  ");
    btn.innerHTML = `
      <div class="cr-kicker">${map.title}</div>
      <div>${map.blurb}</div>
      <div class="cr-copy cr-copy--left" style="margin:8px 0 0">${modes}</div>
      <div class="cr-copy cr-copy--left">${selected ? "Selected" : supports ? "Select" : "Mode mismatch"}</div>
    `;
    btn.onclick = () => {
      this.selectedMapId = map.id;
      this.errorDiv.textContent = "";
      this.renderMapCards();
      this.refreshShowcase();
    };
    return btn;
  }

  private syncPreviewCopy(): void {
    const map = getPublicMaps().find((m) => m.id === this.selectedMapId);
    this.previewTitle.textContent = map?.title ?? "Selected map";
  }

  private refreshShowcase(): void {
    if (!this.visible) return;
    try {
      this.showcase.setGameplayMap(getGameplayMap(this.selectedMapId));
    } catch {
      // production maps only
    }
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
    this.playerInfo.replaceChildren();
    const name = document.createElement("div");
    name.innerHTML = `<strong>${this.user.displayName || "Player"}</strong><div>${primary} / ${secondary}</div>`;
    const edit = this.createButton("Edit", false);
    edit.classList.add("cr-button--inline");
    edit.onclick = () => this.onEditProfile();
    this.playerInfo.append(name, edit);
  }

  protected override onShow(): void {
    this.errorDiv.textContent = "";
    this.joinCodeInput.value = "";
    this.updatePlayerInfo();
    this.renderMapCards();
    this.showcase.attach(this.previewHost);
    this.refreshShowcase();
    this.showcase.start();
  }

  protected override onHide(): void {
    this.showcase.dispose();
  }

  private selectedCreate(): { gameMode: GameModeId; mapId: string } | undefined {
    const map = getPublicMaps().find((m) => m.id === this.selectedMapId);
    if (!map) {
      this.errorDiv.textContent = "Choose a production map.";
      return undefined;
    }
    if (!map.modes.includes(this.selectedMode)) {
      this.errorDiv.textContent = `${map.title} does not support that mode.`;
      return undefined;
    }
    return { gameMode: this.selectedMode, mapId: map.id };
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
      this.errorDiv.textContent = "Join code must be 6 characters.";
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

  override destroy(): void {
    this.showcase.dispose();
    super.destroy();
  }
}
