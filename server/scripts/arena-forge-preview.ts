/**
 * Install a local in-game preview of an ArenaForge map.
 *
 *   npx tsx --tsconfig server/tsconfig.json server/scripts/arena-forge-preview.ts --result=server/.arena-forge-results/<run>/<file>.json --which=final
 *   npx tsx --tsconfig server/tsconfig.json server/scripts/arena-forge-preview.ts --result=... --which=initial
 *
 * Then start the server with MAP_ID=arena-forge-preview and open the client.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ARENA_FORGE_PREVIEW_MAP_ID } from "../../shared/world/arena-forge-preview.js";
import { exportGameplayMap } from "../src/arena-forge/export-map.js";
import type { ArenaMap } from "../src/arena-forge/types.js";

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outPath = path.join(serverDir, ".arena-forge-results", "preview.json");

const args = process.argv.slice(2);
const resultArg = args.find((a) => a.startsWith("--result="))?.slice("--result=".length);
const which = args.find((a) => a.startsWith("--which="))?.slice("--which=".length) ?? "final";

if (!resultArg) {
  process.stderr.write("Pass --result=<p4 run json> and optional --which=initial|final\n");
  process.exit(1);
}

const raw = JSON.parse(readFileSync(path.resolve(resultArg), "utf8")) as {
  caseId?: string;
  arm?: string;
  replicate?: number;
  initialMap?: ArenaMap;
  finalMap?: ArenaMap;
};

const map = which === "initial" ? raw.initialMap : raw.finalMap;
if (!map) {
  process.stderr.write(`result JSON has no ${which} map\n`);
  process.exit(1);
}

const label = `${raw.caseId ?? "arena"} ${raw.arm ?? ""} r${raw.replicate ?? "?"} ${which}`.trim();
const exported = exportGameplayMap(map, { id: ARENA_FORGE_PREVIEW_MAP_ID, name: label });
mkdirSync(path.dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(exported, null, 2) + "\n", "utf8");
process.stdout.write(`wrote ${outPath}\n`);
process.stdout.write(`name ${exported.name}\n`);
process.stdout.write("Restart the server with MAP_ID=arena-forge-preview\n");
