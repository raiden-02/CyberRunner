import { describe, expect, it } from "vitest";
import { sanitizeAimDir, shotOriginFromBody, EYE_FROM_CENTER } from "../src/net/shot-origin.js";

describe("sanitizeAimDir", () => {
  it("rejects missing, non-finite, zero, and huge vectors", () => {
    expect(sanitizeAimDir(undefined)).toBeNull();
    expect(sanitizeAimDir({ x: NaN, y: 0, z: -1 })).toBeNull();
    expect(sanitizeAimDir({ x: 0, y: Infinity, z: 0 })).toBeNull();
    expect(sanitizeAimDir({ x: 0, y: 0, z: 0 })).toBeNull();
    expect(sanitizeAimDir({ x: 0, y: 0, z: 50 })).toBeNull();
  });

  it("normalizes a sane aim vector", () => {
    const aim = sanitizeAimDir({ x: 0, y: 3, z: 4 });
    expect(aim).not.toBeNull();
    expect(aim!.x).toBeCloseTo(0);
    expect(aim!.y).toBeCloseTo(0.6);
    expect(aim!.z).toBeCloseTo(0.8);
  });
});

describe("shotOriginFromBody", () => {
  it("places the muzzle ahead of the eye, not at the capsule center", () => {
    const body = { x: 2, y: 1.25, z: -3 };
    const aim = { x: 0, y: 0, z: -1 };
    const origin = shotOriginFromBody(body, aim);
    expect(origin.x).toBeCloseTo(2);
    expect(origin.y).toBeCloseTo(1.25 + EYE_FROM_CENTER);
    expect(origin.z).toBeLessThan(-3);
  });
});
