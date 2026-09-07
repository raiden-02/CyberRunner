import { randomUUID } from "node:crypto";
import { parseArenaDesignSpec, type ArenaDesignSpec } from "@shared/world/arena-design-spec.js";
import { getGameplayMap } from "@shared/world/map-registry.js";
import { buildBlankArena } from "./blank-map.js";
import { evaluateArena } from "./evaluator.js";
import { importGameplayMap } from "./import-map.js";
import {
  compactP0,
  DESIGN_BRIEF_MAX,
  isDesignStartingMap,
  jobCatalogId,
  publicError,
  viewFromAgentResult,
  type DesignJobStatus,
  type PublicDesignPlan,
  type PublicDesignView,
} from "./design-view.js";
import { runPlaytestAgentDesign, type PlaytestAgentTurnRecord } from "./playtest-agent.js";
import { LIVE_DISABLED_MESSAGE } from "./live-forge-policy.js";
import { runArenaDesigner, type ProductDesignerRunResult } from "./product-designer.js";
import { resolveArenaForgeProviderConfig, type ArenaForgeProvider } from "./provider.js";
import type { ArenaEvaluation, ArenaEvaluationMode, ArenaMap } from "./types.js";
import type { PlaytestAgentRunResult } from "./playtest-agent.js";

export const MAX_STORED_DESIGN_JOBS = 8;

export type DesignRunner = (args: {
  map: ArenaMap;
  brief: string;
  onTurn: (turn: PlaytestAgentTurnRecord) => void;
}) => Promise<PlaytestAgentRunResult>;

export type ProductDesignRunner = (args: {
  spec: ArenaDesignSpec;
  map: ArenaMap;
  onTurn: (turn: PlaytestAgentTurnRecord) => void;
}) => Promise<ProductDesignerRunResult>;

export type DesignJobRecord = {
  id: string;
  status: DesignJobStatus;
  brief: string;
  startingMapId: string;
  path?: "product" | "historical";
  mode?: ArenaEvaluationMode;
  spec?: ArenaDesignSpec;
  ownerUserId?: string;
  guestSessionId?: string;
  designPlan?: PublicDesignPlan;
  initialMap: ArenaMap;
  initialEvaluation: ArenaEvaluation;
  turns: PlaytestAgentTurnRecord[];
  result?: PlaytestAgentRunResult | ProductDesignerRunResult;
  error?: string;
  createdAt: number;
  provider?: ArenaForgeProvider;
  providerModel?: string;
};

export type DesignJobDeps = {
  isLiveAvailable?: () => boolean;
  run?: DesignRunner;
  runProduct?: ProductDesignRunner;
  createId?: () => string;
};

const jobs = new Map<string, DesignJobRecord>();
let activeJobId: string | undefined;

export function resetDesignJobs(): void {
  jobs.clear();
  activeJobId = undefined;
}

export function isLiveAgentAvailable(env: NodeJS.ProcessEnv = process.env): boolean {
  const provider = resolveArenaForgeProviderConfig(env);
  return env.ARENA_FORGE_LIVE_AGENT_ENABLED === "true" && provider.valid && provider.keyConfigured;
}

export function liveAgentGate(
  env: NodeJS.ProcessEnv = process.env,
): { ok: true } | { ok: false; status: 403; error: string } {
  if (env.ARENA_FORGE_LIVE_AGENT_ENABLED !== "true") {
    return {
      ok: false,
      status: 403,
      error: LIVE_DISABLED_MESSAGE,
    };
  }
  const provider = resolveArenaForgeProviderConfig(env);
  if (!provider.valid || !provider.keyConfigured) {
    return {
      ok: false,
      status: 403,
      error: "Live design is not configured on this server.",
    };
  }
  return { ok: true };
}

export async function defaultLiveRunner(args: {
  map: ArenaMap;
  brief: string;
  onTurn: (turn: PlaytestAgentTurnRecord) => void;
}): Promise<PlaytestAgentRunResult> {
  const { createPlaytestAgentSession } = await import("./playtest-session-factory.js");
  const session = createPlaytestAgentSession();
  return runPlaytestAgentDesign({
    map: args.map,
    brief: args.brief,
    session,
    requestedModel: session.requestedModel,
    onTurn: args.onTurn,
  });
}

function liveAvailable(deps?: DesignJobDeps): boolean {
  return (deps?.isLiveAvailable ?? isLiveAgentAvailable)();
}

function hasActiveJob(): boolean {
  if (!activeJobId) return false;
  const job = jobs.get(activeJobId);
  return job !== undefined && (job.status === "queued" || job.status === "running");
}

