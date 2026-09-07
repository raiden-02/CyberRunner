import { diffArenaMapViews } from "@shared/world/arena-map-view.js";
import {
  DEFAULT_SND_BRIEF,
  sampleBriefForMode,
  type ArenaGameMode,
} from "@shared/world/arena-design-spec.js";
import {
  LIVE_DOCS_HREF,
  liveCostCopy,
  liveDisabledCopy,
  liveLocalLinkLabel,
  liveProviderLine,
  liveRunBadge,
} from "@shared/ui/forge-live-copy.js";
import { ArenaSetupEditor } from "../ArenaSetupEditor.js";
import {
  api,
  type ForgeCatalogEntry,
  type ForgeDesignTurn,
  type ForgeDesignView,
  type ForgeP0Summary,
  type ForgePlaytestSummary,
  type ForgePublicMapView,
} from "../../api/client.js";
import { THEME } from "../../theme.js";
import { MapShowcase } from "../../world/MapShowcase.js";
import {
  formatP0Line,
  formatTurnCard,
  forgeActivityText,
  recordedStoryLine,
  revisionCaption,
} from "../forge-workbench.js";
import { TacticalMap } from "../TacticalMap.js";
import { fillDesignPlan, setUntrustedText } from "@shared/ui/untrusted-text.js";
import { BaseScreen } from "./BaseScreen.js";
import type { PlayAction } from "./LobbyScreen.js";

const BRIEF_MAX = 800;
const POLL_MS = 800;

export class ForgeScreen extends BaseScreen {
  private onPlay: (action: PlayAction) => void = () => {};
  private onBack: () => void = () => {};
  private liveAvailable = false;
  private liveRequiresSignIn = true;
  private liveAccessMode: "hosted" | "self_host" = "hosted";
  private remainingRunsToday: number | undefined;
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
  private liveForm!: HTMLDivElement;
  private liveDisabled!: HTMLDivElement;
  private liveProviderEl!: HTMLDivElement;
  private mapSelect!: HTMLSelectElement;
  private briefInput!: HTMLTextAreaElement;
  private runBtn!: HTMLButtonElement;
  private liveHint!: HTMLDivElement;
  private liveProvider?: string;
  private liveModel?: string;
  private inspectList!: HTMLDivElement;
  private fixturesEl!: HTMLDetailsElement;
  private playNote!: HTMLDivElement;
  private errorDiv!: HTMLDivElement;
  private tab = "design" as "recorded" | "design";
  private introEl!: HTMLParagraphElement;
  private timelineHead!: HTMLDivElement;
  private tacNote!: HTMLDivElement;
  private replayHint!: HTMLDivElement;
  private replayBtn!: HTMLButtonElement;
  private saveModal!: HTMLDivElement;
  private saveNameInput!: HTMLInputElement;
  private saveStatus!: HTMLDivElement;
  private setup = new ArenaSetupEditor();
  private setupHost!: HTMLDivElement;
  private setupIssues!: HTMLDivElement;
  private planEl!: HTMLDivElement;
  private saveRow!: HTMLDivElement;
  private signedIn = false;
  private briefEdited = false;
  private savedMapByJob = new Map<string, string>();
  private productView: ForgeDesignView | null = null;

  private showcase = new MapShowcase();
  private tactical = new TacticalMap();

  constructor() {
    super("forge-screen", true);
    this.container.style.overflow = "auto";
    this.buildUI();
  }

