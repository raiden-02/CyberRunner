/**
 * P4 held-out comparison runner.
 *
 *   npx tsx --tsconfig server/tsconfig.json server/scripts/arena-forge-eval.ts --print-manifest
 *   npx tsx --tsconfig server/tsconfig.json server/scripts/arena-forge-eval.ts --held-out
 *   npx tsx --tsconfig server/tsconfig.json server/scripts/arena-forge-eval.ts --summarize=server/.arena-forge-results/<run>
 */
import { config } from "dotenv";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  formatFrozenManifest,
  getEvalCase,
  heldOutCases,
  P4_ARMS,
  P4_MANIFEST_ID,
  P4_REPLICATES,
  p4ManifestHash,
  type P4Arm,
} from "../src/arena-forge/eval-cases.js";
import {
  aggregateHeldOut,
  renderEvaluationMarkdown,
  runEvalCaseOnce,
  type EvalRunArtifact,
} from "../src/arena-forge/evaluation.js";
import { missingOpenAIKeyMessage, readOpenAIApiKey, resolveArenaForgeModel } from "../src/arena-forge/one-shot.js";
import { OpenAIAgentSession } from "../src/arena-forge/openai-agent.js";
import { OpenAIOneShotDesigner } from "../src/arena-forge/openai-designer.js";

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
config({ path: path.join(serverDir, ".env") });

const RESULTS_ROOT = path.join(serverDir, ".arena-forge-results");
const SUMMARY_PATH = path.join(serverDir, "arena-forge-evaluation.md");

const args = process.argv.slice(2);
const printManifest = args.includes("--print-manifest");
const heldOut = args.includes("--held-out");
const summarizeDir = args.find((a) => a.startsWith("--summarize="))?.slice("--summarize=".length);
const caseId = args.find((a) => a.startsWith("--case="))?.slice("--case=".length);
const armArg = args.find((a) => a.startsWith("--arm="))?.slice("--arm=".length);
const replicateArg = args.find((a) => a.startsWith("--replicate="))?.slice("--replicate=".length);

function requestedModel(): string {
  return resolveArenaForgeModel();
}

function requireKey(): void {
  if (!readOpenAIApiKey()) {
    process.stderr.write(`${missingOpenAIKeyMessage()}\n`);
    process.exit(1);
  }
}

function writeJson(filePath: string, value: unknown): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function runFileName(artifact: Pick<EvalRunArtifact, "caseId" | "arm" | "replicate">): string {
  return `${artifact.caseId}__${artifact.arm}__r${artifact.replicate}.json`;
}

async function executeRun(
  evalCaseId: string,
  arm: P4Arm,
  replicate: number,
  model: string,
): Promise<EvalRunArtifact> {
  const evalCase = getEvalCase(evalCaseId);
  process.stdout.write(`\n--- ${evalCase.id}  ${arm}  r${replicate} ---\n`);
  const artifact = await runEvalCaseOnce({
    evalCase,
    arm,
    replicate,
    requestedModel: model,
    designerFactory: () => new OpenAIOneShotDesigner({ model }),
    sessionFactory: () => new OpenAIAgentSession({ model }),
  });
  process.stdout.write(
    `status ${artifact.execution}  constraints ${artifact.satisfiedCount}/${artifact.declaredCount}  hard ${artifact.hardFailureCount}  edits ${artifact.successfulEdits}  tokens ${artifact.usage.totalTokens}  ${artifact.latencyMs}ms`,
  );
  if (artifact.infrastructureRetry) process.stdout.write("  infra-retry");
  if (artifact.feedbackResponsive) {
    process.stdout.write(`  feedback ${artifact.feedbackResponsive.classification}`);
  }
  process.stdout.write("\n");
  return artifact;
}

function loadSuite(dir: string): EvalRunArtifact[] {
  const files = readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "suite.json" && f !== "manifest.json");
  return files.map((f) => JSON.parse(readFileSync(path.join(dir, f), "utf8")) as EvalRunArtifact);
}

function writeSummary(dir: string, runs: EvalRunArtifact[], model: string): void {
  const aggregate = aggregateHeldOut(runs, model);
  writeJson(path.join(dir, "suite.json"), aggregate);
  const markdown = renderEvaluationMarkdown({ requestedModel: model, aggregate, runs });
  writeFileSync(path.join(dir, "arena-forge-evaluation.md"), markdown, "utf8");
  writeFileSync(SUMMARY_PATH, markdown, "utf8");
  process.stdout.write(`\nWrote ${path.relative(serverDir, SUMMARY_PATH)}\n`);
  process.stdout.write(`Verdict: ${aggregate.verdict}\n`);
}

try {
  const model = requestedModel();

  if (printManifest || heldOut) {
    process.stdout.write(formatFrozenManifest(model));
    if (printManifest && !heldOut) process.exit(0);
  }

  if (summarizeDir) {
    const dir = path.resolve(summarizeDir);
    const runs = loadSuite(dir);
    writeSummary(dir, runs, model);
    process.exit(0);
  }

  if (caseId && armArg && replicateArg) {
    requireKey();
    if (armArg !== "one_shot" && armArg !== "agent") {
      process.stderr.write("arm must be one_shot or agent\n");
      process.exit(1);
    }
    const artifact = await executeRun(caseId, armArg, Number(replicateArg), model);
    const dir = path.join(RESULTS_ROOT, "adhoc");
    writeJson(path.join(dir, runFileName(artifact)), artifact);
    process.exit(0);
  }

  if (!heldOut) {
    process.stderr.write("Pass --print-manifest, --held-out, --summarize=<dir>, or --case --arm --replicate.\n");
    process.exit(1);
  }

  requireKey();
  const runId = `p4-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const dir = path.join(RESULTS_ROOT, runId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "manifest.txt"), formatFrozenManifest(model), "utf8");
  writeJson(path.join(dir, "manifest.json"), {
    manifestId: P4_MANIFEST_ID,
    manifestHash: p4ManifestHash(),
    requestedModel: model,
    runId,
  });
  process.stdout.write(`\nWriting artifacts to ${dir}\n`);

  const runs: EvalRunArtifact[] = [];
  for (const evalCase of heldOutCases()) {
    for (const arm of P4_ARMS) {
      for (let replicate = 1; replicate <= P4_REPLICATES; replicate++) {
        const artifact = await executeRun(evalCase.id, arm, replicate, model);
        writeJson(path.join(dir, runFileName(artifact)), artifact);
        runs.push(artifact);
      }
    }
  }

  if (runs.length !== heldOutCases().length * P4_ARMS.length * P4_REPLICATES) {
    throw new Error(`expected 20 held-out runs, got ${runs.length}`);
  }
  writeSummary(dir, runs, model);
  process.exit(0);
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
