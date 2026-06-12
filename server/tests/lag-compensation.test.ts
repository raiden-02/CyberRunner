import { describe, expect, it } from "vitest";
import {
  CLIENT_INTERP_DELAY_TICKS,
  LagCompensation,
  MAX_REWIND_MS,
  MAX_REWIND_TICKS,
  TICK_TIME_MS,
} from "../src/systems/lag-compensation.js";

function mockPlayer(x: number, y: number, z: number, isDead = false) {
  let pos = { x, y, z };
  return {
    schema: { isDead },
    ctrl: {
      body: {
        translation: () => ({ ...pos }),
        setTranslation: (next: { x: number; y: number; z: number }) => {
          pos = { ...next };
        },
      },
    },
  };
}

describe("LagCompensation tick lag", () => {
  it("defaults to 3 ticks before any ping samples", () => {
    const lag = new LagCompensation();
    expect(lag.getAverageTickLag({ sessionId: "a" })).toBe(3);
  });

  it("converts one-way latency to tick lag", () => {
    const lag = new LagCompensation();
    lag.setClientLatency({ sessionId: "a" }, 50);
    expect(lag.getAverageTickLag({ sessionId: "a" })).toBeCloseTo(50 / TICK_TIME_MS);
  });

  it("averages multiple samples for one client", () => {
    const lag = new LagCompensation();
    lag.setClientLatency({ sessionId: "a" }, 50);
    lag.setClientLatency({ sessionId: "a" }, 80);
    expect(lag.getAverageTickLag({ sessionId: "a" })).toBeCloseTo((50 + 80) / 2 / TICK_TIME_MS);
  });

  it("tracks clients independently", () => {
    const lag = new LagCompensation();
    lag.setClientLatency({ sessionId: "a" }, 50);
    lag.setClientLatency({ sessionId: "b" }, 100);
    expect(lag.getAverageTickLag({ sessionId: "a" })).toBeCloseTo(50 / TICK_TIME_MS);
    expect(lag.getAverageTickLag({ sessionId: "b" })).toBeCloseTo(100 / TICK_TIME_MS);
  });
});