  private buildUI(): void {
    this.workbench = document.createElement("div");
    this.workbench.className = "cr-panel cr-forge";

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

    const tabs = document.createElement("div");
    tabs.className = "cr-row";
    tabs.style.margin = "12px 0";
    const designTab = this.createButton("New Design", true);
    const recordedTab = this.createButton("Recorded Run", false);
    designTab.onclick = () => this.setTab("design");
    recordedTab.onclick = () => this.setTab("recorded");
    tabs.append(designTab, recordedTab);
    this.workbench.appendChild(tabs);

    this.setupHost = document.createElement("div");
    this.setupHost.style.display = "none";
    this.setupHost.appendChild(this.buildSetupPanel());
    this.workbench.appendChild(this.setupHost);

    this.introEl = document.createElement("p");
    this.introEl.textContent =
      "Draw an arena, place starts, and generate. Playing walks the map. Save Map is the only way into Your Maps.";
    this.introEl.style.cssText = mutedBlock();
    this.workbench.appendChild(this.introEl);

    this.briefEl = document.createElement("div");
    this.briefEl.style.cssText = `
      color: ${THEME.paper};
      font-size: 15px;
      line-height: 1.45;
      margin: 0 0 16px 0;
    `;
    this.workbench.appendChild(this.briefEl);

    this.planEl = document.createElement("div");
    this.planEl.style.cssText = `
      display:none;border:1px solid var(--cr-border);padding:12px 14px;margin:0 0 16px 0;
    `;
    this.workbench.appendChild(this.planEl);

    this.activity = document.createElement("div");
    this.activity.style.cssText = `color: ${THEME.muted}; font-size: 13px; margin-bottom: 8px;`;
    this.workbench.appendChild(this.activity);

    this.storyEl = document.createElement("div");
    this.storyEl.style.cssText = `color: ${THEME.paper}; font-size: 13px; line-height: 1.45; margin: 0 0 12px 0;`;
    this.workbench.appendChild(this.storyEl);

    this.showcaseHost = document.createElement("div");
    this.showcaseHost.className = "cr-forge__showcase";
    this.workbench.appendChild(this.showcaseHost);

    this.revisionRow = document.createElement("div");
    this.revisionRow.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:12px 0 8px 0;";
    this.workbench.appendChild(this.revisionRow);
    this.revisionLabel = document.createElement("div");
    this.revisionLabel.style.cssText = `color:${THEME.muted};font-size:12px;letter-spacing:0.06em;text-transform:uppercase;`;
    this.workbench.appendChild(this.revisionLabel);

    this.timelineHead = sectionLabel("Design edits");
    this.workbench.appendChild(this.timelineHead);
    this.timeline = document.createElement("div");
    this.timeline.className = "cr-forge__timeline";
    this.workbench.appendChild(this.timeline);

    const split = document.createElement("div");
    split.className = "cr-forge__split";
    const left = document.createElement("div");
    const tacLabel = sectionLabel("Tactical map");
    tacLabel.style.marginTop = "0";
    left.appendChild(tacLabel);
    this.tacNote = document.createElement("div");
    this.tacNote.textContent = "Scripted playtest";
    this.tacNote.style.cssText = `color:${THEME.muted};font-size:12px;margin-bottom:8px;`;
    left.appendChild(this.tacNote);
    this.tacticalHost = document.createElement("div");
    this.tacticalHost.style.cssText = "height:280px;overflow:hidden;border:1px solid var(--cr-border);";
    this.tacticalHost.appendChild(this.tactical.canvas);
    left.appendChild(this.tacticalHost);
    this.replayHint = document.createElement("div");
    this.replayHint.textContent = "Offline navigation proxy. Not live players.";
    this.replayHint.style.cssText = `color:${THEME.muted};font-size:12px;margin-top:8px;`;
    left.appendChild(this.replayHint);
    this.replayBtn = document.createElement("button");
    this.replayBtn.textContent = "Pause rollout";
    this.replayBtn.className = "cr-button cr-button--ghost";
    this.replayBtn.onclick = () => {
      this.replayPlaying = !this.replayPlaying;
      this.replayBtn.textContent = this.replayPlaying ? "Pause rollout" : "Play rollout";
    };
    left.appendChild(this.replayBtn);

    const right = document.createElement("div");
    const evLabel = sectionLabel("Evidence");
    evLabel.style.marginTop = "0";
    right.appendChild(evLabel);
    this.evidence = document.createElement("div");
    right.appendChild(this.evidence);
    split.appendChild(left);
    split.appendChild(right);
    this.workbench.appendChild(split);

    this.playNote = document.createElement("div");
    this.playNote.textContent = "Walk the map without starting a match. Save Map is the only persist action.";
    this.playNote.style.cssText = `color:${THEME.muted};font-size:13px;margin-bottom:8px;`;
    this.workbench.appendChild(this.playNote);
    this.playRow = document.createElement("div");
    this.playRow.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;";
    this.workbench.appendChild(this.playRow);
    this.saveRow = document.createElement("div");
    this.saveRow.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;";
    this.workbench.appendChild(this.saveRow);

    this.liveBox = document.createElement("div");
    this.liveBox.style.display = "none";
    this.liveBox.appendChild(this.liveDesignBlock());
    this.workbench.appendChild(this.liveBox);

    this.fixturesEl = document.createElement("details");
    this.fixturesEl.style.marginTop = "12px";
    const fixSum = document.createElement("summary");
    fixSum.textContent = "Evaluation fixtures";
    fixSum.style.cssText = summaryCss();
    this.fixturesEl.appendChild(fixSum);
    const fixHint = document.createElement("p");
    fixHint.textContent = "Starting maps used for evaluation cases.";
    fixHint.style.cssText = mutedBlock();
    this.fixturesEl.appendChild(fixHint);
    const evalNote = document.createElement("div");
    evalNote.style.cssText = `color:${THEME.muted};font-size:12px;line-height:1.5;margin-bottom:8px;`;
    evalNote.textContent =
      "Inspection maps for the recorded evaluation cases.";
    this.fixturesEl.appendChild(evalNote);
    this.inspectList = document.createElement("div");
    this.inspectList.style.cssText = "display:flex;flex-direction:column;gap:8px;";
    this.fixturesEl.appendChild(this.inspectList);
    this.workbench.appendChild(this.fixturesEl);

    this.errorDiv = this.createError();
    this.workbench.appendChild(this.errorDiv);
    this.saveModal = this.buildSaveModal();
    this.workbench.appendChild(this.saveModal);

    this.container.appendChild(this.workbench);
  }

