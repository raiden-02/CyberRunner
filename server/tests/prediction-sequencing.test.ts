import { describe, expect, it } from "vitest";
import {
  authoritativeMovementDt,
  consumeFixedTicks,
  discardAckedInputs,
  FIXED_DT,
  seqsAreUniqueAndIncreasing,
  simulationTimeSec,
} from "../../shared/net/fixed-tick.js";

function driveClock(frameDts: number[]): { seqs: number[]; pending: { seq: number }[] } {
  let acc = 0;
  let seq = 0;
  const seqs: number[] = [];
  const pending: { seq: number }[] = [];

  for (const dt of frameDts) {
    const stepped = consumeFixedTicks(acc, dt);
    acc = stepped.accumulator;
    for (let i = 0; i < stepped.ticks; i++) {
      seq += 1;
      seqs.push(seq);
      pending.push({ seq });
    }
  }

  return { seqs, pending };
}

function framesCoveringTicks(tickCount: number, fps: number): number[] {
  const elapsed = tickCount * FIXED_DT;
  const frameDt = 1 / fps;
  const frames: number[] = [];
  let covered = 0;
  while (covered + frameDt <= elapsed + 1e-12) {
    frames.push(frameDt);
    covered += frameDt;
  }
  const remainder = elapsed - covered;
  if (remainder > 1e-12) frames.push(remainder);
  return frames;
}

describe("consumeFixedTicks", () => {
  it("produces the same tick count for 1s at 60 fps and 120 fps", () => {
    const at60 = driveClock(framesCoveringTicks(60, 60));
    const at120 = driveClock(framesCoveringTicks(60, 120));
    expect(at60.seqs.length).toBe(60);
    expect(at120.seqs.length).toBe(60);
    expect(at60.seqs).toEqual(at120.seqs);
  });

  it("matches 60 ticks over 1s with uneven frame times", () => {
    const elapsed = 60 * FIXED_DT;
    const frames: number[] = [];
    let remaining = elapsed;
    const pattern = [0.008, 0.021, 0.012, 0.016, 0.005, 0.03];
    let i = 0;
    while (remaining > 1e-12) {
      const dt = Math.min(pattern[i % pattern.length], remaining);
      frames.push(dt);
      remaining -= dt;
      i += 1;
    }
    const driven = driveClock(frames);
    expect(driven.seqs.length).toBe(60);
  });

  it("assigns one unique increasing seq per tick", () => {
    const { seqs, pending } = driveClock(framesCoveringTicks(30, 144));
    expect(seqs.length).toBe(30);
    expect(pending.length).toBe(seqs.length);
    expect(seqsAreUniqueAndIncreasing(seqs)).toBe(true);
    expect(pending.map((p) => p.seq)).toEqual(seqs);
  });
});

describe("discardAckedInputs", () => {
  it("removes seq <= ack and keeps newer commands for replay", () => {
    const pending = [{ seq: 8 }, { seq: 9 }, { seq: 10 }, { seq: 11 }];
    const remaining = discardAckedInputs(pending, 9);
    expect(remaining.map((p) => p.seq)).toEqual([10, 11]);
    expect(remaining.length).toBe(2);
  });

  it("leaves the buffer unchanged when ack is older than all entries", () => {
    const pending = [{ seq: 4 }, { seq: 5 }];
    expect(discardAckedInputs(pending, 3)).toEqual(pending);
  });
});

describe("FIXED_DT", () => {
  it("is 60 Hz", () => {
    expect(FIXED_DT).toBeCloseTo(1 / 60);
  });

  it("keeps one input step at FIXED_DT no matter the scheduler delta", () => {
    expect(authoritativeMovementDt(0.008)).toBe(FIXED_DT);
    expect(authoritativeMovementDt(1 / 60)).toBe(FIXED_DT);
    expect(authoritativeMovementDt(0.05)).toBe(FIXED_DT);
    expect(authoritativeMovementDt(0)).toBe(FIXED_DT);
  });

  it("advances simulation time by FIXED_DT per tick", () => {
    expect(simulationTimeSec(1)).toBeCloseTo(FIXED_DT);
    expect(simulationTimeSec(60) - simulationTimeSec(59)).toBeCloseTo(FIXED_DT);
  });
});
