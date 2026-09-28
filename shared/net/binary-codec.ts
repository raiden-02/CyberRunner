import type { InputMsg } from "../movement/types.js";

/**
 * Hot-path wire format, little-endian.
 *
 * INPUT_CMD (15 bytes):
 *   u32  inputSeq
 *   i16  moveX_q     (-10000..10000 from -1..1)
 *   i16  moveZ_q
 *   f32  lookYaw
 *   i16  lookPitch_q (-15708..15708 from -PI/2..PI/2)
 *   u8   buttons     sprint|aiming|crouchP|crouchR|crouchH|jumpP
 *
 * FIRE_CMD (13 bytes):
 *   u8   firing
 *   f32  aimDirX, aimDirY, aimDirZ
 */

export type FireCmd = {
  firing: boolean;
  aimDir: { x: number; y: number; z: number };
};

const INPUT_CMD_SIZE = 15;
const FIRE_CMD_SIZE = 13;
const QUANT_SCALE = 10000;

const BTN_SPRINT       = 1 << 0;
const BTN_AIMING       = 1 << 1;
const BTN_CROUCH_PRESS = 1 << 2;
const BTN_CROUCH_REL   = 1 << 3;
const BTN_CROUCH_HELD  = 1 << 4;
const BTN_JUMP_PRESS   = 1 << 5;

export function encodeInputCmd(msg: InputMsg): Uint8Array {
  const view = new DataView(new ArrayBuffer(INPUT_CMD_SIZE));

  view.setUint32(0, msg.seq >>> 0, true);
  view.setInt16(4, Math.round(msg.moveX * QUANT_SCALE), true);
  view.setInt16(6, Math.round(msg.moveZ * QUANT_SCALE), true);
  view.setFloat32(8, msg.lookYaw, true);
  view.setInt16(12, Math.round(msg.lookPitch * QUANT_SCALE), true);

  let buttons = 0;
  if (msg.sprint)         buttons |= BTN_SPRINT;
  if (msg.aiming)         buttons |= BTN_AIMING;
  if (msg.crouchPressed)  buttons |= BTN_CROUCH_PRESS;
  if (msg.crouchReleased) buttons |= BTN_CROUCH_REL;
  if (msg.crouchHeld)     buttons |= BTN_CROUCH_HELD;
  if (msg.jumpPressed)    buttons |= BTN_JUMP_PRESS;
  view.setUint8(14, buttons);

  return new Uint8Array(view.buffer);
}

export function decodeInputCmd(bytes: Uint8Array): InputMsg | null {
  if (bytes.length < INPUT_CMD_SIZE) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const buttons = view.getUint8(14);

  return {
    seq: view.getUint32(0, true),
    moveX: view.getInt16(4, true) / QUANT_SCALE,
    moveZ: view.getInt16(6, true) / QUANT_SCALE,
    lookYaw: view.getFloat32(8, true),
    lookPitch: view.getInt16(12, true) / QUANT_SCALE,
    sprint:         !!(buttons & BTN_SPRINT),
    aiming:         !!(buttons & BTN_AIMING),
    crouchPressed:  !!(buttons & BTN_CROUCH_PRESS),
    crouchReleased: !!(buttons & BTN_CROUCH_REL),
    crouchHeld:     !!(buttons & BTN_CROUCH_HELD),
    jumpPressed:    !!(buttons & BTN_JUMP_PRESS),
  };
}

export function encodeFireCmd(msg: FireCmd): Uint8Array {
  const view = new DataView(new ArrayBuffer(FIRE_CMD_SIZE));
  view.setUint8(0, msg.firing ? 1 : 0);
  view.setFloat32(1, msg.aimDir.x, true);
  view.setFloat32(5, msg.aimDir.y, true);
  view.setFloat32(9, msg.aimDir.z, true);
  return new Uint8Array(view.buffer);
}

export function decodeFireCmd(bytes: Uint8Array): FireCmd | null {
  if (bytes.length < FIRE_CMD_SIZE) return null;
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
