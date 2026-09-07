import { parseArenaDesignSpec } from "../../shared/world/arena-design-spec.js";
import type { AgentTurnDecision } from "../src/arena-forge/agent.js";
import { ScriptedPlaytestSession } from "../src/arena-forge/playtest-agent.js";
import { startProductDesignJob, getDesignJob } from "../src/arena-forge/design-jobs.js";

function call(name: string, args: Record<string, unknown>): AgentTurnDecision {
  return { latencyMs: 1, calls: [{ name, arguments: args, callId: name }] };
}

const parsed = parseArenaDesignSpec({
  version: 1,
  mode: "search_destroy",
  envelope: { centerX: 0, centerZ: 0, halfWidth: 20, halfDepth: 16 },
  spawnSetup: {
    kind: "search_destroy",
    ghostAnchor: { x: -12, z: 0 },
    sentinelAnchor: { x: 12, z: 0 },
  },
  brief: "Three routes between the teams.",
});
if (!parsed.ok) throw new Error("native S&D spec");

export const nativeSndSpec = parsed.spec;

export function nativeSndScript(): ScriptedPlaytestSession {
  return new ScriptedPlaytestSession([
    call("propose_design_plan", {
      summary: "Cover between team starts.",
      layout: ["center"],
      priorities: ["safety"],
    }),
    call("add_block", { kind: "occluder", x: 0, z: 4, width: 4, depth: 0.8, height: 3, hp: null }),
    call("place_objective", { objectiveId: "A", x: -4, y: 0, z: 6, radius: 2 }),
    call("place_objective", { objectiveId: "B", x: 4, y: 0, z: -6, radius: 2 }),
    call("finish_design", { summary: "Ghosts west, Sentinels east, A and B live." }),
  ]);
}

export async function completeNativeSndJob(owner: string, jobId: string): Promise<string> {
  const started = startProductDesignJob(nativeSndSpec, {
    ownerUserId: owner,
    isLiveAvailable: () => true,
    runProduct: async ({ spec, map }) => {
      const { runArenaDesigner } = await import("../src/arena-forge/product-designer.js");
      const { buildBlankArena } = await import("../src/arena-forge/blank-map.js");
      return runArenaDesigner({
        spec,
        map: map ?? buildBlankArena(spec),
        session: nativeSndScript(),
      });
    },
    createId: () => jobId,
  });
  if (!started.ok) throw new Error(started.error);
  for (let i = 0; i < 40; i++) {
    const job = getDesignJob(started.jobId);
    if (job?.status === "completed" || job?.status === "failed") return started.jobId;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error("native S&D job did not finish");
}
