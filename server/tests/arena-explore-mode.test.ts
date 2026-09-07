import { describe, expect, it } from "vitest";
import { parseArenaDesignSpec } from "../../shared/world/arena-design-spec.js";
import { assertExploreMap, pickExploreSpawn } from "../../shared/world/explore-map.js";
import { assertSearchDestroyMap } from "../../shared/world/map-registry.js";
import { GameState } from "../src/GameState.js";
import { buildBlankArena } from "../src/arena-forge/blank-map.js";
import { exportGameplayMap } from "../src/arena-forge/export-map.js";
import { createGameMode } from "../src/game-modes/index.js";
import { ExploreMode } from "../src/game-modes/explore-mode.js";

const snd = parseArenaDesignSpec({
  version: 1,
  mode: "search_destroy",
  envelope: { centerX: 0, centerZ: 0, halfWidth: 20, halfDepth: 16 },
  spawnSetup: {
    kind: "search_destroy",
    ghostAnchor: { x: -12, z: 0 },
    sentinelAnchor: { x: 12, z: 0 },
  },
  brief: "Blank.",
});
if (!snd.ok) throw new Error("snd");

const dm = parseArenaDesignSpec({
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
  brief: "DM.",
});
if (!dm.ok) throw new Error("dm");

describe("ExploreMode", () => {
  it("starts immediately with no lobby, score, or victory", () => {
    const mode = createGameMode("explore");
    expect(mode).toBeInstanceOf(ExploreMode);
    const cfg = mode.getConfig();
    expect(cfg.teamBased).toBe(false);
    expect(cfg.scoreLimit).toBe(0);
    expect(cfg.roundBased).toBe(false);
    mode.addPlayer("p1");
    mode.startGame();
    const state = new GameState();
    expect(mode.update(0.016, state, new Map()).ended).toBe(false);
    expect(mode.isGameEnded()).toBe(false);
    expect(mode.canRespawn("p1")).toBe(true);
  });

  it("spawns S&D explore at the first Ghost start and DM at the first general", () => {
    const sndMap = exportGameplayMap(buildBlankArena(snd.spec), { id: "ex-snd", name: "Blank" });
    expect(pickExploreSpawn(sndMap)).toEqual(sndMap.ghostSpawnPoints![0]);
    assertExploreMap(sndMap);
    expect(() => assertSearchDestroyMap(sndMap)).toThrow(/upload terminals/);

    const dmMap = exportGameplayMap(buildBlankArena(dm.spec), { id: "ex-dm", name: "DM" });
    expect(pickExploreSpawn(dmMap)).toEqual(dmMap.spawnPoints[0]);
    assertExploreMap(dmMap);
  });
});
