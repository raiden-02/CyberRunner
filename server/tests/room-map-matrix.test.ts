import { describe, expect, it } from "vitest";
import { getGameplayMap, getPublicMapIds, isPublicMapId } from "../../shared/world/map-registry.js";
import {
  assertCreatedRoomMode,
  assertRoomMode,
  resolveCreatedRoomMap,
  shouldAllowForgeSoloStart,
} from "../src/room-map.js";

describe("map/mode authoritative matrix", () => {
  it("keeps Shoot House public for both modes", () => {
    expect(getPublicMapIds()).toEqual(["shoot-house-neon"]);
    const map = getGameplayMap("shoot-house-neon");
    expect(() => assertRoomMode(map, "deathmatch")).not.toThrow();
    expect(() => assertRoomMode(map, "search_destroy")).not.toThrow();
    expect(assertCreatedRoomMode({ gameMode: "deathmatch", mapId: "shoot-house-neon" }, map)).toBe(
      "deathmatch",
    );
    expect(assertCreatedRoomMode({ gameMode: "search_destroy", mapId: "shoot-house-neon" }, map)).toBe(
      "search_destroy",
    );
  });

  it("hides internal fixtures and Forge ids from public match selection", () => {
    expect(isPublicMapId("map-contract-smoke")).toBe(false);
    expect(isPublicMapId("fixture:p4a")).toBe(false);
    expect(isPublicMapId("demo:p5:final")).toBe(false);
    expect(isPublicMapId("arena-forge-preview")).toBe(false);
    expect(isPublicMapId("arena-forge-preview::demo:p5:final")).toBe(false);
  });

  it("accepts Forge + Search & Destroy and rejects Forge + Deathmatch", () => {
    const resolved = resolveCreatedRoomMap({
      gameMode: "search_destroy",
      forgeMapId: "demo:p5:final",
    });
    expect(resolved.allowSoloStart).toBe(true);
    expect(shouldAllowForgeSoloStart({ forgeMapId: "demo:p5:final" })).toBe(true);
    expect(
      assertCreatedRoomMode({ gameMode: "search_destroy", forgeMapId: "demo:p5:final" }, resolved.map),
    ).toBe("search_destroy");

    expect(() =>
      assertCreatedRoomMode({ gameMode: "deathmatch", forgeMapId: "demo:p5:final" }, resolved.map),
    ).toThrow(/Search & Destroy/);

    expect(() =>
      assertCreatedRoomMode({ forgeMapId: "demo:p5:final" }, resolved.map),
    ).toThrow(/Search & Destroy/);
  });
});
