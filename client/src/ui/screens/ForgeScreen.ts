import { diffArenaMapViews } from "@shared/world/arena-map-view.js";
import {
  api,
  type ForgeCatalogEntry,
  type ForgeDesignTurn,
  type ForgeDesignView,
  type ForgeP0Summary,
  type ForgePublicMapView,
} from "../../api/client.js";
import { THEME } from "../../theme.js";
import { MapShowcase } from "../../world/MapShowcase.js";
import {
  formatP0Line,
  formatPlaytestLines,
  formatTurnCard,
  forgeActivityText,
  recordedStoryLine,
  revisionCaption,
} from "../forge-workbench.js";
import { TacticalMap } from "../TacticalMap.js";
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
  private replayId: ReturnType<typeof setInterval> | null = null;
  private busy = false;
  private selectedTurn = 0;
  private replayPlaying = true;
  private replayProgress = 0;
  private loadedOnce = false;

  private workbench!: HTMLDivElement;
  private briefEl!: HTMLDivElement;
  private sourceBadge!: HTMLDivElement;
  private activity!: HTMLDivElement;
  private storyEl!: HTMLDivElement;
  private showcaseHost!: HTMLDivElement;
  private revisionLabel!: HTMLDivElement;
  private revisionRow!: HTMLDivElement;
  private timeline!: HTMLDivElement;
  private tacticalHost!: HTMLDivElement;
  private evidence!: HTMLDivElement;
  private playRow!: HTMLDivElement;
  private liveBox!: HTMLDivElement;
  private mapSelect!: HTMLSelectElement;
  private briefInput!: HTMLTextAreaElement;
  private runBtn!: HTMLButtonElement;
  private liveHint!: HTMLDivElement;
  private inspectList!: HTMLDivElement;
  private errorDiv!: HTMLDivElement;

  private showcase = new MapShowcase();
  private tactical = new TacticalMap();

  constructor() {
    super("forge-screen");
    this.container.style.alignItems = "stretch";
    this.container.style.justifyContent = "flex-start";
    this.container.style.overflow = "auto";
    this.container.style.padding = "20px 16px 32px";
    this.buildUI();
  }

  private buildUI(): void {
    this.workbench = document.createElement("div");
    this.workbench.style.cssText = `
      background: ${THEME.panel};
      border: 1px solid ${THEME.panelBorder};
      border-radius: 4px;
      padding: 24px 28px 28px;
      width: min(1180px, 96vw);
      margin: 0 auto;
      box-shadow: 0 16px 48px rgba(0, 0, 0, 0.45);
    `;

    const header = document.createElement("div");
    header.style.cssText = "display:flex;justify-content:space-between;gap:16px;align-items:flex-start;flex-wrap:wrap;";
    const titles = document.createElement("div");
    const title = this.createTitle("ARENA FORGE");
    title.style.textAlign = "left";
    title.style.margin = "0 0 6px 0";
    titles.appendChild(title);
    this.sourceBadge = document.createElement("div");
    this.sourceBadge.style.cssText = `
      font-size: 12px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: ${THEME.muted};
    `;
    titles.appendChild(this.sourceBadge);
    header.appendChild(titles);
    const back = this.createButton("Back", false);
    back.style.width = "auto";
    back.style.margin = "0";
    back.style.padding = "10px 18px";
    back.onclick = () => this.onBack();
    header.appendChild(back);
    this.workbench.appendChild(header);

    const intro = document.createElement("p");
    intro.textContent =
      "Bounded AI level designer inside CyberRunner. It edits real map structures, checks geometry and routes, runs a seeded scripted playtest, then launches the result in the real game.";
    intro.style.cssText = mutedBlock();
    this.workbench.appendChild(intro);

    this.briefEl = document.createElement("div");
    this.briefEl.style.cssText = `
      color: ${THEME.paper};
      font-size: 15px;
      line-height: 1.45;
      margin: 0 0 16px 0;
    `;
    this.workbench.appendChild(this.briefEl);

    this.activity = document.createElement("div");
    this.activity.style.cssText = `color: ${THEME.muted}; font-size: 13px; margin-bottom: 8px;`;
    this.workbench.appendChild(this.activity);

    this.storyEl = document.createElement("div");
    this.storyEl.style.cssText = `color: ${THEME.paper}; font-size: 13px; line-height: 1.45; margin: 0 0 12px 0;`;
    this.workbench.appendChild(this.storyEl);

    this.showcaseHost = document.createElement("div");
    this.showcaseHost.style.cssText = `
      width: 100%;
      height: min(46vh, 420px);
      min-height: 220px;
      border: 1px solid ${THEME.panelBorder};
      border-radius: 3px;
      overflow: hidden;
      background: ${THEME.ink};
    `;
    this.workbench.appendChild(this.showcaseHost);

    this.revisionRow = document.createElement("div");
    this.revisionRow.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:12px 0 8px 0;";
    this.workbench.appendChild(this.revisionRow);
    this.revisionLabel = document.createElement("div");
    this.revisionLabel.style.cssText = `color:${THEME.muted};font-size:12px;letter-spacing:0.06em;text-transform:uppercase;`;
    this.workbench.appendChild(this.revisionLabel);

    const timeHead = sectionLabel("Agent run");
    this.workbench.appendChild(timeHead);
    this.timeline = document.createElement("div");
    this.timeline.style.cssText = `
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 8px;
      margin-bottom: 16px;
    `;
    this.workbench.appendChild(this.timeline);

    const split = document.createElement("div");
    split.className = "forge-split";
    split.style.cssText = `
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: 12px;
      margin-bottom: 16px;
    `;
    const responsive = document.createElement("style");
    responsive.textContent = `
      @media (max-width: 860px) {
        .forge-split { grid-template-columns: 1fr !important; }
      }
    `;
    this.workbench.appendChild(responsive);
    const left = document.createElement("div");
    const tacLabel = sectionLabel("Tactical map");
    tacLabel.style.marginTop = "0";
    left.appendChild(tacLabel);
    const tacNote = document.createElement("div");
    tacNote.textContent = "Scripted playtest · offline navigation proxy";
    tacNote.style.cssText = `color:${THEME.muted};font-size:12px;margin-bottom:8px;`;
    left.appendChild(tacNote);
    this.tacticalHost = document.createElement("div");
    this.tacticalHost.style.cssText = `
      height: 280px;
      border: 1px solid ${THEME.panelBorder};
      border-radius: 3px;
      overflow: hidden;
    `;
    this.tacticalHost.appendChild(this.tactical.canvas);
    left.appendChild(this.tacticalHost);
    const replayHint = document.createElement("div");
    replayHint.textContent = "Representative scripted rollout. Offline navigation proxy — not live players.";
    replayHint.style.cssText = `color:${THEME.muted};font-size:12px;margin-top:8px;`;
    left.appendChild(replayHint);
    const replayBtn = document.createElement("button");
    replayBtn.textContent = "Pause rollout";
    replayBtn.style.cssText = secondaryBtn();
    replayBtn.onclick = () => {
      this.replayPlaying = !this.replayPlaying;
      replayBtn.textContent = this.replayPlaying ? "Pause rollout" : "Play rollout";
    };
    left.appendChild(replayBtn);

    const right = document.createElement("div");
    const evLabel = sectionLabel("Evidence");
    evLabel.style.marginTop = "0";
    right.appendChild(evLabel);
    this.evidence = document.createElement("div");
    right.appendChild(this.evidence);
    split.appendChild(left);
    split.appendChild(right);
    this.workbench.appendChild(split);

    const playNote = document.createElement("div");
    playNote.textContent = "Opens the selected map in the real CyberRunner Search & Destroy runtime.";
    playNote.style.cssText = `color:${THEME.muted};font-size:13px;margin-bottom:8px;`;
    this.workbench.appendChild(playNote);
    this.playRow = document.createElement("div");
    this.playRow.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;";
    this.workbench.appendChild(this.playRow);

    this.liveBox = document.createElement("div");
    this.liveBox.style.cssText = "margin-top: 20px;";
    this.liveBox.appendChild(this.liveDesignBlock());
    this.workbench.appendChild(this.liveBox);

    const fixtures = document.createElement("details");
    fixtures.style.marginTop = "12px";
    const fixSum = document.createElement("summary");
    fixSum.textContent = "Evaluation fixtures";
    fixSum.style.cssText = summaryCss();
    fixtures.appendChild(fixSum);
    const fixHint = document.createElement("p");
    fixHint.textContent = "P4-A and P4-B start fixtures, plus any local recorded eval runs.";
    fixHint.style.cssText = mutedBlock();
    fixtures.appendChild(fixHint);
    const evalNote = document.createElement("div");
    evalNote.style.cssText = `color:${THEME.muted};font-size:12px;line-height:1.5;margin-bottom:8px;`;
    evalNote.textContent =
      "Basic repair: one-shot 100%, agent 100%. Interaction stress: one-shot 88.9%, agent 86.1%. Iteration was not universally better.";
    fixtures.appendChild(evalNote);
    this.inspectList = document.createElement("div");
    this.inspectList.style.cssText = "display:flex;flex-direction:column;gap:8px;";
    fixtures.appendChild(this.inspectList);
    this.workbench.appendChild(fixtures);

    this.errorDiv = this.createError();
    this.workbench.appendChild(this.errorDiv);

    this.container.appendChild(this.workbench);
  }

  private liveDesignBlock(): HTMLDetailsElement {
    const details = document.createElement("details");
    const sum = document.createElement("summary");
    sum.textContent = "Run your own design";
    sum.style.cssText = summaryCss();
    details.appendChild(sum);

    this.mapSelect = this.createSelect([{ value: "map-contract-smoke", label: "map-contract-smoke" }]);
    details.appendChild(this.createLabel("Starting map"));
    details.appendChild(this.mapSelect);

    details.appendChild(this.createLabel("Design brief"));
    this.briefInput = document.createElement("textarea");
    this.briefInput.maxLength = BRIEF_MAX;
    this.briefInput.rows = 3;
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
    details.appendChild(this.briefInput);

    this.runBtn = this.createButton("Run ArenaForge", true);
    this.runBtn.onclick = () => void this.startLive();
    details.appendChild(this.runBtn);

    this.liveHint = document.createElement("div");
    this.liveHint.style.cssText = mutedBlock();
    details.appendChild(this.liveHint);
    return details;
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
    this.showcase.attach(this.showcaseHost);
    this.renderCapability();
    this.renderView();
    try {
      const cap = await api.forgeCapability();
      this.liveAvailable = cap.liveAgentAvailable;
    } catch {
      this.liveAvailable = false;
    }
    this.renderCapability();
    if (!this.loadedOnce || !this.view) {
      await this.loadRecorded();
      this.loadedOnce = true;
    } else {
      this.renderView();
      this.syncShowcase();
    }
    this.showcase.start();
    this.startReplayClock();
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
    this.stopReplayClock();
    this.showcase.dispose();
  }

  private renderCapability(): void {
    this.runBtn.disabled = !this.liveAvailable || this.busy;
    this.runBtn.style.opacity = this.runBtn.disabled ? "0.55" : "1";
    this.runBtn.style.cursor = this.runBtn.disabled ? "default" : "pointer";
    this.liveHint.textContent = this.liveAvailable
      ? "Live design uses the frozen P5 agent on the server. One job at a time."
      : "Live design is disabled on this server. The recorded run above uses the same P5 agent.";
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
        revisionMaps: [],
      };
      this.selectedTurn = 0;
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
        if (next.turns.length) this.selectedTurn = next.turns.length - 1;
        this.renderView();
        this.syncShowcase();
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
      this.selectedTurn = Math.max(0, (this.view.turns.length || 1) - 1);
      this.renderView();
      this.syncShowcase();
    } catch (err) {
      this.errorDiv.textContent = err instanceof Error ? err.message : "Failed to load recorded demo";
    }
  }

  private currentTurn(): ForgeDesignTurn | undefined {
    return this.view?.turns[this.selectedTurn];
  }

  private currentRevision(): number {
    const view = this.view;
    if (!view) return 0;
    const turn = this.currentTurn();
    if (turn) return turn.mapRevision;
    return view.finalMapRevision;
  }

  private currentMap(): ForgePublicMapView | undefined {
    const maps = this.view?.revisionMaps ?? [];
    if (maps.length === 0) return undefined;
    const rev = Math.max(0, Math.min(this.currentRevision(), maps.length - 1));
    return maps[rev];
  }

  private renderView(): void {
    const view = this.view;
    if (!view) {
      this.sourceBadge.textContent = "";
      this.activity.textContent = "";
      this.briefEl.textContent = "";
      this.storyEl.textContent = "";
      this.timeline.replaceChildren();
      this.evidence.replaceChildren();
      this.playRow.replaceChildren();
      this.revisionRow.replaceChildren();
      return;
    }

    this.sourceBadge.textContent = view.source === "recorded" ? "Recorded agent run" : "Live agent run";
    this.sourceBadge.style.color = view.source === "live" ? THEME.accent : THEME.muted;
    this.briefEl.textContent = `Brief: ${view.brief}`;
    this.activity.textContent = forgeActivityText(view);
    this.storyEl.textContent = recordedStoryLine(view) ?? "";
    if (view.status === "failed" && view.error) this.errorDiv.textContent = view.error;

    this.revisionRow.replaceChildren();
    const original = chipButton("Original");
    const result = chipButton("Result");
    original.onclick = () => this.selectRevision(0);
    result.onclick = () => this.selectRevision(view.finalMapRevision);
    this.revisionRow.appendChild(original);
    for (let i = 1; i < view.finalMapRevision; i++) {
      const mid = chipButton(`Revision ${i}`);
      mid.onclick = () => this.selectRevision(i);
      this.revisionRow.appendChild(mid);
    }
    this.revisionRow.appendChild(result);
    this.revisionLabel.textContent = revisionCaption(this.currentRevision(), view.finalMapRevision);

    this.timeline.replaceChildren();
    view.turns.forEach((turn, index) => {
      const card = document.createElement("button");
      card.type = "button";
      const selected = index === this.selectedTurn;
      card.style.cssText = `
        text-align: left;
        border: 1px solid ${selected ? THEME.accent : THEME.panelBorder};
        background: ${selected ? THEME.accentDim : "transparent"};
        border-radius: 3px;
        padding: 10px 12px;
        white-space: pre-wrap;
        font-size: 13px;
        line-height: 1.45;
        color: ${THEME.paper};
        cursor: pointer;
      `;
      card.textContent = `Turn ${turn.turn}\n${formatTurnCard(turn)}`;
      card.onclick = () => {
        this.selectedTurn = index;
        this.replayProgress = 0;
        this.renderView();
        this.syncShowcase();
      };
      this.timeline.appendChild(card);
    });

    this.evidence.replaceChildren();
    const turn = this.currentTurn();
    if (turn?.playtest) {
      this.evidence.appendChild(metricCard("Selected playtest", formatPlaytestLines(turn.playtest).join("\n")));
    } else if (view.lastPlaytest) {
      this.evidence.appendChild(metricCard("Last observed playtest", formatPlaytestLines(view.lastPlaytest).join("\n")));
    }
    this.evidence.appendChild(this.p0Cards(view));

    this.playRow.replaceChildren();
    const playOriginal = this.createButton("Play Original", false);
    playOriginal.style.flex = "1";
    playOriginal.onclick = () => this.playMap(view.playOriginalId);
    this.playRow.appendChild(playOriginal);
    if (view.playResultId && (view.status === "completed" || view.source === "recorded")) {
      const playResult = this.createButton("Play Result", true);
      playResult.style.flex = "1";
      playResult.onclick = () => this.playMap(view.playResultId!);
      this.playRow.appendChild(playResult);
    }

    this.drawTactical();
  }

  private selectRevision(revision: number): void {
    const view = this.view;
    if (!view) return;
    const match = view.turns.findIndex((t) => t.mapRevision === revision);
    this.selectedTurn = match >= 0 ? match : 0;
    if (revision === view.finalMapRevision && view.turns.length) {
      this.selectedTurn = view.turns.length - 1;
    }
    this.replayProgress = 0;
    this.renderView();
    this.syncShowcase();
  }

  private syncShowcase(): void {
    const map = this.currentMap();
    if (!map || !this.showcaseHost.isConnected) return;
    if (!this.visible) return;
    const view = this.view;
    const baseline = view?.revisionMaps?.[0];
    const turn = this.currentTurn();
    const highlightId = turn?.target;
    const highlightSolid = highlightId ? map.solids.find((s) => s.id === highlightId) : undefined;
    const changed =
      highlightSolid ??
      (baseline
        ? map.solids.find((s) => {
            const prev = baseline.solids.find((p) => p.id === s.id);
            return !prev || prev.hx !== s.hx || prev.hz !== s.hz || prev.x !== s.x;
          })
        : undefined);
    this.showcase.setMap(
      map,
      changed && this.currentRevision() > 0
        ? { x: changed.x, y: changed.y, z: changed.z, hx: changed.hx, hy: changed.hy, hz: changed.hz }
        : undefined,
    );
    this.drawTactical();
  }

  private drawTactical(): void {
    const map = this.currentMap();
    const view = this.view;
    if (!map || !view) return;
    const baseline = view.revisionMaps?.[0];
    const turn = this.currentTurn();
    const replay = view.revisionReplays?.[this.currentRevision()];
    this.tactical.setState({
      map,
      diff: baseline ? diffArenaMapViews(baseline, map) : undefined,
      hotspot: turn?.playtest?.firstContact.hotspot,
      replay,
      replayProgress: this.replayProgress,
    });
  }

  private startReplayClock(): void {
    this.stopReplayClock();
    this.replayId = setInterval(() => {
      if (!this.replayPlaying) return;
      this.replayProgress = (this.replayProgress + 0.02) % 1;
      this.drawTactical();
    }, 80);
  }

  private stopReplayClock(): void {
    if (this.replayId !== null) {
      clearInterval(this.replayId);
      this.replayId = null;
    }
  }

  private p0Cards(view: ForgeDesignView): HTMLDivElement {
    const wrap = document.createElement("div");
    wrap.style.cssText = "margin: 8px 0;";
    wrap.appendChild(metricCard("Static checks", formatP0Line(view.initialP0) + medianLine(view.initialP0)));
    if (view.finalP0) {
      wrap.appendChild(metricCard("After edits", formatP0Line(view.finalP0) + medianLine(view.finalP0)));
    }
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

function summaryCss(): string {
  return `
    cursor: pointer;
    color: ${THEME.paper};
    font-size: 14px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    margin-bottom: 8px;
  `;
}

function secondaryBtn(): string {
  return `
    margin-top: 8px;
    padding: 8px 12px;
    border: 1px solid ${THEME.panelBorder};
    background: transparent;
    color: ${THEME.paper};
    cursor: pointer;
    border-radius: 3px;
    font-size: 12px;
  `;
}

function chipButton(text: string): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = text;
  btn.style.cssText = `
    padding: 8px 14px;
    border: 1px solid ${THEME.panelBorder};
    background: transparent;
    color: ${THEME.paper};
    cursor: pointer;
    border-radius: 3px;
    font-size: 12px;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  `;
  return btn;
}

function medianLine(p0: ForgeP0Summary): string {
  const parts = [
    p0.ghostAMedian !== undefined ? `Ghost A ${p0.ghostAMedian}` : "",
    p0.ghostBMedian !== undefined ? `Ghost B ${p0.ghostBMedian}` : "",
  ].filter(Boolean);
  return parts.length ? `\nMedians: ${parts.join("  ")}` : "";
}

function metricCard(title: string, body: string): HTMLDivElement {
  const card = document.createElement("div");
  card.style.cssText = `
    border: 1px solid ${THEME.panelBorder};
    border-radius: 3px;
    padding: 10px 12px;
    margin-bottom: 8px;
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
