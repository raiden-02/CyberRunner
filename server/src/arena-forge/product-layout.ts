import { aabbOverhangs, type MapBoundsRect } from "@shared/world/map-bounds.js";
import {
  applyArenaEdit,
  createIdAllocator,
  type ArenaEditAction,
  type ArenaEditError,
} from "./actions.js";
import { isFiniteNumber, solidOverlapsStandingCapsule } from "./geometry.js";
import type { ArenaMap, ArenaSolid, SolidKind } from "./types.js";

export const PRODUCT_GRID = 0.5;
export const MIN_BLOCK_METERS = 0.5;
export const MIN_HEIGHT_METERS = 0.5;
export const MAX_HEIGHT_METERS = 6;
export const MIN_WALL_THICKNESS = 0.4;
export const MAX_WALL_THICKNESS = 2;
export const MIN_WALL_CHAIN_POINTS = 2;
export const MAX_WALL_CHAIN_POINTS = 7;
export const MAX_WALL_CHAIN_SEGMENTS = 6;
const ORTHO_EPS = 1e-3;
const DUP_EPS = 1e-3;

const SOLID_KINDS: SolidKind[] = ["obstacle", "occluder", "breakable"];

export type ProductPoint = { x: number; z: number };

export type AddBlockAction = {
  type: "add_block";
  kind: SolidKind;
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  hp?: number;
};

export type AddWallAction = {
  type: "add_wall";
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  height: number;
  thickness: number;
  kind: SolidKind;
};

export type AddWallChainAction = {
  type: "add_wall_chain";
  points: ProductPoint[];
  height: number;
  thickness: number;
  kind: SolidKind;
};

export type ProductLayoutAction = AddBlockAction | AddWallAction | AddWallChainAction;

export function snapProduct(n: number): number {
  return Math.round(n / PRODUCT_GRID) * PRODUCT_GRID;
}

function nearlyEqual(a: number, b: number, eps = ORTHO_EPS): boolean {
  return Math.abs(a - b) <= eps;
}

function isKind(value: unknown): value is SolidKind {
  return typeof value === "string" && (SOLID_KINDS as string[]).includes(value);
}

function num(rec: Record<string, unknown>, key: string): number | undefined {
  const v = rec[key];
  return typeof v === "number" && isFiniteNumber(v) ? v : undefined;
}

type AddSolidAction = Extract<ArenaEditAction, { type: "add_solid" }>;

function groundedSolid(
  kind: SolidKind,
  x: number,
  z: number,
  hx: number,
  hz: number,
  height: number,
  hp?: number,
): AddSolidAction {
  return {
    type: "add_solid",
    kind,
    x,
    y: height / 2,
    z,
    hx,
    hy: height / 2,
    hz,
    ...(hp !== undefined ? { hp } : {}),
  };
}

export function isOrthogonalWall(x1: number, z1: number, x2: number, z2: number): boolean {
  return nearlyEqual(x1, x2) || nearlyEqual(z1, z2);
}

export function wallBox(
  x1: number,
  z1: number,
  x2: number,
  z2: number,
  height: number,
  thickness: number,
  extendStart = 0,
  extendEnd = 0,
): { x: number; z: number; hx: number; hz: number; y: number; hy: number } | undefined {
  if (!isOrthogonalWall(x1, z1, x2, z2)) return undefined;
  if (nearlyEqual(x1, x2) && nearlyEqual(z1, z2)) return undefined;
  const hy = height / 2;
  if (nearlyEqual(z1, z2)) {
    const dir = x2 >= x1 ? 1 : -1;
    const a = x1 - dir * extendStart;
    const b = x2 + dir * extendEnd;
    const minX = Math.min(a, b);
    const maxX = Math.max(a, b);
    const hx = (maxX - minX) / 2;
    if (hx < MIN_BLOCK_METERS / 2) return undefined;
    return { x: (minX + maxX) / 2, z: z1, hx, hz: thickness / 2, y: hy, hy };
  }
  const dir = z2 >= z1 ? 1 : -1;
  const a = z1 - dir * extendStart;
  const b = z2 + dir * extendEnd;
  const minZ = Math.min(a, b);
  const maxZ = Math.max(a, b);
  const hz = (maxZ - minZ) / 2;
  if (hz < MIN_BLOCK_METERS / 2) return undefined;
  return { x: x1, z: (minZ + maxZ) / 2, hx: thickness / 2, hz, y: hy, hy };
}

