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
  revisionCaption,
} from "../forge-workbench.js";
import { TacticalMap } from "../TacticalMap.js";
import { fillDesignPlan } from "@shared/ui/untrusted-text.js";
import {
  evidenceForSelectedTurn,
  previousSnapshot,
  selectionAfterPoll,
  selectionAfterUserPick,
  selectionFollowLatest,
  shouldHighlightEdit,
  shouldShowReplay,
  shouldShowRoute,
  snapshotForTurn,
  turnIndexForRevision,
} from "@shared/ui/forge-viewer.js";
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
  private followLatest = true;
  private replayPlaying = true;
  private replayProgress = 0;
  private loadedOnce = false;

  private workbench!: HTMLDivElement;
  private briefEl!: HTMLDivElement;
  private sourceBadge!: HTMLDivElement;
  private activity!: HTMLDivElement;
  private showcaseHost!: HTMLDivElement;
  private revisionLabel!: HTMLDivElement;
  private revisionRow!: HTMLDivElement;
  private actionEl!: HTMLDivElement;
  private followBtn!: HTMLButtonElement;
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
    const recordedTab = this.createButton("Recorded Design", false);
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

    this.showcaseHost = document.createElement("div");
    this.showcaseHost.className = "cr-forge__showcase";
    this.workbench.appendChild(this.showcaseHost);

    this.revisionRow = document.createElement("div");
    this.revisionRow.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:12px 0 8px 0;";
    this.workbench.appendChild(this.revisionRow);
    this.revisionLabel = document.createElement("div");
    this.revisionLabel.style.cssText = `color:${THEME.muted};font-size:12px;letter-spacing:0.06em;text-transform:uppercase;`;
    this.workbench.appendChild(this.revisionLabel);
    this.actionEl = document.createElement("div");
    this.actionEl.style.cssText = `color:${THEME.paper};font-size:14px;line-height:1.4;margin:0 0 12px 0;`;
    this.workbench.appendChild(this.actionEl);
    this.followBtn = this.createButton("Follow latest", false);
    this.followBtn.style.display = "none";
    this.followBtn.style.width = "auto";
    this.followBtn.style.margin = "0 0 12px 0";
    this.followBtn.onclick = () => this.jumpToLatest();
    this.workbench.appendChild(this.followBtn);

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
    const showPlaytest = shouldShowReplay(this.currentTurn());

    this.setupHost.style.display = setup ? "block" : "none";
    this.introEl.style.display = setup || recorded ? "block" : "none";
    this.introEl.textContent = recorded
      ? "Recorded Design replays a native S&D run from a blank user-defined arena. No model key."
      : "Draw an arena, place starts, and generate. Playing walks the map. Save Map is the only way into Your Maps.";
    this.timelineHead.textContent = recorded ? "Recorded Design" : "Design edits";
    this.timelineHead.style.display = recorded || designing || result ? "block" : "none";
    this.timeline.style.display = recorded || designing || result ? "block" : "none";
    this.revisionRow.style.display = recorded || designing || result ? "flex" : "none";
    this.briefEl.style.display = recorded || designing || result ? "block" : "none";
    this.activity.style.display = recorded || designing || result ? "block" : "none";
    this.showcaseHost.style.display = recorded || designing || result ? "block" : "none";
    this.playNote.style.display = result || recorded ? "block" : "none";
    this.playRow.style.display = result || recorded ? "flex" : "none";
    this.saveRow.style.display =
      (result || (recorded && view?.path === "product")) && view?.status === "completed" && view.path === "product"
        ? "flex"
        : "none";
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
      this.followLatest = true;
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
        const nextSel = selectionAfterPoll(
          { selectedTurn: this.selectedTurn, followLatest: this.followLatest },
          next.turns.length,
        );
        this.selectedTurn = nextSel.selectedTurn;
        this.followLatest = nextSel.followLatest;
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
      this.view = await api.getRecordedDemo();
      this.selectedTurn = 0;
      this.followLatest = false;
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
    const view = this.view;
    if (!view?.revisionMaps?.length) return undefined;
    try {
      return snapshotForTurn({ ...view, revisionMaps: view.revisionMaps }, this.selectedTurn);
    } catch (err) {
      this.errorDiv.textContent = err instanceof Error ? err.message : "Invalid map revision.";
      return undefined;
    }
  }

  private renderView(): void {
    const view = this.view;
    if (!view) {
      this.sourceBadge.textContent = "";
      this.activity.textContent = "";
      this.briefEl.textContent = "";
      this.actionEl.textContent = "";
      this.timeline.replaceChildren();
      this.evidence.replaceChildren();
      this.playRow.replaceChildren();
      this.revisionRow.replaceChildren();
      return;
    }

    this.sourceBadge.textContent =
      this.tab === "recorded" || view.source === "recorded"
        ? "Recorded Design"
        : liveRunBadge(view.provider, view.model ?? view.modelRequested);
    this.sourceBadge.style.color = view.source === "live" ? THEME.accent : THEME.muted;
    this.briefEl.textContent = `Brief: ${view.brief}`;
    this.activity.textContent = forgeActivityText(view);
    const turn = this.currentTurn();
    this.actionEl.textContent = selectedActionText(turn);
    const liveRunning = view.source === "live" && (view.status === "queued" || view.status === "running");
    this.followBtn.style.display = liveRunning && !this.followLatest ? "inline-flex" : "none";
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
      card.textContent = formatTurnCard(turn, view.turns);
      card.onclick = () => this.pickTurn(index);
      this.timeline.appendChild(card);
    });

    this.evidence.replaceChildren();
    this.evidence.appendChild(this.stepEvidence(view));

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

  private pickTurn(index: number): void {
    const next = selectionAfterUserPick(index);
    this.selectedTurn = next.selectedTurn;
    this.followLatest = next.followLatest;
    this.replayProgress = 0;
    this.renderView();
    this.syncShowcase();
  }

  private jumpToLatest(): void {
    const next = selectionFollowLatest(this.view?.turns.length ?? 0);
    this.selectedTurn = next.selectedTurn;
    this.followLatest = next.followLatest;
    this.replayProgress = 0;
    this.renderView();
    this.syncShowcase();
  }

  private selectRevision(revision: number): void {
    const view = this.view;
    if (!view) return;
    this.pickTurn(turnIndexForRevision(view.turns, revision, view.finalMapRevision));
  }

  private syncShowcase(): void {
    const map = this.currentMap();
    if (!map || !this.showcaseHost.isConnected) return;
    if (!this.visible) return;
    const turn = this.currentTurn();
    const highlights = shouldHighlightEdit(turn)
      ? highlightBoxes(map, turn?.changedIds ?? (turn?.target ? [turn.target] : []))
      : [];
    this.showcase.setForgeView(map, highlights.length ? highlights : undefined);
    this.drawTactical();
  }

  private drawTactical(): void {
    const map = this.currentMap();
    const view = this.view;
    if (!map || !view) return;
    const turn = this.currentTurn();
    const revision = turn?.mapRevision ?? 0;
    const prev = view.revisionMaps ? previousSnapshot({ revisionMaps: view.revisionMaps }, revision) : undefined;
    const replay = shouldShowReplay(turn) ? view.revisionReplays?.[revision] : undefined;
    this.tactical.setState({
      map,
      diff: shouldHighlightEdit(turn) && prev ? diffArenaMapViews(prev, map) : undefined,
      hotspot: shouldShowReplay(turn) ? turn?.playtest?.firstContact.hotspot : undefined,
      replay,
      replayProgress: shouldShowReplay(turn) ? this.replayProgress : 0,
      route: shouldShowRoute(turn) ? turn?.route : undefined,
    });
  }

  private startReplayClock(): void {
    this.stopReplayClock();
    this.replayId = setInterval(() => {
      if (!this.replayPlaying || !shouldShowReplay(this.currentTurn())) return;
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

  private stepEvidence(view: ForgeDesignView): HTMLDivElement {
    const wrap = document.createElement("div");
    wrap.style.cssText = "margin: 8px 0;";
    const evidence = evidenceForSelectedTurn({ ...view, revisionMaps: view.revisionMaps ?? [] }, this.selectedTurn);
    const playtest = evidence.playtest as ForgePlaytestSummary | undefined;
    if (playtest) wrap.appendChild(playtestTiles(playtest));
    if (evidence.route) {
      const dist = evidence.route.distanceMeters !== undefined ? ` · ${evidence.route.distanceMeters} m` : "";
      wrap.appendChild(
        metricCard(
          "Route",
          `${evidence.route.fromId} → ${evidence.route.toId}\n${evidence.route.reachable ? "Reachable" : "Unreachable"}${dist}`,
        ),
      );
    }
    if (evidence.playtestNote) {
      wrap.appendChild(metricCard("Scripted playtest", evidence.playtestNote));
    }
    const p0 = evidence.p0 as ForgeP0Summary | undefined;
    if (p0 && evidence.p0Title) {
      wrap.appendChild(metricCard(evidence.p0Title, formatP0Line(p0) + medianLine(p0)));
    }
    return wrap;
  }

  private defaultSaveName(view: ForgeDesignView): string {
    if (view.source === "recorded" && view.path === "product") return "Recorded Crossfire Yard";
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

function selectedActionText(turn: ForgeDesignTurn | undefined): string {
  if (!turn) return "";
  if (turn.kind === "plan") return turn.intent ? `Plan: ${turn.intent}` : "Published the design plan.";
  if (turn.kind === "route" && turn.route) {
    return turn.intent ?? `Traced ${turn.route.fromId} to ${turn.route.toId}.`;
  }
  if (turn.kind === "playtest") return turn.intent ?? "Ran the scripted playtest.";
  if (turn.kind === "finish") return turn.finishSummary ?? "Finished the design.";
  if (turn.rejected) return turn.intent ? `Rejected: ${turn.intent}` : "This edit was rejected.";
  return turn.intent ?? `${turn.tool}${turn.target ? ` ${turn.target}` : ""}`;
}

function highlightBoxes(map: ForgePublicMapView, ids: string[]): Array<{ x: number; y: number; z: number; hx: number; hy: number; hz: number }> {
  const boxes: Array<{ x: number; y: number; z: number; hx: number; hy: number; hz: number }> = [];
  for (const id of ids) {
    const solid = map.solids.find((s) => s.id === id);
    if (solid) {
      boxes.push({ x: solid.x, y: solid.y, z: solid.z, hx: solid.hx, hy: solid.hy, hz: solid.hz });
      continue;
    }
    const obj = map.objectives.find((o) => o.id === id);
    if (obj) {
      boxes.push({ x: obj.x, y: obj.y, z: obj.z, hx: obj.radius, hy: 0.4, hz: obj.radius });
    }
  }
  return boxes;
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
