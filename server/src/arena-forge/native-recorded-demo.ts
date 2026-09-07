import { readFileSync } from "node:fs";
import path from "node:path";
import { parseArenaDesignSpec } from "@shared/world/arena-design-spec.js";
import { assertExploreMap } from "@shared/world/explore-map.js";
import { assertSearchDestroyMap } from "@shared/world/map-registry.js";
import { SERVER_DIR } from "../project-paths.js";
import { buildBlankArena } from "./blank-map.js";
import {
  compactP0,
  viewFromAgentResult,
  type PublicDesignPlan,
  type PublicDesignView,
} from "./design-view.js";
import { evaluateArena } from "./evaluator.js";
import { exportGameplayMap } from "./export-map.js";
import { assertPublicRecordedPayload, containsSecretMaterial, stripHiddenReasoning } from "./native-demo-sanitize.js";
import { assertProductReplayMatchesFinal } from "./product-timeline.js";
import {
  NATIVE_DEMO_ID,
  NATIVE_DEMO_LABEL,
  NATIVE_DEMO_MAP_NAME,
  NATIVE_DEMO_SPEC,
  NATIVE_DEMO_VERSION,
} from "./native-demo-spec.js";
import { productModeCompletionIssues } from "./product-tools.js";
import type { ProductDesignerRunResult } from "./product-designer.js";
import type { ArenaMap } from "./types.js";

export const NATIVE_DEMO_FIXTURE_NAME = "native-designer-demo.json";

export type NativeDemoOrigin = "synthetic" | "live";

export type NativeRecordedDemo = {
  version: number;
  id: string;
  source: "recorded";
  path: "product";
  label: string;
  mapName: string;
  origin: NativeDemoOrigin;
  spec: typeof NATIVE_DEMO_SPEC;
  designPlan: PublicDesignPlan;
  brief: string;
  finishSummary: string;
  provider?: "openai" | "anthropic" | "scripted";
  model?: string;
  modelRequested?: string;
  modelReturned?: string;
  totalTokens?: number;
  latencyMs?: number;
  editAttempts: number;
  successfulEdits: number;
  playtestCalls: number;
  modelCalls: number;
  initialMap: ArenaMap;
  finalMap: ArenaMap;
  result: ProductDesignerRunResult;
};

const fixturePath = path.join(SERVER_DIR, "fixtures", "arena-forge", NATIVE_DEMO_FIXTURE_NAME);

let cached: NativeRecordedDemo | undefined;

export function nativeRecordedDemoPath(): string {
  return fixturePath;
}

export function nativeDemoCatalogId(which: "initial" | "final"): string {
  return `demo:native:${which}`;
}

export function parseNativeDemoCatalogId(catalogId: string): "initial" | "final" | undefined {
  if (catalogId === "demo:native:initial") return "initial";
  if (catalogId === "demo:native:final") return "final";
  return undefined;
}

export function isNativeDemoJobId(jobId: string): boolean {
  return jobId === NATIVE_DEMO_ID;
}

export function demoFromProductResult(args: {
  result: ProductDesignerRunResult;
  origin: NativeDemoOrigin;
  provider?: NativeRecordedDemo["provider"];
  model?: string;
}): NativeRecordedDemo {
  const result = stripHiddenReasoning(args.result);
  if (result.status !== "completed" || !result.designPlan || !result.finishSummary) {
    throw new Error("Native demo run is not a completed product design.");
  }
  const demo: NativeRecordedDemo = {
    version: NATIVE_DEMO_VERSION,
    id: NATIVE_DEMO_ID,
    source: "recorded",
    path: "product",
    label: NATIVE_DEMO_LABEL,
    mapName: NATIVE_DEMO_MAP_NAME,
    origin: args.origin,
    spec: result.spec,
    designPlan: result.designPlan,
    brief: result.brief,
    finishSummary: result.finishSummary,
    ...(args.provider ? { provider: args.provider } : {}),
    ...(args.model ? { model: args.model } : {}),
    ...(result.model.requested ? { modelRequested: result.model.requested } : {}),
    ...(result.model.returnedModels.length
      ? { modelReturned: result.model.returnedModels[result.model.returnedModels.length - 1] }
      : {}),
    ...(result.totalUsage?.totalTokens !== undefined ? { totalTokens: result.totalUsage.totalTokens } : {}),
    latencyMs: result.totalLatencyMs,
    editAttempts: result.editAttempts,
    successfulEdits: result.successfulEdits,
    playtestCalls: result.playtestCalls,
    modelCalls: result.modelCalls,
    initialMap: result.initialMap,
    finalMap: result.finalMap,
    result,
  };
  validateNativeRecordedDemo(demo);
  return demo;
}