function sameSolid(a: ArenaSolid, b: { kind: SolidKind; x: number; z: number; hx: number; hy: number; hz: number }): boolean {
  return (
    a.kind === b.kind
    && nearlyEqual(a.x, b.x, DUP_EPS)
    && nearlyEqual(a.z, b.z, DUP_EPS)
    && nearlyEqual(a.hx, b.hx, DUP_EPS)
    && nearlyEqual(a.hy, b.hy, DUP_EPS)
    && nearlyEqual(a.hz, b.hz, DUP_EPS)
  );
}

export function rejectProductSolid(
  map: ArenaMap,
  solid: { kind: SolidKind; x: number; y: number; z: number; hx: number; hy: number; hz: number },
  envelope: MapBoundsRect,
): ArenaEditError | undefined {
  const overhangs = aabbOverhangs(
    solid.x - solid.hx,
    solid.x + solid.hx,
    solid.z - solid.hz,
    solid.z + solid.hz,
    envelope,
  );
  if (overhangs.length) {
    return { code: "out-of-envelope", side: overhangs[0]!.side };
  }
  const bottom = solid.y - solid.hy;
  const top = solid.y + solid.hy;
  if (Math.abs(bottom) > 1e-3 || top <= 0) {
    return { code: "not-grounded" };
  }
  for (const spawn of map.spawns) {
    if (solidOverlapsStandingCapsule({ ...solid, id: "trial" }, spawn.x, spawn.z)) {
      return { code: "spawn-overlap", target: spawn.id };
    }
  }
  if (map.solids.some((existing) => sameSolid(existing, solid))) {
    return { code: "duplicate-solid" };
  }
  return undefined;
}

function validateHeight(height: number): ArenaEditError | undefined {
  if (!isFiniteNumber(height)) return { code: "invalid-height" };
  if (height < MIN_HEIGHT_METERS || height > MAX_HEIGHT_METERS) return { code: "invalid-height" };
  return undefined;
}

function validateKind(kind: unknown): ArenaEditError | undefined {
  if (!isKind(kind)) return { code: "unsupported-kind" };
  return undefined;
}

export function addBlockToSolid(action: AddBlockAction): AddSolidAction | ArenaEditError {
  const kindErr = validateKind(action.kind);
  if (kindErr) return kindErr;
  if (![action.x, action.z, action.width, action.depth, action.height].every(isFiniteNumber)) {
    return { code: "nonfinite" };
  }
  const heightErr = validateHeight(action.height);
  if (heightErr) return heightErr;
  if (action.width < MIN_BLOCK_METERS || action.depth < MIN_BLOCK_METERS) {
    return { code: "too-small" };
  }
  return groundedSolid(
    action.kind,
    action.x,
    action.z,
    action.width / 2,
    action.depth / 2,
    action.height,
    action.hp,
  );
}

export function addWallToSolid(action: AddWallAction, extendStart = 0, extendEnd = 0): AddSolidAction | ArenaEditError {
  const kindErr = validateKind(action.kind);
  if (kindErr) return kindErr;
  if (![action.x1, action.z1, action.x2, action.z2, action.height, action.thickness].every(isFiniteNumber)) {
    return { code: "nonfinite" };
  }
  const heightErr = validateHeight(action.height);
  if (heightErr) return heightErr;
  if (action.thickness < MIN_WALL_THICKNESS || action.thickness > MAX_WALL_THICKNESS) {
    return { code: "invalid-thickness" };
  }
  if (!isOrthogonalWall(action.x1, action.z1, action.x2, action.z2)) {
    return { code: "diagonal-wall" };
  }
  const box = wallBox(
    action.x1,
    action.z1,
    action.x2,
    action.z2,
    action.height,
    action.thickness,
    extendStart,
    extendEnd,
  );
  if (!box) return { code: "invalid-wall" };
  return groundedSolid(action.kind, box.x, box.z, box.hx, box.hz, action.height);
}

