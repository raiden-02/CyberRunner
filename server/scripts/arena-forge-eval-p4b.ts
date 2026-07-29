/**
 * P4-B held-out interaction-stress runner. Separate from P4-A.
 *
 *   npx tsx --tsconfig server/tsconfig.json server/scripts/arena-forge-eval-p4b.ts --print-manifest
 *   npx tsx --tsconfig server/tsconfig.json server/scripts/arena-forge-eval-p4b.ts --held-out
 *   npx tsx --tsconfig server/tsconfig.json server/scripts/arena-forge-eval-p4b.ts --summarize=server/.arena-forge-results/<run>
 */
import { config } from "dotenv";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  formatFrozenP4BManifest,
  getP4BCase,
  P4B_ARMS,
  P4B_MANIFEST_ID,
  P4B_REPLICATES,
  p4bHeldOutCases,
  p4bManifestHash,
  type P4BCaseDefinition,
} from "../src/arena-forge/eval-cases-p4b.js";
import type { P4Arm } from "../src/arena-forge/eval-cases.js";
import {
  aggregateP4B,
  renderP4BMarkdown,
  runP4BEvalCaseOnce,
  type P4BRunArtifact,
} from "../src/arena-forge/evaluation-p4b.js";
import { missingOpenAIKeyMessage, readOpenAIApiKey, resolveArenaForgeModel } from "../src/arena-forge/one-shot.js";
import { OpenAIAgentSession } from "../src/arena-forge/openai-agent.js";
import { OpenAIOneShotDesigner } from "../src/arena-forge/openai-designer.js";

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
config({ path: path.join(serverDir, ".env") });

const RESULTS_ROOT = path.join(serverDir, ".arena-forge-results");
const SUMMARY_PATH = path.join(serverDir, "arena-forge-evaluation-p4b.md");

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

function runFileName(artifact: Pick<P4BRunArtifact, "caseId" | "arm" | "replicate">): string {
  return `${artifact.caseId}__${artifact.arm}__r${artifact.replicate}.json`;
}

async function executeRun(
  def: P4BCaseDefinition,
  arm: P4Arm,
  replicate: number,
  model: string,
): Promise<P4BRunArtifact> {
  process.stdout.write(`\n--- ${def.id}  ${arm}  r${replicate} ---\n`);
  const artifact = await runP4BEvalCaseOnce({
    def,
    arm,
    replicate,
    requestedModel: model,
    designerFactory: () => new OpenAIOneShotDesigner({ model }),
    sessionFactory: () => new OpenAIAgentSession({ model }),
  });
  process.stdout.write(
    `status ${artifact.execution}  all ${artifact.satisfiedCount}/${artifact.declaredCount}  target ${artifact.targetSatisfied}/${artifact.targetDeclared}  guard ${artifact.guardrailSatisfied}/${artifact.guardrailDeclared}  hard ${artifact.hardFailureCount}  edits ${artifact.successfulEdits}  tokens ${artifact.usage.totalTokens}  ${artifact.latencyMs}ms`,
  );
  if (artifact.infrastructureRetry) process.stdout.write("  infra-retry");
  if (artifact.feedbackResponsive) {
    process.stdout.write(`  feedback ${artifact.feedbackResponsive.classification}`);
  }
  if (artifact.regressionRecovery) {
    process.stdout.write(`  recovery ${artifact.regressionRecovery.classification}`);
  }
  process.stdout.write("\n");
  return artifact;
}

function loadSuite(dir: string): P4BRunArtifact[] {
  const files = readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "suite.json" && f !== "manifest.json");
  return files.map((f) => JSON.parse(readFileSync(path.join(dir, f), "utf8")) as P4BRunArtifact);
}

function writeSummary(dir: string, runs: P4BRunArtifact[], model: string): void {
  const aggregate = aggregateP4B(runs, model);
  writeJson(path.join(dir, "suite.json"), aggregate);
  const markdown = renderP4BMarkdown({ requestedModel: model, aggregate, runs });
  writeFileSync(path.join(dir, "arena-forge-evaluation-p4b.md"), markdown, "utf8");
  writeFileSync(SUMMARY_PATH, markdown, "utf8");
  process.stdout.write(`\nWrote ${path.relative(serverDir, SUMMARY_PATH)}\n`);
  process.stdout.write(`Verdict: ${aggregate.verdict}\n`);
}

try {
  const model = requestedModel();

  if (printManifest || heldOut) {
    process.stdout.write(formatFrozenP4BManifest(model));
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
    const artifact = await executeRun(getP4BCase(caseId), armArg, Number(replicateArg), model);
    const dir = path.join(RESULTS_ROOT, "p4b-adhoc");
    writeJson(path.join(dir, runFileName(artifact)), artifact);
    process.exit(0);
  }

  if (!heldOut) {
    process.stderr.write("Pass --print-manifest, --held-out, --summarize=<dir>, or --case --arm --replicate.\n");
    process.exit(1);
  }

  requireKey();
  const runId = `p4b-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const dir = path.join(RESULTS_ROOT, runId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "manifest.txt"), formatFrozenP4BManifest(model), "utf8");
  writeJson(path.join(dir, "manifest.json"), {
    manifestId: P4B_MANIFEST_ID,
    manifestHash: p4bManifestHash(),
    requestedModel: model,
    runId,
  });
  process.stdout.write(`\nWriting artifacts to ${dir}\n`);

  const held = p4bHeldOutCases();
  const runs: P4BRunArtifact[] = [];
  for (const def of held) {
    for (const arm of P4B_ARMS) {
      for (let replicate = 1; replicate <= P4B_REPLICATES; replicate++) {
        const artifact = await executeRun(def, arm, replicate, model);
        writeJson(path.join(dir, runFileName(artifact)), artifact);
        runs.push(artifact);
      }
    }
  }

  if (runs.length !== held.length * P4B_ARMS.length * P4B_REPLICATES) {
    throw new Error(`expected 20 held-out P4-B runs, got ${runs.length}`);
  }
  writeSummary(dir, runs, model);
  process.exit(0);
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