  private buildSaveModal(): HTMLDivElement {
    const overlay = document.createElement("div");
    overlay.style.cssText =
      "display:none;position:fixed;inset:0;z-index:20;background:rgba(7,9,13,0.72);align-items:center;justify-content:center;";
    const panel = document.createElement("div");
    panel.className = "cr-panel";
    panel.style.cssText = "width:min(420px,92vw);";
    const title = document.createElement("div");
    title.className = "cr-title cr-title--left";
    title.textContent = "SAVE MAP";
    const nameLabel = this.createLabel("Name");
    this.saveNameInput = this.createInput("Neon Crossfire");
    this.saveNameInput.maxLength = 40;
    const modeHint = document.createElement("div");
    modeHint.className = "cr-copy cr-copy--left";
    modeHint.textContent = "Search & Destroy or Deathmatch is taken from the design.";
    const row = document.createElement("div");
    row.className = "cr-row";
    row.style.marginTop = "12px";
    const cancel = this.createButton("Cancel", false);
    const save = this.createButton("Save", true);
    cancel.onclick = () => {
      overlay.style.display = "none";
    };
    save.onclick = () => void this.commitSave();
    row.append(cancel, save);
    this.saveStatus = document.createElement("div");
    this.saveStatus.style.cssText = `color:${THEME.muted};font-size:13px;margin-top:8px;`;
    panel.append(title, nameLabel, this.saveNameInput, modeHint, row, this.saveStatus);
    overlay.appendChild(panel);
    overlay.addEventListener("click", (ev) => {
      if (ev.target === overlay) overlay.style.display = "none";
    });
    return overlay;
  }

