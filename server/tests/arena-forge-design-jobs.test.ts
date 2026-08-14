import { afterEach, beforeAll, describe, expect, it } from "vitest";
import RAPIER from "@dimforge/rapier3d-compat";
import { getGameplayMap } from "../../shared/world/map-registry.js";
import { buildMapColliders } from "../../shared/world/map-physics.js";
import { p4ManifestHash } from "../src/arena-forge/eval-cases.js";
import { p4bManifestHash } from "../src/arena-forge/eval-cases-p4b.js";
import {
  getDesignJob,
  getDesignJobView,
  resetDesignJobs,
  startDesignJob,
  liveAgentCapability,
  type DesignRunner,
} from "../src/arena-forge/design-jobs.js";
import { DESIGN_BRIEF_MAX, assertNoSecrets, jobCatalogId } from "../src/arena-forge/design-view.js";
import { importGameplayMap } from "../src/arena-forge/import-map.js";
import { loadForgeMap } from "../src/arena-forge/preview.js";
import {
  loadRecordedP5Demo,
  recordedDemoView,
  verifyRecordedDemoMaps,
} from "../src/arena-forge/recorded-demo.js";
import {
  ScriptedPlaytestSession,
  runPlaytestAgentDesign,
  type PlaytestAgentTurnRecord,
} from "../src/arena-forge/playtest-agent.js";
import type { AgentTurnDecision } from "../src/arena-forge/agent.js";

const P4A_HASH = "6acb4b3274ec7d1bb06090f5342816737227a9855945558958bc3d29154282e2";
const P4B_HASH = "0ad49258552c067ebf1117dacc37b0c02ce16505870e943ef33e60ef571faa39";

function decision(name: string, args: unknown): AgentTurnDecision {
  return { calls: [{ name, arguments: args, callId: `call-${name}` }], latencyMs: 1 };
}

function liveDeps(run: DesignRunner, createId?: () => string) {
  return { isLiveAvailable: () => true, run, createId };
}

function scriptedRunner(turns: AgentTurnDecision[]): DesignRunner {
  return async ({ map, brief, onTurn }) =>
    runPlaytestAgentDesign({
      map,
      brief,
      session: new ScriptedPlaytestSession(turns),
      onTurn,
    });
}

afterEach(() => {
  resetDesignJobs();
});

describe("P4 hashes stay frozen in P6", () => {
  it("keeps P4-A and P4-B manifest hashes", () => {
    expect(p4ManifestHash()).toBe(P4A_HASH);
    expect(p4bManifestHash()).toBe(P4B_HASH);
  });
});

describe("P6 A feature disabled", () => {
  it("rejects live design when the gate is off", () => {
    const started = startDesignJob(
      { brief: "Use playtest evidence to even site choice.", mapId: "map-contract-smoke" },
      { isLiveAvailable: () => false },
    );
    expect(started.ok).toBe(false);
    if (started.ok) return;
    expect(started.status).toBe(403);
    expect(started.error).toMatch(/recorded P5 demo/i);
    expect(liveAgentCapability({ isLiveAvailable: () => false })).toEqual({ liveAgentAvailable: false });
  });
});

describe("P6 B invalid brief", () => {
  it("rejects empty and oversized briefs before creating a job", () => {
    const empty = startDesignJob({ brief: "   ", mapId: "map-contract-smoke" }, liveDeps(async () => {
      throw new Error("should not run");
    }));
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.status).toBe(400);

    const long = startDesignJob(
      { brief: "x".repeat(DESIGN_BRIEF_MAX + 1), mapId: "map-contract-smoke" },
      liveDeps(async () => {
        throw new Error("should not run");
      }),
    );
    expect(long.ok).toBe(false);
    if (!long.ok) expect(long.status).toBe(400);
    expect(getDesignJobView("missing")).toBeUndefined();
  });
});

describe("P6 C invalid map", () => {
  it("rejects a map that is not on the allowlist", () => {
    const started = startDesignJob(
      { brief: "Keep both sites reachable.", mapId: "shoot-house-neon" },
      liveDeps(async () => {
        throw new Error("should not run");
      }),
    );
    expect(started.ok).toBe(false);
    if (!started.ok) expect(started.status).toBe(400);
  });
});

