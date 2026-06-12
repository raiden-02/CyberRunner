import { describe, expect, it } from "vitest";
import {
  SERVER_INPUT_QUEUE_MAX,
  ServerInputQueue,
} from "../src/net/server-input-queue.js";
import { ackSeqAfterTick } from "../src/net/auth-player-tick.js";
import type { InputMsg } from "../../shared/movement/types.js";

function cmd(seq: number, extras: Partial<InputMsg> = {}): InputMsg {
  return {
    seq,
    moveX: 0,
    moveZ: 1,
    lookYaw: 0,
    lookPitch: 0,
    sprint: false,
    aiming: false,
    crouchPressed: false,
    crouchReleased: false,
    crouchHeld: false,
    jumpPressed: false,
    ...extras,
  };
}

describe("ServerInputQueue enqueue", () => {
  it("does not treat receive as consume: ack stays unset until consumeForTick", () => {
    const q = new ServerInputQueue();
    expect(q.enqueue(cmd(41, { jumpPressed: true }))).toBe("accepted");
    expect(q.enqueue(cmd(42))).toBe("accepted");
    expect(q.enqueue(cmd(43))).toBe("accepted");
    expect(q.length).toBe(3);
    expect(q.lastAppliedInput).toBeNull();
  });

  it("ignores duplicate and stale seq", () => {
    const q = new ServerInputQueue();
    expect(q.enqueue(cmd(5))).toBe("accepted");
    expect(q.enqueue(cmd(5))).toBe("ignored");
    expect(q.enqueue(cmd(4))).toBe("ignored");
    expect(q.length).toBe(1);
  });

  it("overflow keeps already-queued commands and does not accept the extra", () => {
    const q = new ServerInputQueue();
    for (let seq = 1; seq <= SERVER_INPUT_QUEUE_MAX; seq++) {
      expect(q.enqueue(cmd(seq))).toBe("accepted");
    }
    expect(q.enqueue(cmd(SERVER_INPUT_QUEUE_MAX + 1))).toBe("overflow");
    expect(q.length).toBe(SERVER_INPUT_QUEUE_MAX);

    const first = q.consumeForTick();
    expect(first.kind).toBe("queued");
    if (first.kind === "queued") {
      expect(first.input.seq).toBe(1);
    }
    expect(q.length).toBe(SERVER_INPUT_QUEUE_MAX - 1);
  });
});

describe("ServerInputQueue consume", () => {
  it("consumes three burst commands in order, one per tick", () => {
    const q = new ServerInputQueue();
    q.enqueue(cmd(41, { jumpPressed: true }));
    q.enqueue(cmd(42, { jumpPressed: false }));
    q.enqueue(cmd(43, { jumpPressed: false }));

    const a = q.consumeForTick();
    const b = q.consumeForTick();
    const c = q.consumeForTick();

    expect(a).toEqual({ kind: "queued", input: cmd(41, { jumpPressed: true }) });
    expect(b).toEqual({ kind: "queued", input: cmd(42) });
    expect(c).toEqual({ kind: "queued", input: cmd(43) });
  });

  it("does not let a later queued command overwrite an earlier jump edge", () => {
    const q = new ServerInputQueue();
    q.enqueue(cmd(41, { jumpPressed: true, crouchPressed: true }));
    q.enqueue(cmd(42, { jumpPressed: false, crouchPressed: false }));

    const first = q.consumeForTick();
    expect(first.kind).toBe("queued");
    if (first.kind === "queued") {
      expect(first.input.jumpPressed).toBe(true);
      expect(first.input.crouchPressed).toBe(true);
      expect(first.input.seq).toBe(41);
    }
  });

  it("repeats held move when the queue is empty, without repeating one-shots", () => {
    const q = new ServerInputQueue();
    q.enqueue(cmd(7, { jumpPressed: true, moveZ: 1, crouchHeld: true }));

    const first = q.consumeForTick();
    expect(first.kind).toBe("queued");
    if (first.kind === "queued") {
      expect(first.input.jumpPressed).toBe(true);
    }

    const held = q.consumeForTick();
    expect(held.kind).toBe("held");
    if (held.kind === "held") {
      expect(held.input.seq).toBe(7);
      expect(held.input.moveZ).toBe(1);
      expect(held.input.crouchHeld).toBe(true);
      expect(held.input.jumpPressed).toBe(false);
      expect(held.input.crouchPressed).toBe(false);
      expect(held.input.crouchReleased).toBe(false);
    }
  });

  it("returns none before any accepted command", () => {
    const q = new ServerInputQueue();
    expect(q.consumeForTick()).toEqual({ kind: "none" });
  });

  it("does not ack a queued command that was not simulated because the player is dead", () => {
    const q = new ServerInputQueue();
    q.enqueue(cmd(50, { moveZ: 1 }));
    const applied = q.consumeForTick();
    expect(applied.kind).toBe("queued");
    expect(ackSeqAfterTick(true, applied)).toBeNull();
    expect(ackSeqAfterTick(false, applied)).toBe(50);
  });

  it("discards dead-period commands so they cannot move the player after respawn", () => {
    const q = new ServerInputQueue();
    q.enqueue(cmd(50, { moveZ: 1, jumpPressed: true }));
    q.enqueue(cmd(51, { moveZ: 1 }));
    q.discardUnsimulated();
    expect(q.length).toBe(0);
    expect(q.consumeForTick()).toEqual({ kind: "none" });
    expect(q.enqueue(cmd(50))).toBe("ignored");
    expect(q.enqueue(cmd(52))).toBe("accepted");
    const next = q.consumeForTick();
    expect(next.kind).toBe("queued");
    if (next.kind === "queued") {
      expect(next.input.seq).toBe(52);
      expect(ackSeqAfterTick(false, next)).toBe(52);
    }
  });
});
