import { describe, expect, it } from "vitest";
import { quickPlayFollowThrough } from "../../shared/net/quickplay-action.js";

describe("Quick Play follow-through", () => {
  it("joins only when the server returns a room", () => {
    expect(quickPlayFollowThrough({ action: "join", roomId: "abc" })).toBe("join");
  });

  it("creates only when the server explicitly returns create", () => {
    expect(quickPlayFollowThrough({ action: "create", roomId: null })).toBe("create");
  });

  it("does not guess create on a failed or malformed response", () => {
    expect(quickPlayFollowThrough({ action: "join", roomId: null })).toBe("invalid");
    expect(quickPlayFollowThrough({ action: "error" })).toBe("invalid");
    expect(quickPlayFollowThrough({})).toBe("invalid");
  });
});
