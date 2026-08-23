import { afterEach, describe, expect, it } from "vitest";
import { LobbyService } from "../src/services/lobby-service.js";
import { makeDeathmatchRoom } from "./match-test-harness.js";

afterEach(() => {
  LobbyService.reset();
});

describe("host and room cleanup", () => {
  it("hands host to the remaining player", () => {
    const { match, room } = makeDeathmatchRoom(["host", "guest"]);
    room.setHostId("host");
    match.transferHost();
    expect(room.hostId).toBe("guest");
    expect(room.state.hostId).toBe("guest");
    expect(room.broadcasts.some((b) => b.type === "host_changed")).toBe(true);
  });

  it("stops advertising a room after the last player leaves", () => {
    const info = LobbyService.registerRoom("room-a", {
      gameMode: "deathmatch",
      mapId: "shoot-house-neon",
    });
    LobbyService.updatePlayerCount("room-a", 1);
    expect(LobbyService.findAvailableRoom({ gameMode: "deathmatch", mapId: "shoot-house-neon" })?.roomId).toBe(
      "room-a",
    );

    LobbyService.updatePlayerCount("room-a", 0);
    LobbyService.unregisterRoom("room-a");
    expect(LobbyService.getRoomById("room-a")).toBeNull();
    expect(LobbyService.getRoomByCode(info.joinCode)).toBeNull();
    expect(
      LobbyService.findAvailableRoom({ gameMode: "deathmatch", mapId: "shoot-house-neon" }),
    ).toBeNull();
  });
});
