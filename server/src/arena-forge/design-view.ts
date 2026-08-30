import type { PublicArenaMapView } from "@shared/world/arena-map-view.js";
import type { ArenaEvaluation, ArenaMap } from "./types.js";
import type { ArenaPlaytestReport } from "./playtest.js";
import type { PlaytestAgentRunResult, PlaytestAgentTurnRecord } from "./playtest-agent.js";
import { publicRevisionMaps, revisionMapsFromTurns } from "./public-map.js";
import type { PlaytestReplay } from "./playtest-replay.js";
import { representativeReplay } from "./playtest-replay.js";
import { PLAYTEST_SEED } from "./playtest.js";

export const DESIGN_BRIEF_MAX = 800;
export const DESIGN_STARTING_MAPS = ["map-contract-smoke"] as const;
export type DesignStartingMapId = (typeof DESIGN_STARTING_MAPS)[number];

export type DesignJobStatus = "queued" | "running" | "completed" | "failed";
export type DesignSource = "live" | "recorded";

export type PublicP0Summary = {
  hardFailures: number;
  reachablePaths: number;
  totalPaths: number;
  ghostAMedian?: number;
  ghostBMedian?: number;
  sentinelAMedian?: number;
  sentinelBMedian?: number;
};

export type PublicPlaytestSummary = {
  seed: number;
  rollouts: number;
  ghost: ArenaPlaytestReport["ghost"];
  sentinel: ArenaPlaytestReport["sentinel"];
  firstContact: ArenaPlaytestReport["firstContact"];
  mapRevision: number;
};

export type PublicDesignTurn = {
  turn: number;
  kind: "edit" | "playtest" | "finish";
  tool: string;
  intent?: string;
  target?: string;
  rejected?: boolean;
  p0?: PublicP0Summary;
  playtest?: PublicPlaytestSummary;
  finishSummary?: string;
  mapRevision: number;
};

export type PublicDesignView = {
  jobId: string;
  status: DesignJobStatus;
  source: DesignSource;
  startingMapId: string;
  brief: string;
  error?: string;
  finishSummary?: string;
  turns: PublicDesignTurn[];
  editAttempts: number;
  successfulEdits: number;
  playtestCalls: number;
  modelCalls: number;
  totalTokens?: number;
  latencyMs?: number;
  modelRequested?: string;
  modelReturned?: string;
  initialP0: PublicP0Summary;
  finalP0?: PublicP0Summary;
  firstPlaytest?: PublicPlaytestSummary;
  lastPlaytest?: PublicPlaytestSummary;
  lastPlaytestMapRevision?: number;
  finalMapRevision: number;
  lastPlaytestIsOnFinalMap: boolean;
  playOriginalId: string;
  playResultId?: string;
  revisionMaps: PublicArenaMapView[];
  revisionReplays?: PlaytestReplay[];
  provider?: "openai" | "anthropic";
  model?: string;
};

export function isDesignStartingMap(id: string): id is DesignStartingMapId {
  return (DESIGN_STARTING_MAPS as readonly string[]).includes(id);
}

export function compactP0(ev: ArenaEvaluation): PublicP0Summary {
  const reachable = ev.navigation.paths.filter((p) => p.reachable).length;
  const median = (role: "ghost" | "sentinel", to: "objective-A" | "objective-B") =>
    ev.navigation.aggregates.find((a) => a.fromRole === role && a.to === to)?.medianMeters;
  return {
    hardFailures: ev.summary.hardFailureCount,
    reachablePaths: reachable,
    totalPaths: ev.navigation.paths.length,
    ...(median("ghost", "objective-A") !== undefined ? { ghostAMedian: median("ghost", "objective-A") } : {}),
    ...(median("ghost", "objective-B") !== undefined ? { ghostBMedian: median("ghost", "objective-B") } : {}),
    ...(median("sentinel", "objective-A") !== undefined ? { sentinelAMedian: median("sentinel", "objective-A") } : {}),
    ...(median("sentinel", "objective-B") !== undefined ? { sentinelBMedian: median("sentinel", "objective-B") } : {}),
  };
}

export function compactPlaytest(report: ArenaPlaytestReport, mapRevision: number): PublicPlaytestSummary {
  return {
    seed: report.seed,
    rollouts: report.rollouts,
    ghost: report.ghost,
    sentinel: report.sentinel,
    firstContact: report.firstContact,
    mapRevision,
  };
}

function targetOf(tool: string, args: unknown, changedIds?: string[]): string | undefined {
  if (!args || typeof args !== "object") return changedIds?.[0];
  const rec = args as Record<string, unknown>;
  if (typeof rec.solidId === "string") return rec.solidId;
  if (typeof rec.spawnId === "string") return rec.spawnId;
  if (typeof rec.objectiveId === "string") return rec.objectiveId;
  return changedIds?.[0];
}

export function publicTurnsFromRecords(records: PlaytestAgentTurnRecord[]): PublicDesignTurn[] {
  const out: PublicDesignTurn[] = [];
  let revision = 0;
  for (const record of records) {
    if (record.outcome?.ok && record.tool !== "run_playtest" && record.tool !== "finish_design") {
      revision += 1;
    }
    const kind: PublicDesignTurn["kind"] =
      record.tool === "run_playtest" ? "playtest" : record.tool === "finish_design" ? "finish" : "edit";
    const turn: PublicDesignTurn = {
      turn: record.turn,
      kind,
      tool: record.tool,
      intent: record.intent,
      target: targetOf(record.tool, record.arguments, record.outcome?.changedIds),
      mapRevision: revision,
    };
    if (record.outcome?.ok === false) turn.rejected = true;
    if (record.evaluationAfter) turn.p0 = compactP0(record.evaluationAfter);
    if (record.playtest) turn.playtest = compactPlaytest(record.playtest, revision);
    if (kind === "finish" && typeof (record.arguments as { summary?: unknown } | undefined)?.summary === "string") {
      turn.finishSummary = (record.arguments as { summary: string }).summary;
    }
    out.push(turn);
  }
  return out;
}

