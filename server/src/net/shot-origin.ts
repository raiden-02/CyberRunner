import { CAPSULE } from "@shared/physics/constants.js";

/** Standing capsule center to foot, then eye 1.6 m above the foot. */
const CENTER_TO_FOOT = CAPSULE.HalfHeight + CAPSULE.Radius;
const EYE_HEIGHT = 1.6;
export const EYE_FROM_CENTER = EYE_HEIGHT - CENTER_TO_FOOT;
const MUZZLE_FORWARD = CAPSULE.Radius + 0.15;

const AIM_MIN_LEN = 1e-6;
const AIM_MAX_LEN = 10;

export function sanitizeAimDir(
  dir: { x: number; y: number; z: number } | undefined,
): { x: number; y: number; z: number } | null {
  if (!dir) return null;
  const { x, y, z } = dir;
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
  const len = Math.hypot(x, y, z);
  if (len < AIM_MIN_LEN || len > AIM_MAX_LEN) return null;
  return { x: x / len, y: y / len, z: z / len };
}

/** Hitscan origin from an authoritative capsule center and a sanitized aim. */
export function shotOriginFromBody(
  body: { x: number; y: number; z: number },
  aim: { x: number; y: number; z: number },
): { x: number; y: number; z: number } {
  const eye = { x: body.x, y: body.y + EYE_FROM_CENTER, z: body.z };
  return {
    x: eye.x + aim.x * MUZZLE_FORWARD,
    y: eye.y + aim.y * MUZZLE_FORWARD,
    z: eye.z + aim.z * MUZZLE_FORWARD,
  };
}
