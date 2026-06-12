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

const INPUT_CMD_SIZE = 15;
const FIRE_CMD_SIZE = 13;
const QUANT_SCALE = 10000;

// Button bitfield layout
const BTN_SPRINT       = 1 << 0;
const BTN_AIMING       = 1 << 1;
const BTN_CROUCH_PRESS = 1 << 2;
const BTN_CROUCH_REL   = 1 << 3;
const BTN_CROUCH_HELD  = 1 << 4;
const BTN_JUMP_PRESS   = 1 << 5;

// ── Input encoding (client → server) ────────────────────────────────

export function encodeInputCmd(msg: {
  seq: number;
  moveX: number;
  moveZ: number;
  lookYaw: number;
  lookPitch: number;
  sprint: boolean;
  aiming: boolean;
  crouchPressed: boolean;
  crouchReleased: boolean;
  crouchHeld: boolean;
  jumpPressed: boolean;
}): Uint8Array {
  const buf = new ArrayBuffer(INPUT_CMD_SIZE);
  const view = new DataView(buf);

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

  return new Uint8Array(buf);
}

export function encodeFireCmd(msg: {
  firing: boolean;
  aimDir: { x: number; y: number; z: number };
}): Uint8Array {
  const buf = new ArrayBuffer(FIRE_CMD_SIZE);
  const view = new DataView(buf);

  view.setUint8(0, msg.firing ? 1 : 0);
  view.setFloat32(1, msg.aimDir.x, true);
  view.setFloat32(5, msg.aimDir.y, true);
  view.setFloat32(9, msg.aimDir.z, true);

  return new Uint8Array(buf);
}
