import { describe, expect, it } from "vitest";
import {
  DEFAULT_LIVE_BRIEF,
  LIVE_STARTING_MAP_ID,
  LIVE_STARTING_MAP_LABEL,
  liveCostCopy,
  liveDisabledCopy,
  liveLocalLinkLabel,
  liveProviderLine,
  liveRunBadge,
  startingMapLabel,
} from "../../shared/ui/forge-live-copy.js";
import { DESIGN_BRIEF_MAX } from "../src/arena-forge/design-view.js";

describe("Forge live copy helpers", () => {
  it("keeps the sample brief nonempty and within the server limit", () => {
    expect(DEFAULT_LIVE_BRIEF.trim().length).toBeGreaterThan(20);
    expect(DEFAULT_LIVE_BRIEF.length).toBeLessThanOrEqual(DESIGN_BRIEF_MAX);
    expect(DEFAULT_LIVE_BRIEF).toMatch(/playtest/i);
  });

  it("uses a human-readable starting map label without renaming the id", () => {
    expect(LIVE_STARTING_MAP_ID).toBe("map-contract-smoke");
    expect(startingMapLabel("map-contract-smoke")).toBe(LIVE_STARTING_MAP_LABEL);
    expect(LIVE_STARTING_MAP_LABEL).toBe("ArenaForge Test Range");
    expect(startingMapLabel("shoot-house-neon")).toBe("shoot-house-neon");
  });

  it("formats live provider display", () => {
    expect(liveProviderLine("openai", "gpt-5.6")).toBe("OpenAI · gpt-5.6");
    expect(liveProviderLine("anthropic", "claude-sonnet-5")).toBe("Anthropic · claude-sonnet-5");
    expect(liveRunBadge("openai", "gpt-5.6")).toBe("Live run · OpenAI · gpt-5.6");
    expect(liveProviderLine(undefined, "gpt-5.6")).toBe("");
  });

  it("keeps disabled-live copy credential-free", () => {
    expect(liveDisabledCopy()).toMatch(/Live runs are disabled on this server/);
    expect(liveLocalLinkLabel()).toBe("Run live locally");
    expect(liveCostCopy()).toMatch(/may incur API charges/);
    expect(liveDisabledCopy() + liveCostCopy()).not.toMatch(/OPENAI_API_KEY|ANTHROPIC_API_KEY|paste/i);
  });
});
