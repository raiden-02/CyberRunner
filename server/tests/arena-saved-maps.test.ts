import { afterEach, describe, expect, it } from "vitest";
import { parseArenaDesignSpec } from "../../shared/world/arena-design-spec.js";
import { forgeMapTitle, personalMapsForMode, createGameUsesLaunchGrant } from "../../shared/ui/lobby-maps.js";
import { ScriptedPlaytestSession } from "../src/arena-forge/playtest-agent.js";
import { resetDesignJobs, startProductDesignJob } from "../src/arena-forge/design-jobs.js";
import {
  MemorySavedMapStore,
  saveCompletedDesign,
  loadValidatedSavedMap,
  MAX_SAVED_MAPS_PER_USER,
  parseSavedMapName,
} from "../src/arena-forge/saved-maps.js";
import { guestMapOwnerId } from "../src/arena-forge/guest-map-session.js";
import {
  consumeSavedMapLaunch,
  issueSavedMapLaunch,
  LAUNCH_GRANT_TTL_MS,
  resetSavedMapLaunches,
} from "../src/arena-forge/saved-map-launches.js";
import { resetSavedRuntimeMaps } from "../src/arena-forge/saved-runtime-maps.js";
import { assertCreatedRoomMode, resolveCreatedRoomMap } from "../src/room-map.js";
import type { AgentTurnDecision } from "../src/arena-forge/agent.js";

function call(name: string, args: Record<string, unknown>): AgentTurnDecision {
  return { latencyMs: 1, calls: [{ name, arguments: args, callId: name }] };
}

const dmSpec = parseArenaDesignSpec({
  version: 1,
  mode: "deathmatch",
  envelope: { centerX: 0, centerZ: 0, halfWidth: 18, halfDepth: 18 },
  spawnSetup: {
    kind: "deathmatch",
    general: [
      { x: -8, z: -8 },
      { x: 8, z: -8 },
      { x: -8, z: 8 },
      { x: 8, z: 8 },
    ],
  },
  brief: "Loops and cover.",
});
if (!dmSpec.ok) throw new Error("dm spec");

