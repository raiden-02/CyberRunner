import { afterEach, describe, expect, it } from "vitest";
import { getGameplayMap } from "../../shared/world/map-registry.js";
import type { GameplayMapDefinition, SpawnPoint } from "../../shared/world/map-types.js";
import { GameState } from "../src/GameState.js";
import { PlayerState } from "../src/PlayerState.js";
import { MemorySavedMapStore, saveCompletedDesign } from "../src/arena-forge/saved-maps.js";
import { issueSavedMapLaunch, resetSavedMapLaunches } from "../src/arena-forge/saved-map-launches.js";
import { resetSavedRuntimeMaps } from "../src/arena-forge/saved-runtime-maps.js";
import { resetDesignJobs } from "../src/arena-forge/design-jobs.js";
import { createGameMode, SearchDestroyMode } from "../src/game-modes/index.js";
import { MatchLifecycle } from "../src/match/match-lifecycle.js";
import { assertCreatedRoomMode, resolveCreatedRoomMap } from "../src/room-map.js";
import { beginRoomJoin, rollbackRoomJoin } from "../src/spawn/join-spawn.js";
import { pickSpawnPoint, spawnCandidates } from "../src/spawn/spawn-select.js";
import { completeNativeSndJob } from "./arena-snd-fixture.js";
import { makeDeathmatchRoom, makeSearchDestroyRoom, testPlayer } from "./match-test-harness.js";

function atSpawn(point: SpawnPoint, pos: { x: number; y: number; z: number }): boolean {
  return point.x === pos.x && point.y === pos.y && point.z === pos.z;
}

function inSet(points: SpawnPoint[] | undefined, pos: { x: number; y: number; z: number }): boolean {
  return Boolean(points?.some((p) => atSpawn(p, pos)));
}

function nativeSndMap(overrides?: Partial<GameplayMapDefinition>): GameplayMapDefinition {
  return {
    id: "native-snd",
    name: "Native S&D",
    boundsHalfSize: 20,
    wallHeight: 3,
    wallThickness: 0.4,
    groundThickness: 0.1,
    obstacles: [],
    occluders: [],
    breakables: [],
    spawnProtectionZones: [],
    spawnPoints: [],
    ghostSpawnPoints: [
      { x: -13.2, y: 1, z: -1.2 },
      { x: -10.8, y: 1, z: -1.2 },
    ],
    sentinelSpawnPoints: [
      { x: 10.8, y: 1, z: 1.2 },
      { x: 13.2, y: 1, z: 1.2 },
    ],
    uploadTerminals: [
      { id: "A", x: -4, y: 0, z: 6, radius: 2 },
      { id: "B", x: 4, y: 0, z: -6, radius: 2 },
    ],
    spikeSpawnLocation: { x: -12, y: 1, z: 0 },
    ...overrides,
  };
}

function pickFor(
  map: GameplayMapDefinition,
  sessionId: string,
  teamOf: (id: string) => string | undefined,
  players = new Map(),
) {
  return pickSpawnPoint(map, players, sessionId, teamOf);
}

afterEach(() => {
  resetDesignJobs();
  resetSavedMapLaunches();
  resetSavedRuntimeMaps();
});

