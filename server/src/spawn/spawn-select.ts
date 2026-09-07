import { isPointInsideBox } from "@shared/world/map-types.js";
import type { GameplayMapDefinition, SpawnPoint } from "@shared/world/map-types.js";
import type { PlayerRuntime } from "../player-runtime.js";

const MIN_SPAWN_DISTANCE = 8;

export type SpawnCandidateSource = "ghosts" | "sentinels" | "general" | "snd-fallback";

function usableSpawns(points: SpawnPoint[] | undefined): SpawnPoint[] | undefined {
  if (!points || points.length === 0) return undefined;
  return points;
}

function requireSpawn(points: SpawnPoint[] | undefined, message: string): SpawnPoint[] {
  const usable = usableSpawns(points);
  if (!usable) throw new Error(message);
  return usable;
}

function pickDefined(points: SpawnPoint[]): SpawnPoint {
  return points[Math.floor(Math.random() * points.length)]!;
}

/**
 * Team-aware spawn lists. Search & Destroy uses team arrays only.
 * Empty general spawnPoints is valid for native S&D maps.
 */
export function spawnCandidates(
  map: GameplayMapDefinition,
  teamId: string | undefined,
): { points: SpawnPoint[]; source: SpawnCandidateSource } {
  if (teamId === "ghosts") {
    return {
      points: requireSpawn(map.ghostSpawnPoints, "Map has no usable Ghost spawn points."),
      source: "ghosts",
    };
  }
  if (teamId === "sentinels") {
    return {
      points: requireSpawn(map.sentinelSpawnPoints, "Map has no usable Sentinel spawn points."),
      source: "sentinels",
    };
  }

  const general = usableSpawns(map.spawnPoints);
  if (general) return { points: general, source: "general" };

  const ghosts = usableSpawns(map.ghostSpawnPoints) ?? [];
  const sentinels = usableSpawns(map.sentinelSpawnPoints) ?? [];
  if (ghosts.length > 0 || sentinels.length > 0) {
    return { points: [...ghosts, ...sentinels], source: "snd-fallback" };
  }

  throw new Error("Map has no usable spawn points.");
}

export function isInSpawnProtectionZone(
  map: GameplayMapDefinition,
  x: number,
  y: number,
  z: number,
): boolean {
  return map.spawnProtectionZones.some((zone) =>
    x >= zone.x - zone.hx &&
    x <= zone.x + zone.hx &&
    z >= zone.z - zone.hz &&
    z <= zone.z + zone.hz &&
    y >= zone.y - zone.hy &&
    y <= zone.y + zone.hy
  );
}

export function pickSpawnPoint(
  map: GameplayMapDefinition,
  players: Map<string, PlayerRuntime>,
  sessionId: string | undefined,
  getPlayerTeam: (sessionId: string) => string | undefined,
): { x: number; y: number; z: number } {
  const teamId = sessionId ? getPlayerTeam(sessionId) : undefined;
  const spawnPoints = spawnCandidates(map, teamId).points;

  const alivePositions: Array<{ x: number; y: number; z: number }> = [];
  for (const [, player] of players) {
    if (!player.schema.isDead) {
      alivePositions.push({ x: player.schema.x, y: player.schema.y, z: player.schema.z });
    }
  }

  if (alivePositions.length === 0) {
    return pickDefined(spawnPoints);
  }

  let bestPoint = spawnPoints[0];
  let bestScore = -Infinity;

  for (const point of spawnPoints) {
    let blocked = false;
    for (const obs of map.obstacles) {
      if (isPointInsideBox(point, obs)) {
        blocked = true;
        break;
      }
    }
    if (!blocked) {
      for (const occ of map.occluders) {
        if (isPointInsideBox(point, occ)) {
          blocked = true;
          break;
        }
      }
    }
    if (!blocked) {
      for (const br of map.breakables) {
        if (isPointInsideBox(point, br)) {
          blocked = true;
          break;
        }
      }
    }
    if (blocked) continue;

    let minDistSq = Infinity;
    for (const pos of alivePositions) {
      const dx = point.x - pos.x;
      const dz = point.z - pos.z;
      const distSq = dx * dx + dz * dz;
      if (distSq < minDistSq) minDistSq = distSq;
    }
    if (minDistSq > bestScore) {
      bestScore = minDistSq;
      bestPoint = point;
    }
  }

  if (bestScore < MIN_SPAWN_DISTANCE * MIN_SPAWN_DISTANCE) {
    const sorted = [...spawnPoints].sort((a, b) => {
      const aScore = alivePositions.reduce((min, pos) => {
        const dx = a.x - pos.x;
        const dz = a.z - pos.z;
        return Math.min(min, dx * dx + dz * dz);
      }, Infinity);
      const bScore = alivePositions.reduce((min, pos) => {
        const dx = b.x - pos.x;
        const dz = b.z - pos.z;
        return Math.min(min, dx * dx + dz * dz);
      }, Infinity);
      return bScore - aScore;
    });
    const pick = sorted[Math.floor(Math.random() * Math.min(3, sorted.length))];
    if (!pick) return pickDefined(spawnPoints);
    return pick;
  }

  if (bestScore === -Infinity) {
    return pickDefined(spawnPoints);
  }

  return bestPoint;
}
