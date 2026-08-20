import type { GameplayMapDefinition } from "./map-types.js";

export type PublicSolidKind = "obstacle" | "occluder" | "breakable";
export type PublicSpawnRole = "general" | "ghost" | "sentinel";

export type PublicArenaSolid = {
  id: string;
  kind: PublicSolidKind;
  x: number;
  y: number;
  z: number;
  hx: number;
  hy: number;
  hz: number;
  hp?: number;
};

export type PublicArenaSpawn = {
  id: string;
  role: PublicSpawnRole;
  x: number;
  y: number;
  z: number;
};

export type PublicArenaObjective = {
  id: "A" | "B";
  x: number;
  y: number;
  z: number;
  radius: number;
};

/** Sanitized map slice for Forge visualization. No SDK, prompt, or eval payloads. */
export type PublicArenaMapView = {
  boundsHalfSize: number;
  wallHeight: number;
  wallThickness: number;
  groundThickness: number;
  solids: PublicArenaSolid[];
  spawns: PublicArenaSpawn[];
  objectives: PublicArenaObjective[];
};

export type MapDiffKind = "unchanged" | "added" | "removed" | "changed";

export type MapSolidDiff = {
  id: string;
  kind: MapDiffKind;
};

export type MapAnchorDiff = {
  id: string;
  kind: MapDiffKind;
};

export type ArenaMapDiff = {
  solids: MapSolidDiff[];
  spawns: MapAnchorDiff[];
  objectives: MapAnchorDiff[];
};

const BREAKABLE_HP = 50;

function solidKey(s: PublicArenaSolid): string {
  return [s.kind, s.x, s.y, s.z, s.hx, s.hy, s.hz, s.hp ?? ""].join("|");
}

function spawnKey(s: PublicArenaSpawn): string {
  return [s.role, s.x, s.y, s.z].join("|");
}

function objectiveKey(o: PublicArenaObjective): string {
  return [o.x, o.y, o.z, o.radius].join("|");
}

function classifyById<T extends { id: string }>(
  before: T[],
  after: T[],
  same: (a: T, b: T) => boolean,
): Array<{ id: string; kind: MapDiffKind }> {
  const prev = new Map(before.map((item) => [item.id, item]));
  const next = new Map(after.map((item) => [item.id, item]));
  const ids = new Set([...prev.keys(), ...next.keys()]);
  const out: Array<{ id: string; kind: MapDiffKind }> = [];
  for (const id of ids) {
    const a = prev.get(id);
    const b = next.get(id);
    if (!a && b) out.push({ id, kind: "added" });
    else if (a && !b) out.push({ id, kind: "removed" });
    else if (a && b && !same(a, b)) out.push({ id, kind: "changed" });
    else out.push({ id, kind: "unchanged" });
  }
  return out.sort((x, y) => x.id.localeCompare(y.id));
}

export function diffArenaMapViews(before: PublicArenaMapView, after: PublicArenaMapView): ArenaMapDiff {
  return {
    solids: classifyById(before.solids, after.solids, (a, b) => solidKey(a) === solidKey(b)),
    spawns: classifyById(before.spawns, after.spawns, (a, b) => spawnKey(a) === spawnKey(b)),
    objectives: classifyById(before.objectives, after.objectives, (a, b) => objectiveKey(a) === objectiveKey(b)),
  };
}

export function gameplayFromPublicView(
  view: PublicArenaMapView,
  runtime: { id: string; name: string },
): GameplayMapDefinition {
  return {
    id: runtime.id,
    name: runtime.name,
    boundsHalfSize: view.boundsHalfSize,
    wallHeight: view.wallHeight,
    wallThickness: view.wallThickness,
    groundThickness: view.groundThickness,
    obstacles: view.solids
      .filter((s) => s.kind === "obstacle")
      .map(({ x, y, z, hx, hy, hz }) => ({ x, y, z, hx, hy, hz })),
    occluders: view.solids
      .filter((s) => s.kind === "occluder")
      .map(({ x, y, z, hx, hy, hz }) => ({ x, y, z, hx, hy, hz })),
    breakables: view.solids
      .filter((s) => s.kind === "breakable")
      .map(({ x, y, z, hx, hy, hz, hp }) => ({
        x, y, z, hx, hy, hz,
        hp: hp ?? BREAKABLE_HP,
      })),
    spawnProtectionZones: [],
    spawnPoints: view.spawns
      .filter((s) => s.role === "general")
      .map(({ x, y, z }) => ({ x, y, z })),
    ghostSpawnPoints: view.spawns
      .filter((s) => s.role === "ghost")
      .map(({ x, y, z }) => ({ x, y, z })),
    sentinelSpawnPoints: view.spawns
      .filter((s) => s.role === "sentinel")
      .map(({ x, y, z }) => ({ x, y, z })),
    uploadTerminals: view.objectives.map((o) => ({
      id: o.id,
      x: o.x,
      y: o.y,
      z: o.z,
      radius: o.radius,
    })),
  };
}

export type ShowcaseFraming = {
  centerX: number;
  centerY: number;
  centerZ: number;
  radius: number;
  elevation: number;
  near: number;
  far: number;
};

/** Orbit framing from map bounds and solids. Works for smoke, Forge revisions, and Shoot House. */
export function computeShowcaseFraming(view: PublicArenaMapView): ShowcaseFraming {
  let minX = -view.boundsHalfSize;
  let maxX = view.boundsHalfSize;
  let minZ = -view.boundsHalfSize;
  let maxZ = view.boundsHalfSize;
  let maxY = view.wallHeight;
  for (const s of view.solids) {
    minX = Math.min(minX, s.x - s.hx);
    maxX = Math.max(maxX, s.x + s.hx);
    minZ = Math.min(minZ, s.z - s.hz);
    maxZ = Math.max(maxZ, s.z + s.hz);
    maxY = Math.max(maxY, s.y + s.hy);
  }
  const spanX = Math.max(4, maxX - minX);
  const spanZ = Math.max(4, maxZ - minZ);
  const extent = Math.max(spanX, spanZ);
  const radius = Math.max(8, extent * 0.72);
  return {
    centerX: (minX + maxX) / 2,
    centerY: Math.min(maxY * 0.35, view.wallHeight * 0.6),
    centerZ: (minZ + maxZ) / 2,
    radius,
    elevation: Math.max(4, Math.min(maxY * 1.15, radius * 0.42)),
    near: 0.2,
    far: Math.max(80, radius * 6),
  };
}