  private buildSetupPanel(): HTMLDivElement {
    const wrap = document.createElement("div");
    wrap.style.cssText = "display:grid;grid-template-columns:minmax(0,1fr) 280px;gap:16px;margin:0 0 20px 0;";
    const canvasHost = document.createElement("div");
    canvasHost.style.cssText = "height:min(52vh,420px);min-height:260px;border:1px solid var(--cr-border);background:#05070b;";
    canvasHost.appendChild(this.setup.canvas);
    const side = document.createElement("div");
    side.appendChild(this.createLabel("Mode"));
    const modes = document.createElement("div");
    modes.className = "cr-row";
    for (const mode of ["search_destroy", "deathmatch"] as const) {
      const btn = this.createButton(mode === "deathmatch" ? "Deathmatch" : "S&D", false);
      btn.onclick = () => {
        this.setup.setMode(mode);
        if (!this.briefEdited) {
          this.briefInput.value = sampleBriefForMode(mode);
          this.setup.setBrief(this.briefInput.value);
        }
        this.syncSetupTools();
        this.refreshSetupIssues();
      };
      modes.appendChild(btn);
    }
    side.appendChild(modes);
    side.appendChild(this.createLabel("Tools"));
    const tools = document.createElement("div");
    tools.id = "forge-setup-tools";
    tools.style.cssText = "display:flex;flex-direction:column;gap:6px;margin:0 0 12px 0;";
    side.appendChild(tools);
    const undo = this.createButton("Undo", false);
    undo.onclick = () => this.setup.undo();
    const del = this.createButton("Delete selected", false);
    del.onclick = () => this.setup.deleteSelected();
    const reset = this.createButton("Reset setup", false);
    reset.onclick = () => this.setup.reset();
    side.append(undo, del, reset);
    this.setupIssues = document.createElement("div");
    this.setupIssues.style.cssText = `color:${THEME.muted};font-size:13px;line-height:1.4;margin:10px 0;`;
    side.appendChild(this.setupIssues);
    side.appendChild(this.createLabel("Design brief"));
    this.briefInput = document.createElement("textarea");
    this.briefInput.maxLength = BRIEF_MAX;
    this.briefInput.rows = 5;
    this.briefInput.value = DEFAULT_SND_BRIEF;
    this.briefInput.className = "cr-field";
    this.briefInput.style.resize = "vertical";
    this.briefInput.oninput = () => {
      this.briefEdited = true;
      this.setup.setBrief(this.briefInput.value);
      this.refreshSetupIssues();
    };
    side.appendChild(this.briefInput);
    this.liveProviderEl = document.createElement("div");
    this.liveProviderEl.style.cssText = `color: ${THEME.paper}; font-size: 13px; margin: 10px 0 6px 0;`;
    side.appendChild(this.liveProviderEl);
    this.runBtn = this.createButton("Generate", true);
    this.runBtn.onclick = () => void this.startLive();
    side.appendChild(this.runBtn);
    this.liveHint = document.createElement("div");
    this.liveHint.style.cssText = mutedBlock();
    side.appendChild(this.liveHint);
    this.liveDisabled = document.createElement("div");
    const disabledCopy = document.createElement("p");
    disabledCopy.textContent = liveDisabledCopy();
    disabledCopy.style.cssText = mutedBlock();
    const localLink = document.createElement("a");
    localLink.href = LIVE_DOCS_HREF;
    localLink.target = "_blank";
    localLink.rel = "noreferrer";
    localLink.textContent = liveLocalLinkLabel();
    localLink.style.cssText = `color: ${THEME.accent}; font-size: 13px;`;
    this.liveDisabled.append(disabledCopy, localLink);
    side.appendChild(this.liveDisabled);
    wrap.append(canvasHost, side);
    this.setup.setOnChange(() => this.refreshSetupIssues());
    this.setup.setBrief(DEFAULT_SND_BRIEF);
    queueMicrotask(() => {
      this.syncSetupTools();
      this.refreshSetupIssues();
      this.setup.resize();
    });
    return wrap;
  }

