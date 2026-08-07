/**
 * Non-LLM before/after: P0 stays clean while playtest metrics move.
 *
 *   npx tsx --tsconfig server/tsconfig.json server/scripts/arena-forge-playtest-demo.ts
 */
import { applyArenaEdit, createIdAllocator } from "../src/arena-forge/actions.js";
import { evaluateArena } from "../src/arena-forge/evaluator.js";
import { importGameplayMap } from "../src/arena-forge/import-map.js";
import { formatPlaytestReport, runPlaytest } from "../src/arena-forge/playtest.js";
import { getGameplayMap } from "../../shared/world/map-registry.js";

const map = importGameplayMap(getGameplayMap("map-contract-smoke"));
const beforeEval = evaluateArena(map);
const before = runPlaytest(map);

const edited = applyArenaEdit(
  map,
  { type: "add_solid", kind: "obstacle", x: 6, y: 2, z: -2, hx: 4, hy: 2, hz: 1.2 },
  createIdAllocator(map),
);
if (!edited.ok) throw new Error(JSON.stringify(edited.error));

const afterEval = evaluateArena(edited.map);
const after = runPlaytest(edited.map);

function compact(ev: ReturnType<typeof evaluateArena>): string {
  const reachable = ev.navigation.paths.filter((p) => p.reachable).length;
  return `hard ${ev.summary.hardFailureCount}  paths ${reachable}/${ev.navigation.paths.length}`;
}

process.stdout.write("P5 playtest demo (no LLM)\n");
process.stdout.write("Edit: add east B cover at (6, 2, -2) hx=4 hz=1.2\n\n");
process.stdout.write(`P0 before: ${compact(beforeEval)}\n`);
process.stdout.write(`P0 after:  ${compact(afterEval)}\n\n`);
process.stdout.write("--- before ---\n");
process.stdout.write(formatPlaytestReport(before) + "\n\n");
process.stdout.write("--- after ---\n");
process.stdout.write(formatPlaytestReport(after) + "\n");
