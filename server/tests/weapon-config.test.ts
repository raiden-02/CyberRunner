import { describe, expect, it } from "vitest";
import { calculateDamageFalloff, calculateExplosionDamage } from "../src/weapons/weapon-config.js";

describe("calculateDamageFalloff", () => {
  const falloff = { startRange: 10, endRange: 20, minDamagePercent: 0.5 };

  it("returns full damage with no falloff config", () => {
    expect(calculateDamageFalloff(100)).toBe(1);
  });

  it("returns full damage inside start range", () => {
    expect(calculateDamageFalloff(0, falloff)).toBe(1);
    expect(calculateDamageFalloff(10, falloff)).toBe(1);
  });

  it("returns min damage at and beyond end range", () => {
    expect(calculateDamageFalloff(20, falloff)).toBe(0.5);
    expect(calculateDamageFalloff(50, falloff)).toBe(0.5);
  });

  it("lerps between start and end range", () => {
    expect(calculateDamageFalloff(15, falloff)).toBeCloseTo(0.75);
  });
});

describe("calculateExplosionDamage", () => {
  it("returns 0 outside the blast radius", () => {
    expect(calculateExplosionDamage(100, 5, 4)).toBe(0);
  });

  it("returns full damage at the center", () => {
    expect(calculateExplosionDamage(100, 0, 4, 0.2)).toBe(100);
  });

  it("falls off linearly toward the edge", () => {
    expect(calculateExplosionDamage(100, 2, 4, 0.2)).toBe(60);
  });
});
