import { describe, expect, it } from "vitest";
import { LIVE_COST_COPY, LIVE_DISABLED_COPY, liveProviderLine, liveRunBadge } from "../../shared/ui/forge-live-copy.js";

describe("Forge live copy", () => {
  it("formats the provider line only for known providers", () => {
    expect(liveProviderLine("anthropic", "claude-sonnet-5")).toBe("Anthropic · claude-sonnet-5");
    expect(liveProviderLine(undefined, "gpt-5.6")).toBe("");
    expect(liveRunBadge(undefined)).toBe("Live run");
  });

  it("never mentions credentials in public copy", () => {
    expect(LIVE_DISABLED_COPY + LIVE_COST_COPY).not.toMatch(/OPENAI_API_KEY|ANTHROPIC_API_KEY|paste/i);
  });
});
