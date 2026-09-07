import { parseArenaDesignSpec, type ArenaDesignSpec } from "@shared/world/arena-design-spec.js";

export const NATIVE_DEMO_ID = "native-designer-demo";
export const NATIVE_DEMO_LABEL = "Native S&D Design";
export const NATIVE_DEMO_MAP_NAME = "Crossfire Yard";
export const NATIVE_DEMO_SAVE_NAME = "Recorded Crossfire Yard";
export const NATIVE_DEMO_VERSION = 1;

export const NATIVE_DEMO_BRIEF =
  "Build a compact three-route Search & Destroy arena. Give both teams meaningful choices off spawn, keep the middle route fast but exposed, make A more enclosed than B, and avoid a single sightline that controls most rotations.";

const parsed = parseArenaDesignSpec({
  version: 1,
  mode: "search_destroy",
  envelope: { centerX: 0, centerZ: 0, halfWidth: 22, halfDepth: 16 },
  spawnSetup: {
    kind: "search_destroy",
    ghostAnchor: { x: -16, z: 0 },
    sentinelAnchor: { x: 16, z: 0 },
  },
  brief: NATIVE_DEMO_BRIEF,
});
if (!parsed.ok) throw new Error(parsed.issues.map((i) => i.message).join("; "));

export const NATIVE_DEMO_SPEC: ArenaDesignSpec = parsed.spec;
