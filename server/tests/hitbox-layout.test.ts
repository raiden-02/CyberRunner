import { describe, expect, it } from "vitest";
import { CAPSULE, DAMAGE_MULTIPLIERS, HITBOX } from "../../shared/physics/constants.js";
import { getDamageMultiplier } from "../src/physics/hitbox-system.js";

const CENTER_TO_FOOT = CAPSULE.HalfHeight + CAPSULE.Radius;
const CAPSULE_TOP = CENTER_TO_FOOT;
const CAPSULE_BOTTOM = -CENTER_TO_FOOT;

describe("HITBOX layout vs standing capsule", () => {
  it("places the head near the top of the capsule, not at the center", () => {
    const headTop = HITBOX.Head.offsetY + HITBOX.Head.radius;
    expect(HITBOX.Head.offsetY).toBeGreaterThan(0.7);
    expect(headTop).toBeLessThanOrEqual(CAPSULE_TOP + 0.05);
    expect(headTop).toBeGreaterThan(CAPSULE_TOP - 0.4);
  });

  it("keeps the torso below the head", () => {
    const headBottom = HITBOX.Head.offsetY - HITBOX.Head.radius;
    const upperTop = HITBOX.UpperTorso.offsetY + HITBOX.UpperTorso.halfExtents.y;
    expect(upperTop).toBeLessThanOrEqual(headBottom + 0.08);
  });

  it("keeps the legs above the capsule floor", () => {
    const legBottom = HITBOX.Leg.offsetY - HITBOX.Leg.halfHeight - HITBOX.Leg.radius;
    expect(legBottom).toBeGreaterThanOrEqual(CAPSULE_BOTTOM - 0.05);
  });
});

describe("body-part damage multipliers", () => {
  it("matches the published HITBOX multipliers", () => {
    expect(getDamageMultiplier("head")).toBe(DAMAGE_MULTIPLIERS.head);
    expect(getDamageMultiplier("upperTorso")).toBe(DAMAGE_MULTIPLIERS.upperTorso);
    expect(getDamageMultiplier("lowerTorso")).toBe(DAMAGE_MULTIPLIERS.lowerTorso);
    expect(getDamageMultiplier("leftArm")).toBe(DAMAGE_MULTIPLIERS.arm);
    expect(getDamageMultiplier("rightLeg")).toBe(DAMAGE_MULTIPLIERS.leg);
  });
});
