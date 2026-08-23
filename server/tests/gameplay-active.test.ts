import { describe, expect, it } from "vitest";
import { isGameplayActive, shouldSendGameplayInput } from "../../shared/net/gameplay-input.js";
import {
  applyFireCommand,
  enqueueIfGameplayActive,
  shouldAcceptGameplayCommand,
  shouldAcceptSpikeAction,
} from "../src/net/gameplay-commands.js";
import { SERVER_INPUT_QUEUE_MAX, ServerInputQueue } from "../src/net/server-input-queue.js";
import type { InputMsg } from "../../shared/movement/types.js";

const waiting = { lobbyState: "waiting", isRoundActive: false, isGameOver: false };
const playing = { lobbyState: "playing", isRoundActive: true, isGameOver: false };
const interRound = { lobbyState: "playing", isRoundActive: false, isGameOver: false };
const ended = { lobbyState: "ended", isRoundActive: false, isGameOver: true };

function cmd(seq: number): InputMsg {
  return {
    seq,
    moveX: 1,
    moveZ: 0,
    lookYaw: 0,
    lookPitch: 0,
    sprint: false,
    aiming: false,
    crouchPressed: false,
    crouchReleased: false,
    crouchHeld: false,
    jumpPressed: false,
  };
}

describe("gameplay-active contract", () => {
  it("rejects waiting, inter-round, and ended, and accepts an active round", () => {
    expect(isGameplayActive(waiting)).toBe(false);
    expect(isGameplayActive(playing)).toBe(true);
    expect(isGameplayActive(interRound)).toBe(false);
    expect(isGameplayActive(ended)).toBe(false);
    expect(shouldSendGameplayInput(playing)).toBe(true);
    expect(shouldSendGameplayInput(ended)).toBe(false);
    expect(shouldSendGameplayInput({ lobbyState: "playing" })).toBe(true);
  });

  it("treats Deathmatch playing without an explicit round flag as active", () => {
    expect(isGameplayActive({ lobbyState: "playing", isGameOver: false })).toBe(true);
  });
});

describe("server gameplay command gate", () => {
  it("does not enqueue waiting or custom-client movement", () => {
    const queue = new ServerInputQueue();
    expect(enqueueIfGameplayActive(queue, cmd(1), waiting)).toBe("inactive");
    expect(queue.length).toBe(0);
    expect(shouldAcceptGameplayCommand(waiting)).toBe(false);
  });

  it("accepts movement and fire while the round is active", () => {
    const queue = new ServerInputQueue();
    expect(enqueueIfGameplayActive(queue, cmd(1), playing)).toBe("accepted");
    expect(queue.length).toBe(1);

    const player = { firing: false };
    expect(applyFireCommand(player, true, playing)).toBe(true);
    expect(player.firing).toBe(true);
  });

  it("rejects S&D inter-round movement, fire, reload, and spike", () => {
    const queue = new ServerInputQueue();
    expect(enqueueIfGameplayActive(queue, cmd(1), interRound)).toBe("inactive");
    expect(queue.length).toBe(0);
    expect(shouldAcceptGameplayCommand(interRound)).toBe(false);
    expect(shouldAcceptSpikeAction(interRound, "search_destroy")).toBe(false);

    const player = { firing: true };
    expect(applyFireCommand(player, true, interRound)).toBe(false);
    expect(player.firing).toBe(false);
  });

  it("rejects ended-state client and custom-client commands", () => {
    expect(shouldSendGameplayInput(ended)).toBe(false);
    const queue = new ServerInputQueue();
    expect(enqueueIfGameplayActive(queue, cmd(1), ended)).toBe("inactive");
    expect(queue.length).toBe(0);
    expect(shouldAcceptSpikeAction(ended, "search_destroy")).toBe(false);
  });

  it("resumes input when the next S&D round becomes active", () => {
    const queue = new ServerInputQueue();
    expect(enqueueIfGameplayActive(queue, cmd(1), interRound)).toBe("inactive");
    expect(enqueueIfGameplayActive(queue, cmd(1), playing)).toBe("accepted");
    expect(queue.length).toBe(1);
    expect(shouldAcceptSpikeAction(playing, "search_destroy")).toBe(true);
  });

  it("does not grow the queue or overflow when ended-state packets flood in", () => {
    const queue = new ServerInputQueue();
    const results = [];
    for (let seq = 1; seq <= SERVER_INPUT_QUEUE_MAX + 8; seq++) {
      results.push(enqueueIfGameplayActive(queue, cmd(seq), ended));
    }
    expect(results.every((r) => r === "inactive")).toBe(true);
    expect(queue.length).toBe(0);
    expect(results.includes("overflow")).toBe(false);
    expect(SERVER_INPUT_QUEUE_MAX).toBe(24);
  });

  it("clears held fire when gameplay becomes inactive", () => {
    const player = { firing: true };
    applyFireCommand(player, true, playing);
    expect(player.firing).toBe(true);
    applyFireCommand(player, true, ended);
    expect(player.firing).toBe(false);
    applyFireCommand(player, true, waiting);
    expect(player.firing).toBe(false);
  });

  it("does not accept new spike actions after game-over", () => {
    expect(shouldAcceptSpikeAction({ lobbyState: "playing", isRoundActive: true, isGameOver: true }, "search_destroy")).toBe(
      false,
    );
    expect(shouldAcceptSpikeAction(playing, "deathmatch")).toBe(false);
  });
});