describe("S&D spawn candidates", () => {
  it("picks Ghost and Sentinel arrays after TeamManager assignment", () => {
    const map = nativeSndMap();
    const mode = new SearchDestroyMode(map.uploadTerminals ?? []);
    mode.getTeamManager().assignToTeam("a", "ghosts");
    mode.getTeamManager().assignToTeam("b", "sentinels");

    const ghost = pickFor(map, "a", (id) => mode.getTeamManager().getPlayerTeam(id));
    const sentinel = pickFor(map, "b", (id) => mode.getTeamManager().getPlayerTeam(id));

    expect(inSet(map.ghostSpawnPoints, ghost)).toBe(true);
    expect(inSet(map.sentinelSpawnPoints, sentinel)).toBe(true);
    expect(inSet(map.sentinelSpawnPoints, ghost)).toBe(false);
    expect(inSet(map.ghostSpawnPoints, sentinel)).toBe(false);
  });

  it("never returns undefined without a team on empty general spawns", () => {
    const map = nativeSndMap();
    const picked = pickSpawnPoint(map, new Map(), "solo", () => undefined);
    expect(picked).toBeDefined();
    expect(Number.isFinite(picked.x) && Number.isFinite(picked.y) && Number.isFinite(picked.z)).toBe(true);
    expect(inSet(map.ghostSpawnPoints, picked) || inSet(map.sentinelSpawnPoints, picked)).toBe(true);
    expect(spawnCandidates(map, undefined).source).toBe("snd-fallback");
  });

  it("throws a clear error when a known team has no spawns", () => {
    const emptyGhosts = nativeSndMap({ ghostSpawnPoints: [] });
    expect(() => spawnCandidates(emptyGhosts, "ghosts")).toThrow("Map has no usable Ghost spawn points.");
    const emptySentinels = nativeSndMap({ sentinelSpawnPoints: [] });
    expect(() => spawnCandidates(emptySentinels, "sentinels")).toThrow("Map has no usable Sentinel spawn points.");
    expect(() => spawnCandidates({ ...nativeSndMap(), ghostSpawnPoints: [], sentinelSpawnPoints: [] }, undefined))
      .toThrow("Map has no usable spawn points.");
  });

  it("keeps Shoot House Deathmatch on general spawns and S&D on team arrays", () => {
    const map = getGameplayMap("shoot-house-neon");
    const dm = pickSpawnPoint(map, new Map(), "p", () => undefined);
    expect(inSet(map.spawnPoints, dm)).toBe(true);

    const ghost = pickSpawnPoint(map, new Map(), "g", () => "ghosts");
    const sentinel = pickSpawnPoint(map, new Map(), "s", () => "sentinels");
    expect(inSet(map.ghostSpawnPoints, ghost)).toBe(true);
    expect(inSet(map.sentinelSpawnPoints, sentinel)).toBe(true);
  });
});

