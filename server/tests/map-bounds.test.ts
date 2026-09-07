import { describe, expect, it } from "vitest";
import { boundaryWalls, resolveMapBounds } from "../../shared/world/map-bounds.js";
import { SHOOT_HOUSE_NEON } from "../../shared/world/maps/shoot-house-neon.js";
import { NavGrid } from "../src/arena-forge/navigation.js";
import { evaluateGameplayMap } from "../src/arena-forge/evaluator.js";
import { importGameplayMap } from "../src/arena-forge/import-map.js";
import { circleInsideBounds, pointInsideBounds } from "../src/arena-forge/geometry.js";

describe("rectangular bounds compatibility", () => {
  it("resolves legacy boundsHalfSize to a centered square", () => {
    expect(resolveMapBounds({ boundsHalfSize: 28 })).toEqual({
      centerX: 0,
      centerZ: 0,
      halfWidth: 28,
      halfDepth: 28,
    });
    expect(pointInsideBounds(28, 28, 28)).toBe(true);
    expect(pointInsideBounds(28.1, 0, 28)).toBe(false);
    expect(circleInsideBounds(0, 0, 0.35, 28)).toBe(true);
  });

  it("keeps Shoot House nav grid 112×112 and the same walkable count", () => {
    const map = importGameplayMap(SHOOT_HOUSE_NEON);
    const grid = new NavGrid(map);
    expect(grid.cols).toBe(112);
    expect(grid.rows).toBe(112);
    expect(grid.cellCenter(0, 0)).toEqual({ x: -27.75, z: -27.75 });
    const ev = evaluateGameplayMap(SHOOT_HOUSE_NEON);
    expect(ev.summary.hardFailureCount).toBe(0);
    expect(ev.navigation.walkableCells).toBe(9740);
    expect(ev.navigation.totalCells).toBe(12544);
  });

  it("places square walls at the same offsets as today", () => {
    const walls = boundaryWalls({ centerX: 0, centerZ: 0, halfWidth: 28, halfDepth: 28 }, 0.4);
    expect(walls).toEqual([
      { tx: 28.4, tz: 0, hx: 0.4, hz: 28 },
      { tx: -28.4, tz: 0, hx: 0.4, hz: 28 },
      { tx: 0, tz: 28.4, hx: 28, hz: 0.4 },
      { tx: 0, tz: -28.4, hx: 28, hz: 0.4 },
    ]);
  });

  it("supports a 40×24 rectangular arena", () => {
    const bounds = { centerX: 2, centerZ: -1, halfWidth: 20, halfDepth: 12 };
    expect(resolveMapBounds({ boundsHalfSize: 20, bounds })).toEqual(bounds);
    const walls = boundaryWalls(bounds, 0.4);
    expect(walls[0]).toEqual({ tx: 22.4, tz: -1, hx: 0.4, hz: 12 });
    expect(walls[2]).toEqual({ tx: 2, tz: 11.4, hx: 20, hz: 0.4 });
    expect(pointInsideBounds(21.9, -1, bounds)).toBe(true);
    expect(pointInsideBounds(22.1, -1, bounds)).toBe(false);

    const def = {
      id: "rect-40x24",
      name: "Rect",
      boundsHalfSize: 20,
      bounds,
      wallHeight: 3,
      wallThickness: 0.4,
      groundThickness: 0.1,
      obstacles: [],
      occluders: [],
      breakables: [],
      spawnProtectionZones: [],
      spawnPoints: [{ x: 2, y: 1.25, z: -1 }],
    };
    const map = importGameplayMap(def);
    const grid = new NavGrid(map);
    expect(grid.cols).toBe(80);
    expect(grid.rows).toBe(48);
    const ev = evaluateGameplayMap(def, "deathmatch");
    expect(ev.summary.hardFailures.some((i) => i.code === "invalid-bounds")).toBe(false);
    expect(ev.navigation.totalCells).toBe(80 * 48);
  });
});
