import { randomUUID } from "node:crypto";
import { getGameplayMap } from "@shared/world/map-registry.js";
import { evaluateArena } from "./evaluator.js";
import { importGameplayMap } from "./import-map.js";
import { readOpenAIApiKey } from "./one-shot.js";
import {
  compactP0,
  DESIGN_BRIEF_MAX,
  isDesignStartingMap,
  jobCatalogId,
  publicError,
  viewFromAgentResult,
  type DesignJobStatus,
  type PublicDesignView,
} from "./design-view.js";
import { runPlaytestAgentDesign, type PlaytestAgentTurnRecord } from "./playtest-agent.js";
import type { ArenaEvaluation, ArenaMap } from "./types.js";
import type { PlaytestAgentRunResult } from "./playtest-agent.js";

export const MAX_STORED_DESIGN_JOBS = 8;

export type DesignRunner = (args: {
  map: ArenaMap;
  brief: string;
  onTurn: (turn: PlaytestAgentTurnRecord) => void;
}) => Promise<PlaytestAgentRunResult>;

export type DesignJobRecord = {
  id: string;
  status: DesignJobStatus;
  brief: string;
  startingMapId: string;
  initialMap: ArenaMap;
  initialEvaluation: ArenaEvaluation;
  turns: PlaytestAgentTurnRecord[];
  result?: PlaytestAgentRunResult;
  error?: string;
  createdAt: number;
};

export type DesignJobDeps = {
  isLiveAvailable?: () => boolean;
  run?: DesignRunner;
  createId?: () => string;
};

const jobs = new Map<string, DesignJobRecord>();
let activeJobId: string | undefined;

export function resetDesignJobs(): void {
  jobs.clear();
  activeJobId = undefined;
}

export function isLiveAgentAvailable(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.ARENA_FORGE_LIVE_AGENT_ENABLED === "true" && Boolean(readOpenAIApiKey(env));
}

export async function defaultLiveRunner(args: {
  map: ArenaMap;
  brief: string;
  onTurn: (turn: PlaytestAgentTurnRecord) => void;
}): Promise<PlaytestAgentRunResult> {
  const { OpenAIPlaytestAgentSession } = await import("./openai-playtest-agent.js");
  const session = new OpenAIPlaytestAgentSession();
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
  return viewFromAgentResult({
    jobId: job.id,
    source: "live",
    startingMapId: job.startingMapId,
    brief: job.brief,
    status: job.status,
    error: job.error,
    result: job.result,
    turns: job.turns,
    initialP0: compactP0(job.initialEvaluation),
    playOriginalId: jobCatalogId(job.id, "initial"),
    playResultId:
      job.status === "completed" || job.status === "failed"
        ? jobCatalogId(job.id, "final")
        : undefined,
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

export function startDesignJob(
  input: { brief?: unknown; mapId?: unknown },
  deps: DesignJobDeps = {},
): StartDesignResult {
  if (!liveAvailable(deps)) {
    return {
      ok: false,
      status: 403,
      error: "Live design is off on this server. Load the recorded P5 demo instead.",
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

  const initialMap = importGameplayMap(getGameplayMap(mapId));
  const id = (deps.createId ?? randomUUID)();
  const job: DesignJobRecord = {
    id,
    status: "queued",
    brief,
    startingMapId: mapId,
    initialMap,
    initialEvaluation: evaluateArena(initialMap),
    turns: [],
    createdAt: Date.now(),
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
