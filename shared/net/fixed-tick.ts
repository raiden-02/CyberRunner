/** Client and server movement tick. One input seq per tick. */
export const FIXED_DT = 1 / 60;
export const FIXED_TICK_HZ = 60;

/**
 * Authoritative movement always steps at FIXED_DT.
 * Colyseus scheduler jitter must not change how far one input moves the player.
 */
export function authoritativeMovementDt(_schedulerDtSec?: number): number {
  return FIXED_DT;
}

/** Monotonic simulation clock from tick index. Tick 1 is the first step. */
export function simulationTimeSec(tick: number): number {
  return tick * FIXED_DT;
}

const MAX_TICKS_PER_FRAME = 6;

/**
 * Convert elapsed render time into a fixed number of simulation ticks.
 * Remainder stays in the accumulator. Frame rate does not change tick count
 * for a given elapsed time (aside from the spiral-of-death cap).
 */
export function consumeFixedTicks(
  accumulator: number,
  elapsedSec: number,
  dt: number = FIXED_DT,
): { ticks: number; accumulator: number } {
  let acc = accumulator + Math.max(0, elapsedSec);
  let ticks = 0;
  while (acc + 1e-9 >= dt && ticks < MAX_TICKS_PER_FRAME) {
    acc -= dt;
    ticks += 1;
  }
  if (acc < 0) acc = 0;
  if (ticks === MAX_TICKS_PER_FRAME) {
    acc = 0;
  }
  return { ticks, accumulator: acc };
}

export function discardAckedInputs<T extends { seq: number }>(
  pending: readonly T[],
  ackSeq: number,
): T[] {
  return pending.filter((cmd) => cmd.seq > ackSeq);
}

export function seqsAreUniqueAndIncreasing(seqs: readonly number[]): boolean {
  for (let i = 1; i < seqs.length; i++) {
    if (seqs[i] <= seqs[i - 1]) return false;
  }
  return true;
}
