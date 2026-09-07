import { describe, expect, it } from "vitest";
import {
  DEATHMATCH_MAX_SPAWNS,
  DEATHMATCH_MIN_SPAWNS,
  DESIGN_BRIEF_MAX,
  ENVELOPE_MAX_SIZE,
  ENVELOPE_MIN_SIZE,
  parseArenaDesignSpec,
  teamClusterPoints,
} from "../../shared/world/arena-design-spec.js";

const envelope = { centerX: 0, centerZ: 0, halfWidth: 20, halfDepth: 16 };

describe("ArenaDesignSpec", () => {
  it("parses a valid S&D setup", () => {
    const parsed = parseArenaDesignSpec({
      version: 1,
      mode: "search_destroy",
      envelope,
      spawnSetup: {
        kind: "search_destroy",
        ghostAnchor: { x: -12, z: 0 },
        sentinelAnchor: { x: 12, z: 0 },
      },
      brief: "Three routes.",
    });
    expect(parsed.ok).toBe(true);
  });

  it("rejects tiny or huge envelopes and non-finite numbers", () => {
    expect(parseArenaDesignSpec({
      version: 1,
      mode: "deathmatch",
      envelope: { centerX: 0, centerZ: 0, halfWidth: 4, halfDepth: 4 },
      spawnSetup: { kind: "deathmatch", general: [{ x: 0, z: 0 }, { x: 2, z: 2 }, { x: -2, z: 2 }, { x: 2, z: -2 }] },
      brief: "x",
    }).ok).toBe(false);
    expect(parseArenaDesignSpec({
      version: 1,
      mode: "deathmatch",
      envelope: { centerX: 0, centerZ: 0, halfWidth: 50, halfDepth: 50 },
      spawnSetup: { kind: "deathmatch", general: [{ x: 0, z: 0 }, { x: 2, z: 2 }, { x: -2, z: 2 }, { x: 2, z: -2 }] },
      brief: "x",
    }).ok).toBe(false);
    expect(parseArenaDesignSpec({
      version: 1,
      mode: "search_destroy",
      envelope: { centerX: Number.NaN, centerZ: 0, halfWidth: 20, halfDepth: 16 },
      spawnSetup: { kind: "search_destroy", ghostAnchor: { x: -12, z: 0 }, sentinelAnchor: { x: 12, z: 0 } },
      brief: "x",
    }).ok).toBe(false);
    expect(ENVELOPE_MIN_SIZE).toBe(16);
    expect(ENVELOPE_MAX_SIZE).toBe(80);
  });

  it("rejects S&D anchors that are too close to the wall or each other", () => {
    const wall = parseArenaDesignSpec({
      version: 1,
      mode: "search_destroy",
      envelope,
      spawnSetup: {
        kind: "search_destroy",
        ghostAnchor: { x: -19, z: 0 },
        sentinelAnchor: { x: 12, z: 0 },
      },
      brief: "x",
    });
    expect(wall.ok).toBe(false);
    if (!wall.ok) expect(wall.issues.some((i) => i.code === "ghost-anchor-margin")).toBe(true);

    const close = parseArenaDesignSpec({
      version: 1,
      mode: "search_destroy",
      envelope,
      spawnSetup: {
        kind: "search_destroy",
        ghostAnchor: { x: -2, z: 0 },
        sentinelAnchor: { x: 2, z: 0 },
      },
      brief: "x",
    });
    expect(close.ok).toBe(false);
  });

  it("builds a deterministic four-point cluster", () => {
    const pts = teamClusterPoints({ x: 0, z: 0 });
    expect(pts).toEqual([
      { x: -1.2, z: -1.2 },
      { x: 1.2, z: -1.2 },
      { x: -1.2, z: 1.2 },
      { x: 1.2, z: 1.2 },
    ]);
  });

  it("requires 4-8 unique Deathmatch spawns inside the envelope", () => {
    const three = parseArenaDesignSpec({
      version: 1,
      mode: "deathmatch",
      envelope,
      spawnSetup: { kind: "deathmatch", general: [{ x: 0, z: 0 }, { x: 2, z: 2 }, { x: -2, z: 2 }] },
      brief: "x",
    });
    expect(three.ok).toBe(false);
    if (!three.ok) expect(three.issues.some((i) => i.code === "need-more-spawns")).toBe(true);

    const dup = parseArenaDesignSpec({
      version: 1,
      mode: "deathmatch",
      envelope,
      spawnSetup: {
        kind: "deathmatch",
        general: [{ x: 0, z: 0 }, { x: 2, z: 2 }, { x: -2, z: 2 }, { x: 0, z: 0 }],
      },
      brief: "x",
    });
    expect(dup.ok).toBe(false);

    const outside = parseArenaDesignSpec({
      version: 1,
      mode: "deathmatch",
      envelope,
      spawnSetup: {
        kind: "deathmatch",
        general: [{ x: 0, z: 0 }, { x: 2, z: 2 }, { x: -2, z: 2 }, { x: 19.5, z: 0 }],
      },
      brief: "x",
    });
    expect(outside.ok).toBe(false);

    const ok = parseArenaDesignSpec({
      version: 1,
      mode: "deathmatch",
      envelope,
      spawnSetup: {
        kind: "deathmatch",
        general: [
          { x: -6, z: -6 },
          { x: 6, z: -6 },
          { x: -6, z: 6 },
          { x: 6, z: 6 },
        ],
      },
      brief: "x",
    });
    expect(ok.ok).toBe(true);
    expect(DEATHMATCH_MIN_SPAWNS).toBe(4);
    expect(DEATHMATCH_MAX_SPAWNS).toBe(8);
  });

  it("rejects a brief over the limit", () => {
    const parsed = parseArenaDesignSpec({
      version: 1,
      mode: "search_destroy",
      envelope,
      spawnSetup: {
        kind: "search_destroy",
        ghostAnchor: { x: -12, z: 0 },
        sentinelAnchor: { x: 12, z: 0 },
      },
      brief: "x".repeat(DESIGN_BRIEF_MAX + 1),
    });
    expect(parsed.ok).toBe(false);
  });
});
