import { hypot2, roundMeters, segmentHitsAabb } from "./geometry.js";
import { EYE_HEIGHT, type ArenaMap, type LosPair } from "./types.js";

export function losPair(
  map: ArenaMap,
  fromId: string,
  from: { x: number; z: number },
  toId: string,
  to: { x: number; z: number },
): LosPair {
  const distanceMeters = roundMeters(hypot2(to.x - from.x, to.z - from.z));
  let bestT = Infinity;
  let blockedBy: string | undefined;

  for (const solid of map.solids) {
    const t = segmentHitsAabb(
      from.x, EYE_HEIGHT, from.z,
      to.x, EYE_HEIGHT, to.z,
      solid,
    );
    if (t === null) continue;
    if (t < bestT) {
      bestT = t;
      blockedBy = solid.id;
    }
  }

  if (blockedBy) {
    return { from: fromId, to: toId, clear: false, distanceMeters, blockedBy };
  }
  return { from: fromId, to: toId, clear: true, distanceMeters };
}
