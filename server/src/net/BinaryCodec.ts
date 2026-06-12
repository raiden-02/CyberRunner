/**
 * Server decoder for the 15-byte INPUT_CMD and 13-byte FIRE_CMD.
 * Mirror of client/src/network/BinaryCodec.ts.
 */

import type { InputMsg, FireInputMsg } from "./messages.js";

const QUANT_SCALE = 10000;

const BTN_SPRINT       = 1 << 0;
const BTN_AIMING       = 1 << 1;
const BTN_CROUCH_PRESS = 1 << 2;
const BTN_CROUCH_REL   = 1 << 3;
const BTN_CROUCH_HELD  = 1 << 4;
const BTN_JUMP_PRESS   = 1 << 5;

export function decodeInputCmd(bytes: Uint8Array): InputMsg | null {
  if (bytes.length < 15) return null;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const seq = view.getUint32(0, true);
  const moveX = view.getInt16(4, true) / QUANT_SCALE;
  const moveZ = view.getInt16(6, true) / QUANT_SCALE;
  const lookYaw = view.getFloat32(8, true);
  const lookPitch = view.getInt16(12, true) / QUANT_SCALE;
  const buttons = view.getUint8(14);

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
  };
}

export function decodeFireCmd(bytes: Uint8Array): FireInputMsg | null {
  if (bytes.length < 13) return null;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  return {
    firing: view.getUint8(0) === 1,
    aimDir: {
      x: view.getFloat32(1, true),
      y: view.getFloat32(5, true),
      z: view.getFloat32(9, true),
    },
  };
}
