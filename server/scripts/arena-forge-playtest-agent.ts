/**
 * P5 playtest-grounded agent. One live tool loop.
 *
 *   npx tsx --tsconfig server/tsconfig.json server/scripts/arena-forge-playtest-agent.ts --map=map-contract-smoke --brief="..."
 */
import { config } from "dotenv";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getGameplayMap } from "../../shared/world/map-registry.js";
import { importGameplayMap } from "../src/arena-forge/import-map.js";
import { OpenAIPlaytestAgentSession } from "../src/arena-forge/openai-playtest-agent.js";
import { formatPlaytestReport } from "../src/arena-forge/playtest.js";
import {
  MAX_PLAYTEST_CALLS,
  MAX_PLAYTEST_EDIT_ATTEMPTS,
  MAX_PLAYTEST_MODEL_CALLS,
  runPlaytestAgentDesign,
} from "../src/arena-forge/playtest-agent.js";
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
  return {
    clear: pairs.filter((p) => p.clear).length,
    total: pairs.length,
  };
}

try {
  const brief = briefFile ? readFileSync(briefFile, "utf8").trim() : briefArg;
  if (!brief) {
    process.stderr.write("Pass --brief=\"...\" or --brief-file=<path>.\n");
    process.exit(1);
  }

  const session = new OpenAIPlaytestAgentSession();
  const result = await runPlaytestAgentDesign({
    map: importGameplayMap(getGameplayMap(mapId)),
    brief,
    session,
    requestedModel: session.requestedModel,
  });

  if (json) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    process.exit(result.status === "completed" ? 0 : 1);
  }

  process.stdout.write(`map ${result.sourceMapId ?? mapId}  kind ${result.kind}\n`);
  process.stdout.write(`model requested ${result.model.requested}`);
  if (result.model.returnedModels.length) {
    process.stdout.write(`  returned ${[...new Set(result.model.returnedModels)].join(",")}`);
  }
  process.stdout.write("\n");
  process.stdout.write(`brief ${brief}\n`);
  process.stdout.write(`status ${result.status}\n`);
  process.stdout.write(
    `edits ${result.successfulEdits}/${result.editAttempts}  playtests ${result.playtestCalls}/${MAX_PLAYTEST_CALLS}  model calls ${result.modelCalls}/${MAX_PLAYTEST_MODEL_CALLS}  edit budget ${MAX_PLAYTEST_EDIT_ATTEMPTS}\n`,
  );
  if (result.invalidReason) process.stdout.write(`reason ${result.invalidReason}\n`);
  if (result.finishSummary) process.stdout.write(`finish ${result.finishSummary}\n`);
  process.stdout.write(
    `tokens ${result.totalUsage?.totalTokens ?? 0}  latency ${result.totalLatencyMs}ms\n`,
  );

  const beforeLos = losCounts(result.initialEvaluation);
  const afterLos = losCounts(result.finalEvaluation);
  process.stdout.write(
    `P0 hard ${result.initialEvaluation.summary.hardFailureCount} → ${result.finalEvaluation.summary.hardFailureCount}  LOS ${beforeLos.clear}/${beforeLos.total} → ${afterLos.clear}/${afterLos.total}\n`,
  );

  process.stdout.write("\nTurns\n");
  for (const turn of result.turns) {
    process.stdout.write(`  ${turn.turn} ${turn.tool}`);
    if (turn.intent) process.stdout.write(`  ${turn.intent}`);
    if (turn.outcome?.ok === false) process.stdout.write(`  rejected ${JSON.stringify(turn.outcome.error)}`);
    if (turn.playtest) {
      process.stdout.write(
        `  contact ${turn.playtest.firstContact.occurrenceFraction}  ghost conc ${turn.playtest.ghost.routeConcentration}`,
      );
    }
    process.stdout.write("\n");
  }

  if (result.lastPlaytest) {
    process.stdout.write("\nLast playtest\n");
    process.stdout.write(formatPlaytestReport(result.lastPlaytest) + "\n");
  }
  process.exit(result.status === "completed" ? 0 : 1);
} catch (err) {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
}