export function hasActiveDesignJob(): boolean {
  return hasActiveJob();
}

function evictOldJobs(): void {
  const terminal = [...jobs.values()]
    .filter((j) => j.status === "completed" || j.status === "failed")
    .sort((a, b) => a.createdAt - b.createdAt);
  while (terminal.length > MAX_STORED_DESIGN_JOBS) {
    const oldest = terminal.shift();
    if (!oldest) break;
    if (oldest.id === activeJobId) continue;
    jobs.delete(oldest.id);
  }
}

function jobView(job: DesignJobRecord): PublicDesignView {
  const plan =
    job.designPlan ??
    (job.result && "designPlan" in job.result ? job.result.designPlan : undefined);
  return viewFromAgentResult({
    jobId: job.id,
    source: "live",
    startingMapId: job.startingMapId,
    brief: job.brief,
    status: job.status,
    error: job.error,
    result: job.result as PlaytestAgentRunResult | undefined,
    turns: job.turns,
    initialP0: compactP0(job.initialEvaluation),
    playOriginalId: jobCatalogId(job.id, "initial"),
    playResultId:
      job.status === "completed" || job.status === "failed"
        ? jobCatalogId(job.id, "final")
        : undefined,
    initialMap: job.initialMap,
    provider: job.provider,
    model: job.providerModel,
    path: job.path,
    mode: job.mode,
    designPlan: plan,
  });
}

export function getDesignJob(jobId: string): DesignJobRecord | undefined {
  return jobs.get(jobId);
}

export function getDesignJobView(jobId: string): PublicDesignView | undefined {
  const job = jobs.get(jobId);
  return job ? jobView(job) : undefined;
}

export function getDesignJobMap(jobId: string, which: "initial" | "final"): ArenaMap | undefined {
  const job = jobs.get(jobId);
  if (!job) return undefined;
  if (which === "initial") return job.initialMap;
  if (job.result) return job.result.finalMap;
  return undefined;
}

export type StartDesignResult =
  | { ok: true; status: 202; jobId: string }
  | { ok: false; status: 400 | 403 | 409; error: string };

export function validateDesignJobStart(
  input: { brief?: unknown; mapId?: unknown },
  deps: DesignJobDeps = {},
): { ok: true } | { ok: false; status: 400 | 403 | 409; error: string } {
  if (!liveAvailable(deps)) {
    return {
      ok: false,
      status: 403,
      error: LIVE_DISABLED_MESSAGE,
    };
  }

  const brief = typeof input.brief === "string" ? input.brief.trim() : "";
  if (!brief) {
    return { ok: false, status: 400, error: "Brief is required." };
  }
  if (brief.length > DESIGN_BRIEF_MAX) {
    return { ok: false, status: 400, error: `Brief must be at most ${DESIGN_BRIEF_MAX} characters.` };
  }

  const mapId = typeof input.mapId === "string" ? input.mapId : "";
  if (!isDesignStartingMap(mapId)) {
    return { ok: false, status: 400, error: "Starting map is not available." };
  }

  if (hasActiveJob()) {
    return { ok: false, status: 409, error: "A design job is already running. Wait for it to finish." };
  }

  return { ok: true };
}

export function startDesignJob(
  input: { brief?: unknown; mapId?: unknown },
  deps: DesignJobDeps = {},
): StartDesignResult {
  const validated = validateDesignJobStart(input, deps);
  if (!validated.ok) return validated;

  const brief = typeof input.brief === "string" ? input.brief.trim() : "";
  const mapId = typeof input.mapId === "string" ? input.mapId : "";
  const initialMap = importGameplayMap(getGameplayMap(mapId));
  const id = (deps.createId ?? randomUUID)();
  const provider = resolveArenaForgeProviderConfig();
  const job: DesignJobRecord = {
    id,
    status: "queued",
    brief,
    startingMapId: mapId,
    initialMap,
    initialEvaluation: evaluateArena(initialMap),
    turns: [],
    createdAt: Date.now(),
    ...(provider.valid ? { provider: provider.provider, providerModel: provider.model } : {}),
  };
  jobs.set(id, job);
  activeJobId = id;
  evictOldJobs();

  const run = deps.run ?? defaultLiveRunner;
  void Promise.resolve()
    .then(async () => {
      job.status = "running";
      const result = await run({
        map: initialMap,
        brief,
        onTurn: (turn) => {
          job.turns.push(turn);
        },
      });
      job.result = result;
      if (result.status === "completed") {
        job.status = "completed";
      } else {
        job.status = "failed";
        job.error = publicError(result.invalidReason ?? result.status);
      }
    })
    .catch((err) => {
      job.status = "failed";
      job.error = publicError(err instanceof Error ? err.message : String(err));
    })
    .finally(() => {
      if (activeJobId === id) activeJobId = undefined;
      evictOldJobs();
    });

  return { ok: true, status: 202, jobId: id };
}

