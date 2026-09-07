/**
 * Record one native ArenaForge product run.
 *
 * Default writes `.arena-forge-results/native-demo-candidate.json`.
 * Does not overwrite the committed fixture.
 *
 *   npm run forge:record-native-demo -- --provider openai
 */
import { config } from "dotenv";
import { writeFileSync } from "node:fs";
import path from "node:path";

config({ path: path.resolve(import.meta.dirname, "../.env") });
import { NATIVE_DEMO_SPEC } from "../src/arena-forge/native-demo-spec.js";
import {
  nativeDemoCandidatePath,
  printNativeDemoSummary,
  recordNativeDemo,
  writeNativeDemoCandidate,
} from "../src/arena-forge/record-native-demo.js";
import { runSyntheticNativeDemo } from "../src/arena-forge/synthetic-native-demo.js";
import type { ArenaForgeProvider } from "../src/arena-forge/provider.js";

function argValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx < 0) return undefined;
  return process.argv[idx + 1];
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function printHelp(): void {
  process.stdout.write(
    [
      "Record one native ArenaForge S&D product run.",
      "",
      "  npm run forge:record-native-demo -- --provider openai",
      "",
      "Uses the current product agent, tools, and budgets.",
      "Writes a candidate JSON. Does not overwrite the committed fixture.",
      "",
      "Flags:",
      "  --provider openai|anthropic   Override ARENA_FORGE_PROVIDER for this process",
      "  --out <path>                  Candidate output path",
      "  --synthetic                   Scripted run (tests / plumbing only)",
      "  --help                        This text",
      "",
    ].join("\n"),
  );
}

async function main(): Promise<void> {
  if (hasFlag("--help")) {
    printHelp();
    return;
  }
  const positional = process.argv.slice(2).find((a) => a === "openai" || a === "anthropic");
  const providerArg = argValue("--provider") ?? positional;
  if (providerArg && providerArg !== "openai" && providerArg !== "anthropic") {
    throw new Error("--provider must be openai or anthropic.");
  }
  if (providerArg) process.env.ARENA_FORGE_PROVIDER = providerArg;
  const out = argValue("--out") ? path.resolve(argValue("--out")!) : nativeDemoCandidatePath();

  const demo = hasFlag("--synthetic")
    ? await runSyntheticNativeDemo()
    : await recordNativeDemo({
        origin: "live",
        provider: (providerArg as ArenaForgeProvider | undefined),
      });

  const written = writeNativeDemoCandidate(demo, out);
  process.stdout.write(`${printNativeDemoSummary(demo)}\n\n`);
  process.stdout.write(`spec envelope: ${NATIVE_DEMO_SPEC.envelope.halfWidth * 2} x ${NATIVE_DEMO_SPEC.envelope.halfDepth * 2} m\n`);
  process.stdout.write(`candidate: ${written}\n`);
  writeFileSync(path.join(path.dirname(written), "native-demo-candidate.summary.txt"), `${printNativeDemoSummary(demo)}\n`);
}

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