describe("P6 D one active job", () => {
  it("rejects a second concurrent start", async () => {
    let release!: () => void;
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const run: DesignRunner = async () => {
      await hold;
      return runPlaytestAgentDesign({
        map: importGameplayMap(getGameplayMap("map-contract-smoke")),
        brief: "done",
        session: new ScriptedPlaytestSession([decision("finish_design", { summary: "Idle." })]),
      });
    };
    const first = startDesignJob(
      { brief: "First job.", mapId: "map-contract-smoke" },
      liveDeps(run),
    );
    expect(first.ok).toBe(true);
    await Promise.resolve();
    const second = startDesignJob(
      { brief: "Second job.", mapId: "map-contract-smoke" },
      liveDeps(run),
    );
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.status).toBe(409);
      expect(second.error).toMatch(/already running/i);
    }
    release();
    if (first.ok) {
      await viWaitFor(() => getDesignJob(first.jobId)?.status === "completed");
    }
  });
});

describe("P6 E progress", () => {
  it("exposes playtest then edit incrementally", async () => {
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const run: DesignRunner = async ({ onTurn }) => {
      onTurn({
        turn: 1,
        tool: "run_playtest",
        arguments: { intent: "baseline" },
        intent: "baseline",
        playtest: {
          seed: 20260831,
          rollouts: 64,
          speedMetersPerSecond: 5,
          ghost: {
            siteChoice: { A: 15, B: 49 },
            medianArrivalSeconds: { A: 1.5, B: 2.4 },
            meanRouteExposureFraction: 0.755,
            routeConcentration: 0.438,
          },
          sentinel: {
            siteChoice: { A: 29, B: 35 },
            medianArrivalSeconds: { A: 1.6, B: 1.7 },
            meanRouteExposureFraction: 0.954,
            routeConcentration: 0.391,
          },
          firstContact: { occurrenceFraction: 0.594 },
          limitations: [],
        },
        latencyMs: 1,
      });
      await firstGate;
      onTurn({
        turn: 2,
        tool: "add_solid",
        arguments: { kind: "obstacle", x: 1, y: 1, z: 1, hx: 1, hy: 1, hz: 1, intent: "nudge" },
        intent: "nudge",
        outcome: { ok: true, changedIds: ["obstacle-2"] },
        latencyMs: 1,
      });
      return runPlaytestAgentDesign({
        map: importGameplayMap(getGameplayMap("map-contract-smoke")),
        brief: "progress",
        session: new ScriptedPlaytestSession([
          decision("run_playtest", { intent: "after" }),
          decision("finish_design", { summary: "Done." }),
        ]),
      });
    };

    const started = startDesignJob(
      { brief: "Watch the trace.", mapId: "map-contract-smoke" },
      liveDeps(run, () => "job-progress"),
    );
    expect(started.ok).toBe(true);
    await viWaitFor(() => (getDesignJobView("job-progress")?.turns.length ?? 0) >= 1);
    const mid = getDesignJobView("job-progress")!;
    expect(mid.status).toBe("running");
    expect(mid.turns[0]?.kind).toBe("playtest");
    expect(mid.turns[0]?.playtest?.ghost.siteChoice.B).toBe(49);
    releaseFirst();
    await viWaitFor(() => getDesignJobView("job-progress")?.status === "completed");
    const done = getDesignJobView("job-progress")!;
    expect(done.status).toBe("completed");
    expect(done.turns.some((t) => t.kind === "playtest")).toBe(true);
    expect(done.turns.some((t) => t.kind === "finish")).toBe(true);
  });
});

