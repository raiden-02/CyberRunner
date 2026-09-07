import { describe, expect, it } from "vitest";
import { parseArenaDesignSpec } from "../../shared/world/arena-design-spec.js";
import { applyArenaEdit, createIdAllocator } from "../src/arena-forge/actions.js";
import { buildBlankArena } from "../src/arena-forge/blank-map.js";
import { deathmatchAllPairs } from "../src/arena-forge/product-dm-diagnostics.js";

function dmSpec(count: 4 | 8) {
  const pts = count === 4
    ? [
        { x: -8, z: -8 },
        { x: 8, z: -8 },
        { x: -8, z: 8 },
        { x: 8, z: 8 },
      ]
    : [
        { x: -8, z: -8 },
        { x: 8, z: -8 },
        { x: -8, z: 8 },
        { x: 8, z: 8 },
        { x: -8, z: 0 },
        { x: 8, z: 0 },
        { x: 0, z: -8 },
        { x: 0, z: 8 },
      ];
  const parsed = parseArenaDesignSpec({
    version: 1,
    mode: "deathmatch",
    envelope: { centerX: 0, centerZ: 0, halfWidth: 18, halfDepth: 18 },
    spawnSetup: { kind: "deathmatch", general: pts },
    brief: "Pairs.",
  });
  if (!parsed.ok) throw new Error("spec");
  return parsed.spec;
}

describe("product Deathmatch pair diagnostics", () => {
  it("counts 6 pairs for 4 spawns and 28 for 8", () => {
    expect(deathmatchAllPairs(buildBlankArena(dmSpec(4))).totalPairs).toBe(6);
    expect(deathmatchAllPairs(buildBlankArena(dmSpec(8))).totalPairs).toBe(28);
    const open = deathmatchAllPairs(buildBlankArena(dmSpec(4)));
    expect(open.reachablePairs).toBe(6);
    expect(open.unreachablePairs).toBe(0);
    expect(open.minDistance).toBeDefined();
    expect(open.medianDistance).toBeDefined();
    expect(open.maxDistance).toBeDefined();
  });

  it("counts unreachable pairs when the map is partitioned", () => {
    const map = buildBlankArena(dmSpec(4));
    const wall = applyArenaEdit(
      map,
      { type: "add_solid", kind: "obstacle", x: 0, y: 1.5, z: 0, hx: 2, hy: 1.5, hz: 18 },
      createIdAllocator(map),
    );
    if (!wall.ok) throw new Error(wall.error.code);
    const diag = deathmatchAllPairs(wall.map);
    expect(diag.totalPairs).toBe(6);
    expect(diag.unreachablePairs).toBeGreaterThan(0);
    expect(diag.reachablePairs + diag.unreachablePairs).toBe(6);
  });
});
