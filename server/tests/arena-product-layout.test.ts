import { describe, expect, it } from "vitest";
import { parseArenaDesignSpec } from "../../shared/world/arena-design-spec.js";
import { buildBlankArena } from "../src/arena-forge/blank-map.js";
import {
  applyProductLayout,
  isOrthogonalWall,
  wallBox,
} from "../src/arena-forge/product-layout.js";
import { PLAYER_RADIUS } from "../src/arena-forge/types.js";

const spec = parseArenaDesignSpec({
  version: 1,
  mode: "search_destroy",
  envelope: { centerX: 0, centerZ: 0, halfWidth: 20, halfDepth: 16 },
  spawnSetup: {
    kind: "search_destroy",
    ghostAnchor: { x: -12, z: 0 },
    sentinelAnchor: { x: 12, z: 0 },
  },
  brief: "Cover.",
});
if (!spec.ok) throw new Error("spec");

describe("product layout tools", () => {
  it("grounds add_block and derives half-extents", () => {
    const map = buildBlankArena(spec.spec);
    const result = applyProductLayout(
      map,
      { type: "add_block", kind: "obstacle", x: 0, z: 2, width: 4, depth: 2, height: 3 },
      spec.spec.envelope,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const solid = result.map.solids[0]!;
    expect(solid.y).toBe(1.5);
    expect(solid.hy).toBe(1.5);
    expect(solid.hx).toBe(2);
    expect(solid.hz).toBe(1);
    expect(solid.y - solid.hy).toBeCloseTo(0);
  });

  it("rejects envelope, spawn overlap, and diagonal walls", () => {
    const map = buildBlankArena(spec.spec);
    const outside = applyProductLayout(
      map,
      { type: "add_block", kind: "obstacle", x: 40, z: 0, width: 2, depth: 2, height: 2 },
      spec.spec.envelope,
    );
    expect(outside.ok).toBe(false);
    if (!outside.ok) expect(outside.error.code).toBe("out-of-envelope");

    const onSpawn = applyProductLayout(
      map,
      { type: "add_block", kind: "obstacle", x: -12, z: 0, width: 2, depth: 2, height: 2 },
      spec.spec.envelope,
    );
    expect(onSpawn.ok).toBe(false);
    if (!onSpawn.ok) expect(onSpawn.error.code).toBe("spawn-overlap");

    expect(isOrthogonalWall(0, 0, 4, 4)).toBe(false);
    const diagonal = applyProductLayout(
      map,
      { type: "add_wall", kind: "occluder", x1: 0, z1: 2, x2: 4, z2: 6, height: 3, thickness: 0.4 },
      spec.spec.envelope,
    );
    expect(diagonal.ok).toBe(false);
    if (!diagonal.ok) expect(diagonal.error.code).toBe("diagonal-wall");
  });

  it("builds horizontal and vertical walls on the ground", () => {
    const map = buildBlankArena(spec.spec);
    const h = applyProductLayout(
      map,
      { type: "add_wall", kind: "occluder", x1: -6, z1: 4, x2: 6, z2: 4, height: 3, thickness: 0.4 },
      spec.spec.envelope,
    );
    expect(h.ok).toBe(true);
    if (!h.ok) return;
    const wall = h.map.solids[0]!;
    expect(wall.x).toBe(0);
    expect(wall.z).toBe(4);
    expect(wall.hx).toBe(6);
    expect(wall.hz).toBeCloseTo(0.2);
    expect(wall.y - wall.hy).toBeCloseTo(0);

    const v = applyProductLayout(
      map,
      { type: "add_wall", kind: "occluder", x1: 2, z1: -4, x2: 2, z2: 4, height: 3, thickness: 0.4 },
      spec.spec.envelope,
    );
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.map.solids[0]!.hx).toBeCloseTo(0.2);
    expect(v.map.solids[0]!.hz).toBe(4);
  });

  it("creates an atomic joined wall chain without player-sized corner cracks", () => {
    const map = buildBlankArena(spec.spec);
    const chain = applyProductLayout(
      map,
      {
        type: "add_wall_chain",
        kind: "occluder",
        height: 3,
        thickness: 0.4,
        points: [
          { x: -8, z: -4 },
          { x: 2, z: -4 },
          { x: 2, z: 8 },
        ],
      },
      spec.spec.envelope,
    );
    expect(chain.ok).toBe(true);
    if (!chain.ok) return;
    expect(chain.changedIds).toHaveLength(2);
    const [a, b] = chain.map.solids;
    expect(a && b).toBeTruthy();
    const overlapX = Math.min(a!.x + a!.hx, b!.x + b!.hx) - Math.max(a!.x - a!.hx, b!.x - b!.hx);
    const overlapZ = Math.min(a!.z + a!.hz, b!.z + b!.hz) - Math.max(a!.z - a!.hz, b!.z - b!.hz);
    expect(overlapX).toBeGreaterThan(PLAYER_RADIUS);
    expect(overlapZ).toBeGreaterThan(0);

    const bad = applyProductLayout(
      map,
      {
        type: "add_wall_chain",
        kind: "occluder",
        height: 3,
        thickness: 0.4,
        points: [
          { x: -8, z: -4 },
          { x: 2, z: -4 },
          { x: 6, z: 8 },
        ],
      },
      spec.spec.envelope,
    );
    expect(bad.ok).toBe(false);
    expect(map.solids).toHaveLength(0);
  });

  it("rejects too many chain segments", () => {
    const map = buildBlankArena(spec.spec);
    const points = [
      { x: -8, z: -6 },
      { x: -6, z: -6 },
      { x: -6, z: -4 },
      { x: -4, z: -4 },
      { x: -4, z: -2 },
      { x: -2, z: -2 },
      { x: -2, z: 0 },
      { x: 0, z: 0 },
    ];
    const result = applyProductLayout(
      map,
      { type: "add_wall_chain", kind: "obstacle", height: 2, thickness: 0.4, points },
      spec.spec.envelope,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("invalid-chain-length");
  });

  it("does not invent rotated geometry", () => {
    const box = wallBox(0, 0, 3, 3, 2, 0.4);
    expect(box).toBeUndefined();
  });
});
