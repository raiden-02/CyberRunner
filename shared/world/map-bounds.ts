/**
 * Axis-aligned XZ playable envelope.
 * Legacy maps store only `boundsHalfSize` (square, centered at origin).
 * New Forge maps store `bounds` natively. `resolveMapBounds` is the only
 * place that translates between the two.
 */
export type MapBoundsRect = {
  centerX: number;
  centerZ: number;
  halfWidth: number;
  halfDepth: number;
};

export type BoundsSource = {
  bounds?: MapBoundsRect;
  boundsHalfSize: number;
};

export function isFiniteNumber(n: number): boolean {
  return Number.isFinite(n);
}

export function resolveMapBounds(map: BoundsSource): MapBoundsRect {
  if (map.bounds) return map.bounds;
  return {
    centerX: 0,
    centerZ: 0,
    halfWidth: map.boundsHalfSize,
    halfDepth: map.boundsHalfSize,
  };
}

/** Legacy square half-extent. Prefer `resolveMapBounds` for geometry. */
export function compatibilityHalfSize(bounds: MapBoundsRect): number {
  return Math.max(bounds.halfWidth, bounds.halfDepth);
}

export function isUsableBounds(bounds: MapBoundsRect): boolean {
  return (
    isFiniteNumber(bounds.centerX) &&
    isFiniteNumber(bounds.centerZ) &&
    isFiniteNumber(bounds.halfWidth) &&
    isFiniteNumber(bounds.halfDepth) &&
    bounds.halfWidth > 0 &&
    bounds.halfDepth > 0
  );
}

export function boundsMinX(b: MapBoundsRect): number {
  return b.centerX - b.halfWidth;
}

export function boundsMaxX(b: MapBoundsRect): number {
  return b.centerX + b.halfWidth;
}

export function boundsMinZ(b: MapBoundsRect): number {
  return b.centerZ - b.halfDepth;
}

export function boundsMaxZ(b: MapBoundsRect): number {
  return b.centerZ + b.halfDepth;
}

export function pointInsideRect(x: number, z: number, b: MapBoundsRect): boolean {
  return x >= boundsMinX(b) && x <= boundsMaxX(b) && z >= boundsMinZ(b) && z <= boundsMaxZ(b);
}

export function circleInsideRect(
  x: number,
  z: number,
  radius: number,
  b: MapBoundsRect,
): boolean {
  return (
    x - radius >= boundsMinX(b) &&
    x + radius <= boundsMaxX(b) &&
    z - radius >= boundsMinZ(b) &&
    z + radius <= boundsMaxZ(b)
  );
}

export type BoundSide = "x+" | "x-" | "z+" | "z-";

export function aabbOverhangs(
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
  b: MapBoundsRect,
): Array<{ side: BoundSide; overhangMeters: number }> {
  const overhangs: Array<{ side: BoundSide; overhangMeters: number }> = [];
  const round = (n: number) => Math.round(n * 1000) / 1000;
  if (maxX > boundsMaxX(b)) overhangs.push({ side: "x+", overhangMeters: round(maxX - boundsMaxX(b)) });
  if (minX < boundsMinX(b)) overhangs.push({ side: "x-", overhangMeters: round(boundsMinX(b) - minX) });
  if (maxZ > boundsMaxZ(b)) overhangs.push({ side: "z+", overhangMeters: round(maxZ - boundsMaxZ(b)) });
  if (minZ < boundsMinZ(b)) overhangs.push({ side: "z-", overhangMeters: round(boundsMinZ(b) - minZ) });
  return overhangs;
}

/** Ground half-extents and wall placements for a rectangular envelope. */
export function boundaryWalls(b: MapBoundsRect, wallThickness: number): Array<{
  tx: number;
  tz: number;
  hx: number;
  hz: number;
}> {
  const wt = wallThickness;
  return [
    { tx: b.centerX + b.halfWidth + wt, tz: b.centerZ, hx: wt, hz: b.halfDepth },
    { tx: b.centerX - b.halfWidth - wt, tz: b.centerZ, hx: wt, hz: b.halfDepth },
    { tx: b.centerX, tz: b.centerZ + b.halfDepth + wt, hx: b.halfWidth, hz: wt },
    { tx: b.centerX, tz: b.centerZ - b.halfDepth - wt, hx: b.halfWidth, hz: wt },
  ];
}
