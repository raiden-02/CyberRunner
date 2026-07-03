import type { GameplayMapDefinition } from "@shared/world/map-types.js";
import type { ArenaMap, ArenaObjective, ArenaSolid, ArenaSpawn, ArenaZone } from "./types.js";

/** Deterministic IDs from array order. Stable for one imported working map. */
export function importGameplayMap(map: GameplayMapDefinition): ArenaMap {
  const solids: ArenaSolid[] = [];
  map.obstacles.forEach((o, i) => {
    solids.push({ id: `obstacle-${i}`, kind: "obstacle", ...o });
  });
  map.occluders.forEach((o, i) => {
    solids.push({ id: `occluder-${i}`, kind: "occluder", ...o });
  });
  map.breakables.forEach((o, i) => {
    solids.push({ id: `breakable-${i}`, kind: "breakable", ...o });
  });

  const spawns: ArenaSpawn[] = [];
  map.spawnPoints.forEach((s, i) => {
    spawns.push({ id: `spawn-${i}`, role: "general", ...s });
  });
  (map.ghostSpawnPoints ?? []).forEach((s, i) => {
    spawns.push({ id: `ghost-spawn-${i}`, role: "ghost", ...s });
  });
  (map.sentinelSpawnPoints ?? []).forEach((s, i) => {
    spawns.push({ id: `sentinel-spawn-${i}`, role: "sentinel", ...s });
  });

  const objectives: ArenaObjective[] = (map.uploadTerminals ?? []).map((t) => ({
    id: t.id,
    x: t.x,
    y: t.y,
    z: t.z,
    radius: t.radius,
  }));

  const spawnProtectionZones: ArenaZone[] = map.spawnProtectionZones.map((z, i) => ({
    id: `zone-${i}`,
    ...z,
  }));

  return {
    sourceMapId: map.id,
    boundsHalfSize: map.boundsHalfSize,
    wallHeight: map.wallHeight,
    wallThickness: map.wallThickness,
    groundThickness: map.groundThickness,
    solids,
    spawns,
    objectives,
    spawnProtectionZones,
    spikeSpawnLocation: map.spikeSpawnLocation
      ? { id: "spike-spawn", ...map.spikeSpawnLocation }
      : undefined,
  };
}