function parsePoint(raw: unknown): ProductPoint | undefined {
  if (Array.isArray(raw) && raw.length >= 2) {
    const x = raw[0];
    const z = raw[1];
    if (typeof x === "number" && typeof z === "number" && isFiniteNumber(x) && isFiniteNumber(z)) {
      return { x: snapProduct(x), z: snapProduct(z) };
    }
    return undefined;
  }
  if (typeof raw === "object" && raw !== null) {
    const rec = raw as Record<string, unknown>;
    const x = rec.x;
    const z = rec.z;
    if (typeof x === "number" && typeof z === "number" && isFiniteNumber(x) && isFiniteNumber(z)) {
      return { x: snapProduct(x), z: snapProduct(z) };
    }
  }
  return undefined;
}

export function parseProductLayoutAction(name: string, args: unknown): ProductLayoutAction | string {
  if (typeof args !== "object" || args === null || Array.isArray(args)) {
    return "tool arguments must be an object";
  }
  const rec = args as Record<string, unknown>;
  if (name === "add_block") {
    const kind = rec.kind;
    const x = num(rec, "x");
    const z = num(rec, "z");
    const width = num(rec, "width");
    const depth = num(rec, "depth");
    const height = num(rec, "height");
    if (!isKind(kind) || x === undefined || z === undefined || width === undefined || depth === undefined || height === undefined) {
      return "add_block requires kind, x, z, width, depth, height";
    }
    const hp = rec.hp === null || rec.hp === undefined ? undefined : num(rec, "hp");
    if (rec.hp !== null && rec.hp !== undefined && hp === undefined) return "add_block hp must be finite when supplied";
    return { type: "add_block", kind, x, z, width, depth, height, ...(hp !== undefined ? { hp } : {}) };
  }
  if (name === "add_wall") {
    const kind = rec.kind;
    const x1 = num(rec, "x1");
    const z1 = num(rec, "z1");
    const x2 = num(rec, "x2");
    const z2 = num(rec, "z2");
    const height = num(rec, "height");
    const thickness = num(rec, "thickness");
    if (
      !isKind(kind)
      || x1 === undefined
      || z1 === undefined
      || x2 === undefined
      || z2 === undefined
      || height === undefined
      || thickness === undefined
    ) {
      return "add_wall requires x1, z1, x2, z2, height, thickness, kind";
    }
    return { type: "add_wall", kind, x1, z1, x2, z2, height, thickness };
  }
  if (name === "add_wall_chain") {
    const kind = rec.kind;
    const height = num(rec, "height");
    const thickness = num(rec, "thickness");
    if (!isKind(kind) || height === undefined || thickness === undefined || !Array.isArray(rec.points)) {
      return "add_wall_chain requires points, height, thickness, kind";
    }
    const points: ProductPoint[] = [];
    for (const raw of rec.points) {
      const pt = parsePoint(raw);
      if (!pt) return "add_wall_chain points must be {x,z} or [x,z]";
      points.push(pt);
    }
    return { type: "add_wall_chain", kind, height, thickness, points };
  }
  return `unknown layout tool: ${name}`;
}

export type LayoutApplyOk = { ok: true; changedIds: string[]; map: ArenaMap };
export type LayoutApplyFail = { ok: false; error: ArenaEditError };
export type LayoutApplyResult = LayoutApplyOk | LayoutApplyFail;

function applyOneSolid(
  map: ArenaMap,
  action: ArenaEditAction,
  envelope: MapBoundsRect,
): LayoutApplyResult {
  if (action.type !== "add_solid") return { ok: false, error: { code: "invalid-wall" } };
  const blocked = rejectProductSolid(map, action, envelope);
  if (blocked) return { ok: false, error: blocked };
  const trial = applyArenaEdit(map, action, createIdAllocator(map));
  if (!trial.ok) return trial;
  return { ok: true, changedIds: trial.changedIds, map: trial.map };
}

