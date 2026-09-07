import { describe, expect, it } from "vitest";
import { getPublicMaps } from "../../shared/world/map-registry.js";
import {
  officialLobbyOption,
  officialQuickPlaySelection,
  personalLobbyOption,
  quickPlayDisabledReason,
  selectedLobbyOption,
} from "../../shared/ui/lobby-maps.js";

describe("unified lobby map selection", () => {
  const official = getPublicMaps();
  const personal = [
    { id: "p1", name: "Neon Crossfire", mode: "search_destroy" as const, createdAt: "t", sessionOnly: true },
    { id: "p2", name: "Grid", mode: "deathmatch" as const, createdAt: "t" },
  ];

  it("builds official and personal options with FORGE labels", () => {
    expect(officialLobbyOption(official[0]!).source).toBe("official");
    expect(personalLobbyOption(personal[0]!).source).toBe("personal");
    expect(personalLobbyOption(personal[0]!).title).toBe("Neon Crossfire");
  });

  it("keeps a single selection and mode filter", () => {
    expect(selectedLobbyOption({ source: "official", id: official[0]!.id }, official, personal)?.source).toBe("official");
    expect(selectedLobbyOption({ source: "personal", id: "p2" }, official, personal)?.modes).toEqual(["deathmatch"]);
  });

  it("does not silently fall back from a personal selection to an official map", () => {
    const selected = officialQuickPlaySelection({ source: "personal", id: "p2" }, official, "deathmatch");
    expect(selected).toEqual({ error: "Official maps only" });
    expect(quickPlayDisabledReason(personalLobbyOption(personal[1]!))).toBe("Official maps only");
    const officialPick = officialQuickPlaySelection({ source: "official", id: official[0]!.id }, official, "deathmatch");
    expect(officialPick).toEqual({ gameMode: "deathmatch", mapId: official[0]!.id });
  });
});