describe("P6 F completion preview", () => {
  it("stores the final map and resolves it through Forge preview", async () => {
    const started = startDesignJob(
      { brief: "Nudge a box.", mapId: "map-contract-smoke" },
      liveDeps(
        scriptedRunner([
          decision("run_playtest", { intent: "look" }),
          decision("move_solid", { solidId: "obstacle-1", x: 4, y: 1, z: -2, intent: "nudge" }),
          decision("run_playtest", { intent: "check" }),
          decision("finish_design", { summary: "Moved one box." }),
        ]),
        () => "job-complete",
      ),
    );
    expect(started.ok).toBe(true);
    await viWaitFor(() => getDesignJobView("job-complete")?.status === "completed");
    const view = getDesignJobView("job-complete")!;
    expect(view.playOriginalId).toBe(jobCatalogId("job-complete", "initial"));
    expect(view.playResultId).toBe(jobCatalogId("job-complete", "final"));
    expect(view.lastPlaytestIsOnFinalMap).toBe(true);
    const preview = loadForgeMap(view.playResultId);
    expect(preview.obstacles[1]).toEqual({ x: 4, y: 1, z: -2, hx: 1, hy: 1, hz: 1 });
    expect(preview.id).toBe("arena-forge-preview");
  });

  it("does not label a stale playtest as the final map state", async () => {
    const started = startDesignJob(
      { brief: "Edit after observing.", mapId: "map-contract-smoke" },
      liveDeps(
        scriptedRunner([
          decision("run_playtest", { intent: "look" }),
          decision("move_solid", { solidId: "obstacle-1", x: 4, y: 1, z: -2, intent: "nudge" }),
          decision("finish_design", { summary: "Edited after the last playtest." }),
        ]),
        () => "job-stale",
      ),
    );
    expect(started.ok).toBe(true);
    await viWaitFor(() => getDesignJobView("job-stale")?.status === "completed");
    const view = getDesignJobView("job-stale")!;
    expect(view.lastPlaytest).toBeTruthy();
    expect(view.lastPlaytestIsOnFinalMap).toBe(false);
    expect(view.lastPlaytestMapRevision).toBe(0);
    expect(view.finalMapRevision).toBe(1);
  });
});

describe("P6 G failure keeps partial trace", () => {
  it("retains turns produced before a runner error", async () => {
    const run: DesignRunner = async ({ onTurn }) => {
      onTurn({
        turn: 1,
        tool: "run_playtest",
        arguments: { intent: "look" },
        intent: "look",
        latencyMs: 1,
      } as PlaytestAgentTurnRecord);
      throw new Error("provider timeout");
    };
    const started = startDesignJob(
      { brief: "This will fail.", mapId: "map-contract-smoke" },
      liveDeps(run, () => "job-fail"),
    );
    expect(started.ok).toBe(true);
    await viWaitFor(() => getDesignJobView("job-fail")?.status === "failed");
    const view = getDesignJobView("job-fail")!;
    expect(view.turns).toHaveLength(1);
    expect(view.turns[0]?.tool).toBe("run_playtest");
    expect(view.error).toBe("provider timeout");
  });
});

describe("P6 H recorded demo", () => {
  it("loads without calling OpenAI", () => {
    const demo = loadRecordedP5Demo();
    verifyRecordedDemoMaps(demo);
    const view = recordedDemoView();
    expect(view.source).toBe("recorded");
    expect(view.turns).toHaveLength(6);
    expect(view.firstPlaytest?.ghost.siteChoice).toEqual({ A: 15, B: 49 });
    expect(view.lastPlaytest?.ghost.siteChoice).toEqual({ A: 30, B: 34 });
    expect(view.lastPlaytestIsOnFinalMap).toBe(true);
    const original = loadForgeMap(view.playOriginalId);
    const result = loadForgeMap(view.playResultId!);
    expect(original.occluders).toHaveLength(1);
    expect(result.occluders.some((o) => o.hx === 1.2 && o.x === -5.5)).toBe(true);
  });
});

describe("P6 I no secrets", () => {
  it("does not serialize an API key in job or demo payloads", async () => {
    const started = startDesignJob(
      { brief: "No secrets here.", mapId: "map-contract-smoke" },
      liveDeps(
        scriptedRunner([decision("finish_design", { summary: "Nothing to change." })]),
        () => "job-secrets",
      ),
    );
    expect(started.ok).toBe(true);
    await viWaitFor(() => getDesignJobView("job-secrets")?.status === "completed");
    assertNoSecrets(getDesignJobView("job-secrets"));
    assertNoSecrets(recordedDemoView());
    assertNoSecrets(loadRecordedP5Demo());
  });
});

describe("P6 recorded demo export", () => {
  beforeAll(async () => {
    await RAPIER.init();
  });

  it("exports the recorded result through GameplayMapDefinition and RAPIER", () => {
    const map = loadForgeMap("demo:p5:final");
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    const { breakableColliders } = buildMapColliders(RAPIER, world, map);
    expect(breakableColliders.length).toBe(map.breakables.length);
    const expected = 1 + 4 + map.obstacles.length + map.occluders.length + map.breakables.length;
    expect(world.colliders.len()).toBe(expected);
    world.free();
  });
});

async function viWaitFor(check: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error("timed out");
    await new Promise((r) => setTimeout(r, 10));
  }
}