  private syncSetupTools(): void {
    const host = this.setupHost.querySelector("#forge-setup-tools");
    if (!host) return;
    host.replaceChildren();
    const mode = this.setup.getState().mode;
    const tools = mode === "deathmatch"
      ? ([["envelope", "Envelope"], ["deathmatch", "Deathmatch Spawn"], ["select", "Select/Delete"]] as const)
      : ([["envelope", "Envelope"], ["ghost", "Ghost Start"], ["sentinel", "Sentinel Start"], ["select", "Select/Delete"]] as const);
    for (const [id, label] of tools) {
      const btn = this.createButton(label, this.setup.getTool() === id);
      btn.onclick = () => {
        this.setup.setTool(id);
        this.syncSetupTools();
      };
      host.appendChild(btn);
    }
  }

  private refreshSetupIssues(): void {
    this.setup.setBrief(this.briefInput?.value ?? this.setup.getState().brief);
    const issues = this.setup.issues();
    this.setupIssues.textContent = issues.length
      ? issues.map((i) => i.message).join(" ")
      : "Setup is ready. Generate starts the agent.";
  }

  private designPhase(): "setup" | "designing" | "result" | "recorded" {
    if (this.tab === "recorded") return "recorded";
    const view = this.view;
    if (!view || view.path !== "product") return "setup";
    if (view.status === "queued" || view.status === "running") return "designing";
    return "result";
  }

  private applyChrome(): void {
    const phase = this.designPhase();
    const recorded = phase === "recorded";
    const setup = phase === "setup";
    const designing = phase === "designing";
    const result = phase === "result";
    const view = this.view;
    const showPlaytest = recorded || (view?.mode === "search_destroy" && Boolean(view.lastPlaytest || this.currentTurn()?.playtest));

    this.setupHost.style.display = setup ? "block" : "none";
    this.fixturesEl.style.display = recorded ? "block" : "none";
    this.storyEl.style.display = recorded ? "block" : "none";
    this.introEl.style.display = setup || recorded ? "block" : "none";
    this.introEl.textContent = recorded
      ? "Recorded agent run. Frozen evaluation fixtures stay here."
      : "Draw an arena, place starts, and generate. Playing walks the map. Save Map is the only way into Your Maps.";
    this.timelineHead.textContent = recorded ? "Recorded agent run" : "Design edits";
    this.timelineHead.style.display = recorded || designing || result ? "block" : "none";
    this.timeline.style.display = recorded || designing || result ? "block" : "none";
    this.revisionRow.style.display = recorded || designing || result ? "flex" : "none";
    this.briefEl.style.display = recorded || designing || result ? "block" : "none";
    this.activity.style.display = recorded || designing || result ? "block" : "none";
    this.showcaseHost.style.display = recorded || designing || result ? "block" : "none";
    this.playNote.style.display = result || recorded ? "block" : "none";
    this.playRow.style.display = result || recorded ? "flex" : "none";
    this.saveRow.style.display = result && view?.path === "product" ? "flex" : "none";
    this.tacNote.style.display = showPlaytest ? "block" : "none";
    this.replayHint.style.display = showPlaytest ? "block" : "none";
    this.replayBtn.style.display = showPlaytest ? "inline-flex" : "none";
    if (setup) {
      this.setup.resize();
      this.refreshSetupIssues();
    }
  }

  private setTab(tab: "recorded" | "design"): void {
    this.tab = tab;
    if (tab === "recorded") {
      if (this.view?.path === "product") this.productView = this.view;
      void this.loadRecorded();
    } else if (this.productView) {
      this.view = this.productView;
    } else if (this.view?.source === "recorded") {
      this.view = null;
    }
    this.applyChrome();
    this.renderView();
    this.syncShowcase();
  }

