import { PLAYER_RADIUS, STANDING_CAPSULE_TOP, type ArenaSolid } from "./types.js";

export function isFiniteNumber(n: number): boolean {
  return Number.isFinite(n);
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export function roundMeters(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function hypot2(dx: number, dz: number): number {
  return Math.hypot(dx, dz);
}

/** Circle vs AABB on XZ. Contact counts as overlap. */
export function circleOverlapsAabb(
  cx: number,
  cz: number,
  radius: number,
  box: { x: number; z: number; hx: number; hz: number },
): boolean {
  const closestX = clamp(cx, box.x - box.hx, box.x + box.hx);
  const closestZ = clamp(cz, box.z - box.hz, box.z + box.hz);
  const dx = cx - closestX;
  const dz = cz - closestZ;
  return dx * dx + dz * dz <= radius * radius;
}

export function solidOverlapsStandingCapsule(solid: ArenaSolid, cx: number, cz: number): boolean {
  const top = solid.y + solid.hy;
  const bottom = solid.y - solid.hy;
  if (top <= 0 || bottom >= STANDING_CAPSULE_TOP) return false;
  return circleOverlapsAabb(cx, cz, PLAYER_RADIUS, solid);
}

export function pointInsideBounds(x: number, z: number, boundsHalfSize: number): boolean {
  return Math.abs(x) <= boundsHalfSize && Math.abs(z) <= boundsHalfSize;
}

export function circleInsideBounds(x: number, z: number, radius: number, boundsHalfSize: number): boolean {
  return (
    x - radius >= -boundsHalfSize &&
    x + radius <= boundsHalfSize &&
    z - radius >= -boundsHalfSize &&
    z + radius <= boundsHalfSize
  );
}

export type BoundSide = "x+" | "x-" | "z+" | "z-";

export function solidBoundOverhangs(
  solid: ArenaSolid,
  boundsHalfSize: number,
): Array<{ side: BoundSide; overhangMeters: number }> {
  const overhangs: Array<{ side: BoundSide; overhangMeters: number }> = [];
  const minX = solid.x - solid.hx;
  const maxX = solid.x + solid.hx;
  const minZ = solid.z - solid.hz;
  const maxZ = solid.z + solid.hz;
  if (maxX > boundsHalfSize) {
    overhangs.push({ side: "x+", overhangMeters: roundMeters(maxX - boundsHalfSize) });
  }
  if (minX < -boundsHalfSize) {
    overhangs.push({ side: "x-", overhangMeters: roundMeters(-boundsHalfSize - minX) });
  }
  if (maxZ > boundsHalfSize) {
    overhangs.push({ side: "z+", overhangMeters: roundMeters(maxZ - boundsHalfSize) });
  }
  if (minZ < -boundsHalfSize) {
    overhangs.push({ side: "z-", overhangMeters: roundMeters(-boundsHalfSize - minZ) });
  }
  return overhangs;
}

/**
 * Segment vs AABB, slab method. Inclusive on faces.
 * Returns the first hit distance along the segment, or null.
 */
export function segmentHitsAabb(
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  box: { x: number; y: number; z: number; hx: number; hy: number; hz: number },
): number | null {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  let tMin = 0;
  let tMax = 1;

  const slabs: Array<[number, number, number, number]> = [
    [ax, dx, box.x - box.hx, box.x + box.hx],
    [ay, dy, box.y - box.hy, box.y + box.hy],
    [az, dz, box.z - box.hz, box.z + box.hz],
  ];

  for (const [origin, dir, min, max] of slabs) {
    if (dir === 0) {
      if (origin < min || origin > max) return null;
      continue;
    }
    const inv = 1 / dir;
    let t1 = (min - origin) * inv;
    let t2 = (max - origin) * inv;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return null;
  }

  return tMin;
}
