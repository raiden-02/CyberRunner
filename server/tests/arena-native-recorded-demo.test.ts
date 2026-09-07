import { afterEach, describe, expect, it } from "vitest";
import { assertExploreMap } from "../../shared/world/explore-map.js";
import { assertSearchDestroyMap } from "../../shared/world/map-registry.js";
import { resetDesignJobs } from "../src/arena-forge/design-jobs.js";
import { exportGameplayMap } from "../src/arena-forge/export-map.js";
import { assertNoSecrets } from "../src/arena-forge/design-view.js";
import { NATIVE_DEMO_ID, NATIVE_DEMO_SPEC } from "../src/arena-forge/native-demo-spec.js";
import {
  loadNativeRecordedDemo,
  nativeDemoCatalogId,
  nativeRecordedDemoView,
  resetNativeRecordedDemoCache,
} from "../src/arena-forge/native-recorded-demo.js";
import { assertPublicRecordedPayload } from "../src/arena-forge/native-demo-sanitize.js";
import { recordNativeDemo, writeNativeDemoCandidate } from "../src/arena-forge/record-native-demo.js";
import { recordedDemoView, loadRecordedP5Demo } from "../src/arena-forge/recorded-demo.js";
import { issueExploreFromJob, issueSavedMapLaunch, resetSavedMapLaunches } from "../src/arena-forge/saved-map-launches.js";
import { MemorySavedMapStore, saveCompletedDesign, resetGuestSavedMaps } from "../src/arena-forge/saved-maps.js";
import { resetSavedRuntimeMaps } from "../src/arena-forge/saved-runtime-maps.js";
import { syntheticNativeDemoSession } from "../src/arena-forge/synthetic-native-demo.js";
import { assertCreatedRoomMode, resolveCreatedRoomMap } from "../src/room-map.js";
import { loadForgeMap } from "../src/arena-forge/preview.js";

afterEach(() => {
  resetDesignJobs();
  resetSavedMapLaunches();
  resetSavedRuntimeMaps();
  resetGuestSavedMaps();
  resetNativeRecordedDemoCache();
});

describe("native recorded demo fixture", () => {
  it("loads a valid product S&D run from a human spec", () => {
    const demo = loadNativeRecordedDemo();
    expect(demo.id).toBe(NATIVE_DEMO_ID);
    expect(demo.origin).toBe("live");
    expect(demo.path).toBe("product");
    expect(demo.spec.mode).toBe("search_destroy");
    expect(demo.spec.envelope.halfWidth * 2).toBe(44);
    expect(demo.spec.envelope.halfDepth * 2).toBe(32);
    expect(demo.designPlan.summary.length).toBeGreaterThan(8);
    expect(demo.result.turns[0]?.tool).toBe("propose_design_plan");
    expect(demo.initialMap.solids).toEqual([]);
    expect(demo.initialMap.objectives).toEqual([]);
    expect(demo.spec).toEqual(NATIVE_DEMO_SPEC);

    const view = nativeRecordedDemoView();
    expect(view.source).toBe("recorded");
    expect(view.path).toBe("product");
    expect(view.mode).toBe("search_destroy");
    expect(view.designPlan?.layout.length).toBeGreaterThan(0);
    expect(view.turns.some((t) => t.kind === "route")).toBe(true);
    expect(view.playtestCalls).toBeGreaterThan(0);

    const original = exportGameplayMap(demo.initialMap, { id: "o", name: "o" });
    const generated = exportGameplayMap(demo.finalMap, { id: "g", name: "g" });
    assertExploreMap(original);
    assertSearchDestroyMap(generated);
    expect(() => assertSearchDestroyMap(original)).toThrow(/upload terminals/);
    assertNoSecrets(view);
    assertPublicRecordedPayload(demo);
  });

  it("keeps the historical P5 fixture as secondary evidence", () => {
    const p5 = loadRecordedP5Demo();
    expect(p5.id).toBe("p5-demo");
    const view = recordedDemoView();
    expect(view.path).toBe("historical");
    expect(view.firstPlaytest?.ghost.siteChoice).toEqual({ A: 15, B: 49 });
    expect(view.lastPlaytest?.ghost.siteChoice).toEqual({ A: 30, B: 34 });
    expect(loadForgeMap("demo:p5:final").occluders.length).toBeGreaterThan(0);
  });
});