  private liveDesignBlock(): HTMLDivElement {
    this.liveForm = document.createElement("div");
    this.mapSelect = this.createSelect([{ value: "blank-arena", label: "New design setup" }]);
    this.mapSelect.style.display = "none";
    this.liveForm.appendChild(this.mapSelect);
    return this.liveForm;
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
      this.liveAccessMode = cap.accessMode === "self_host" ? "self_host" : "hosted";
      this.liveRequiresSignIn = cap.requiresSignIn !== false;
      this.remainingRunsToday = cap.remainingRunsToday;
      this.liveProvider = cap.provider;
      this.liveModel = cap.model;
    } catch {
      this.liveAvailable = false;
    }
    try {
      const me = await api.getMe();
      this.signedIn = Boolean(me?.id && !me.id.startsWith("guest-"));
    } catch {
      this.signedIn = false;
    }
    this.renderCapability();
    if (this.tab === "recorded" && (!this.view || this.view.path === "product")) {
      await this.loadRecorded();
    }
    this.loadedOnce = true;
    this.applyChrome();
    this.renderView();
    this.syncShowcase();
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
    const quotaGone = this.remainingRunsToday === 0;
    const needsSignIn =
      this.liveRequiresSignIn && this.remainingRunsToday === undefined && this.liveAvailable;
    this.liveDisabled.style.display = this.liveAvailable ? "none" : "block";
    this.liveForm.style.display = this.liveAvailable ? "block" : "none";
    this.liveProviderEl.textContent = liveProviderLine(this.liveProvider, this.liveModel);
    this.runBtn.disabled = !this.liveAvailable || this.busy || quotaGone || needsSignIn;
    this.runBtn.style.opacity = this.runBtn.disabled ? "0.55" : "1";
    this.runBtn.style.cursor = this.runBtn.disabled ? "default" : "pointer";
    if (!this.liveAvailable) {
      this.liveHint.textContent = "";
      return;
    }
    if (needsSignIn) {
      this.liveHint.textContent = "Sign in to run live design.";
      return;
    }
    if (quotaGone) {
      this.liveHint.textContent = "No live runs left today.";
      return;
    }
    this.liveHint.textContent = this.liveRequiresSignIn
      ? `${liveCostCopy()} Sign in required.`
      : liveCostCopy();
  }

  private async startLive(): Promise<void> {
    if (!this.liveAvailable || this.busy) return;
    this.errorDiv.textContent = "";
    this.setup.setBrief(this.briefInput.value);
    const spec = this.setup.toSpec();
    if (!spec) {
      this.refreshSetupIssues();
      this.errorDiv.textContent = this.setup.issues()[0]?.message ?? "Finish the setup first.";
      this.setTab("design");
      return;
    }
    this.busy = true;
    this.renderCapability();
    try {
      const { jobId } = await api.startForgeDesign(spec);
      this.view = {
        jobId,
        status: "queued",
        source: "live",
        startingMapId: "blank-arena",
        path: "product",
        mode: spec.mode,
        brief: spec.brief,
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
      this.productView = this.view;
      this.applyChrome();
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
        if (next.path === "product") this.productView = next;
        if (next.turns.length) this.selectedTurn = next.turns.length - 1;
        this.renderView();
        this.syncShowcase();
        if (next.status === "completed" || next.status === "failed") {
          this.stopPoll();
          this.busy = false;
          this.renderCapability();
          this.applyChrome();
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

    this.sourceBadge.textContent =
      this.tab === "recorded" || view.source === "recorded"
        ? "Recorded agent run"
        : liveRunBadge(view.provider, view.model ?? view.modelRequested);
    this.sourceBadge.style.color = view.source === "live" ? THEME.accent : THEME.muted;
    this.briefEl.textContent = `Brief: ${view.brief}`;
    this.activity.textContent = forgeActivityText(view);
    this.storyEl.textContent = this.tab === "recorded" ? recordedStoryLine(view) ?? "" : "";
    if (view.status === "failed" && view.error) this.errorDiv.textContent = view.error;

    this.revisionRow.replaceChildren();
    const currentRev = this.currentRevision();
    const original = chipButton("Original");
    const result = chipButton("Result");
    original.classList.toggle("is-selected", currentRev <= 0);
    result.classList.toggle("is-selected", currentRev >= view.finalMapRevision && view.finalMapRevision > 0);
    original.onclick = () => this.selectRevision(0);
    result.onclick = () => this.selectRevision(view.finalMapRevision);
    this.revisionRow.appendChild(original);
    for (let i = 1; i < view.finalMapRevision; i++) {
      const mid = chipButton(`Revision ${i}`);
      mid.classList.toggle("is-selected", currentRev === i);
      mid.onclick = () => this.selectRevision(i);
      this.revisionRow.appendChild(mid);
    }
    this.revisionRow.appendChild(result);
    this.revisionLabel.textContent = revisionCaption(currentRev, view.finalMapRevision);

    this.timeline.replaceChildren();
    view.turns.forEach((turn, index) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = index === this.selectedTurn ? "cr-forge__turn is-selected" : "cr-forge__turn";
      card.textContent = formatTurnCard(turn);
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
    const playtest = turn?.playtest ?? view.lastPlaytest;
    if (playtest) {
      this.evidence.appendChild(playtestTiles(playtest));
    }
    this.evidence.appendChild(this.p0Cards(view));

    this.playRow.replaceChildren();
    const product = view.path === "product";
    if (product) {
      const playOriginal = this.createButton("Play Original", false);
      playOriginal.style.flex = "1";
      playOriginal.onclick = () => void this.playExplore("original");
      this.playRow.appendChild(playOriginal);
      if (view.status === "completed") {
        const playGenerated = this.createButton("Play Generated", true);
        playGenerated.style.flex = "1";
        playGenerated.onclick = () => void this.playExplore("generated");
        this.playRow.appendChild(playGenerated);
      }
    } else {
      const playOriginal = this.createButton("Play Original", false);
      playOriginal.style.flex = "1";
      playOriginal.onclick = () => void this.playCatalog(view.playOriginalId, view.mode);
      this.playRow.appendChild(playOriginal);
      if (view.playResultId && (view.status === "completed" || view.source === "recorded")) {
        const playResult = this.createButton("Play Result", true);
        playResult.style.flex = "1";
        playResult.onclick = () => void this.playCatalog(view.playResultId, view.mode);
        this.playRow.appendChild(playResult);
      }
    }

    this.saveRow.replaceChildren();
    if (product && view.status === "completed") {
      const already = this.savedMapByJob.has(view.jobId);
      const save = this.createButton(already ? "Saved" : "Save Map", !already);
      save.disabled = already;
      save.onclick = () => this.openSaveModal(view);
      this.saveRow.appendChild(save);
      const note = document.createElement("div");
      note.textContent = already
        ? this.signedIn
          ? "Saved to Your Maps"
          : "Saved to Your Maps for this session"
        : this.signedIn
          ? "Only Save Map writes Your Maps."
          : "Guests keep a saved map for this session.";
      note.style.cssText = `color:${THEME.muted};font-size:13px;`;
      this.saveRow.appendChild(note);
    }

    if (view.designPlan) {
      this.planEl.style.display = "block";
      fillDesignPlan(this.planEl, view.designPlan, (tag) => document.createElement(tag) as HTMLDivElement);
    } else {
      this.planEl.style.display = "none";
      this.planEl.replaceChildren();
    }
    this.applyChrome();

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
    this.showcase.setForgeView(
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

  private playMap(catalogId: string, mode?: ArenaGameMode): void {
    void this.playCatalog(catalogId, mode);
  }

  private defaultSaveName(view: ForgeDesignView): string {
    const fromPlan = view.designPlan?.summary?.trim() ?? "";
    if (fromPlan.length >= 2) return fromPlan.slice(0, 40);
    return "Forge Arena";
  }

  private async playCatalog(catalogId: string | undefined, mode?: ArenaGameMode): Promise<void> {
    if (!catalogId) return;
    this.errorDiv.textContent = "";
    this.onPlay({
      type: "create",
      gameMode: mode ?? "search_destroy",
      forgeMapId: catalogId,
    });
  }

  private async playExplore(which: "original" | "generated"): Promise<void> {
    const view = this.view;
    if (!view?.jobId) return;
    this.errorDiv.textContent = "";
    try {
      const launched = await api.exploreForgeDesign(view.jobId, which);
      this.onPlay({
        type: "create",
        gameMode: "explore",
        mapLaunchId: launched.launchId,
        returnTo: "forge",
      });
    } catch (err) {
      this.errorDiv.textContent = err instanceof Error ? err.message : "Could not explore this map.";
    }
  }

  private openSaveModal(view: ForgeDesignView): void {
    if (this.savedMapByJob.has(view.jobId)) {
      this.saveStatus.textContent = this.signedIn
        ? "Saved to Your Maps"
        : "Saved to Your Maps for this session";
      this.renderView();
      return;
    }
    this.saveNameInput.value = this.defaultSaveName(view);
    this.saveStatus.textContent = "";
    this.saveModal.style.display = "flex";
    this.saveNameInput.focus();
    this.saveNameInput.select();
  }

  private async commitSave(): Promise<void> {
    const view = this.view;
    if (!view?.jobId) return;
    if (this.savedMapByJob.has(view.jobId)) {
      this.saveModal.style.display = "none";
      this.renderView();
      return;
    }
    try {
      const saved = await api.saveMyMap(view.jobId, this.saveNameInput.value);
      this.savedMapByJob.set(view.jobId, saved.id);
      this.saveModal.style.display = "none";
      this.errorDiv.textContent = saved.sessionOnly
        ? "Saved to Your Maps for this session"
        : "Saved to Your Maps";
      this.renderView();
    } catch (err) {
      this.saveStatus.textContent = err instanceof Error ? err.message : "Save failed.";
    }
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
          ? "Evaluation cases"
          : entry.suite === "p4b"
            ? "More evaluation cases"
            : "Recorded runs";
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
      const title = document.createElement("div");
      title.style.fontWeight = "600";
      setUntrustedText(title, entry.title);
      const sub = document.createElement("div");
      sub.style.cssText = `color: ${THEME.muted}; font-size: 12px; margin-top: 4px;`;
      setUntrustedText(sub, publicCatalogSubtitle(entry));
      row.append(title, sub);
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

function publicCatalogSubtitle(entry: ForgeCatalogEntry): string {
  if (entry.suite === "p4a" || entry.suite === "p4b") return "Starting map";
  return entry.which === "final" ? "After edits" : "Before edits";
}

function chipButton(text: string): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "cr-chip";
  btn.textContent = text;
  return btn;
}

function playtestTiles(pt: ForgePlaytestSummary): HTMLDivElement {
  const row = document.createElement("div");
  row.className = "cr-forge__metrics";
  const tiles = [
    ["Ghost routes", `A ${pt.ghost.siteChoice.A} / B ${pt.ghost.siteChoice.B}`],
    ["Exposure", String(pt.ghost.meanRouteExposureFraction)],
    ["Concentration", String(pt.ghost.routeConcentration)],
    ["First contact", `${Math.round(pt.firstContact.occurrenceFraction * 100)}%`],
  ];
  for (const [label, value] of tiles) {
    const tile = document.createElement("div");
    tile.className = "cr-stat";
    const l = document.createElement("div");
    l.className = "cr-stat__label";
    l.textContent = label;
    const v = document.createElement("div");
    v.className = "cr-stat__value";
    v.textContent = value;
    tile.append(l, v);
    row.appendChild(tile);
  }
  return row;
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
