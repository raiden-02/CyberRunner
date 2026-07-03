/**
 * Evaluate a registered CyberRunner map. Default mode is search_destroy.
 *
 *   npx tsx --tsconfig server/tsconfig.json server/scripts/arena-forge-evaluate.ts
 *   npx tsx --tsconfig server/tsconfig.json server/scripts/arena-forge-evaluate.ts map-contract-smoke
 *   npx tsx --tsconfig server/tsconfig.json server/scripts/arena-forge-evaluate.ts shoot-house-neon --json
 *   npx tsx --tsconfig server/tsconfig.json server/scripts/arena-forge-evaluate.ts shoot-house-neon --mode=deathmatch
 */
import { getDefaultMapId, getGameplayMap } from "../../shared/world/map-registry.js";
import { evaluateGameplayMap } from "../src/arena-forge/evaluator.js";
import type { ArenaEvaluationMode } from "../src/arena-forge/types.js";

const args = process.argv.slice(2);
const json = args.includes("--json");
const modeArg = args.find((a) => a.startsWith("--mode="))?.slice("--mode=".length);
const mode: ArenaEvaluationMode = modeArg === "deathmatch" ? "deathmatch" : "search_destroy";
const mapId = args.find((a) => !a.startsWith("--")) ?? getDefaultMapId();

const evaluation = evaluateGameplayMap(getGameplayMap(mapId), mode);

if (json) {
  process.stdout.write(JSON.stringify(evaluation, null, 2) + "\n");
  process.exit(0);
}

const { summary, navigation, lineOfSight, spawns, objectives } = evaluation;
process.stdout.write(`map ${evaluation.sourceMapId ?? mapId}  mode ${evaluation.mode}\n`);
process.stdout.write(`hard failures ${summary.hardFailureCount}\n`);
for (const issue of summary.hardFailures) {
  process.stdout.write(`  ${JSON.stringify(issue)}\n`);
}
process.stdout.write(
  `grid ${navigation.cellMeters}m 4-neighbor  walkable ${navigation.walkableCells}/${navigation.totalCells}\n`,
);
process.stdout.write(
  `components ${navigation.components.count}  largest ${navigation.components.largestCells} (${navigation.components.largestFraction})\n`,
);
const reachable = navigation.paths.filter((p) => p.reachable).length;
process.stdout.write(`paths reachable ${reachable}/${navigation.paths.length}\n`);
for (const a of navigation.aggregates) {
  process.stdout.write(
    `  ${a.fromRole} → ${a.to}  n=${a.sampleCount}  min=${a.minMeters ?? "-"}  median=${a.medianMeters ?? "-"}\n`,
  );
}
const blockedSpawns = spawns.results.filter((s) => !s.valid);
process.stdout.write(`invalid spawns ${blockedSpawns.length}/${spawns.results.length}\n`);
const badObj = objectives.results.filter((o) => !o.valid);
process.stdout.write(`invalid objectives ${badObj.length}/${objectives.results.length}\n`);
const clearLos = lineOfSight.pairs.filter((p) => p.clear);
const spawnLos = lineOfSight.pairs.filter(
  (p) => p.from.startsWith("ghost-spawn-") && p.to.startsWith("sentinel-spawn-"),
);
const clearSpawnLos = spawnLos.filter((p) => p.clear);
process.stdout.write(
  `LOS eye ${lineOfSight.eyeHeight}m  clear ${clearLos.length}/${lineOfSight.pairs.length}  ghost↔sentinel clear ${clearSpawnLos.length}/${spawnLos.length}\n`,
);
for (const p of spawnLos.filter((p) => p.clear)) {
  process.stdout.write(`  ${p.from} → ${p.to}  ${p.distanceMeters}m\n`);
}
