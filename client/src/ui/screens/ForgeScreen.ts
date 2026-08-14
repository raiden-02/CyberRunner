import {
  api,
  type ForgeCatalogEntry,
  type ForgeDesignView,
  type ForgeP0Summary,
} from "../../api/client.js";
import { THEME } from "../../theme.js";
import {
  formatP0Line,
  formatPlaytestLines,
  formatTurnCard,
  forgeActivityText,
  playtestLabel,
} from "../forge-workbench.js";
import { BaseScreen } from "./BaseScreen.js";
import type { PlayAction } from "./LobbyScreen.js";

const BRIEF_MAX = 800;
const POLL_MS = 800;

export class ForgeScreen extends BaseScreen {
  private onPlay: (action: PlayAction) => void = () => {};
  private onBack: () => void = () => {};
  private liveAvailable = false;
  private view: ForgeDesignView | null = null;
  private pollId: ReturnType<typeof setInterval> | null = null;
  private busy = false;

  private mapSelect!: HTMLSelectElement;
  private briefInput!: HTMLTextAreaElement;
  private runBtn!: HTMLButtonElement;
  private liveHint!: HTMLDivElement;
  private sourceBadge!: HTMLDivElement;
  private activity!: HTMLDivElement;
  private timeline!: HTMLDivElement;
  private evidence!: HTMLDivElement;
  private playRow!: HTMLDivElement;
  private inspectList!: HTMLDivElement;
  private errorDiv!: HTMLDivElement;

  constructor() {
    super("forge-screen");
    this.buildUI();
  }

  private buildUI(): void {
    const panel = this.createPanel("640px");
    panel.style.maxHeight = "88vh";
    panel.style.overflowY = "auto";
    panel.appendChild(this.createTitle("ARENA FORGE"));

    const intro = document.createElement("p");
    intro.textContent =
      "Bounded AI level designer. It edits real CyberRunner map structures, checks geometry and routes, can run a seeded scripted playtest, then lets you walk the result.";
    intro.style.cssText = mutedBlock();
    panel.appendChild(intro);

    panel.appendChild(sectionLabel("Design"));

    this.mapSelect = this.createSelect([{ value: "map-contract-smoke", label: "map-contract-smoke" }]);
    panel.appendChild(this.createLabel("Starting map"));
    panel.appendChild(this.mapSelect);

    panel.appendChild(this.createLabel("Design brief"));
    this.briefInput = document.createElement("textarea");
    this.briefInput.maxLength = BRIEF_MAX;
    this.briefInput.rows = 4;
    this.briefInput.placeholder =
      "Use playtest evidence to make attacker routing less one-sided while keeping both sites reachable.";
    this.briefInput.style.cssText = `
      width: 100%;
      box-sizing: border-box;
      padding: 12px 14px;
      margin: 8px 0;
      border: 1px solid ${THEME.panelBorder};
      border-radius: 3px;
      background: ${THEME.ink};
      color: ${THEME.paper};
      font-size: 14px;
      line-height: 1.4;
      font-family: ${THEME.font};
      resize: vertical;
    `;
    this.briefInput.onfocus = () => {
      this.briefInput.style.borderColor = THEME.accent;
    };
    this.briefInput.onblur = () => {
      this.briefInput.style.borderColor = THEME.panelBorder;
    };
    panel.appendChild(this.briefInput);

    this.runBtn = this.createButton("Run ArenaForge", true);
    this.runBtn.onclick = () => void this.startLive();
    panel.appendChild(this.runBtn);

    this.liveHint = document.createElement("div");
    this.liveHint.style.cssText = mutedBlock();
    panel.appendChild(this.liveHint);

    const demoBtn = this.createButton("Load recorded P5 demo", false);
    demoBtn.onclick = () => void this.loadRecorded();
    panel.appendChild(demoBtn);

    this.sourceBadge = document.createElement("div");
    this.sourceBadge.style.cssText = `
      margin: 16px 0 8px 0;
      font-size: 12px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: ${THEME.muted};
    `;
    panel.appendChild(this.sourceBadge);

    this.activity = document.createElement("div");
    this.activity.style.cssText = `color: ${THEME.paper}; font-size: 14px; margin-bottom: 12px; min-height: 20px;`;
    panel.appendChild(this.activity);

    this.timeline = document.createElement("div");
    this.timeline.style.cssText = `display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px;`;
    panel.appendChild(this.timeline);

    this.evidence = document.createElement("div");
    panel.appendChild(this.evidence);

    this.playRow = document.createElement("div");
    this.playRow.style.cssText = `display: flex; gap: 8px; margin-top: 12px;`;
    panel.appendChild(this.playRow);

    panel.appendChild(sectionLabel("Recorded / Inspect"));
    const inspectHint = document.createElement("p");
    inspectHint.textContent = "P4-A and P4-B start fixtures, plus any local recorded eval runs.";
    inspectHint.style.cssText = mutedBlock();
    panel.appendChild(inspectHint);

    this.inspectList = document.createElement("div");
    this.inspectList.style.cssText = `
      max-height: 28vh;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 8px;
    `;
    panel.appendChild(this.inspectList);

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
    this.stopPoll();
    this.renderCapability();
    this.renderView();
    try {
      const cap = await api.forgeCapability();
      this.liveAvailable = cap.liveAgentAvailable;
    } catch {
      this.liveAvailable = false;
    }
    this.renderCapability();
    try {
      const maps = await api.listForgeMaps();
      this.renderInspect(maps);
    } catch (err) {
      this.inspectList.replaceChildren();
      this.errorDiv.textContent = err instanceof Error ? err.message : "Failed to load Forge maps";
    }
  }

