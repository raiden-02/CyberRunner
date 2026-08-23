import { getGameplayMap } from "../../shared/world/map-registry.js";
import { GameState } from "../src/GameState.js";
import { PlayerState } from "../src/PlayerState.js";
import { DeathmatchMode } from "../src/game-modes/deathmatch-mode.js";
import { SearchDestroyMode } from "../src/game-modes/search-destroy-mode.js";
import { MatchLifecycle, type MatchRoomAccess } from "../src/match/match-lifecycle.js";
import type { PlayerRuntime } from "../src/player-runtime.js";
import type { GameplayMapDefinition } from "@shared/world/map-types.js";

export type TestPlayer = PlayerRuntime;

export function testPlayer(id: string, extras?: Partial<PlayerState>): TestPlayer {
  const schema = new PlayerState();
  schema.displayName = id;
  if (extras) Object.assign(schema, extras);
  return {
    schema,
    ctrl: null as unknown as TestPlayer["ctrl"],
    hitboxes: null as unknown as TestPlayer["hitboxes"],
    inputQueue: null as unknown as TestPlayer["inputQueue"],
    aimDir: null,
    godMode: false,
    unlimitedAmmo: false,
  };
}

export type TestRoom = MatchRoomAccess & {
  broadcasts: Array<{ type: string; message?: unknown }>;
  scheduled: Array<() => void>;
  flushScheduled(): void;
};

export function makeDeathmatchRoom(playerIds = ["killer", "victim"]): {
  room: TestRoom;
  match: MatchLifecycle;
  mode: DeathmatchMode;
} {
  const mode = new DeathmatchMode();
  const state = new GameState();
  state.gameMode = "deathmatch";
  state.scoreLimit = mode.getConfig().scoreLimit;
  state.timeRemaining = mode.getConfig().timeLimit;
  state.lobbyState = "playing";
  state.isRoundActive = true;

  const players = new Map<string, TestPlayer>();
  for (const id of playerIds) {
    mode.addPlayer(id);
    players.set(id, testPlayer(id));
  }
  mode.startGame();

  const room = makeRoom({
    state,
    players,
    gameMode: mode,
    getSDMode: () => null,
    isSearchDestroyMode: () => false,
    map: getGameplayMap("shoot-house-neon"),
  });
  return { room, match: new MatchLifecycle(room), mode };
}

export function makeSearchDestroyRoom(opts?: {
  allowSoloStart?: boolean;
  map?: GameplayMapDefinition;
}): {
  room: TestRoom;
  match: MatchLifecycle;
  mode: SearchDestroyMode;
} {
  const map = opts?.map ?? getGameplayMap("map-contract-smoke");
  const mode = new SearchDestroyMode(map.uploadTerminals || []);
  if (opts?.allowSoloStart) {
    mode.getTeamManager().setAllowSoloStart(true);
  }

  const state = new GameState();
  state.gameMode = "search_destroy";
  state.roundsToWin = mode.getConfig().roundsToWin;
  state.lobbyState = "waiting";
  state.isRoundActive = false;
  state.mapId = map.id;

  const ghost = testPlayer("ghost");
  ghost.schema.teamId = "ghosts";
  const sentinel = testPlayer("sentinel");
  sentinel.schema.teamId = "sentinels";
  const players = new Map<string, TestPlayer>([
    ["ghost", ghost],
    ["sentinel", sentinel],
  ]);

  mode.addPlayer("ghost");
  mode.addPlayer("sentinel");
  mode.getTeamManager().assignToTeam("ghost", "ghosts");
  mode.getTeamManager().assignToTeam("sentinel", "sentinels");

  const room = makeRoom({
    state,
    players,
    gameMode: mode,
    getSDMode: () => mode,
    isSearchDestroyMode: () => true,
    map,
    clients: [{ sessionId: "ghost" }, { sessionId: "sentinel" }],
    hostId: "ghost",
  });
  return { room, match: new MatchLifecycle(room), mode };
}

function makeRoom(partial: {
  state: GameState;
  players: Map<string, TestPlayer>;
  gameMode: MatchRoomAccess["gameMode"];
  getSDMode: MatchRoomAccess["getSDMode"];
  isSearchDestroyMode: MatchRoomAccess["isSearchDestroyMode"];
  map: GameplayMapDefinition;
  clients?: Array<{ sessionId: string }>;
  hostId?: string;
}): TestRoom {
  const broadcasts: Array<{ type: string; message?: unknown }> = [];
  const scheduled: Array<() => void> = [];
  let hostId = partial.hostId ?? "killer";
  const clients = partial.clients ?? [...partial.players.keys()].map((sessionId) => ({ sessionId }));

  const room: TestRoom = {
    get state() {
      return partial.state;
    },
    get players() {
      return partial.players;
    },
    get clients() {
      return clients;
    },
    get hostId() {
      return hostId;
    },
    get gameMode() {
      return partial.gameMode;
    },
    getSDMode: partial.getSDMode,
    isSearchDestroyMode: partial.isSearchDestroyMode,
    broadcast: (type, message) => {
      broadcasts.push({ type, message });
    },
    setHostId: (id) => {
      hostId = id;
      partial.state.hostId = id;
    },
    schedule: (fn) => {
      scheduled.push(fn);
    },
    placePlayerAt: (player, x, y, z) => {
      player.schema.x = x;
      player.schema.y = y;
      player.schema.z = z;
    },
    pickSpawnPoint: (sessionId) => {
      const team = partial.players.get(sessionId ?? "")?.schema.teamId;
      if (team === "ghosts" && partial.map.ghostSpawnPoints?.[0]) {
        return { ...partial.map.ghostSpawnPoints[0], y: 1 };
      }
      if (team === "sentinels" && partial.map.sentinelSpawnPoints?.[0]) {
        return { ...partial.map.sentinelSpawnPoints[0], y: 1 };
      }
      return { x: 0, y: 1, z: 0 };
    },
    get map() {
      return partial.map;
    },
    broadcasts,
    scheduled,
    flushScheduled() {
      const next = scheduled.shift();
      next?.();
    },
  };
  return room;
}
