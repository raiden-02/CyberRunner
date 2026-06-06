/**
 * Binary codec for hot-path network messages (server-side decoder).
 * Mirror of client/src/network/BinaryCodec.ts encoder.
 */

import type { InputMsg, FireInputMsg } from "./messages.js";

const QUANT_SCALE = 10000;

const BTN_SPRINT       = 1 << 0;
const BTN_AIMING       = 1 << 1;
const BTN_CROUCH_PRESS = 1 << 2;
const BTN_CROUCH_REL   = 1 << 3;
const BTN_CROUCH_HELD  = 1 << 4;
const BTN_JUMP_PRESS   = 1 << 5;
const BTN_DASH_PRESS   = 1 << 6;

export function decodeInputCmd(bytes: Uint8Array): InputMsg | null {
  if (bytes.length < 13) return null;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const seq = view.getUint16(0, true);
  const moveX = view.getInt16(2, true) / QUANT_SCALE;
  const moveZ = view.getInt16(4, true) / QUANT_SCALE;
  const lookYaw = view.getFloat32(6, true);
  const lookPitch = view.getInt16(10, true) / QUANT_SCALE;
  const buttons = view.getUint8(12);

  return {
    seq,
    moveX,
    moveZ,
    lookYaw,
    lookPitch,
    sprint:         !!(buttons & BTN_SPRINT),
    aiming:         !!(buttons & BTN_AIMING),
    crouchPressed:  !!(buttons & BTN_CROUCH_PRESS),
    crouchReleased: !!(buttons & BTN_CROUCH_REL),
    crouchHeld:     !!(buttons & BTN_CROUCH_HELD),
    jumpPressed:    !!(buttons & BTN_JUMP_PRESS),
    dashPressed:    !!(buttons & BTN_DASH_PRESS),
  };
}

export function decodeFireCmd(bytes: Uint8Array): FireInputMsg | null {
  if (bytes.length < 26) return null;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const firing = view.getUint8(0) === 1;
  const aimDir = {
    x: view.getFloat32(1, true),
    y: view.getFloat32(5, true),
    z: view.getFloat32(9, true),
  };

  const hasPos = view.getUint8(25) === 1;
  const clientPos = hasPos
    ? {
        x: view.getFloat32(13, true),
        y: view.getFloat32(17, true),
        z: view.getFloat32(21, true),
      }
    : undefined;

  return {
    firing,
    aimDir,
    clientPos,
  };
}
