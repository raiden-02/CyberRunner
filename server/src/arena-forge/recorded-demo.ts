import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ArenaMap } from "./types.js";
import {
  compactP0,
  demoCatalogId,
  type PublicDesignView,
  type PublicP0Summary,
  type PublicDesignTurn,
} from "./design-view.js";
import { evaluateArena } from "./evaluator.js";
import {
  applyRevisionEdits,
  P5_RECORDED_REVISION_EDITS,
  publicRevisionMaps,
  solidsEqual,
} from "./public-map.js";
import { PLAYTEST_SEED } from "./playtest.js";
import { representativeReplay } from "./playtest-replay.js";

export const P5_RECORDED_DEMO_ID = "p5-demo";

export type RecordedP5Demo = {
  id: string;
  source: "recorded";
  label: string;
  brief: string;
  startingMapId: string;
  modelRequested: string;
  modelReturned: string;
  editAttempts: number;
  successfulEdits: number;
  playtestCalls: number;
  modelCalls: number;
  totalTokens: number;
  latencyMs: number;
  finishSummary: string;
  initialMap: ArenaMap;
  finalMap: ArenaMap;
  initialP0: PublicP0Summary;
  finalP0: PublicP0Summary;
  turns: PublicDesignTurn[];
};

const fixturePath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../fixtures/arena-forge/p5-demo.json",
);

let cached: RecordedP5Demo | undefined;

export function recordedDemoPath(): string {
  return fixturePath;
}

export function loadRecordedP5Demo(): RecordedP5Demo {
  if (cached) return cached;
  const raw = JSON.parse(readFileSync(fixturePath, "utf8")) as RecordedP5Demo;
  if (raw.id !== P5_RECORDED_DEMO_ID) throw new Error("recorded demo id mismatch");
  cached = raw;
  return raw;
}

export function recordedDemoRevisionMaps() {
  const demo = loadRecordedP5Demo();
  const maps = applyRevisionEdits(demo.initialMap, P5_RECORDED_REVISION_EDITS);
  const last = maps[maps.length - 1];
  if (!last || !solidsEqual(last, demo.finalMap)) {
    throw new Error("recorded P5 revision edits do not match the committed final map");
  }
  return maps;
}

export function recordedDemoView(): PublicDesignView {
  const demo = loadRecordedP5Demo();
  const playtests = demo.turns.filter((t) => t.playtest).map((t) => t.playtest!);
  const lastPlaytest = playtests[playtests.length - 1];
  const arenaRevisions = recordedDemoRevisionMaps();
  return {
    jobId: demo.id,
    status: "completed",
    source: "recorded",
    startingMapId: demo.startingMapId,
    brief: demo.brief,
    finishSummary: demo.finishSummary,
    turns: demo.turns,
    editAttempts: demo.editAttempts,
    successfulEdits: demo.successfulEdits,
    playtestCalls: demo.playtestCalls,
    modelCalls: demo.modelCalls,
    totalTokens: demo.totalTokens,
    latencyMs: demo.latencyMs,
    modelRequested: demo.modelRequested,
    modelReturned: demo.modelReturned,
    initialP0: demo.initialP0,
    finalP0: demo.finalP0,
    firstPlaytest: playtests[0],
    lastPlaytest,
    lastPlaytestMapRevision: lastPlaytest?.mapRevision,
    finalMapRevision: demo.successfulEdits,
    lastPlaytestIsOnFinalMap: lastPlaytest?.mapRevision === demo.successfulEdits,
    playOriginalId: demoCatalogId("initial"),
    playResultId: demoCatalogId("final"),
    revisionMaps: publicRevisionMaps(arenaRevisions),
    revisionReplays: arenaRevisions.map((m) => representativeReplay(m, PLAYTEST_SEED)),
  };
}

export function recordedDemoMap(which: "initial" | "final"): ArenaMap {
  const demo = loadRecordedP5Demo();
  return which === "initial" ? demo.initialMap : demo.finalMap;
}

/** Used only when writing the fixture. Verifies stored P0 matches the maps. */
export function verifyRecordedDemoMaps(demo: RecordedP5Demo): void {
  const initial = compactP0(evaluateArena(demo.initialMap));
  const final = compactP0(evaluateArena(demo.finalMap));
  if (JSON.stringify(initial) !== JSON.stringify(demo.initialP0)) {
    throw new Error("recorded demo initial P0 does not match initial map");
  }
  if (JSON.stringify(final) !== JSON.stringify(demo.finalP0)) {
    throw new Error("recorded demo final P0 does not match final map");
  }
}
