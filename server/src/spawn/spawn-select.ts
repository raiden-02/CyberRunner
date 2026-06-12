import { getCurrentMap, isPointInsideBox } from "../world/maps/map-registry.js";
import type { PlayerRuntime } from "../player-runtime.js";

const MIN_SPAWN_DISTANCE = 8;

export function isInSpawnProtectionZone(x: number, y: number, z: number): boolean {
  const currentMap = getCurrentMap();
  return currentMap.spawnProtectionZones.some((zone) =>
    x >= zone.x - zone.hx &&
    x <= zone.x + zone.hx &&
    z >= zone.z - zone.hz &&
    z <= zone.z + zone.hz &&
    y >= zone.y - zone.hy &&
    y <= zone.y + zone.hy
  );
}

export function pickSpawnPoint(
  players: Map<string, PlayerRuntime>,
  sessionId: string | undefined,
  getPlayerTeam: (sessionId: string) => string | undefined,
): { x: number; y: number; z: number } {
  const currentMap = getCurrentMap();

  let spawnPoints = currentMap.spawnPoints;
  if (sessionId) {
    const teamId = getPlayerTeam(sessionId);
    if (teamId === "ghosts" && currentMap.ghostSpawnPoints) {
      spawnPoints = currentMap.ghostSpawnPoints;
    } else if (teamId === "sentinels" && currentMap.sentinelSpawnPoints) {
      spawnPoints = currentMap.sentinelSpawnPoints;
    }
  }

  const alivePositions: Array<{ x: number; y: number; z: number }> = [];
  for (const [, player] of players) {
    if (!player.schema.isDead) {
      alivePositions.push({ x: player.schema.x, y: player.schema.y, z: player.schema.z });
    }
  }

  if (alivePositions.length === 0) {
    const idx = Math.floor(Math.random() * spawnPoints.length);
    return spawnPoints[idx];
  }

  let bestPoint = spawnPoints[0];
  let bestScore = -Infinity;

  for (const point of spawnPoints) {
    let blocked = false;
    for (const obs of currentMap.obstacles) {
      if (isPointInsideBox(point, obs)) {
        blocked = true;
        break;
      }
    }
    if (!blocked) {
      for (const occ of currentMap.occluders) {
        if (isPointInsideBox(point, occ)) {
          blocked = true;
          break;
        }
      }
    }
    if (!blocked) {
      for (const br of currentMap.breakables) {
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
    return pick;
  }

  if (bestScore === -Infinity) {
    const idx = Math.floor(Math.random() * spawnPoints.length);
    return spawnPoints[idx];
  }

  return bestPoint;
}
