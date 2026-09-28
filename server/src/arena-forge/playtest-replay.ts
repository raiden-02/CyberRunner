import { cloneArenaMap } from "./actions.js";
import { NavGrid, type NavCell } from "./navigation.js";
import { PLAYTEST_SEED, SeededRng, chooseRoute, firstContact, validRoleSpawns } from "./playtest.js";
import type { ArenaMap, ArenaSpawn } from "./types.js";

/**
 * One Ghost/Sentinel pair from the same seed as `runPlaytest`.
 * First rollout only. Offline nav proxy. Never sent to the LLM.
 */
export type PlaytestReplayPoint = { x: number; z: number };

export type PlaytestReplayRole = {
  site: "A" | "B";
  spawn: PlaytestReplayPoint;
  path: PlaytestReplayPoint[];
};

export type PlaytestReplay = {
  seed: number;
  ghost?: PlaytestReplayRole;
  sentinel?: PlaytestReplayRole;
  firstContact?: { seconds: number; x: number; z: number };
};

function roleReplay(
  spawn: ArenaSpawn,
  route: { site: "A" | "B"; path: NavCell[] },
): PlaytestReplayRole {
  return {
    site: route.site,
    spawn: { x: spawn.x, z: spawn.z },
    path: route.path.map((c) => ({ x: c.x, z: c.z })),
  };
}

/**
 * First Ghost/Sentinel pair of `runPlaytest` for this map and seed.
 * Does not call `runPlaytest`. Does not mutate `map`.
 */
export function representativeReplay(map: ArenaMap, seed = PLAYTEST_SEED): PlaytestReplay {
  const snapshot = cloneArenaMap(map);
  const rng = new SeededRng(seed);
  const grid = new NavGrid(snapshot);
  const ghosts = validRoleSpawns(snapshot, grid, "ghost");
  const sentinels = validRoleSpawns(snapshot, grid, "sentinel");
  const ghostAnchors = ghosts.map((s) => ({ x: s.x, z: s.z }));
  const sentinelAnchors = sentinels.map((s) => ({ x: s.x, z: s.z }));

  const ghostSpawn = ghosts.length ? rng.pick(ghosts) : undefined;
  const sentinelSpawn = sentinels.length ? rng.pick(sentinels) : undefined;
  const ghost =
    ghostSpawn !== undefined
      ? chooseRoute(snapshot, grid, ghostSpawn, sentinelAnchors, rng)
      : undefined;
  const sentinel =
    sentinelSpawn !== undefined
      ? chooseRoute(snapshot, grid, sentinelSpawn, ghostAnchors, rng)
      : undefined;
  const contact =
    ghost && sentinel ? firstContact(snapshot, ghost.path, sentinel.path) : undefined;

  const replay: PlaytestReplay = { seed };
  if (ghost && ghostSpawn) replay.ghost = roleReplay(ghostSpawn, ghost);
  if (sentinel && sentinelSpawn) replay.sentinel = roleReplay(sentinelSpawn, sentinel);
  if (contact) replay.firstContact = contact;
  return JSON.parse(JSON.stringify(replay)) as PlaytestReplay;
}
