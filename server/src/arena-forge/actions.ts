import { isFiniteNumber } from "./geometry.js";
import type { ArenaMap, ArenaSolid, SolidKind } from "./types.js";

const SOLID_KINDS: SolidKind[] = ["obstacle", "occluder", "breakable"];

/** Existing CyberRunner breakables use 50. */
export const DEFAULT_BREAKABLE_HP = 50;

export type ArenaEditAction =
  | { type: "move_solid"; solidId: string; x: number; y: number; z: number }
  | { type: "resize_solid"; solidId: string; hx: number; hy: number; hz: number }
  | {
      type: "add_solid";
      kind: SolidKind;
      x: number;
      y: number;
      z: number;
      hx: number;
      hy: number;
      hz: number;
      hp?: number;
    }
  | { type: "remove_solid"; solidId: string }
  | { type: "move_spawn"; spawnId: string; x: number; y: number; z: number }
  | {
      type: "move_objective";
      objectiveId: "A" | "B";
      x: number;
      y: number;
      z: number;
      radius?: number;
    };

export type ArenaEditError = {
  code: string;
  target?: string;
  [key: string]: string | number | undefined;
};

export type IdAllocator = {
  obstacle: number;
  occluder: number;
  breakable: number;
};

export type ArenaEditOk = {
  ok: true;
  action: ArenaEditAction;
  changedIds: string[];
  map: ArenaMap;
  ids: IdAllocator;
};

export type ArenaEditFail = {
  ok: false;
  error: ArenaEditError;
};

export type ArenaEditApplyResult = ArenaEditOk | ArenaEditFail;

export function cloneArenaMap(map: ArenaMap): ArenaMap {
  return structuredClone(map);
}

export function cloneIds(ids: IdAllocator): IdAllocator {
  return { obstacle: ids.obstacle, occluder: ids.occluder, breakable: ids.breakable };
}

export function createIdAllocator(map: ArenaMap): IdAllocator {
  return {
    obstacle: nextSolidIndex(map, "obstacle"),
    occluder: nextSolidIndex(map, "occluder"),
    breakable: nextSolidIndex(map, "breakable"),
  };
}

function nextSolidIndex(map: ArenaMap, kind: SolidKind): number {
  const prefix = `${kind}-`;
  let max = -1;
  for (const solid of map.solids) {
    if (!solid.id.startsWith(prefix)) continue;
    const n = Number(solid.id.slice(prefix.length));
    if (Number.isInteger(n) && n > max) max = n;
  }
  return max + 1;
}

function finiteVec(x: number, y: number, z: number): boolean {
  return isFiniteNumber(x) && isFiniteNumber(y) && isFiniteNumber(z);
}

function fail(code: string, extra: Omit<ArenaEditError, "code"> = {}): ArenaEditFail {
  return { ok: false, error: { code, ...extra } };
}

/**
 * Apply one bounded edit. Clones the map. Does not evaluate.
 * Surviving IDs stay put. New IDs come from the allocator and are not reused.
 */
export function applyArenaEdit(
  map: ArenaMap,
  action: ArenaEditAction,
  ids: IdAllocator,
): ArenaEditApplyResult {
  const next = cloneArenaMap(map);
  const nextIds = cloneIds(ids);

  switch (action.type) {
    case "move_solid": {
      if (!finiteVec(action.x, action.y, action.z)) {
        return fail("non-finite-coordinates", { target: action.solidId });
      }
      const solid = next.solids.find((s) => s.id === action.solidId);
      if (!solid) return fail("unknown-solid", { target: action.solidId });
      solid.x = action.x;
      solid.y = action.y;
      solid.z = action.z;
      return { ok: true, action, changedIds: [solid.id], map: next, ids: nextIds };
    }
    case "resize_solid": {
      if (!finiteVec(action.hx, action.hy, action.hz)) {
        return fail("non-finite-extents", { target: action.solidId });
      }
      if (action.hx <= 0 || action.hy <= 0 || action.hz <= 0) {
        return fail("non-positive-extent", { target: action.solidId });
      }
      const solid = next.solids.find((s) => s.id === action.solidId);
      if (!solid) return fail("unknown-solid", { target: action.solidId });
      solid.hx = action.hx;
      solid.hy = action.hy;
      solid.hz = action.hz;
      return { ok: true, action, changedIds: [solid.id], map: next, ids: nextIds };
    }
    case "add_solid": {
      if (!SOLID_KINDS.includes(action.kind)) {
        return fail("unsupported-kind", { target: String(action.kind) });
      }
      if (!finiteVec(action.x, action.y, action.z)) {
        return fail("non-finite-coordinates");
      }
      if (!finiteVec(action.hx, action.hy, action.hz)) {
        return fail("non-finite-extents");
      }
      if (action.hx <= 0 || action.hy <= 0 || action.hz <= 0) {
        return fail("non-positive-extent");
      }
      let hp: number | undefined;
      if (action.kind === "breakable") {
        hp = action.hp ?? DEFAULT_BREAKABLE_HP;
        if (!isFiniteNumber(hp) || hp <= 0) return fail("invalid-hp");
      }
      const id = `${action.kind}-${nextIds[action.kind]}`;
      nextIds[action.kind] += 1;
      const solid: ArenaSolid = {
        id,
        kind: action.kind,
        x: action.x,
        y: action.y,
        z: action.z,
        hx: action.hx,
        hy: action.hy,
        hz: action.hz,
      };
      if (hp !== undefined) solid.hp = hp;
      next.solids.push(solid);
      return { ok: true, action, changedIds: [id], map: next, ids: nextIds };
    }
    case "remove_solid": {
      const idx = next.solids.findIndex((s) => s.id === action.solidId);
      if (idx < 0) return fail("unknown-solid", { target: action.solidId });
      next.solids.splice(idx, 1);
      return { ok: true, action, changedIds: [action.solidId], map: next, ids: nextIds };
    }
    case "move_spawn": {
      if (!finiteVec(action.x, action.y, action.z)) {
        return fail("non-finite-coordinates", { target: action.spawnId });
      }
      const spawn = next.spawns.find((s) => s.id === action.spawnId);
      if (!spawn) return fail("unknown-spawn", { target: action.spawnId });
      spawn.x = action.x;
      spawn.y = action.y;
      spawn.z = action.z;
      return { ok: true, action, changedIds: [spawn.id], map: next, ids: nextIds };
    }
    case "move_objective": {
      if (!finiteVec(action.x, action.y, action.z)) {
        return fail("non-finite-coordinates", { target: action.objectiveId });
      }
      if (action.radius !== undefined && (!isFiniteNumber(action.radius) || action.radius <= 0)) {
        return fail("non-positive-radius", { target: action.objectiveId });
      }
      const obj = next.objectives.find((o) => o.id === action.objectiveId);
      if (!obj) return fail("unknown-objective", { target: action.objectiveId });
      obj.x = action.x;
      obj.y = action.y;
      obj.z = action.z;
      if (action.radius !== undefined) obj.radius = action.radius;
      return { ok: true, action, changedIds: [action.objectiveId], map: next, ids: nextIds };
    }
    default: {
      const never: never = action;
      return fail("unknown-action", { target: String((never as { type?: string }).type) });
    }
  }
}
