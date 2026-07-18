/**
 * One-shot ArenaForge design run. One model call, then apply the proposal.
 *
 *   npx tsx --tsconfig server/tsconfig.json server/scripts/arena-forge-one-shot.ts --map=map-contract-smoke --brief="Make mid more aggressive while preserving both site routes."
 *   npx tsx --tsconfig server/tsconfig.json server/scripts/arena-forge-one-shot.ts --map=map-contract-smoke --brief-file=brief.txt --json
 */
import { config } from "dotenv";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getGameplayMap } from "../../shared/world/map-registry.js";
import { importGameplayMap } from "../src/arena-forge/import-map.js";
import { OpenAIOneShotDesigner } from "../src/arena-forge/openai-designer.js";
import { runOneShotDesign } from "../src/arena-forge/one-shot.js";
import type { ArenaEvaluation } from "../src/arena-forge/types.js";

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
config({ path: path.join(serverDir, ".env") });

const args = process.argv.slice(2);
const json = args.includes("--json");
const mapArg = args.find((a) => a.startsWith("--map="))?.slice("--map=".length);
const briefArg = args.find((a) => a.startsWith("--brief="))?.slice("--brief=".length);
const briefFile = args.find((a) => a.startsWith("--brief-file="))?.slice("--brief-file=".length);
const mapId = mapArg ?? "map-contract-smoke";

function losCounts(ev: ArenaEvaluation) {
  const pairs = ev.lineOfSight.pairs;
  const spawnLos = pairs.filter(
    (p) => p.from.startsWith("ghost-spawn-") && p.to.startsWith("sentinel-spawn-"),
  );
  return {
    clear: pairs.filter((p) => p.clear).length,
    total: pairs.length,
    spawnClear: spawnLos.filter((p) => p.clear).length,
    spawnTotal: spawnLos.length,
  };
}

function printAggregates(ev: ArenaEvaluation, label: string) {
  process.stdout.write(`${label} path aggregates\n`);
  if (ev.navigation.aggregates.length === 0) {
    process.stdout.write("  (none)\n");
    return;
  }
  for (const a of ev.navigation.aggregates) {
    process.stdout.write(
      `  ${a.fromRole} → ${a.to}  n=${a.sampleCount}  min=${a.minMeters ?? "-"}  median=${a.medianMeters ?? "-"}\n`,
    );
  }
}

try {
  const brief = briefFile
    ? readFileSync(briefFile, "utf8").trim()
    : briefArg;
  if (!brief) {
    process.stderr.write("Pass --brief=\"...\" or --brief-file=<path>.\n");
    process.exit(1);
  }

  const designer = new OpenAIOneShotDesigner();
  const source = getGameplayMap(mapId);
  const result = await runOneShotDesign({
    map: importGameplayMap(source),
    brief,
    designer,
  });

  if (json) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    process.exit(result.executionStatus === "completed" ? 0 : 1);
  }

  const beforeLos = losCounts(result.initialEvaluation);
  const afterLos = losCounts(result.finalEvaluation);
  process.stdout.write(`map ${result.sourceMapId ?? mapId}  kind ${result.kind}\n`);
  process.stdout.write(`model requested ${result.model.requested}`);
  if (result.model.returned) process.stdout.write(`  returned ${result.model.returned}`);
  if (result.model.responseId) process.stdout.write(`  response ${result.model.responseId}`);
  process.stdout.write("\n");
  process.stdout.write(`brief ${brief}\n`);
  process.stdout.write(`status ${result.executionStatus}\n`);
  process.stdout.write(
    `latency model ${result.timing.modelLatencyMs}ms  total ${result.timing.totalLatencyMs}ms\n`,
  );
  if (result.usage) {
    process.stdout.write(
      `tokens in ${result.usage.inputTokens ?? "-"}  out ${result.usage.outputTokens ?? "-"}  total ${result.usage.totalTokens ?? "-"}\n`,
    );
  }
  process.stdout.write(`initial hard failures ${result.initialEvaluation.summary.hardFailureCount}\n`);
  for (const issue of result.initialEvaluation.summary.hardFailures) {
    process.stdout.write(`  ${JSON.stringify(issue)}\n`);
  }
  if (result.proposal) {
    process.stdout.write(`design ${result.proposal.designSummary}\n`);
    process.stdout.write(`proposed actions ${result.proposal.actions.length}\n`);
    for (const [i, action] of result.proposal.actions.entries()) {
      process.stdout.write(`  ${i} ${JSON.stringify(action)}\n`);
    }
  } else if (result.invalidReason) {
    process.stdout.write(`invalid ${result.invalidReason}\n`);
  }
  process.stdout.write(`action results ${result.actionResults.length}\n`);
  for (const rec of result.actionResults) {
    if (rec.ok) {
      process.stdout.write(`  ${rec.index} ok  changed ${rec.changedIds.join(", ")}\n`);
    } else {
      process.stdout.write(`  ${rec.index} rejected  ${JSON.stringify(rec.error)}\n`);
    }
  }
  process.stdout.write(`final hard failures ${result.finalEvaluation.summary.hardFailureCount}\n`);
  for (const issue of result.finalEvaluation.summary.hardFailures) {
    process.stdout.write(`  ${JSON.stringify(issue)}\n`);
  }
  printAggregates(result.initialEvaluation, "initial");
  printAggregates(result.finalEvaluation, "final");
  process.stdout.write(
    `LOS clear ${beforeLos.clear}/${beforeLos.total} → ${afterLos.clear}/${afterLos.total}  ghost↔sentinel ${beforeLos.spawnClear}/${beforeLos.spawnTotal} → ${afterLos.spawnClear}/${afterLos.spawnTotal}\n`,
  );
  process.exit(result.executionStatus === "completed" ? 0 : 1);
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
