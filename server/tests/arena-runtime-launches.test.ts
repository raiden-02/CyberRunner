import { afterEach, describe, expect, it } from "vitest";
import { parseArenaDesignSpec } from "../../shared/world/arena-design-spec.js";
import { ScriptedPlaytestSession } from "../src/arena-forge/playtest-agent.js";
import { resetDesignJobs, startProductDesignJob } from "../src/arena-forge/design-jobs.js";
import {
  consumeRuntimeMapLaunch,
  issueExploreFromJob,
  issueRuntimeMapLaunch,
  LAUNCH_GRANT_TTL_MS,
  resetRuntimeMapLaunches,
} from "../src/arena-forge/saved-map-launches.js";
import { exportGameplayMap } from "../src/arena-forge/export-map.js";
import { buildBlankArena } from "../src/arena-forge/blank-map.js";
import { MemorySavedMapStore, saveCompletedDesign } from "../src/arena-forge/saved-maps.js";
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
  brief: "Loops.",
});
if (!dmSpec.ok) throw new Error("dm");

async function completeJob(id: string, owner: string): Promise<string> {
  const started = startProductDesignJob(dmSpec.spec, {
    ownerUserId: owner,
    isLiveAvailable: () => true,
    runProduct: async ({ spec, map }) => {
      const { runArenaDesigner } = await import("../src/arena-forge/product-designer.js");
      return runArenaDesigner({
        spec,
        map: map ?? buildBlankArena(spec),
        session: new ScriptedPlaytestSession([
          call("propose_design_plan", { summary: "Loops.", layout: ["ring"], priorities: ["cover"] }),
          call("add_block", { kind: "occluder", x: 0, z: 0, width: 4, depth: 0.8, height: 3, hp: null }),
          call("finish_design", { summary: "good" }),
        ]),
      });
    },
    createId: () => id,
  });
  if (!started.ok) throw new Error(started.error);
  for (let i = 0; i < 40; i++) {
    const { getDesignJob } = await import("../src/arena-forge/design-jobs.js");
    if (["completed", "failed"].includes(getDesignJob(started.jobId)?.status ?? "")) return started.jobId;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error("job");
}

afterEach(() => {
  resetDesignJobs();
  resetRuntimeMapLaunches();
});

describe("runtime map launches", () => {
  it("issues high-entropy ids, expires, and consumes once", () => {
    const map = exportGameplayMap(buildBlankArena(dmSpec.spec), { id: "runtime-map:t", name: "T" });
    const grant = issueRuntimeMapLaunch({
      map,
      designedMode: "deathmatch",
      purpose: "explore",
      createId: () => "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    });
    expect(grant.id.length).toBeGreaterThan(20);
    expect(consumeRuntimeMapLaunch(grant.id)?.purpose).toBe("explore");
    expect(consumeRuntimeMapLaunch(grant.id)).toBeUndefined();

    const expired = issueRuntimeMapLaunch({
      map,
      designedMode: "deathmatch",
      purpose: "match",
      now: Date.now() - LAUNCH_GRANT_TTL_MS - 10,
    });
    expect(consumeRuntimeMapLaunch(expired.id)).toBeUndefined();
  });

  it("launches transient original and generated explore maps without saving", async () => {
    const jobId = await completeJob("job-explore", "user-a");
    const store = new MemorySavedMapStore();
    expect((await store.list("user-a")).length).toBe(0);

    const original = issueExploreFromJob({ jobId, which: "original", actorId: "user-a" });
    expect(original.ok).toBe(true);
    if (!original.ok) return;
    const resolvedOriginal = resolveCreatedRoomMap({ mapLaunchId: original.grant.id });
    expect(resolvedOriginal.purpose).toBe("explore");
    expect(resolvedOriginal.allowSoloStart).toBe(false);
    expect(assertCreatedRoomMode({ mapLaunchId: original.grant.id }, resolvedOriginal.map, undefined, resolvedOriginal)).toBe(
      "explore",
    );
    expect(resolvedOriginal.map.obstacles.length + resolvedOriginal.map.occluders.length).toBe(0);

    const generated = issueExploreFromJob({ jobId, which: "generated", actorId: "user-a" });
    expect(generated.ok).toBe(true);
    if (!generated.ok) return;
    const resolvedGen = resolveCreatedRoomMap({ mapLaunchId: generated.grant.id, gameMode: "explore" });
    expect(resolvedGen.purpose).toBe("explore");
    expect(resolvedGen.map.occluders.length).toBe(1);
    expect((await store.list("user-a")).length).toBe(0);

    const saved = await saveCompletedDesign({
      userId: "user-a",
      jobId,
      name: "Compare",
      store,
      createId: () => "map-compare",
    });
    if (!saved.ok) throw new Error("save");
    const exploreMap = resolvedGen.map;
    const matchMap = saved.record.mapDefinition;
    expect(exploreMap.occluders).toEqual(matchMap.occluders);
    expect(exploreMap.obstacles).toEqual(matchMap.obstacles);
    expect(exploreMap.spawnPoints).toEqual(matchMap.spawnPoints);
  });

  it("launches a saved map as a normal match and rejects raw browser JSON", async () => {
    const jobId = await completeJob("job-match", "user-a");
    const store = new MemorySavedMapStore();
    const saved = await saveCompletedDesign({
      userId: "user-a",
      jobId,
      name: "Neon Crossfire",
      store,
      createId: () => "map-saved",
    });
    if (!saved.ok) throw new Error("save");
    const grant = issueRuntimeMapLaunch({
      map: saved.record.mapDefinition,
      designedMode: "deathmatch",
      purpose: "match",
      savedMapId: saved.record.id,
      ownerUserId: "user-a",
    });
    const resolved = resolveCreatedRoomMap({ mapLaunchId: grant.id, gameMode: "deathmatch" });
    expect(resolved.purpose).toBe("match");
    expect(resolved.allowSoloStart).toBe(false);
    expect(assertCreatedRoomMode({ mapLaunchId: grant.id, gameMode: "deathmatch" }, resolved.map, undefined, resolved)).toBe(
      "deathmatch",
    );
    expect(() =>
      resolveCreatedRoomMap({
        mapLaunchId: "not-a-grant",
      }),
    ).toThrow(/invalid or expired/);
  });

  it("rejects explore of someone else's job", async () => {
    const jobId = await completeJob("job-other", "user-a");
    const stolen = issueExploreFromJob({ jobId, which: "original", actorId: "user-b" });
    expect(stolen.ok).toBe(false);
    if (!stolen.ok) expect(stolen.status).toBe(403);
  });
});
