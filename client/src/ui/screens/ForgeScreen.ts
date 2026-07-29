import { api, type ForgeCatalogEntry } from "../../api/client.js";
import { THEME } from "../../theme.js";
import { BaseScreen } from "./BaseScreen.js";
import type { PlayAction } from "./LobbyScreen.js";

export class ForgeScreen extends BaseScreen {
  private onPlay: (action: PlayAction) => void = () => {};
  private onBack: () => void = () => {};
  private list!: HTMLDivElement;
  private errorDiv!: HTMLDivElement;

  constructor() {
    super("forge-screen");
    this.buildUI();
  }

  private buildUI(): void {
    const panel = this.createPanel("520px");
    panel.appendChild(this.createTitle("ARENA FORGE"));

    const hint = document.createElement("p");
    hint.textContent =
      "Walk a P4-A or P4-B start fixture, or a recorded model result. Search & Destroy. This is a look at the maps, not a new designer.";
    hint.style.cssText = `
      color: ${THEME.muted};
      text-align: center;
      margin: -8px 0 16px 0;
      font-size: 13px;
      line-height: 1.4;
    `;
    panel.appendChild(hint);

    this.list = document.createElement("div");
    this.list.style.cssText = `
      max-height: 52vh;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 8px;
    `;
    panel.appendChild(this.list);

    this.errorDiv = this.createError();
    panel.appendChild(this.errorDiv);

    const back = this.createButton("Back", false);
    back.onclick = () => this.onBack();
    panel.appendChild(back);

    this.container.appendChild(panel);
  }

  setOnPlay(callback: (action: PlayAction) => void): void {
    this.onPlay = callback;
  }

  setOnBack(callback: () => void): void {
    this.onBack = callback;
  }

  protected override async onShow(): Promise<void> {
    this.errorDiv.textContent = "";
    this.list.replaceChildren();
    const loading = document.createElement("div");
    loading.textContent = "Loading maps…";
    loading.style.cssText = `color: ${THEME.muted}; text-align: center; padding: 16px;`;
    this.list.appendChild(loading);
    try {
      const maps = await api.listForgeMaps();
      this.renderMaps(maps);
    } catch (err) {
      this.list.replaceChildren();
      this.errorDiv.textContent = err instanceof Error ? err.message : "Failed to load Forge maps";
    }
  }

  private renderMaps(maps: ForgeCatalogEntry[]): void {
    this.list.replaceChildren();
    if (maps.length === 0) {
      const empty = document.createElement("div");
      empty.textContent = "No Forge maps yet. P4-A and P4-B fixtures should appear here.";
      empty.style.cssText = `color: ${THEME.muted}; text-align: center; padding: 16px;`;
      this.list.appendChild(empty);
      return;
    }

    let lastGroup = "";
    for (const entry of maps) {
      const group =
        entry.suite === "p4a"
          ? "P4-A start fixtures"
          : entry.suite === "p4b"
            ? "P4-B start fixtures"
            : "Recorded model runs";
      if (group !== lastGroup) {
        lastGroup = group;
        const header = document.createElement("div");
        header.textContent = group;
        header.style.cssText = `
          color: ${THEME.muted};
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          margin: 8px 0 0 0;
        `;
        this.list.appendChild(header);
      }

      const row = document.createElement("button");
      row.type = "button";
      row.style.cssText = `
        width: 100%;
        text-align: left;
        padding: 12px 14px;
        border: 1px solid ${THEME.panelBorder};
        border-radius: 3px;
        background: transparent;
        color: ${THEME.paper};
        cursor: pointer;
      `;
      row.innerHTML = `
        <div style="font-weight: 600;">${entry.title}</div>
        <div style="color: ${THEME.muted}; font-size: 12px; margin-top: 4px;">${entry.subtitle}</div>
      `;
      row.onmouseenter = () => {
        row.style.borderColor = THEME.accent;
      };
      row.onmouseleave = () => {
        row.style.borderColor = THEME.panelBorder;
      };
      row.onclick = () => {
        this.onPlay({
          type: "create",
          gameMode: "search_destroy",
          forgeMapId: entry.id,
        });
      };
      this.list.appendChild(row);
    }
  }
}
