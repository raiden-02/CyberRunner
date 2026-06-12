import type { TickApply } from "./server-input-queue.js";

/**
 * lastProcessedInputSeq advances only when a queued command was simulated.
 * Dead players discard movement. They do not ack unsimulated seqs.
 */
export function ackSeqAfterTick(isDead: boolean, applied: TickApply): number | null {
  if (isDead) return null;
  if (applied.kind !== "queued") return null;
  return applied.input.seq;
}