export function layoutSolidActions(
  map: ArenaMap,
  action: ProductLayoutAction,
  envelope: MapBoundsRect,
): { ok: true; actions: ArenaEditAction[] } | LayoutApplyFail {
  if (action.type === "add_block") {
    const solid = addBlockToSolid(action);
    if ("code" in solid) return { ok: false, error: solid };
    const blocked = rejectProductSolid(map, solid, envelope);
    if (blocked) return { ok: false, error: blocked };
    return { ok: true, actions: [solid] };
  }
  if (action.type === "add_wall") {
    const solid = addWallToSolid(action);
    if ("code" in solid) return { ok: false, error: solid };
    const blocked = rejectProductSolid(map, solid, envelope);
    if (blocked) return { ok: false, error: blocked };
    return { ok: true, actions: [solid] };
  }

  if (action.points.length < MIN_WALL_CHAIN_POINTS || action.points.length > MAX_WALL_CHAIN_POINTS) {
    return { ok: false, error: { code: "invalid-chain-length" } };
  }
  const segments = action.points.length - 1;
  if (segments < 1 || segments > MAX_WALL_CHAIN_SEGMENTS) {
    return { ok: false, error: { code: "invalid-chain-length" } };
  }
  const overlap = action.thickness / 2;
  let current = map;
  const actions: ArenaEditAction[] = [];
  for (let i = 0; i < segments; i++) {
    const a = action.points[i]!;
    const b = action.points[i + 1]!;
    if (!isOrthogonalWall(a.x, a.z, b.x, b.z)) {
      return { ok: false, error: { code: "diagonal-wall" } };
    }
    const extendStart = i === 0 ? 0 : overlap;
    const extendEnd = i === segments - 1 ? 0 : overlap;
    const solid = addWallToSolid(
      {
        type: "add_wall",
        x1: a.x,
        z1: a.z,
        x2: b.x,
        z2: b.z,
        height: action.height,
        thickness: action.thickness,
        kind: action.kind,
      },
      extendStart,
      extendEnd,
    );
    if ("code" in solid) return { ok: false, error: solid };
    const blocked = rejectProductSolid(current, solid, envelope);
    if (blocked) return { ok: false, error: blocked };
    const trial = applyArenaEdit(current, solid, createIdAllocator(current));
    if (!trial.ok) return trial;
    current = trial.map;
    actions.push(solid);
  }
  return { ok: true, actions };
}

export function applyProductLayout(
  map: ArenaMap,
  action: ProductLayoutAction,
  envelope: MapBoundsRect,
): LayoutApplyResult {
  if (action.type === "add_block") {
    const solid = addBlockToSolid(action);
    if ("code" in solid) return { ok: false, error: solid };
    return applyOneSolid(map, solid, envelope);
  }
  if (action.type === "add_wall") {
    const solid = addWallToSolid(action);
    if ("code" in solid) return { ok: false, error: solid };
    return applyOneSolid(map, solid, envelope);
  }

  if (action.points.length < MIN_WALL_CHAIN_POINTS || action.points.length > MAX_WALL_CHAIN_POINTS) {
    return { ok: false, error: { code: "invalid-chain-length" } };
  }
  const segments = action.points.length - 1;
  if (segments < 1 || segments > MAX_WALL_CHAIN_SEGMENTS) {
    return { ok: false, error: { code: "invalid-chain-length" } };
  }
  const overlap = action.thickness / 2;
  let current = map;
  const changedIds: string[] = [];
  for (let i = 0; i < segments; i++) {
    const a = action.points[i]!;
    const b = action.points[i + 1]!;
    if (!isOrthogonalWall(a.x, a.z, b.x, b.z)) {
      return { ok: false, error: { code: "diagonal-wall" } };
    }
    const extendStart = i === 0 ? 0 : overlap;
    const extendEnd = i === segments - 1 ? 0 : overlap;
    const solid = addWallToSolid(
      {
        type: "add_wall",
        x1: a.x,
        z1: a.z,
        x2: b.x,
        z2: b.z,
        height: action.height,
        thickness: action.thickness,
        kind: action.kind,
      },
      extendStart,
      extendEnd,
    );
    if ("code" in solid) return { ok: false, error: solid };
    const applied = applyOneSolid(current, solid, envelope);
    if (!applied.ok) return applied;
    current = applied.map;
    changedIds.push(...applied.changedIds);
  }
  return { ok: true, changedIds, map: current };
}

export const PRODUCT_LAYOUT_TOOLS = ["add_block", "add_wall", "add_wall_chain"] as const;

export function isProductLayoutTool(name: string): boolean {
  return (PRODUCT_LAYOUT_TOOLS as readonly string[]).includes(name);
}
