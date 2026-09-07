import {
  STANDING_SPAWN_Y,
  clusterCentroid,
  teamClusterPoints,
  type ArenaDesignSpec,
} from "@shared/world/arena-design-spec.js";
import { compatibilityHalfSize } from "@shared/world/map-bounds.js";
import type { ArenaMap, ArenaSpawn, ArenaZone } from "./types.js";

const WALL_HEIGHT = 3;
const WALL_THICKNESS = 0.4;
const GROUND_THICKNESS = 0.1;
const ZONE_HY = 1.5;
const ZONE_HALF = 2.2;

function spawnAt(
  id: string,
  role: ArenaSpawn["role"],
  x: number,
  z: number,
): ArenaSpawn {
  return { id, role, x, y: STANDING_SPAWN_Y, z };
}

function zoneAround(id: string, x: number, z: number): ArenaZone {
  return { id, x, y: ZONE_HY, z, hx: ZONE_HALF, hy: ZONE_HY, hz: ZONE_HALF };
}

/**
 * Deterministic blank arena from the human design spec.
 * Envelope and spawns are locked. No interior solids. S&D has no A/B yet.
 */
export function buildBlankArena(spec: ArenaDesignSpec): ArenaMap {
  const envelope = spec.envelope;
  const spawns: ArenaSpawn[] = [];
  const spawnProtectionZones: ArenaZone[] = [];
  let spikeSpawnLocation: ArenaMap["spikeSpawnLocation"];

  if (spec.mode === "search_destroy" && spec.spawnSetup.kind === "search_destroy") {
    const ghostPts = teamClusterPoints(spec.spawnSetup.ghostAnchor);
    const sentinelPts = teamClusterPoints(spec.spawnSetup.sentinelAnchor);
    ghostPts.forEach((p, i) => spawns.push(spawnAt(`ghost-spawn-${i}`, "ghost", p.x, p.z)));
    sentinelPts.forEach((p, i) => spawns.push(spawnAt(`sentinel-spawn-${i}`, "sentinel", p.x, p.z)));
    const ghostCenter = clusterCentroid(ghostPts);
    const sentinelCenter = clusterCentroid(sentinelPts);
    spikeSpawnLocation = {
      id: "spike-spawn",
      x: ghostCenter.x,
      y: STANDING_SPAWN_Y,
      z: ghostCenter.z,
    };
    spawnProtectionZones.push(
      zoneAround("zone-0", ghostCenter.x, ghostCenter.z),
      zoneAround("zone-1", sentinelCenter.x, sentinelCenter.z),
    );
  } else if (spec.spawnSetup.kind === "deathmatch") {
    spec.spawnSetup.general.forEach((p, i) => {
      spawns.push(spawnAt(`spawn-${i}`, "general", p.x, p.z));
    });
  }

  return {
    boundsHalfSize: compatibilityHalfSize(envelope),
    bounds: envelope,
    wallHeight: WALL_HEIGHT,
    wallThickness: WALL_THICKNESS,
    groundThickness: GROUND_THICKNESS,
    solids: [],
    spawns,
    objectives: [],
    spawnProtectionZones,
    spikeSpawnLocation,
  };
}