describe("native recorded explore and save", () => {
  it("explores original and generated without saving", async () => {
    const store = new MemorySavedMapStore();
    const before = await store.list("guest-x");
    const original = issueExploreFromJob({
      jobId: NATIVE_DEMO_ID,
      which: "original",
      actorId: "guest-x",
    });
    const generated = issueExploreFromJob({
      jobId: NATIVE_DEMO_ID,
      which: "generated",
      actorId: "guest-x",
    });
    expect(original.ok).toBe(true);
    expect(generated.ok).toBe(true);
    if (!original.ok || !generated.ok) return;
    expect(original.grant.purpose).toBe("explore");
    expect(generated.grant.purpose).toBe("explore");
    expect(original.grant.designedMode).toBe("search_destroy");
    expect(generated.grant.map.uploadTerminals?.map((t) => t.id).sort()).toEqual(["A", "B"]);
    expect(original.grant.map.uploadTerminals ?? []).toEqual([]);
    expect(await store.list("guest-x")).toEqual(before);
  });

  it("saves the recorded generated map once, then launches a normal S&D match", async () => {
    const store = new MemorySavedMapStore();
    const first = await saveCompletedDesign({
      userId: "user-a",
      jobId: NATIVE_DEMO_ID,
      name: "Recorded Crossfire Yard",
      store,
      createId: () => "saved-native",
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const again = await saveCompletedDesign({
      userId: "user-a",
      jobId: NATIVE_DEMO_ID,
      name: "Recorded Crossfire Yard",
      store,
    });
    expect(again.ok).toBe(true);
    if (again.ok) expect(again.record.id).toBe("saved-native");

    const listed = await store.list("user-a");
    expect(listed.map((m) => m.name)).toEqual(["Recorded Crossfire Yard"]);

    const grant = issueSavedMapLaunch(first.record, "user-a");
    const options = { gameMode: "search_destroy" as const, mapLaunchId: grant.id };
    const resolved = resolveCreatedRoomMap(options);
    expect(resolved.purpose).toBe("match");
    expect(resolved.allowSoloStart).toBe(false);
    expect(assertCreatedRoomMode(options, resolved.map, undefined, resolved)).toBe("search_destroy");
    expect(resolved.map.ghostSpawnPoints?.length).toBeGreaterThan(0);
    expect(resolved.map.sentinelSpawnPoints?.length).toBeGreaterThan(0);
    expect(resolved.map.uploadTerminals?.map((t) => t.id).sort()).toEqual(["A", "B"]);
    expect(resolved.map.spikeSpawnLocation).toBeDefined();
  });
});

describe("native recording harness", () => {
  it("records a scripted candidate without a provider", async () => {
    const demo = await recordNativeDemo({
      session: syntheticNativeDemoSession(),
      origin: "synthetic",
      provider: "scripted",
      model: "synthetic",
    });
    expect(demo.result.status).toBe("completed");
    expect(demo.result.turns.some((t) => t.tool === "trace_route" && t.route)).toBe(true);
    const written = writeNativeDemoCandidate(demo, `${process.env.TEMP ?? "."}/native-demo-harness.json`);
    expect(written.endsWith("native-demo-harness.json")).toBe(true);
  });
});

describe("native catalog maps", () => {
  it("loads original as explorable and generated as S&D", () => {
    const original = loadForgeMap(nativeDemoCatalogId("initial"));
    const generated = loadForgeMap(nativeDemoCatalogId("final"));
    assertExploreMap(original);
    assertSearchDestroyMap(generated);
  });
});