export function liveAgentCapability(deps?: DesignJobDeps): { liveAgentAvailable: boolean } {
  return { liveAgentAvailable: liveAvailable(deps) };
}

export async function defaultProductRunner(args: {
  spec: ArenaDesignSpec;
  map: ArenaMap;
  onTurn: (turn: PlaytestAgentTurnRecord) => void;
}): Promise<ProductDesignerRunResult> {
  const { createProductAgentSession } = await import("./product-session-factory.js");
  const session = createProductAgentSession(args.spec.mode);
  return runArenaDesigner({
    spec: args.spec,
    map: args.map,
    session,
    requestedModel: session.requestedModel,
    onTurn: args.onTurn,
  });
}

export function validateProductDesignStart(
  input: unknown,
  deps: DesignJobDeps = {},
): { ok: true; spec: ArenaDesignSpec } | { ok: false; status: 400 | 403 | 409; error: string } {
  if (!liveAvailable(deps)) {
    return { ok: false, status: 403, error: LIVE_DISABLED_MESSAGE };
  }
  const parsed = parseArenaDesignSpec(input);
  if (!parsed.ok) {
    return { ok: false, status: 400, error: parsed.issues[0]?.message ?? "Design setup is invalid." };
  }
  if (hasActiveJob()) {
    return { ok: false, status: 409, error: "A design job is already running. Wait for it to finish." };
  }
  return { ok: true, spec: parsed.spec };
}

export function startProductDesignJob(
  input: unknown,
  deps: DesignJobDeps & { ownerUserId?: string; guestSessionId?: string } = {},
): StartDesignResult {
  const validated = validateProductDesignStart(input, deps);
  if (!validated.ok) return validated;

  const spec = validated.spec;
  const initialMap = buildBlankArena(spec);
  const id = (deps.createId ?? randomUUID)();
  const provider = resolveArenaForgeProviderConfig();
  const job: DesignJobRecord = {
    id,
    status: "queued",
    brief: spec.brief,
    startingMapId: "blank-arena",
    path: "product",
    mode: spec.mode,
    spec,
    ownerUserId: deps.ownerUserId,
    guestSessionId: deps.ownerUserId ? undefined : deps.guestSessionId,
    initialMap,
    initialEvaluation: evaluateArena(initialMap, spec.mode),
    turns: [],
    createdAt: Date.now(),
    ...(provider.valid ? { provider: provider.provider, providerModel: provider.model } : {}),
  };
  jobs.set(id, job);
  activeJobId = id;
  evictOldJobs();

  const run = deps.runProduct ?? defaultProductRunner;
  void Promise.resolve()
    .then(async () => {
      job.status = "running";
      const result = await run({
        spec,
        map: initialMap,
        onTurn: (turn) => {
          job.turns.push(turn);
          if (turn.tool === "propose_design_plan" && turn.outcome?.ok) {
            const plan = resultPlanFromArgs(turn.arguments);
            if (plan) job.designPlan = plan;
          }
        },
      });
      job.result = result;
      if (result.designPlan) job.designPlan = result.designPlan;
      if (result.status === "completed") {
        job.status = "completed";
      } else {
        job.status = "failed";
        job.error = publicError(result.invalidReason ?? result.status);
      }
    })
    .catch((err) => {
      job.status = "failed";
      job.error = publicError(err instanceof Error ? err.message : String(err));
    })
    .finally(() => {
      if (activeJobId === id) activeJobId = undefined;
      evictOldJobs();
    });

  return { ok: true, status: 202, jobId: id };
}

function resultPlanFromArgs(args: unknown): PublicDesignPlan | undefined {
  if (typeof args !== "object" || args === null) return undefined;
  const rec = args as Record<string, unknown>;
  if (typeof rec.summary !== "string") return undefined;
  const layout = Array.isArray(rec.layout) ? rec.layout.filter((x): x is string => typeof x === "string") : [];
  const priorities = Array.isArray(rec.priorities)
    ? rec.priorities.filter((x): x is string => typeof x === "string")
    : [];
  if (!layout.length || !priorities.length) return undefined;
  return { summary: rec.summary, layout, priorities };
}
