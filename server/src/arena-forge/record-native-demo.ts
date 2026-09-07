import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { SERVER_DIR } from "../project-paths.js";
import { buildBlankArena } from "./blank-map.js";
import {
  demoFromProductResult,
  nativeRecordedDemoSummary,
  type NativeDemoOrigin,
  type NativeRecordedDemo,
} from "./native-recorded-demo.js";
import { NATIVE_DEMO_SPEC } from "./native-demo-spec.js";
import { runArenaDesigner } from "./product-designer.js";
import { createProductAgentSession } from "./product-session-factory.js";
import type { PlaytestAgentSession } from "./playtest-agent.js";
import { resolveArenaForgeProviderConfig, type ArenaForgeProvider } from "./provider.js";

export const NATIVE_DEMO_CANDIDATE_REL = path.join(".arena-forge-results", "native-demo-candidate.json");

export function nativeDemoCandidatePath(root = SERVER_DIR): string {
  return path.join(root, NATIVE_DEMO_CANDIDATE_REL);
}

export async function recordNativeDemo(args?: {
  session?: PlaytestAgentSession;
  origin?: NativeDemoOrigin;
  provider?: ArenaForgeProvider | "scripted";
  model?: string;
  env?: NodeJS.ProcessEnv;
}): Promise<NativeRecordedDemo> {
  const env = args?.env ?? process.env;
  const session = args?.session ?? createProductAgentSession("search_destroy", { env });
  const config = resolveArenaForgeProviderConfig(env);
  const result = await runArenaDesigner({
    spec: NATIVE_DEMO_SPEC,
    map: buildBlankArena(NATIVE_DEMO_SPEC),
    session,
    requestedModel: args?.model ?? config.model,
  });
  return demoFromProductResult({
    result,
    origin: args?.origin ?? (args?.session ? "synthetic" : "live"),
    provider: args?.provider ?? (config.valid ? config.provider : "scripted"),
    model: args?.model ?? config.model,
  });
}

export function writeNativeDemoCandidate(demo: NativeRecordedDemo, outPath = nativeDemoCandidatePath()): string {
  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(demo, null, 2)}\n`, "utf8");
  return outPath;
}

export function printNativeDemoSummary(demo: NativeRecordedDemo): string {
  const summary = nativeRecordedDemoSummary(demo);
  return [
    `label: ${demo.label}`,
    `origin: ${demo.origin}`,
    `provider: ${summary.provider ?? "none"}`,
    `model: ${summary.model ?? "none"}`,
    `calls: ${summary.calls}`,
    `tokens: ${summary.tokens ?? "n/a"}`,
    `latencyMs: ${summary.latencyMs ?? "n/a"}`,
    `plan: ${summary.plan.summary}`,
    `tools: ${summary.tools.join(" → ")}`,
    `routeQueries: ${summary.routeQueries}`,
    `playtests: ${summary.playtests}`,
    `revisions: ${summary.revisions}`,
    `hardFailures: ${summary.hardFailures}`,
    `finish: ${summary.finishSummary}`,
  ].join("\n");
}
