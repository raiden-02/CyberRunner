/**
 * Seeded ArenaForge playtest on a registered map.
 *
 *   npx tsx --tsconfig server/tsconfig.json server/scripts/arena-forge-playtest.ts --map=map-contract-smoke
 *   npx tsx --tsconfig server/tsconfig.json server/scripts/arena-forge-playtest.ts --map=map-contract-smoke --json
 */
import { getGameplayMap } from "../../shared/world/map-registry.js";
import { importGameplayMap } from "../src/arena-forge/import-map.js";
import { formatPlaytestReport, runPlaytest } from "../src/arena-forge/playtest.js";

const args = process.argv.slice(2);
const json = args.includes("--json");
const mapArg = args.find((a) => a.startsWith("--map="))?.slice("--map=".length);
const mapId = mapArg ?? "map-contract-smoke";

try {
  const map = importGameplayMap(getGameplayMap(mapId));
  const report = runPlaytest(map);
  if (json) {
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  } else {
    process.stdout.write(`map ${mapId}\n\n`);
    process.stdout.write(formatPlaytestReport(report) + "\n");
  }
} catch (err) {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
}
