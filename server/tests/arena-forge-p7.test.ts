import { afterEach, beforeAll, describe, expect, it } from "vitest";
import RAPIER from "@dimforge/rapier3d-compat";
import { buildMapColliders } from "../../shared/world/map-physics.js";
import {
  computeShowcaseFraming,
  diffArenaMapViews,
  gameplayFromPublicView,
} from "../../shared/world/arena-map-view.js";
import { ARENA_FORGE_PREVIEW_MAP_ID } from "../../shared/world/arena-forge-preview.js";
import { getGameplayMap, getPublicMapIds, isPublicMapId } from "../../shared/world/map-registry.js";
import { p4ManifestHash } from "../src/arena-forge/eval-cases.js";
import { p4bManifestHash } from "../src/arena-forge/eval-cases-p4b.js";
import { assertNoSecrets } from "../src/arena-forge/design-view.js";
import { exportGameplayMap } from "../src/arena-forge/export-map.js";
import { importGameplayMap } from "../src/arena-forge/import-map.js";
import { loadForgeMap } from "../src/arena-forge/preview.js";
import { cloneArenaMap } from "../src/arena-forge/actions.js";
import { publicRevisionMaps, toPublicArenaMapView } from "../src/arena-forge/public-map.js";
import { PLAYTEST_SEED, runPlaytest } from "../src/arena-forge/playtest.js";
import { representativeReplay } from "../src/arena-forge/playtest-replay.js";
import { recordedDemoRevisionMaps, recordedDemoView } from "../src/arena-forge/recorded-demo.js";
import {
  getDesignJobView,
  resetDesignJobs,
  startDesignJob,
  type DesignRunner,
} from "../src/arena-forge/design-jobs.js";
import {
  ScriptedPlaytestSession,
  runPlaytestAgentDesign,
} from "../src/arena-forge/playtest-agent.js";
import type { AgentTurnDecision } from "../src/arena-forge/agent.js";
import { assertRoomMode, resolveCreatedRoomMap, shouldAllowForgeSoloStart } from "../src/room-map.js";
import { TeamManager } from "../src/game-modes/team-manager.js";

const P4A_HASH = "6acb4b3274ec7d1bb06090f5342816737227a9855945558958bc3d29154282e2";
const P4B_HASH = "0ad49258552c067ebf1117dacc37b0c02ce16505870e943ef33e60ef571faa39";

function decision(name: string, args: unknown): AgentTurnDecision {
  return { calls: [{ name, arguments: args, callId: `call-${name}` }], latencyMs: 1 };
}

function liveDeps(run: DesignRunner, createId?: () => string) {
  return { isLiveAvailable: () => true, run, createId };
}

afterEach(() => {
  resetDesignJobs();
});