  protected override onHide(): void {
    this.stopPoll();
  }

  private renderCapability(): void {
    this.runBtn.disabled = !this.liveAvailable || this.busy;
    this.runBtn.style.opacity = this.runBtn.disabled ? "0.55" : "1";
    this.runBtn.style.cursor = this.runBtn.disabled ? "default" : "pointer";
    this.liveHint.textContent = this.liveAvailable
      ? "Live design uses the frozen P5 agent on the server. One job at a time."
      : "Live design is unavailable on this server. The recorded P5 demo still works.";
  }

  private async startLive(): Promise<void> {
    if (!this.liveAvailable || this.busy) return;
    this.errorDiv.textContent = "";
    const brief = this.briefInput.value.trim();
    if (!brief) {
      this.errorDiv.textContent = "Write a brief first.";
      return;
    }
    this.busy = true;
    this.renderCapability();
    try {
      const { jobId } = await api.startForgeDesign({
        brief,
        mapId: this.mapSelect.value,
      });
      this.view = {
        jobId,
        status: "queued",
        source: "live",
        startingMapId: this.mapSelect.value,
        brief,
        turns: [],
        editAttempts: 0,
        successfulEdits: 0,
        playtestCalls: 0,
        modelCalls: 0,
        initialP0: { hardFailures: 0, reachablePaths: 0, totalPaths: 0 },
        finalMapRevision: 0,
        lastPlaytestIsOnFinalMap: false,
        playOriginalId: `job:${jobId}:initial`,
      };
      this.renderView();
      this.startPoll(jobId);
    } catch (err) {
      this.busy = false;
      this.renderCapability();
      this.errorDiv.textContent = err instanceof Error ? err.message : "Failed to start design";
    }
  }

  private startPoll(jobId: string): void {
    this.stopPoll();
    const tick = async () => {
      try {
        const next = await api.getForgeDesign(jobId);
        this.view = next;
        this.renderView();
        if (next.status === "completed" || next.status === "failed") {
          this.stopPoll();
          this.busy = false;
          this.renderCapability();
        }
      } catch (err) {
        this.stopPoll();
        this.busy = false;
        this.renderCapability();
        this.errorDiv.textContent = err instanceof Error ? err.message : "Lost the design job";
      }
    };
    void tick();
    this.pollId = setInterval(() => void tick(), POLL_MS);
  }

  private stopPoll(): void {
    if (this.pollId !== null) {
      clearInterval(this.pollId);
      this.pollId = null;
    }
  }

  private async loadRecorded(): Promise<void> {
    this.errorDiv.textContent = "";
    try {
      this.view = await api.getRecordedP5Demo();
      this.renderView();
    } catch (err) {
      this.errorDiv.textContent = err instanceof Error ? err.message : "Failed to load recorded demo";
    }
  }

  private renderView(): void {
    const view = this.view;
    if (!view) {
      this.sourceBadge.textContent = "";
      this.activity.textContent = "";
      this.timeline.replaceChildren();
      this.evidence.replaceChildren();
      this.playRow.replaceChildren();
      return;
    }

    this.sourceBadge.textContent = view.source === "live" ? "Live" : "Recorded";
    this.sourceBadge.style.color = view.source === "live" ? THEME.accent : THEME.muted;
    this.activity.textContent = forgeActivityText(view);
    if (view.status === "failed" && view.error) {
      this.errorDiv.textContent = view.error;
    }

    this.timeline.replaceChildren();
    for (const turn of view.turns) {
      const card = document.createElement("div");
      card.style.cssText = `
        border: 1px solid ${THEME.panelBorder};
        border-radius: 3px;
        padding: 10px 12px;
        white-space: pre-wrap;
        font-size: 13px;
        line-height: 1.45;
        color: ${THEME.paper};
      `;
      card.textContent = formatTurnCard(turn);
      this.timeline.appendChild(card);
    }

    this.evidence.replaceChildren();
    if (view.status === "completed" || view.status === "failed" || view.finalP0 || view.lastPlaytest) {
      this.evidence.appendChild(this.p0Cards(view));
      if (view.firstPlaytest || view.lastPlaytest) {
        this.evidence.appendChild(this.playtestCards(view));
      }
    }

    this.playRow.replaceChildren();
    const original = this.createButton("Play Original", false);
    original.style.flex = "1";
    original.onclick = () => this.playMap(view.playOriginalId);
    this.playRow.appendChild(original);
    if (view.playResultId && (view.status === "completed" || view.source === "recorded")) {
      const result = this.createButton("Play Result", true);
      result.style.flex = "1";
      result.onclick = () => this.playMap(view.playResultId!);
      this.playRow.appendChild(result);
    }
  }

