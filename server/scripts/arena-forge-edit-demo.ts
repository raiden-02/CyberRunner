/**
 * Apply one or two bounded ArenaForge edits to a registered map and print
 * evaluator facts. Not a presentation UI.
 *
 *   npx tsx --tsconfig server/tsconfig.json server/scripts/arena-forge-edit-demo.ts
 *   npx tsx --tsconfig server/tsconfig.json server/scripts/arena-forge-edit-demo.ts map-contract-smoke
 */
import { getDefaultMapId, getGameplayMap } from "../../shared/world/map-registry.js";
import { ArenaWorkspace } from "../src/arena-forge/workspace.js";

const mapId = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? getDefaultMapId();
const source = getGameplayMap(mapId);
const ws = ArenaWorkspace.fromGameplay(source);

function printFacts(label: string) {
  const ev = ws.evaluation;
  const blockedSpawns = ev.spawns.results.filter((s) => !s.valid);
  const unreachable = ev.navigation.paths.filter((p) => !p.reachable);
  const spawnLos = ev.lineOfSight.pairs.filter(
    (p) => p.from.startsWith("ghost-spawn-") && p.to.startsWith("sentinel-spawn-"),
  );
  const clearSpawnLos = spawnLos.filter((p) => p.clear);
  process.stdout.write(`\n${label}\n`);
  process.stdout.write(`  solids ${ws.currentMap().solids.map((s) => s.id).join(", ") || "(none)"}\n`);
  process.stdout.write(`  hard failures ${ev.summary.hardFailureCount}\n`);
  process.stdout.write(`  invalid spawns ${blockedSpawns.length}/${ev.spawns.results.length}\n`);
  for (const s of blockedSpawns) {
    process.stdout.write(`    ${s.id} blockedBy=${s.blockedBy ?? "-"}\n`);
  }
  process.stdout.write(`  unreachable paths ${unreachable.length}/${ev.navigation.paths.length}\n`);
  process.stdout.write(
    `  ghost↔sentinel LOS clear ${clearSpawnLos.length}/${spawnLos.length}\n`,
  );
  for (const p of spawnLos.slice(0, 4)) {
    process.stdout.write(
      `    ${p.from} → ${p.to}  ${p.clear ? "clear" : `blockedBy=${p.blockedBy ?? "-"}`}  ${p.distanceMeters}m\n`,
    );
  }
}

function pairFact(from: string, to: string) {
  const p = ws.evaluation.lineOfSight.pairs.find((pair) => pair.from === from && pair.to === to);
  if (!p) return `${from} → ${to}  (missing)`;
  return `${from} → ${to}  ${p.clear ? "clear" : `blockedBy=${p.blockedBy ?? "-"}`}  ${p.distanceMeters}m`;
}

process.stdout.write(`map ${source.id}  mode ${ws.mode}\n`);
printFacts("initial");

// Shoot House: ghost-spawn-1 (-8,-26) ↔ sentinel-spawn-1 (-8,26) is a clear corridor.
process.stdout.write(`\nedit 1  add_solid occluder at (-8, 2, 0)\n`);
process.stdout.write(`  before  ${pairFact("ghost-spawn-1", "sentinel-spawn-1")}\n`);

const add = ws.apply({
  type: "add_solid",
  kind: "occluder",
  x: -8,
  y: 2,
  z: 0,
  hx: 2,
  hy: 2,
  hz: 0.5,
});
if (!add.ok) {
  process.stdout.write(`  failed  ${JSON.stringify(add.error)}\n`);
  process.exit(1);
}
process.stdout.write(`  ok  created ${add.changedIds.join(", ")}\n`);
process.stdout.write(`  after   ${pairFact("ghost-spawn-1", "sentinel-spawn-1")}\n`);

const createdId = add.changedIds[0];
const created = ws.currentMap().solids.find((s) => s.id === createdId);
if (created) {
  process.stdout.write(`\nedit 2  move_solid ${createdId}  z += 2\n`);
  const move = ws.apply({
    type: "move_solid",
    solidId: createdId,
    x: created.x,
    y: created.y,
    z: created.z + 2,
  });
  if (!move.ok) {
    process.stdout.write(`  failed  ${JSON.stringify(move.error)}\n`);
    process.exit(1);
  }
  process.stdout.write(`  ok  changed ${move.changedIds.join(", ")}\n`);
}

printFacts("after edits");
