import { afterEach, describe, expect, it } from "vitest";
import { LobbyService } from "../src/services/lobby-service.js";
import { parseQuickPlayPreference, resolveQuickPlay } from "../src/services/quickplay.js";

afterEach(() => {
  LobbyService.reset();
});

describe("room metadata", () => {
  it("stores authoritative mode and map on register", () => {
    const info = LobbyService.registerRoom("room-1", {
      gameMode: "search_destroy",
      mapId: "shoot-house-neon",
    });
    expect(info.gameMode).toBe("search_destroy");
    expect(info.mapId).toBe("shoot-house-neon");
    expect(LobbyService.getRoomById("room-1")?.gameMode).toBe("search_destroy");
  });
});

describe("Quick Play compatibility", () => {
  it("joins only a room with the requested mode and map", () => {
    LobbyService.registerRoom("dm", { gameMode: "deathmatch", mapId: "shoot-house-neon" });
    LobbyService.updatePlayerCount("dm", 1);
    LobbyService.registerRoom("sd", { gameMode: "search_destroy", mapId: "shoot-house-neon" });
    LobbyService.updatePlayerCount("sd", 1);

    const sd = resolveQuickPlay({ gameMode: "search_destroy", mapId: "shoot-house-neon" });
    expect(sd.ok).toBe(true);
    if (sd.ok) {
      expect(sd.action).toBe("join");
      expect(sd.room?.roomId).toBe("sd");
    }

    const dm = resolveQuickPlay({ gameMode: "deathmatch", mapId: "shoot-house-neon" });
    expect(dm.ok).toBe(true);
    if (dm.ok) {
      expect(dm.action).toBe("join");
      expect(dm.room?.roomId).toBe("dm");
    }
  });

  it("returns create with the requested mode and map when nothing matches", () => {
    LobbyService.registerRoom("dm", { gameMode: "deathmatch", mapId: "shoot-house-neon" });
    LobbyService.updatePlayerCount("dm", 1);

    const decided = resolveQuickPlay({ gameMode: "search_destroy", mapId: "shoot-house-neon" });
    expect(decided).toEqual({
      ok: true,
      action: "create",
      room: null,
      preference: { gameMode: "search_destroy", mapId: "shoot-house-neon" },
    });
  });

  it("rejects an invalid production map or mode mismatch", () => {
    expect(parseQuickPlayPreference({ gameMode: "search_destroy", mapId: "map-contract-smoke" }).ok).toBe(false);
    expect(parseQuickPlayPreference({ gameMode: "search_destroy", mapId: "arena-forge-preview" }).ok).toBe(false);
    expect(parseQuickPlayPreference({ gameMode: "tdm", mapId: "shoot-house-neon" }).ok).toBe(false);
    expect(parseQuickPlayPreference({}).ok).toBe(false);
  });

  it("ignores full, disposed, and incompatible rooms", () => {
    const full = LobbyService.registerRoom("full", {
      gameMode: "deathmatch",
      mapId: "shoot-house-neon",
    });
    LobbyService.updatePlayerCount("full", full.maxPlayers);

    LobbyService.registerRoom("gone", { gameMode: "deathmatch", mapId: "shoot-house-neon" });
    LobbyService.unregisterRoom("gone");

    LobbyService.registerRoom("forge", {
      gameMode: "search_destroy",
      mapId: "arena-forge-preview::demo:p5:final",
    });
    LobbyService.updatePlayerCount("forge", 1);

    const decided = resolveQuickPlay({ gameMode: "deathmatch", mapId: "shoot-house-neon" });
    expect(decided.ok && decided.action).toBe("create");
  });
});

describe("join by code", () => {
  it("looks up the room without using lobby mode/map selection", () => {
    const room = LobbyService.registerRoom("sd-room", {
      gameMode: "search_destroy",
      mapId: "shoot-house-neon",
    });
    LobbyService.updatePlayerCount("sd-room", 1);

    const found = LobbyService.getRoomByCode(room.joinCode.toLowerCase());
    expect(found?.roomId).toBe("sd-room");
    expect(found?.gameMode).toBe("search_destroy");
  });

  it("rejects a full room and forgets a removed code", () => {
    const room = LobbyService.registerRoom("cap", {
      gameMode: "deathmatch",
      mapId: "shoot-house-neon",
    });
    LobbyService.updatePlayerCount("cap", room.maxPlayers);
    expect(LobbyService.isRoomFull("cap")).toBe(true);

    const code = room.joinCode;
    LobbyService.unregisterRoom("cap");
    expect(LobbyService.getRoomByCode(code)).toBeNull();
    expect(LobbyService.getRoomById("cap")).toBeNull();
  });
});