describe("LagCompensation rewind", () => {
  it("does nothing when history is empty", () => {
    const lag = new LagCompensation();
    const target = mockPlayer(5, 1, 0);
    const players = new Map([["victim", target]]);
    const original = lag.rewindPlayers(players, "shooter", { sessionId: "shooter" });
    expect(original.size).toBe(0);
    expect(target.ctrl.body.translation()).toEqual({ x: 5, y: 1, z: 0 });
  });

  it("rewinds to an exact stored tick when the target is an integer", () => {
    const lag = new LagCompensation();
    const shooter = mockPlayer(0, 1, 0);
    const victim = mockPlayer(0, 1, 0);
    for (let tick = 1; tick <= 10; tick++) {
      victim.ctrl.body.setTranslation({ x: tick, y: 1, z: 0 });
      lag.recordTick(tick, new Map([["shooter", shooter], ["victim", victim]]) as any);
    }
    lag.setClientLatency({ sessionId: "shooter" }, 0.5 * TICK_TIME_MS);
    victim.ctrl.body.setTranslation({ x: 10, y: 1, z: 0 });
    const players = new Map([["shooter", shooter], ["victim", victim]]);
    lag.rewindPlayers(players as any, "shooter", { sessionId: "shooter" });
    expect(lag.getRewindTick({ sessionId: "shooter" })).toBeCloseTo(8);
    expect(victim.ctrl.body.translation().x).toBeCloseTo(8);
  });

  it("never rewinds past the newest stored tick", () => {
    const lag = new LagCompensation();
    const shooter = mockPlayer(0, 1, 0);
    const victim = mockPlayer(0, 1, 0);
    for (let tick = 1; tick <= 10; tick++) {
      victim.ctrl.body.setTranslation({ x: tick, y: 1, z: 0 });
      lag.recordTick(tick, new Map([["shooter", shooter], ["victim", victim]]) as any);
    }
    lag.setClientLatency({ sessionId: "shooter" }, 0);
    expect(lag.getRewindTick({ sessionId: "shooter" })).toBeLessThanOrEqual(10);
    expect(lag.getRewindTick({ sessionId: "shooter" })).toBeGreaterThanOrEqual(1);
  });

  it("interpolates a victim between surrounding ticks and leaves the shooter", () => {
    const lag = new LagCompensation();
    const shooter = mockPlayer(0, 1, 0);
    const victim = mockPlayer(0, 1, 0);

    // 10 ticks. Victim walks +1m on X each tick. Shooter stays put.
    for (let tick = 1; tick <= 10; tick++) {
      victim.ctrl.body.setTranslation({ x: tick, y: 1, z: 0 });
      const players = new Map([
        ["shooter", shooter],
        ["victim", victim],
      ]);
      lag.recordTick(tick, players as any);
    }

    // targetTick = currentTick - tickLag - interpDelay
    // 10 - 1 - 1.5 = 7.5, so X should lerp from 7 to 8.
    lag.setClientLatency({ sessionId: "shooter" }, TICK_TIME_MS);
    expect(CLIENT_INTERP_DELAY_TICKS).toBe(1.5);

    victim.ctrl.body.setTranslation({ x: 10, y: 1, z: 0 });
    shooter.ctrl.body.setTranslation({ x: 0, y: 1, z: 0 });

    const players = new Map([
      ["shooter", shooter],
      ["victim", victim],
    ]);
    const original = lag.rewindPlayers(players as any, "shooter", { sessionId: "shooter" });

    expect(original.get("victim")).toEqual({ x: 10, y: 1, z: 0 });
    expect(original.has("shooter")).toBe(false);
    expect(shooter.ctrl.body.translation()).toEqual({ x: 0, y: 1, z: 0 });

    const rewound = victim.ctrl.body.translation();
    expect(rewound.x).toBeCloseTo(7.5);
    expect(rewound.y).toBeCloseTo(1);
    expect(rewound.z).toBeCloseTo(0);

    lag.restorePlayers(players as any, original);
    expect(victim.ctrl.body.translation()).toEqual({ x: 10, y: 1, z: 0 });
  });

  it("skips dead players during rewind", () => {
    const lag = new LagCompensation();
    const dead = mockPlayer(3, 1, 0, true);
    const players = new Map([["dead", dead]]);
    lag.recordTick(1, players as any);
    const original = lag.rewindPlayers(players as any, "shooter", { sessionId: "shooter" });
    expect(original.size).toBe(0);
    expect(dead.ctrl.body.translation()).toEqual({ x: 3, y: 1, z: 0 });
  });

  it("uses current minus 1.5 ticks at zero measured lag", () => {
    const lag = new LagCompensation();
    const shooter = mockPlayer(0, 1, 0);
    const victim = mockPlayer(0, 1, 0);
    for (let tick = 1; tick <= 10; tick++) {
      victim.ctrl.body.setTranslation({ x: tick, y: 1, z: 0 });
      lag.recordTick(tick, new Map([["shooter", shooter], ["victim", victim]]) as any);
    }
    lag.setClientLatency({ sessionId: "shooter" }, 0);
    victim.ctrl.body.setTranslation({ x: 10, y: 1, z: 0 });
    const players = new Map([["shooter", shooter], ["victim", victim]]);
    lag.rewindPlayers(players as any, "shooter", { sessionId: "shooter" });
    expect(lag.getRewindTick({ sessionId: "shooter" })).toBeCloseTo(10 - CLIENT_INTERP_DELAY_TICKS);
    expect(victim.ctrl.body.translation().x).toBeCloseTo(8.5);
  });

  it("clamps rewind to 250 ms even if reported lag is huge", () => {
    const lag = new LagCompensation();
    const shooter = mockPlayer(0, 1, 0);
    const victim = mockPlayer(0, 1, 0);
    for (let tick = 1; tick <= 40; tick++) {
      victim.ctrl.body.setTranslation({ x: tick, y: 1, z: 0 });
      lag.recordTick(tick, new Map([["shooter", shooter], ["victim", victim]]) as any);
    }
    lag.setClientLatency({ sessionId: "shooter" }, 5000);
    expect(MAX_REWIND_MS).toBe(250);
    const target = lag.getRewindTick({ sessionId: "shooter" });
    expect(target).toBeCloseTo(40 - MAX_REWIND_TICKS - CLIENT_INTERP_DELAY_TICKS);
    expect(40 - target).toBeLessThanOrEqual(MAX_REWIND_TICKS + CLIENT_INTERP_DELAY_TICKS + 1e-6);
  });

  it("does not rewind earlier than stored history", () => {
    const lag = new LagCompensation();
    const shooter = mockPlayer(0, 1, 0);
    const victim = mockPlayer(5, 1, 0);
    lag.recordTick(100, new Map([["shooter", shooter], ["victim", victim]]) as any);
    lag.setClientLatency({ sessionId: "shooter" }, 200);
    expect(lag.getRewindTick({ sessionId: "shooter" })).toBe(100);
  });

  it("restores victims after withRewoundWorld even when the shot throws", () => {
    const lag = new LagCompensation();
    const shooter = mockPlayer(0, 1, 0);
    const victim = mockPlayer(1, 1, 0);
    lag.recordTick(1, new Map([["shooter", shooter], ["victim", victim]]) as any);
    victim.ctrl.body.setTranslation({ x: 9, y: 1, z: 0 });
    const players = new Map([["shooter", shooter], ["victim", victim]]);
    expect(() => {
      lag.withRewoundWorld(players as any, "shooter", { sessionId: "shooter" }, undefined, () => {
        throw new Error("raycast failed");
      });
    }).toThrow("raycast failed");
    expect(victim.ctrl.body.translation()).toEqual({ x: 9, y: 1, z: 0 });
  });

  it("samples the shooter body from the same rewind tick", () => {
    const lag = new LagCompensation();
    const shooter = mockPlayer(0, 1, 0);
    const victim = mockPlayer(0, 1, 0);
    for (let tick = 1; tick <= 10; tick++) {
      shooter.ctrl.body.setTranslation({ x: tick, y: 1, z: 0 });
      victim.ctrl.body.setTranslation({ x: 100 + tick, y: 1, z: 0 });
      lag.recordTick(tick, new Map([["shooter", shooter], ["victim", victim]]) as any);
    }
    lag.setClientLatency({ sessionId: "shooter" }, TICK_TIME_MS);
    const tick = lag.getRewindTick({ sessionId: "shooter" });
    expect(tick).toBeCloseTo(7.5);
    expect(lag.getInterpolatedPosition("shooter", tick)!.x).toBeCloseTo(7.5);
  });
});

describe("LagCompensation RTT", () => {
  it("converts a server-owned RTT sample to one-way tick lag", () => {
    const lag = new LagCompensation();
    lag.recordRtt({ sessionId: "a" }, 100);
    expect(lag.getAverageTickLag({ sessionId: "a" })).toBeCloseTo(50 / TICK_TIME_MS);
  });

  it("ignores invalid RTT samples", () => {
    const lag = new LagCompensation();
    lag.recordRtt({ sessionId: "a" }, 80);
    lag.recordRtt({ sessionId: "a" }, -10);
    lag.recordRtt({ sessionId: "a" }, Number.NaN);
    lag.recordRtt({ sessionId: "a" }, 10_000);
    expect(lag.getAverageTickLag({ sessionId: "a" })).toBeCloseTo(40 / TICK_TIME_MS);
  });
});
