/**
 * Evaluator-grounded ArenaForge agent. One tool per turn.
 *
 *   npx tsx --tsconfig server/tsconfig.json server/scripts/arena-forge-agent.ts --map=map-contract-smoke --brief="Make mid more aggressive while preserving both site routes."
 *   npx tsx --tsconfig server/tsconfig.json server/scripts/arena-forge-agent.ts --map=map-contract-smoke --brief-file=brief.txt --json
 */
import { config } from "dotenv";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getGameplayMap } from "../../shared/world/map-registry.js";
import { MAX_AGENT_EDIT_ATTEMPTS, runAgentDesign } from "../src/arena-forge/agent.js";
import { importGameplayMap } from "../src/arena-forge/import-map.js";
import { OpenAIAgentSession } from "../src/arena-forge/openai-agent.js";
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
  for (const a of ev.navigation.aggregates) {
    process.stdout.write(
      `  ${a.fromRole} → ${a.to}  n=${a.sampleCount}  min=${a.minMeters ?? "-"}  median=${a.medianMeters ?? "-"}\n`,
    );
  }
}

try {
  const brief = briefFile ? readFileSync(briefFile, "utf8").trim() : briefArg;
  if (!brief) {
    process.stderr.write("Pass --brief=\"...\" or --brief-file=<path>.\n");
    process.exit(1);
  }

  const session = new OpenAIAgentSession();
  const source = getGameplayMap(mapId);
  const result = await runAgentDesign({
    map: importGameplayMap(source),
    brief,
    session,
    requestedModel: session.requestedModel,
  });

  if (json) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    process.exit(result.status === "completed" ? 0 : 1);
  }

  const beforeLos = losCounts(result.initialEvaluation);
  const afterLos = losCounts(result.finalEvaluation);
  process.stdout.write(`map ${result.sourceMapId ?? mapId}  kind ${result.kind}\n`);
  process.stdout.write(`model requested ${result.model.requested}`);
  if (result.model.returnedModels.length) {
    process.stdout.write(`  returned ${[...new Set(result.model.returnedModels)].join(",")}`);
  }
  process.stdout.write("\n");
  process.stdout.write(`brief ${brief}\n`);
  process.stdout.write(`status ${result.status}\n`);

  let prevLos = beforeLos;
  for (const turn of result.turns) {
    process.stdout.write(`\nturn ${turn.turn}\n`);
    process.stdout.write(`  tool ${turn.tool}\n`);
    if (turn.intent) process.stdout.write(`  intent ${turn.intent}\n`);
    if (turn.outcome?.ok) {
      process.stdout.write(`  changed ${turn.outcome.changedIds?.join(", ") ?? "-"}\n`);
    } else if (turn.outcome) {
      process.stdout.write(`  rejected ${JSON.stringify(turn.outcome.error)}\n`);
    }
    if (turn.evaluationAfter) {
      const now = losCounts(turn.evaluationAfter);
      process.stdout.write(`  hard failures ${turn.evaluationAfter.summary.hardFailureCount}\n`);
      process.stdout.write(
        `  ghost↔sentinel clear ${prevLos.spawnClear}/${prevLos.spawnTotal} → ${now.spawnClear}/${now.spawnTotal}\n`,
      );
      prevLos = now;
    }
    if (turn.usage) {
      process.stdout.write(
        `  tokens in ${turn.usage.inputTokens ?? "-"}  out ${turn.usage.outputTokens ?? "-"}\n`,
      );
    }
  }

  if (result.finishSummary) process.stdout.write(`\nsummary ${result.finishSummary}\n`);
  if (result.invalidReason) process.stdout.write(`\ninvalid ${result.invalidReason}\n`);
  process.stdout.write(
    `edits ${result.successfulEdits}/${MAX_AGENT_EDIT_ATTEMPTS}  attempts ${result.editAttempts}  model calls ${result.modelCalls}\n`,
  );
  process.stdout.write(
    `hard failures ${result.initialEvaluation.summary.hardFailureCount} → ${result.finalEvaluation.summary.hardFailureCount}\n`,
  );
  printAggregates(result.initialEvaluation, "initial");
  printAggregates(result.finalEvaluation, "final");
  process.stdout.write(
    `LOS clear ${beforeLos.clear}/${beforeLos.total} → ${afterLos.clear}/${afterLos.total}  ghost↔sentinel ${beforeLos.spawnClear}/${beforeLos.spawnTotal} → ${afterLos.spawnClear}/${afterLos.spawnTotal}\n`,
  );
  if (result.totalUsage) {
    process.stdout.write(
      `tokens in ${result.totalUsage.inputTokens ?? "-"}  out ${result.totalUsage.outputTokens ?? "-"}  total ${result.totalUsage.totalTokens ?? "-"}\n`,
    );
  }
  process.stdout.write(`latency total ${result.totalLatencyMs}ms\n`);
  process.exit(result.status === "completed" ? 0 : 1);
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