export function viewFromAgentResult(args: {
  jobId: string;
  source: DesignSource;
  startingMapId: string;
  brief: string;
  status: DesignJobStatus;
  error?: string;
  result?: PlaytestAgentRunResult;
  turns?: PlaytestAgentTurnRecord[];
  initialP0: PublicP0Summary;
  playOriginalId: string;
  playResultId?: string;
  initialMap?: ArenaMap;
  revisionMaps?: PublicArenaMapView[];
  revisionReplays?: PlaytestReplay[];
  provider?: "openai" | "anthropic";
  model?: string;
}): PublicDesignView {
  const records = args.result?.turns ?? args.turns ?? [];
  const turns = publicTurnsFromRecords(records);
  const playtests = turns.filter((t) => t.playtest).map((t) => t.playtest!);
  const lastPlaytest = playtests.length ? playtests[playtests.length - 1] : undefined;
  const finalMapRevision = args.result?.successfulEdits ?? turns.reduce((n, t) => (t.kind === "edit" && !t.rejected ? t.mapRevision : n), 0);
  const lastPlaytestMapRevision = lastPlaytest?.mapRevision;
  const arenaRevisions =
    args.initialMap !== undefined ? revisionMapsFromTurns(args.initialMap, records) : undefined;
  const revisionMaps = args.revisionMaps ?? (arenaRevisions ? publicRevisionMaps(arenaRevisions) : []);
  const revisionReplays =
    args.revisionReplays ??
    (arenaRevisions ? arenaRevisions.map((m) => representativeReplay(m, PLAYTEST_SEED)) : undefined);
  return {
    jobId: args.jobId,
    status: args.status,
    source: args.source,
    startingMapId: args.startingMapId,
    brief: args.brief,
    ...(args.error ? { error: args.error } : {}),
    ...(args.result?.finishSummary ? { finishSummary: args.result.finishSummary } : {}),
    turns,
    editAttempts: args.result?.editAttempts ?? turns.filter((t) => t.kind === "edit").length,
    successfulEdits: args.result?.successfulEdits ?? finalMapRevision,
    playtestCalls: args.result?.playtestCalls ?? playtests.length,
    modelCalls: args.result?.modelCalls ?? turns.length,
    ...(args.result?.totalUsage?.totalTokens !== undefined ? { totalTokens: args.result.totalUsage.totalTokens } : {}),
    ...(args.result?.totalLatencyMs !== undefined ? { latencyMs: args.result.totalLatencyMs } : {}),
    ...(args.result?.model.requested ? { modelRequested: args.result.model.requested } : {}),
    ...(args.result?.model.returnedModels.length
      ? { modelReturned: args.result.model.returnedModels[args.result.model.returnedModels.length - 1] }
      : {}),
    initialP0: args.initialP0,
    ...(args.result ? { finalP0: compactP0(args.result.finalEvaluation) } : {}),
    ...(playtests[0] ? { firstPlaytest: playtests[0] } : {}),
    ...(lastPlaytest ? { lastPlaytest } : {}),
    ...(lastPlaytestMapRevision !== undefined ? { lastPlaytestMapRevision } : {}),
    finalMapRevision,
    lastPlaytestIsOnFinalMap:
      lastPlaytest !== undefined && lastPlaytestMapRevision === finalMapRevision,
    playOriginalId: args.playOriginalId,
    ...(args.playResultId ? { playResultId: args.playResultId } : {}),
    revisionMaps,
    ...(revisionReplays ? { revisionReplays } : {}),
    ...(args.provider ? { provider: args.provider } : {}),
    ...(args.model ? { model: args.model } : {}),
  };
}

export function jobCatalogId(jobId: string, which: "initial" | "final"): string {
  return `job:${jobId}:${which}`;
}

export function demoCatalogId(which: "initial" | "final"): string {
  return `demo:p5:${which}`;
}

export function parseJobCatalogId(
  catalogId: string,
): { jobId: string; which: "initial" | "final" } | undefined {
  const match = /^job:([^:]+):(initial|final)$/.exec(catalogId);
  if (!match) return undefined;
  return { jobId: match[1]!, which: match[2] as "initial" | "final" };
}

export function parseDemoCatalogId(catalogId: string): "initial" | "final" | undefined {
  if (catalogId === "demo:p5:initial") return "initial";
  if (catalogId === "demo:p5:final") return "final";
  return undefined;
}

export function publicError(message: string): string {
  const trimmed = message.trim();
  if (!trimmed) return "Design failed.";
  if (/sk-ant-|sk-[a-zA-Z0-9]|OPENAI_API_KEY|ANTHROPIC_API_KEY|api[_-]?key/i.test(trimmed)) {
    return "The model call failed.";
  }
  if (trimmed.length > 240) return `${trimmed.slice(0, 237)}...`;
  return trimmed;
}

export function assertNoSecrets(payload: unknown): void {
  const text = JSON.stringify(payload);
  if (/sk-ant-|sk-[a-zA-Z0-9]|OPENAI_API_KEY|ANTHROPIC_API_KEY/i.test(text)) {
    throw new Error("payload contains a secret");
  }
}
