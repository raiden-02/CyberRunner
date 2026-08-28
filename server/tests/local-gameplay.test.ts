import { describe, expect, it } from "vitest";
import { isGameplayActive } from "../../shared/net/gameplay-input.js";
import {
  shouldApplyLocalWeaponSwitch,
  shouldSendSpikeClientAction,
  shouldSimulateLocalFire,
} from "../../shared/net/local-gameplay.js";
import { quickPlayFollowThrough } from "../../shared/net/quickplay-action.js";
import { showcaseSourceForForgePreview, showcaseSourceForGameplayMapId } from "../../shared/world/showcase-source.js";
import { ARENA_FORGE_PREVIEW_MAP_ID } from "../../shared/world/arena-forge-preview.js";
import { lobbyModeCopy, overlayOutcomeTitle } from "../../shared/ui/mode-copy.js";

const inactive = { lobbyState: "ended", isGameOver: true, isRoundActive: false };
const active = { lobbyState: "playing", isRoundActive: true, isGameOver: false };
const interRound = { lobbyState: "playing", isRoundActive: false, isGameOver: false };

describe("Gate 0 local weapon and spike", () => {
  it("does not simulate local fire while gameplay is inactive", () => {
    expect(
      shouldSimulateLocalFire({ gameplayActive: false, inputFiring: true, canFire: true }),
    ).toBe(false);
    expect(
      shouldSimulateLocalFire({
        gameplayActive: isGameplayActive(inactive),
        inputFiring: true,
        canFire: true,
      }),
    ).toBe(false);
    expect(
      shouldSimulateLocalFire({ gameplayActive: true, inputFiring: true, canFire: true }),
    ).toBe(true);
  });

  it("does not apply a local weapon switch while inactive", () => {
    expect(shouldApplyLocalWeaponSwitch(false)).toBe(false);
    expect(shouldApplyLocalWeaponSwitch(isGameplayActive(interRound))).toBe(false);
    expect(shouldApplyLocalWeaponSwitch(isGameplayActive(active))).toBe(true);
  });

  it("gates spike client messages with the full activity contract", () => {
    expect(shouldSendSpikeClientAction({ lobbyState: "playing" })).toBe(true);
    expect(shouldSendSpikeClientAction(interRound)).toBe(false);
    expect(shouldSendSpikeClientAction(inactive)).toBe(false);
    expect(shouldSendSpikeClientAction({ lobbyState: "waiting" })).toBe(false);
  });

  it("leaves Quick Play follow-through unchanged", () => {
    expect(quickPlayFollowThrough({ action: "create", roomId: null })).toBe("create");
    expect(quickPlayFollowThrough({ action: "join", roomId: null })).toBe("invalid");
  });
});

describe("Map showcase source", () => {
  it("keeps the production Shoot House id and specialized renderer", () => {
    expect(showcaseSourceForGameplayMapId("shoot-house-neon")).toEqual({
      mapId: "shoot-house-neon",
      renderer: "shoot-house-neon",
    });
  });

  it("uses the Forge preview id and CoreLevel path for generated views", () => {
    expect(showcaseSourceForForgePreview()).toEqual({
      mapId: ARENA_FORGE_PREVIEW_MAP_ID,
      renderer: "core",
    });
  });
});

describe("public mode copy", () => {
  it("keeps Deathmatch and S&D lobby lines short", () => {
    expect(lobbyModeCopy("deathmatch")).toEqual({
      title: "Deathmatch",
      detail: "First to 5 kills",
    });
    expect(lobbyModeCopy("search_destroy")).toEqual({
      title: "Search & Destroy",
      detail: "3 lives · First to 3 rounds",
    });
  });

  it("labels match outcomes without checkpoint jargon", () => {
    expect(overlayOutcomeTitle({ gameMode: "deathmatch", localWon: true })).toBe("VICTORY");
    expect(overlayOutcomeTitle({ gameMode: "deathmatch", localWon: false })).toBe("DEFEAT");
    expect(
      overlayOutcomeTitle({
        gameMode: "search_destroy",
        localWon: false,
        winnerTeam: "ghosts",
        hasLocalTeam: true,
      }),
    ).toBe("DEFEAT");
  });
});
