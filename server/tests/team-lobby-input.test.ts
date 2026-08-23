import { describe, expect, it } from "vitest";
import { shouldSendGameplayInput } from "../../shared/net/gameplay-input.js";
import { SERVER_INPUT_QUEUE_MAX } from "../src/net/server-input-queue.js";

describe("team-lobby input regression", () => {
  it("does not send gameplay input while the team lobby is waiting", () => {
    expect(shouldSendGameplayInput({ lobbyState: "waiting" })).toBe(false);
  });

  it("sends input only during an active playable period", () => {
    expect(shouldSendGameplayInput({ lobbyState: "playing", isRoundActive: true })).toBe(true);
    expect(shouldSendGameplayInput({ lobbyState: "playing", isRoundActive: false })).toBe(false);
    expect(shouldSendGameplayInput({ lobbyState: "ended", isGameOver: true })).toBe(false);
    expect(shouldSendGameplayInput({})).toBe(false);
  });

  it("keeps the bounded server input queue", () => {
    expect(SERVER_INPUT_QUEUE_MAX).toBe(24);
  });
});