describe("P7 frozen hashes and P5/P6 semantics", () => {
  it("keeps P4-A and P4-B manifest hashes", () => {
    expect(p4ManifestHash()).toBe(P4A_HASH);
    expect(p4bManifestHash()).toBe(P4B_HASH);
  });

  it("keeps the recorded P5 playtest report byte-identical", () => {
    const map = importGameplayMap(getGameplayMap("map-contract-smoke"));
    const a = runPlaytest(map);
    const b = runPlaytest(cloneArenaMap(map), { seed: PLAYTEST_SEED });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("keeps onTurn non-controlling", async () => {
    const turns = [
      decision("run_playtest", { intent: "look" }),
      decision("finish_design", { summary: "Done." }),
    ];
    const map = importGameplayMap(getGameplayMap("map-contract-smoke"));
    const seen: string[] = [];
    const withCb = await runPlaytestAgentDesign({
      map: importGameplayMap(getGameplayMap("map-contract-smoke")),
      brief: "observe",
      session: new ScriptedPlaytestSession(turns),
      onTurn: (turn) => {
        seen.push(turn.tool);
      },
    });
    const without = await runPlaytestAgentDesign({
      map,
      brief: "observe",
      session: new ScriptedPlaytestSession(turns),
    });
    const { totalLatencyMs: _a, ...a } = withCb;
    const { totalLatencyMs: _b, ...b } = without;
    expect(a).toEqual(b);
    expect(seen).toEqual(["run_playtest", "finish_design"]);
  });
});

describe("P7 public map catalog and Create Game", () => {
  it("does not list internal fixtures as public maps", () => {
    expect(getPublicMapIds()).toEqual(["shoot-house-neon"]);
    expect(isPublicMapId("map-contract-smoke")).toBe(false);
    expect(isPublicMapId("fixture:p4a")).toBe(false);
    expect(isPublicMapId("demo:p5:final")).toBe(false);
  });

  it("puts the selected production map into authoritative room state", () => {
    const resolved = resolveCreatedRoomMap({
      gameMode: "deathmatch",
      mapId: "shoot-house-neon",
    });
    expect(resolved.stateMapId).toBe("shoot-house-neon");
    expect(resolved.map.id).toBe("shoot-house-neon");
    expect(resolved.allowSoloStart).toBe(false);
    expect(() => assertRoomMode(resolved.map, "deathmatch")).not.toThrow();
    expect(() => assertRoomMode(resolved.map, "search_destroy")).not.toThrow();
  });

  it("rejects Search & Destroy on a map missing terminals", () => {
    const incomplete = {
      ...getGameplayMap("map-contract-smoke"),
      uploadTerminals: [{ id: "A" as const, x: 0, y: 0, z: 0, radius: 2.5 }],
    };
    expect(() => assertRoomMode(incomplete, "search_destroy")).toThrow(/upload terminals A and B/);
  });
});

describe("P7 map diff", () => {
  const base = toPublicArenaMapView(importGameplayMap(getGameplayMap("map-contract-smoke")));

  it("classifies added, removed, changed, and unchanged solids by id", () => {
    const after = structuredClone(base);
    after.solids = after.solids.filter((s) => s.id !== "obstacle-1");
    const kept = after.solids.find((s) => s.id === "obstacle-0")!;
    kept.hx = 3;
    after.solids.push({
      id: "occluder-1",
      kind: "occluder",
      x: -5.5,
      y: 1.5,
      z: -3.5,
      hx: 2,
      hy: 1.5,
      hz: 0.4,
    });
    const diff = diffArenaMapViews(base, after);
    expect(diff.solids.find((s) => s.id === "occluder-1")?.kind).toBe("added");
    expect(diff.solids.find((s) => s.id === "obstacle-1")?.kind).toBe("removed");
    expect(diff.solids.find((s) => s.id === "obstacle-0")?.kind).toBe("changed");
    expect(diff.solids.find((s) => s.id === "occluder-0")?.kind).toBe("unchanged");
  });
});

describe("P7 recorded revisions and snapshots", () => {
  it("maps the six recorded turns onto revisions 0,1,1,2,2,2", () => {
    const view = recordedDemoView();
    expect(view.turns.map((t) => t.mapRevision)).toEqual([0, 1, 1, 2, 2, 2]);
    expect(view.revisionMaps).toHaveLength(3);
  });

  it("pairs each playtest hotspot with the revision that produced it", () => {
    const view = recordedDemoView();
    const playtests = view.turns.filter((t) => t.playtest);
    expect(playtests.map((t) => t.playtest!.mapRevision)).toEqual([0, 1, 2]);
    expect(playtests[0]?.playtest?.firstContact.hotspot).toEqual({
      x: 5.25,
      z: -1.25,
      sampleCount: 9,
    });
    expect(playtests[1]?.playtest?.firstContact.hotspot).toEqual({
      x: -4.25,
      z: -1.25,
      sampleCount: 19,
    });
    expect(playtests[2]?.playtest?.firstContact.hotspot).toEqual({
      x: 6.25,
      z: 0.25,
      sampleCount: 9,
    });
  });

  it("rebuilds occluder-1 as added then resized", () => {
    const maps = recordedDemoRevisionMaps();
    expect(maps[0]!.solids.some((s) => s.id === "occluder-1")).toBe(false);
    expect(maps[1]!.solids.find((s) => s.id === "occluder-1")).toMatchObject({
      hx: 2,
      hy: 1.5,
      hz: 0.4,
    });
    expect(maps[2]!.solids.find((s) => s.id === "occluder-1")).toMatchObject({
      hx: 1.2,
      hy: 1.5,
      hz: 0.4,
    });
    const d1 = diffArenaMapViews(publicRevisionMaps(maps)[0]!, publicRevisionMaps(maps)[1]!);
    const d2 = diffArenaMapViews(publicRevisionMaps(maps)[1]!, publicRevisionMaps(maps)[2]!);
    expect(d1.solids.find((s) => s.id === "occluder-1")?.kind).toBe("added");
    expect(d2.solids.find((s) => s.id === "occluder-1")?.kind).toBe("changed");
  });

  it("sanitizes public revision maps", () => {
    const view = recordedDemoView();
    assertNoSecrets(view.revisionMaps);
    const blob = JSON.stringify(view.revisionMaps);
    expect(blob).not.toMatch(/sk-|OPENAI|responseId|hidden|chain.of.thought/i);
    for (const map of view.revisionMaps) {
      expect(Object.keys(map).sort()).toEqual([
        "boundsHalfSize",
        "groundThickness",
        "objectives",
        "solids",
        "spawns",
        "wallHeight",
        "wallThickness",
      ]);
    }
  });
});

describe("P7 representative replay", () => {
  it("is deterministic, read-only, and consistent with first-contact LOS", () => {
    const map = recordedDemoRevisionMaps()[2]!;
    const before = JSON.stringify(map);
    const a = representativeReplay(map);
    const b = representativeReplay(map, PLAYTEST_SEED);
    expect(a).toEqual(b);
    expect(JSON.stringify(map)).toBe(before);
    expect(JSON.stringify(runPlaytest(importGameplayMap(getGameplayMap("map-contract-smoke"))))).toBe(
      JSON.stringify(runPlaytest(importGameplayMap(getGameplayMap("map-contract-smoke")))),
    );
    if (a.firstContact) {
      expect(Number.isFinite(a.firstContact.x)).toBe(true);
      expect(Number.isFinite(a.firstContact.z)).toBe(true);
      expect(Number.isFinite(a.firstContact.seconds)).toBe(true);
    }
    const blob = JSON.stringify(a);
    expect(blob).not.toMatch(/NaN|Infinity/);
  });
});

describe("P7 Play Result and framing", () => {
  beforeAll(async () => {
    await RAPIER.init();
  });

  it("exports the recorded result through GameplayMapDefinition and RAPIER", () => {
    const map = loadForgeMap("demo:p5:final");
    expect(map.id).toBe(ARENA_FORGE_PREVIEW_MAP_ID);
    expect(() => assertRoomMode(map, "search_destroy")).not.toThrow();
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    const { breakableColliders } = buildMapColliders(RAPIER, world, map);
    expect(breakableColliders.length).toBe(map.breakables.length);
    world.free();
    const room = resolveCreatedRoomMap({
      gameMode: "search_destroy",
      forgeMapId: "demo:p5:final",
    });
    expect(room.stateMapId).toBe(`${ARENA_FORGE_PREVIEW_MAP_ID}::demo:p5:final`);
    expect(room.allowSoloStart).toBe(true);
  });

  it("frames smoke, recorded result, and Shoot House from geometry", () => {
    const smoke = toPublicArenaMapView(importGameplayMap(getGameplayMap("map-contract-smoke")));
    const result = toPublicArenaMapView(recordedDemoRevisionMaps()[2]!);
    const house = toPublicArenaMapView(importGameplayMap(getGameplayMap("shoot-house-neon")));
    const a = computeShowcaseFraming(smoke);
    const b = computeShowcaseFraming(result);
    const c = computeShowcaseFraming(house);
    expect(a.radius).toBeGreaterThan(4);
    expect(c.radius).toBeGreaterThan(a.radius);
    expect(b.far).toBeGreaterThan(b.near);
    expect(Number.isFinite(c.elevation)).toBe(true);
  });

  it("converts a public view back into a playable GameplayMapDefinition", () => {
    const view = toPublicArenaMapView(recordedDemoRevisionMaps()[2]!);
    const gameplay = gameplayFromPublicView(view, { id: ARENA_FORGE_PREVIEW_MAP_ID, name: "preview" });
    const exported = exportGameplayMap(recordedDemoRevisionMaps()[2]!, {
      id: ARENA_FORGE_PREVIEW_MAP_ID,
      name: "preview",
    });
    expect(gameplay.occluders).toEqual(exported.occluders);
    expect(gameplay.obstacles).toEqual(exported.obstacles);
    expect(gameplay.ghostSpawnPoints).toEqual(exported.ghostSpawnPoints);
  });
});

describe("P7 Forge solo-start", () => {
  it("lets one assigned player start when Forge solo-start is on", () => {
    expect(shouldAllowForgeSoloStart({ forgeMapId: "demo:p5:final" })).toBe(true);
    expect(shouldAllowForgeSoloStart({ mapId: "shoot-house-neon" })).toBe(false);

    const ordinary = new TeamManager();
    ordinary.assignToTeam("p1", "ghosts");
    expect(ordinary.canStartGame()).toBe(false);

    const forge = new TeamManager();
    forge.setAllowSoloStart(true);
    forge.assignToTeam("p1", "ghosts");
    expect(forge.canStartGame()).toBe(true);
    expect(forge.getSentinelsCount()).toBe(0);
  });

  it("stores live-job revision maps from successful edits", async () => {
    const started = startDesignJob(
      { brief: "Nudge a box.", mapId: "map-contract-smoke" },
      liveDeps(
        async ({ map, brief, onTurn }) =>
          runPlaytestAgentDesign({
            map,
            brief,
            session: new ScriptedPlaytestSession([
              decision("run_playtest", { intent: "look" }),
              decision("move_solid", { solidId: "obstacle-1", x: 4, y: 1, z: -2, intent: "nudge" }),
              decision("finish_design", { summary: "Moved one box." }),
            ]),
            onTurn,
          }),
        () => "job-p7-rev",
      ),
    );
    expect(started.ok).toBe(true);
    await viWaitFor(() => getDesignJobView("job-p7-rev")?.status === "completed");
    const view = getDesignJobView("job-p7-rev")!;
    expect(view.revisionMaps.length).toBe(2);
    expect(view.turns.map((t) => t.mapRevision)).toEqual([0, 1, 1]);
    const moved = view.revisionMaps[1]!.solids.find((s) => s.id === "obstacle-1");
    expect(moved).toMatchObject({ x: 4, z: -2 });
  });
});

async function viWaitFor(check: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error("timed out");
    await new Promise((r) => setTimeout(r, 10));
  }
}