describe("S&D join lifecycle", () => {
  it("assigns a team before picking the initial spawn and rolls back on failure", () => {
    const map = nativeSndMap();
    const mode = new SearchDestroyMode(map.uploadTerminals ?? []);
    const joined = beginRoomJoin({
      sessionId: "host",
      gameMode: mode,
      pickSpawn: (id) => pickFor(map, id, (sid) => mode.getTeamManager().getPlayerTeam(sid)),
    });
    expect(joined.teamId).toBe("ghosts");
    expect(inSet(map.ghostSpawnPoints, joined.spawn)).toBe(true);
    expect(mode.getTeamManager().getPlayerTeam("host")).toBe("ghosts");

    const broken = new SearchDestroyMode([]);
    expect(() =>
      beginRoomJoin({
        sessionId: "fail",
        gameMode: broken,
        pickSpawn: (id) => pickFor(nativeSndMap({ ghostSpawnPoints: [] }), id, () => "ghosts"),
      }),
    ).toThrow("Map has no usable Ghost spawn points.");
    expect(broken.getTeamManager().getPlayerTeam("fail")).toBeUndefined();
    rollbackRoomJoin(mode, "host");
    expect(mode.getTeamManager().getPlayerTeam("host")).toBeUndefined();
  });

  it("creates a saved native S&D room and joins the first player into the team lobby", async () => {
    const store = new MemorySavedMapStore();
    const jobId = await completeNativeSndJob("user-a", "job-join-snd");
    const saved = await saveCompletedDesign({
      userId: "user-a",
      jobId,
      name: "Split Sites",
      store,
      createId: () => "map-join-snd",
    });
    if (!saved.ok) throw new Error(saved.error);

    const grant = issueSavedMapLaunch(saved.record, "user-a");
    const options = { gameMode: "search_destroy" as const, mapLaunchId: grant.id };
    const resolved = resolveCreatedRoomMap(options);
    const modeId = assertCreatedRoomMode(options, resolved.map, undefined, resolved);
    expect(modeId).toBe("search_destroy");
    expect(resolved.purpose).toBe("match");
    expect(resolved.allowSoloStart).toBe(false);
    expect(resolved.map.spawnPoints.length).toBe(0);

    const gameMode = createGameMode(modeId, resolved.map.uploadTerminals || []);
    expect(gameMode).toBeInstanceOf(SearchDestroyMode);
    const sd = gameMode as SearchDestroyMode;
    const state = new GameState();
    state.gameMode = gameMode.getConfig().id;
    state.mapId = resolved.stateMapId;
    state.lobbyState = "waiting";
    state.isRoundActive = false;

    const players = new Map();
    const joined = beginRoomJoin({
      sessionId: "host",
      gameMode,
      pickSpawn: (id) => pickFor(resolved.map, id, (sid) => sd.getTeamManager().getPlayerTeam(sid), players),
    });
    const schema = new PlayerState();
    schema.x = joined.spawn.x;
    schema.y = joined.spawn.y;
    schema.z = joined.spawn.z;
    schema.teamId = joined.teamId ?? "";
    players.set("host", testPlayer("host", schema));

    expect(state.gameMode).toBe("search_destroy");
    expect(state.lobbyState).toBe("waiting");
    expect(players.has("host")).toBe(true);
    expect(joined.teamId === "ghosts" || joined.teamId === "sentinels").toBe(true);
    expect(Number.isFinite(schema.x) && Number.isFinite(schema.y) && Number.isFinite(schema.z)).toBe(true);
    const teamSpawns = joined.teamId === "ghosts"
      ? resolved.map.ghostSpawnPoints
      : resolved.map.sentinelSpawnPoints;
    expect(inSet(teamSpawns, joined.spawn)).toBe(true);
    expect(sd.getTeamManager().canStartGame()).toBe(false);
  });

  it("auto-assigns two players to opposite teams, then Start Game uses team spawns", async () => {
    const store = new MemorySavedMapStore();
    const jobId = await completeNativeSndJob("user-a", "job-two-snd");
    const saved = await saveCompletedDesign({
      userId: "user-a",
      jobId,
      name: "Split Sites",
      store,
      createId: () => "map-two-snd",
    });
    if (!saved.ok) throw new Error(saved.error);
    const grant = issueSavedMapLaunch(saved.record, "user-a");
    const options = { gameMode: "search_destroy" as const, mapLaunchId: grant.id };
    const resolved = resolveCreatedRoomMap(options);
    const map = resolved.map;

    const { room, match, mode } = makeSearchDestroyRoom({ map });
    for (const id of [...room.players.keys()]) {
      mode.getTeamManager().removePlayer(id);
      mode.removePlayer(id);
      room.players.delete(id);
    }

    const players = room.players;
    const first = beginRoomJoin({
      sessionId: "a",
      gameMode: mode,
      pickSpawn: (id) => pickFor(map, id, (sid) => mode.getTeamManager().getPlayerTeam(sid), players),
    });
    const second = beginRoomJoin({
      sessionId: "b",
      gameMode: mode,
      pickSpawn: (id) => pickFor(map, id, (sid) => mode.getTeamManager().getPlayerTeam(sid), players),
    });

    const a = testPlayer("a");
    a.schema.teamId = first.teamId ?? "";
    a.schema.x = first.spawn.x;
    a.schema.y = first.spawn.y;
    a.schema.z = first.spawn.z;
    const b = testPlayer("b");
    b.schema.teamId = second.teamId ?? "";
    b.schema.x = second.spawn.x;
    b.schema.y = second.spawn.y;
    b.schema.z = second.spawn.z;
    players.set("a", a);
    players.set("b", b);
    room.clients.length = 0;
    room.clients.push({ sessionId: "a" }, { sessionId: "b" });
    room.setHostId("a");

    const teams = [first.teamId, second.teamId].sort();
    expect(teams).toEqual(["ghosts", "sentinels"]);
    expect(mode.getTeamManager().canStartGame()).toBe(true);
    expect(inSet(map.ghostSpawnPoints, first.teamId === "ghosts" ? first.spawn : second.spawn)).toBe(true);
    expect(inSet(map.sentinelSpawnPoints, first.teamId === "sentinels" ? first.spawn : second.spawn)).toBe(true);

    match.startTeamGame();
    expect(room.state.lobbyState).toBe("playing");
    expect(room.state.isRoundActive).toBe(true);

    const afterA = players.get("a")!.schema;
    const afterB = players.get("b")!.schema;
    expect(inSet(
      afterA.teamId === "ghosts" ? map.ghostSpawnPoints : map.sentinelSpawnPoints,
      { x: afterA.x, y: afterA.y, z: afterA.z },
    )).toBe(true);
    expect(inSet(
      afterB.teamId === "ghosts" ? map.ghostSpawnPoints : map.sentinelSpawnPoints,
      { x: afterB.x, y: afterB.y, z: afterB.z },
    )).toBe(true);
  });

  it("starts saved Deathmatch immediately and keeps historical solo-start off the saved path", () => {
    const dm = makeDeathmatchRoom();
    expect(dm.room.state.lobbyState).toBe("playing");
    expect(dm.mode.getModeId()).toBe("deathmatch");

    const forge = makeSearchDestroyRoom({ allowSoloStart: true });
    forge.mode.getTeamManager().removePlayer("sentinel");
    expect(forge.mode.getTeamManager().canStartGame()).toBe(true);

    const ordinary = makeSearchDestroyRoom();
    ordinary.mode.getTeamManager().removePlayer("sentinel");
    expect(ordinary.mode.getTeamManager().canStartGame()).toBe(false);
  });
});
