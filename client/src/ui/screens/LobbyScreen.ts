import { getGameplayMap, getPublicMaps } from "@shared/world/map-registry.js";
import { quickPlayFollowThrough } from "@shared/net/quickplay-action.js";
import { lobbyModeCopy } from "@shared/ui/mode-copy.js";
import {
  forgeMapTitle,
  officialQuickPlaySelection,
  personalMapsForMode,
  personalLobbyOption,
  officialLobbyOption,
  quickPlayDisabledReason,
  selectedLobbyOption,
  type LobbyMapOption,
  type SelectedLobbyMap,
} from "@shared/ui/lobby-maps.js";
import { setUntrustedText } from "@shared/ui/untrusted-text.js";
import { api, type SavedMapMeta, type UserProfile } from "../../api/client.js";
import { MapShowcase } from "../../world/MapShowcase.js";
import { BaseScreen } from "./BaseScreen.js";

export type GameModeId = "deathmatch" | "search_destroy";

export interface PlayAction {
  type: "quickplay" | "create" | "join";
  roomId?: string;
  joinCode?: string;
  gameMode?: GameModeId | "explore";
  mapId?: string;
  forgeMapId?: string;
  savedMapLaunchId?: string;
  mapLaunchId?: string;
  returnTo?: "lobby" | "forge";
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
  private selectedMap: SelectedLobbyMap = {
    source: "official",
    id: getPublicMaps()[0]?.id ?? "shoot-house-neon",
  };
  private selectedMode: GameModeId = "deathmatch";
  private quickPlayBtn!: HTMLButtonElement;
  private personalMaps: SavedMapMeta[] = [];
  private personalMapsError = "";
  private modeButtons: HTMLButtonElement[] = [];
  private showcase = new MapShowcase();
  private personalHint!: HTMLDivElement;

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
    this.personalHint = document.createElement("div");
    this.personalHint.className = "cr-copy cr-copy--left";
    play.appendChild(this.personalHint);

    this.quickPlayBtn = this.createButton("Quick Play", true);
    this.quickPlayBtn.onclick = () => void this.handleQuickPlay();
    play.appendChild(this.quickPlayBtn);