export function validateNativeRecordedDemo(raw: NativeRecordedDemo): NativeRecordedDemo {
  if (raw.version !== NATIVE_DEMO_VERSION) throw new Error("Native demo version mismatch.");
  if (raw.id !== NATIVE_DEMO_ID) throw new Error("Native demo id mismatch.");
  if (raw.source !== "recorded" || raw.path !== "product") {
    throw new Error("Native demo must be a recorded product run.");
  }
  const spec = parseArenaDesignSpec(raw.spec);
  if (!spec.ok) throw new Error(`Native demo spec is invalid: ${spec.issues.map((i) => i.message).join("; ")}`);
  if (spec.spec.mode !== "search_destroy") throw new Error("Native demo mode must be search_destroy.");
  if (!raw.designPlan?.summary || !raw.designPlan.layout?.length || !raw.designPlan.priorities?.length) {
    throw new Error("Native demo is missing a public design plan.");
  }
  const firstTool = raw.result.turns.find((t) => t.outcome?.ok)?.tool;
  if (firstTool !== "propose_design_plan") {
    throw new Error("Native demo must begin with propose_design_plan.");
  }
  const blank = buildBlankArena(spec.spec);
  if (JSON.stringify(blank.objectives) !== JSON.stringify(raw.initialMap.objectives)) {
    throw new Error("Native demo original must start without agent-placed A/B.");
  }
  if ((raw.initialMap.solids ?? []).length !== 0) {
    throw new Error("Native demo original must have no interior solids.");
  }
  const initialExport = exportGameplayMap(raw.initialMap, { id: "native-initial", name: "Original setup" });
  assertExploreMap(initialExport);
  const finalExport = exportGameplayMap(raw.finalMap, { id: "native-final", name: raw.mapName });
  assertSearchDestroyMap(finalExport);
  const blockers = productModeCompletionIssues(raw.finalMap, raw.result.finalEvaluation, "search_destroy");
  if (blockers.length) {
    throw new Error(`Native demo final map is not saveable: ${blockers.join(", ")}.`);
  }
  if (containsSecretMaterial(raw)) throw new Error("Native demo contains secret material.");
  assertPublicRecordedPayload(raw);
  assertProductReplayMatchesFinal(raw.initialMap, raw.result.turns, raw.finalMap);
  return raw;
}

export function loadNativeRecordedDemo(): NativeRecordedDemo {
  if (cached) return cached;
  const raw = JSON.parse(readFileSync(fixturePath, "utf8")) as NativeRecordedDemo;
  cached = validateNativeRecordedDemo(raw);
  return cached;
}

export function resetNativeRecordedDemoCache(): void {
  cached = undefined;
}

export function nativeRecordedDemoView(): PublicDesignView {
  const demo = loadNativeRecordedDemo();
  return viewFromAgentResult({
    jobId: demo.id,
    source: "recorded",
    startingMapId: "blank-arena",
    brief: demo.brief,
    status: "completed",
    result: demo.result,
    turns: demo.result.turns,
    initialP0: compactP0(evaluateArena(demo.initialMap, "search_destroy")),
    playOriginalId: nativeDemoCatalogId("initial"),
    playResultId: nativeDemoCatalogId("final"),
    initialMap: demo.initialMap,
    provider: demo.provider === "openai" || demo.provider === "anthropic" ? demo.provider : undefined,
    model: demo.model,
    path: "product",
    mode: "search_destroy",
    designPlan: demo.designPlan,
  });
}

export function nativeRecordedDemoMap(which: "initial" | "final"): ArenaMap {
  const demo = loadNativeRecordedDemo();
  return which === "initial" ? demo.initialMap : demo.finalMap;
}

export function nativeRecordedDemoSummary(demo: NativeRecordedDemo): {
  provider?: string;
  model?: string;
  calls: number;
  tokens?: number;
  latencyMs?: number;
  plan: PublicDesignPlan;
  tools: string[];
  routeQueries: number;
  playtests: number;
  revisions: number;
  hardFailures: number;
  finishSummary: string;
} {
  const tools = demo.result.turns.map((t) => t.tool);
  const firstPlaytest = demo.result.turns.findIndex((t) => t.tool === "run_playtest" && t.outcome?.ok);
  const revisions = demo.result.turns.filter(
    (t, i) =>
      t.outcome?.ok &&
      firstPlaytest >= 0 &&
      i > firstPlaytest &&
      t.tool !== "run_playtest" &&
      t.tool !== "finish_design" &&
      t.tool !== "trace_route" &&
      t.tool !== "propose_design_plan",
  ).length;
  return {
    ...(demo.provider ? { provider: demo.provider } : {}),
    ...(demo.model ? { model: demo.model } : {}),
    calls: demo.modelCalls,
    ...(demo.totalTokens !== undefined ? { tokens: demo.totalTokens } : {}),
    ...(demo.latencyMs !== undefined ? { latencyMs: demo.latencyMs } : {}),
    plan: demo.designPlan,
    tools,
    routeQueries: tools.filter((t) => t === "trace_route").length,
    playtests: demo.playtestCalls,
    revisions,
    hardFailures: demo.result.finalEvaluation.summary.hardFailureCount,
    finishSummary: demo.finishSummary,
  };
}
