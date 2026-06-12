import type { InputMsg } from "@shared/movement/types.js";

/**
 * Max queued commands per player.
 * 24 ticks is 400 ms at 60 Hz. Covers hitch catch-up (client caps 6 ticks
 * per frame) and packet bunching. A flood beyond this is treated as abuse.
 */
export const SERVER_INPUT_QUEUE_MAX = 24;

export type EnqueueResult = "accepted" | "ignored" | "overflow";

export type TickApply =
  | { kind: "queued"; input: InputMsg }
  | { kind: "held"; input: InputMsg }
  | { kind: "none" };

function cloneInput(msg: InputMsg): InputMsg {
  return { ...msg };
}

function heldRepeat(msg: InputMsg): InputMsg {
  return {
    ...msg,
    jumpPressed: false,
    crouchPressed: false,
    crouchReleased: false,
  };
}

/**
 * Ordered server-side input queue.
 *
 * lastProcessedInputSeq must only advance when kind === "queued".
 * Overflow does not drop queued commands. The caller should disconnect.
 */
export class ServerInputQueue {
  private pending: InputMsg[] = [];
  private lastEnqueuedSeq = 0;
  private lastApplied: InputMsg | null = null;

  get length(): number {
    return this.pending.length;
  }

  get lastAppliedInput(): InputMsg | null {
    return this.lastApplied ? cloneInput(this.lastApplied) : null;
  }

  enqueue(cmd: InputMsg): EnqueueResult {
    // Ordinary numeric compare. Seq is u32 on the wire. Wrap at 2^32 is
    // ~827 days at 60 Hz and is not handled here.
    if (cmd.seq <= this.lastEnqueuedSeq) {
      return "ignored";
    }
    if (this.pending.length >= SERVER_INPUT_QUEUE_MAX) {
      return "overflow";
    }
    this.pending.push(cloneInput(cmd));
    this.lastEnqueuedSeq = cmd.seq;
    return "accepted";
  }

  /**
   * Drop queued and held commands without simulating them.
   * Keeps lastEnqueuedSeq so stale seqs after death/respawn stay ignored.
   */
  discardUnsimulated(): void {
    this.pending = [];
    this.lastApplied = null;
  }

  /** Consume at most one queued command for this authoritative tick. */
  consumeForTick(): TickApply {
    const next = this.pending.shift();
    if (next) {
      this.lastApplied = cloneInput(next);
      return { kind: "queued", input: cloneInput(next) };
    }
    if (!this.lastApplied) {
      return { kind: "none" };
    }
    const held = heldRepeat(this.lastApplied);
    this.lastApplied = held;
    return { kind: "held", input: cloneInput(held) };
  }
}