  private p0Cards(view: ForgeDesignView): HTMLDivElement {
    const wrap = document.createElement("div");
    wrap.style.cssText = "margin: 8px 0;";
    const title = document.createElement("div");
    title.textContent = "Static checks";
    title.style.cssText = sectionTitleCss();
    wrap.appendChild(title);
    wrap.appendChild(
      pairRow(
        "Before",
        formatP0Line(view.initialP0) + medianLine(view.initialP0),
        "After",
        view.finalP0 ? formatP0Line(view.finalP0) + medianLine(view.finalP0) : "Not finished.",
      ),
    );
    return wrap;
  }

  private playtestCards(view: ForgeDesignView): HTMLDivElement {
    const wrap = document.createElement("div");
    wrap.style.cssText = "margin: 8px 0;";
    const title = document.createElement("div");
    title.textContent = playtestLabel(view);
    title.style.cssText = sectionTitleCss();
    wrap.appendChild(title);
    wrap.appendChild(
      pairRow(
        "First observed",
        view.firstPlaytest ? formatPlaytestLines(view.firstPlaytest).join("\n") : "None",
        "Last observed",
        view.lastPlaytest ? formatPlaytestLines(view.lastPlaytest).join("\n") : "None",
      ),
    );
    return wrap;
  }

  private playMap(catalogId: string): void {
    this.onPlay({
      type: "create",
      gameMode: "search_destroy",
      forgeMapId: catalogId,
    });
  }

  private renderInspect(maps: ForgeCatalogEntry[]): void {
    this.inspectList.replaceChildren();
    if (maps.length === 0) {
      const empty = document.createElement("div");
      empty.textContent = "No inspect maps yet.";
      empty.style.cssText = `color: ${THEME.muted}; text-align: center; padding: 12px;`;
      this.inspectList.appendChild(empty);
      return;
    }

    let lastGroup = "";
    for (const entry of maps) {
      const group =
        entry.suite === "p4a"
          ? "P4-A start fixtures"
          : entry.suite === "p4b"
            ? "P4-B start fixtures"
            : "Local recorded runs";
      if (group !== lastGroup) {
        lastGroup = group;
        const header = document.createElement("div");
        header.textContent = group;
        header.style.cssText = sectionTitleCss();
        this.inspectList.appendChild(header);
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
      row.onclick = () => this.playMap(entry.id);
      this.inspectList.appendChild(row);
    }
  }
}

function mutedBlock(): string {
  return `
    color: ${THEME.muted};
    text-align: left;
    margin: 0 0 16px 0;
    font-size: 13px;
    line-height: 1.45;
  `;
}

function sectionLabel(text: string): HTMLDivElement {
  const el = document.createElement("div");
  el.textContent = text;
  el.style.cssText = `
    color: ${THEME.paper};
    font-size: 15px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    margin: 20px 0 8px 0;
  `;
  return el;
}

function sectionTitleCss(): string {
  return `
    color: ${THEME.muted};
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin: 8px 0 6px 0;
  `;
}

function medianLine(p0: ForgeP0Summary): string {
  const parts = [
    p0.ghostAMedian !== undefined ? `Ghost A ${p0.ghostAMedian}` : "",
    p0.ghostBMedian !== undefined ? `Ghost B ${p0.ghostBMedian}` : "",
  ].filter(Boolean);
  return parts.length ? `\nMedians: ${parts.join("  ")}` : "";
}

function pairRow(leftTitle: string, leftBody: string, rightTitle: string, rightBody: string): HTMLDivElement {
  const row = document.createElement("div");
  row.style.cssText = "display: flex; gap: 8px;";
  row.appendChild(metricCard(leftTitle, leftBody));
  row.appendChild(metricCard(rightTitle, rightBody));
  return row;
}

function metricCard(title: string, body: string): HTMLDivElement {
  const card = document.createElement("div");
  card.style.cssText = `
    flex: 1;
    border: 1px solid ${THEME.panelBorder};
    border-radius: 3px;
    padding: 10px 12px;
  `;
  const h = document.createElement("div");
  h.textContent = title;
  h.style.cssText = `color: ${THEME.muted}; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px;`;
  const p = document.createElement("div");
  p.textContent = body;
  p.style.cssText = `color: ${THEME.paper}; font-size: 13px; white-space: pre-wrap; line-height: 1.4;`;
  card.appendChild(h);
  card.appendChild(p);
  return card;
}