    const create = this.createButton("Create Game", false);
    create.onclick = () => void this.handleCreate();
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
    ft.textContent = "Draw an arena, place starts, and let ArenaForge build a playable map.";
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
    const officialHead = document.createElement("div");
    officialHead.className = "cr-kicker";
    officialHead.textContent = "Official";
    this.mapList.appendChild(officialHead);
    for (const map of maps) {
      this.mapList.appendChild(this.mapOptionCard(officialLobbyOption(map)));
    }
    const yours = personalMapsForMode(this.personalMaps, this.selectedMode);
    const yourHead = document.createElement("div");
    yourHead.className = "cr-kicker";
    yourHead.style.marginTop = "10px";
    yourHead.textContent = "Your Maps";
    this.mapList.appendChild(yourHead);
    if (this.personalMapsError) {
      const err = document.createElement("div");
      err.className = "cr-copy cr-copy--left";
      err.textContent = this.personalMapsError;
      this.mapList.appendChild(err);
    } else if (yours.length === 0) {
      const empty = document.createElement("div");
      empty.className = "cr-copy cr-copy--left";
      empty.textContent = this.isPersistentUser()
        ? "No saved Forge maps for this mode."
        : "No session maps for this mode. Generate in Arena Forge, then Save Map.";
      this.mapList.appendChild(empty);
    }
    for (const map of yours) {
      this.mapList.appendChild(this.mapOptionCard(personalLobbyOption(map)));
    }
    if (this.selectedMap.source === "personal" && yours.some((m) => m.id === this.selectedMap.id)) {
      const row = document.createElement("div");
      row.className = "cr-row";
      row.style.marginTop = "8px";
      const rename = this.createButton("Rename", false);
      rename.classList.add("cr-button--inline");
      rename.onclick = () => void this.renameSelected();
      const del = this.createButton("Delete", false);
      del.classList.add("cr-button--inline");
      del.onclick = () => void this.deleteSelected();
      row.append(rename, del);
      this.mapList.appendChild(row);
    }
    this.syncPreviewCopy();
    this.syncQuickPlay();
  }

  private currentOption(): LobbyMapOption | undefined {
    return selectedLobbyOption(this.selectedMap, getPublicMaps(), this.personalMaps);
  }

  private mapOptionCard(option: LobbyMapOption): HTMLButtonElement {
    const selected = this.selectedMap.source === option.source && this.selectedMap.id === option.id;
    const supports = option.modes.includes(this.selectedMode);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `cr-card${selected ? " is-selected" : ""}`;
    const kicker = document.createElement("div");
    kicker.className = "cr-kicker";
    setUntrustedText(kicker, option.source === "personal" ? "FORGE" : "OFFICIAL");
    const title = document.createElement("div");
    setUntrustedText(title, option.source === "personal" ? forgeMapTitle(option.title) : option.title);
    const detail = document.createElement("div");
    detail.className = "cr-copy cr-copy--left";
    detail.style.margin = "8px 0 0";
    const modes = option.modes
      .map((m) => (m === "deathmatch" ? "Deathmatch" : "Search & Destroy"))
      .join("  ·  ");
    const extras = option.sessionOnly ? " · This session" : "";
    setUntrustedText(detail, option.blurb ? option.blurb : `${modes}${extras}`);
    const status = document.createElement("div");
    status.className = "cr-copy cr-copy--left";
    setUntrustedText(status, selected ? "Selected" : supports ? "Select" : "Mode mismatch");
    btn.append(kicker, title, detail, status);
    btn.onclick = () => {
      this.selectedMap = { source: option.source, id: option.id };
      this.errorDiv.textContent = "";
      this.renderMapCards();
      if (option.source === "personal") void this.refreshPersonalShowcase(option.id);
      else this.refreshShowcase();
    };
    return btn;
  }

  private syncQuickPlay(): void {
    const reason = quickPlayDisabledReason(this.currentOption());
    this.quickPlayBtn.disabled = Boolean(reason);
    this.quickPlayBtn.style.opacity = reason ? "0.55" : "1";
    this.quickPlayBtn.textContent = reason ?? "Quick Play";
    this.personalHint.textContent = reason
      ? "Quick Play is official maps only. Create Game launches the selected Forge map as a normal match."
      : "";
  }

  private syncPreviewCopy(): void {
    const option = this.currentOption();
    if (!option) {
      this.previewTitle.textContent = "Selected map";
      return;
    }
    this.previewTitle.textContent = option.source === "personal" ? forgeMapTitle(option.title) : option.title;
  }

  private isPersistentUser(): boolean {
    const id = this.user?.id ?? "";
    return Boolean(id) && !id.startsWith("guest-") && !id.startsWith("dev-user-");
  }

  private refreshShowcase(): void {
    if (!this.visible) return;
    try {
      if (this.selectedMap.source !== "official") return;
      this.showcase.setGameplayMap(getGameplayMap(this.selectedMap.id));
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
    return this.selectedMap.source === "official"
      ? this.selectedMap.id
      : getPublicMaps()[0]?.id ?? "shoot-house-neon";
  }

  private updatePlayerInfo(): void {
    if (!this.user) return;
    const primary = this.user.primaryWeaponId?.replace("_1", "") || "AR";
    const secondary = this.user.secondaryWeaponId?.replace("_1", "") || "PISTOL";
    this.playerInfo.replaceChildren();
    const name = document.createElement("div");
    const strong = document.createElement("strong");
    strong.textContent = this.user.displayName || "Player";
    const loadout = document.createElement("div");
    loadout.textContent = `${primary} / ${secondary}`;
    name.append(strong, loadout);
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
    void this.loadPersonalMaps();
  }

  protected override onHide(): void {
    this.showcase.dispose();
  }

  private async handleQuickPlay(): Promise<void> {
    this.errorDiv.textContent = "";
    const selected = officialQuickPlaySelection(this.selectedMap, getPublicMaps(), this.selectedMode);
    if ("error" in selected) {
      this.errorDiv.textContent = selected.error;
      return;
    }

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

  private async handleCreate(): Promise<void> {
    this.errorDiv.textContent = "";
    if (this.selectedMap.source === "personal") {
      const personal = this.personalMaps.find((m) => m.id === this.selectedMap.id);
      if (!personal) {
        this.errorDiv.textContent = "Choose a map.";
        return;
      }
      if (personal.mode !== this.selectedMode) {
        this.errorDiv.textContent = "That Forge map was designed for a different mode.";
        return;
      }
      try {
        const launched = await api.launchMyMap(personal.id);
        this.onPlay({
          type: "create",
          gameMode: personal.mode,
          mapLaunchId: launched.launchId,
        });
      } catch (err) {
        this.errorDiv.textContent = err instanceof Error ? err.message : "Failed to launch map.";
      }
      return;
    }
    const selected = officialQuickPlaySelection(this.selectedMap, getPublicMaps(), this.selectedMode);
    if ("error" in selected) {
      this.errorDiv.textContent = selected.error;
      return;
    }
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

  private async loadPersonalMaps(): Promise<void> {
    this.personalMapsError = "";
    try {
      this.personalMaps = await api.listMyMaps();
    } catch {
      this.personalMaps = [];
      this.personalMapsError = "Could not load your maps. Official maps still work.";
    }
    this.renderMapCards();
  }

  private async refreshPersonalShowcase(id: string): Promise<void> {
    if (!this.visible) return;
    try {
      const detail = await api.getMyMap(id);
      this.showcase.setGameplayMap(detail.mapDefinition);
    } catch {
      this.refreshShowcase();
    }
  }

  private async renameSelected(): Promise<void> {
    if (this.selectedMap.source !== "personal") return;
    const current = this.personalMaps.find((m) => m.id === this.selectedMap.id);
    const next = window.prompt("Rename map", current?.name ?? "");
    if (next == null) return;
    try {
      await api.renameMyMap(this.selectedMap.id, next);
      await this.loadPersonalMaps();
    } catch (err) {
      this.errorDiv.textContent = err instanceof Error ? err.message : "Rename failed.";
    }
  }

  private async deleteSelected(): Promise<void> {
    if (this.selectedMap.source !== "personal") return;
    if (!window.confirm("Delete this Forge map?")) return;
    try {
      await api.deleteMyMap(this.selectedMap.id);
      this.selectedMap = {
        source: "official",
        id: getPublicMaps()[0]?.id ?? "shoot-house-neon",
      };
      await this.loadPersonalMaps();
      this.refreshShowcase();
    } catch (err) {
      this.errorDiv.textContent = err instanceof Error ? err.message : "Delete failed.";
    }
  }

  override destroy(): void {
    this.showcase.dispose();
    super.destroy();
  }
}