async function completeOwnedJob(owner: string): Promise<string> {
  const started = startProductDesignJob(dmSpec.spec, {
    ownerUserId: owner,
    isLiveAvailable: () => true,
    runProduct: async ({ spec, map }) => {
      const { runArenaDesigner } = await import("../src/arena-forge/product-designer.js");
      const { buildBlankArena } = await import("../src/arena-forge/blank-map.js");
      return runArenaDesigner({
        spec,
        map: map ?? buildBlankArena(spec),
        session: new ScriptedPlaytestSession([
          call("propose_design_plan", {
            summary: "Loops.",
            layout: ["ring"],
            priorities: ["cover"],
          }),
          call("add_solid", { kind: "occluder", x: 0, y: 1.5, z: 0, hx: 2, hy: 1.5, hz: 0.4, hp: null }),
          call("finish_design", { summary: "good enough" }),
        ]),
      });
    },
    createId: () => "job-owned",
  });
  if (!started.ok) throw new Error(started.error);
  for (let i = 0; i < 40; i++) {
    const { getDesignJob } = await import("../src/arena-forge/design-jobs.js");
    const job = getDesignJob(started.jobId);
    if (job?.status === "completed" || job?.status === "failed") return started.jobId;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error("job did not finish");
}

async function completeGuestJob(sessionId: string): Promise<string> {
  const started = startProductDesignJob(dmSpec.spec, {
    guestSessionId: sessionId,
    isLiveAvailable: () => true,
    runProduct: async ({ spec, map }) => {
      const { runArenaDesigner } = await import("../src/arena-forge/product-designer.js");
      const { buildBlankArena } = await import("../src/arena-forge/blank-map.js");
      return runArenaDesigner({
        spec,
        map: map ?? buildBlankArena(spec),
        session: new ScriptedPlaytestSession([
          call("propose_design_plan", {
            summary: "Loops.",
            layout: ["ring"],
            priorities: ["cover"],
          }),
          call("add_solid", { kind: "occluder", x: 0, y: 1.5, z: 0, hx: 2, hy: 1.5, hz: 0.4, hp: null }),
          call("finish_design", { summary: "good enough" }),
        ]),
      });
    },
    createId: () => "job-guest",
  });
  if (!started.ok) throw new Error(started.error);
  for (let i = 0; i < 40; i++) {
    const { getDesignJob } = await import("../src/arena-forge/design-jobs.js");
    const job = getDesignJob(started.jobId);
    if (job?.status === "completed" || job?.status === "failed") return started.jobId;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error("guest job did not finish");
}

afterEach(() => {
  resetDesignJobs();
  resetSavedMapLaunches();
  resetSavedRuntimeMaps();
});

describe("saved maps", () => {
  it("saves a completed owned job and lists only the owner", async () => {
    const store = new MemorySavedMapStore();
    const jobId = await completeOwnedJob("user-a");
    const saved = await saveCompletedDesign({
      userId: "user-a",
      jobId,
      name: "Neon Crossfire",
      store,
      createId: () => "map-1",
    });
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect((await store.list("user-a")).map((m) => m.name)).toEqual(["Neon Crossfire"]);
    expect(await store.list("user-b")).toEqual([]);
    const loaded = loadValidatedSavedMap(saved.record);
    expect(loaded.id).toBe("user-map:map-1");
    expect(loaded.spawnPoints.length).toBe(4);
    expect(saved.record.designPlan.summary).toBe("Loops.");
    expect(saved.record.brief).toBe("Loops and cover.");
    resetDesignJobs();
    expect((await store.get("map-1"))?.name).toBe("Neon Crossfire");
    expect(loadValidatedSavedMap((await store.get("map-1"))!).id).toBe("user-map:map-1");
  });

  it("rejects unfinished jobs, other users, and bad names", async () => {
    const store = new MemorySavedMapStore();
    const started = startProductDesignJob(dmSpec.spec, {
      ownerUserId: "user-a",
      isLiveAvailable: () => true,
      runProduct: async () => {
        await new Promise((r) => setTimeout(r, 50));
        throw new Error("still running");
      },
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const unfinished = await saveCompletedDesign({
      userId: "user-a",
      jobId: started.jobId,
      name: "Draft",
      store,
    });
    expect(unfinished.ok).toBe(false);
    for (let i = 0; i < 20; i++) {
      const { getDesignJob } = await import("../src/arena-forge/design-jobs.js");
      const job = getDesignJob(started.jobId);
      if (job?.status === "failed" || job?.status === "completed") break;
      await new Promise((r) => setTimeout(r, 20));
    }

    const jobId = await completeOwnedJob("user-a");
    const stolen = await saveCompletedDesign({
      userId: "user-b",
      jobId,
      name: "Stolen",
      store,
    });
    expect(stolen.ok).toBe(false);
    expect(parseSavedMapName("X").ok).toBe(false);
    expect(parseSavedMapName("Neon Crossfire").ok).toBe(true);
  });

  it("lets a guest save a matching session job and rejects another session", async () => {
    const store = new MemorySavedMapStore();
    const jobId = await completeGuestJob("11111111-1111-4111-8111-111111111111");
    const stolen = await saveCompletedDesign({
      userId: guestMapOwnerId("22222222-2222-4222-8222-222222222222"),
      jobId,
      name: "Stolen",
      store,
    });
    expect(stolen.ok).toBe(false);
    const saved = await saveCompletedDesign({
      userId: guestMapOwnerId("11111111-1111-4111-8111-111111111111"),
      jobId,
      name: "Session Arena",
      store,
      createId: () => "guest-map-1",
    });
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.record.userId).toBe(guestMapOwnerId("11111111-1111-4111-8111-111111111111"));
    expect((await store.list(guestMapOwnerId("22222222-2222-4222-8222-222222222222"))).length).toBe(0);
    const again = await saveCompletedDesign({
      userId: guestMapOwnerId("11111111-1111-4111-8111-111111111111"),
      jobId,
      name: "Session Arena",
      store,
      createId: () => "guest-map-2",
    });
    expect(again.ok).toBe(true);
    if (again.ok) expect(again.record.id).toBe("guest-map-1");
  });

  it("enforces rename/delete ownership and the map limit", async () => {
    const store = new MemorySavedMapStore();
    const jobId = await completeOwnedJob("user-a");
    const saved = await saveCompletedDesign({
      userId: "user-a",
      jobId,
      name: "Neon Crossfire",
      store,
      createId: () => "map-1",
    });
    expect(saved.ok).toBe(true);
    expect(await store.updateName("map-1", "user-b", "Nope")).toBe(false);
    expect(await store.updateName("map-1", "user-a", "Split Decision")).toBe(true);
    expect(await store.delete("map-1", "user-b")).toBe(false);
    expect(await store.delete("map-1", "user-a")).toBe(true);
    expect(MAX_SAVED_MAPS_PER_USER).toBe(20);

    const again = await saveCompletedDesign({
      userId: "user-a",
      jobId,
      name: "Bad JSON",
      store,
    });
    expect(again.ok).toBe(true);
    if (again.ok) {
      const broken = structuredClone(again.record);
      (broken.mapDefinition as { boundsHalfSize: number }).boundsHalfSize = Number.NaN;
      broken.mapDefinition.bounds = undefined;
      expect(() => loadValidatedSavedMap(broken)).toThrow();
    }
  });
});

describe("launch grants and rooms", () => {
  it("issues an owner-only grant and consumes it once", async () => {
    const store = new MemorySavedMapStore();
    const jobId = await completeOwnedJob("user-a");
    const saved = await saveCompletedDesign({
      userId: "user-a",
      jobId,
      name: "Neon Crossfire",
      store,
      createId: () => "map-1",
    });
    if (!saved.ok) throw new Error("save");
    expect(() => issueSavedMapLaunch(saved.record, "user-b")).toThrow();
    const grant = issueSavedMapLaunch(saved.record, "user-a");
    expect(grant.id).not.toContain("map-1");
    expect(grant.map.id).toBe("user-map:map-1");
    const first = consumeSavedMapLaunch(grant.id);
    expect(first?.mode).toBe("deathmatch");
    expect(consumeSavedMapLaunch(grant.id)).toBeUndefined();
    expect(consumeSavedMapLaunch("missing")).toBeUndefined();
  });

  it("rejects expired grants and mode mismatch", async () => {
    const store = new MemorySavedMapStore();
    const jobId = await completeOwnedJob("user-a");
    const saved = await saveCompletedDesign({
      userId: "user-a",
      jobId,
      name: "Neon Crossfire",
      store,
      createId: () => "map-1",
    });
    if (!saved.ok) throw new Error("save");
    const grant = issueSavedMapLaunch(saved.record, "user-a", Date.now() - LAUNCH_GRANT_TTL_MS - 1);
    expect(consumeSavedMapLaunch(grant.id)).toBeUndefined();

    const fresh = issueSavedMapLaunch(saved.record, "user-a");
    expect(() =>
      resolveCreatedRoomMap({
        gameMode: "deathmatch",
        mapId: "shoot-house-neon",
        savedMapLaunchId: fresh.id,
      }),
    ).toThrow(/more than one map source/);

    const only = issueSavedMapLaunch(saved.record, "user-a");
    const resolved = resolveCreatedRoomMap({
      gameMode: "deathmatch",
      savedMapLaunchId: only.id,
    });
    expect(resolved.allowSoloStart).toBe(false);
    expect(resolved.stateMapId).toBe("user-map:map-1");
    expect(assertCreatedRoomMode(
      { gameMode: "deathmatch", savedMapLaunchId: only.id },
      resolved.map,
      undefined,
      resolved,
    )).toBe("deathmatch");
    expect(() =>
      assertCreatedRoomMode(
        { gameMode: "search_destroy", savedMapLaunchId: "x" },
        resolved.map,
        undefined,
        resolved,
      ),
    ).toThrow(/mode/);
  });

  it("keeps historical Forge preview S&D-only and official maps dual-mode", () => {
    const official = resolveCreatedRoomMap({ gameMode: "deathmatch", mapId: "shoot-house-neon" });
    expect(official.allowSoloStart).toBe(false);
    expect(assertCreatedRoomMode({ gameMode: "deathmatch", mapId: "shoot-house-neon" }, official.map)).toBe(
      "deathmatch",
    );
    const forge = resolveCreatedRoomMap({
      gameMode: "search_destroy",
      forgeMapId: "demo:p5:final",
    });
    expect(forge.allowSoloStart).toBe(true);
    expect(() =>
      assertCreatedRoomMode({ gameMode: "deathmatch", forgeMapId: "demo:p5:final" }, forge.map),
    ).toThrow(/Search & Destroy/);
  });

  it("lets product Play Original load a blank S&D job map", async () => {
    const { parseArenaDesignSpec } = await import("../../shared/world/arena-design-spec.js");
    const { loadForgeMap } = await import("../src/arena-forge/preview.js");
    const spec = parseArenaDesignSpec({
      version: 1,
      mode: "search_destroy",
      envelope: { centerX: 0, centerZ: 0, halfWidth: 20, halfDepth: 16 },
      spawnSetup: {
        kind: "search_destroy",
        ghostAnchor: { x: -12, z: 0 },
        sentinelAnchor: { x: 12, z: 0 },
      },
      brief: "Three routes.",
    });
    if (!spec.ok) throw new Error("spec");
    const started = startProductDesignJob(spec.spec, {
      guestSessionId: "11111111-1111-4111-8111-111111111111",
      isLiveAvailable: () => true,
      runProduct: async ({ spec: s, map }) => {
        const { runArenaDesigner } = await import("../src/arena-forge/product-designer.js");
        const { buildBlankArena } = await import("../src/arena-forge/blank-map.js");
        return runArenaDesigner({
          spec: s,
          map: map ?? buildBlankArena(s),
          session: new ScriptedPlaytestSession([
            call("propose_design_plan", { summary: "Later.", layout: ["center"], priorities: ["safety"] }),
            call("finish_design", { summary: "too soon" }),
          ]),
        });
      },
      createId: () => "job-blank-snd",
    });
    if (!started.ok) throw new Error(started.error);
    const map = loadForgeMap("job:job-blank-snd:initial");
    expect(map.ghostSpawnPoints?.length).toBe(4);
    expect(map.uploadTerminals ?? []).toEqual([]);
    const resolved = resolveCreatedRoomMap({
      gameMode: "search_destroy",
      forgeMapId: "job:job-blank-snd:initial",
    });
    expect(resolved.allowSoloStart).toBe(true);
    expect(assertCreatedRoomMode(
      { gameMode: "search_destroy", forgeMapId: "job:job-blank-snd:initial" },
      resolved.map,
    )).toBe("search_destroy");
  });
});

describe("lobby helpers", () => {
  it("prefixes Forge titles and filters by mode", () => {
    expect(forgeMapTitle("Neon Crossfire")).toBe("FORGE · Neon Crossfire");
    const maps = [
      { id: "a", name: "A", mode: "search_destroy" as const, createdAt: "t" },
      { id: "b", name: "B", mode: "deathmatch" as const, createdAt: "t" },
    ];
    expect(personalMapsForMode(maps, "deathmatch").map((m) => m.id)).toEqual(["b"]);
    expect(createGameUsesLaunchGrant({ kind: "personal", gameMode: "deathmatch", savedMapId: "b" })).toBe(true);
    expect(createGameUsesLaunchGrant({ kind: "official", gameMode: "deathmatch", mapId: "shoot-house-neon" })).toBe(
      false,
    );
  });
});
