/**
 * Binary codec for hot-path network messages.
 *
 * Uses binary encoding for per-tick traffic (inputs, fire events) and
 * structured messages for cold paths (chat, loadout, match phase).
 * Binary encoding reduces payload from ~80-100 bytes (MsgPack) to
 * ~13-15 bytes per input command.
 *
 * Wire format (all little-endian):
 *
 * INPUT_CMD (13 bytes):
 *   u16  inputSeq
 *   i16  moveX_q     (-10000..10000, quantized from -1..1)
 *   i16  moveZ_q     (-10000..10000)
 *   f32  lookYaw     (radians, full precision needed for aiming)
 *   i16  lookPitch_q (-15708..15708, quantized from -PI/2..PI/2)
 *   u8   buttons     (bitfield: sprint|aiming|crouchP|crouchR|crouchH|jumpP|dashP)
 *
 * FIRE_CMD (26 bytes):
 *   u8   firing      (0 or 1)
 *   f32  aimDirX
 *   f32  aimDirY
 *   f32  aimDirZ
 *   f32  clientPosX
 *   f32  clientPosY
 *   f32  clientPosZ
 *   u8   hasPos      (1 = clientPos fields are valid)
 */

const INPUT_CMD_SIZE = 13;
const FIRE_CMD_SIZE = 26;
const QUANT_SCALE = 10000;

// Button bitfield layout
const BTN_SPRINT       = 1 << 0;
const BTN_AIMING       = 1 << 1;
const BTN_CROUCH_PRESS = 1 << 2;
const BTN_CROUCH_REL   = 1 << 3;
const BTN_CROUCH_HELD  = 1 << 4;
const BTN_JUMP_PRESS   = 1 << 5;
const BTN_DASH_PRESS   = 1 << 6;

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
  dashPressed: boolean;
}): Uint8Array {
  const buf = new ArrayBuffer(INPUT_CMD_SIZE);
  const view = new DataView(buf);

  view.setUint16(0, msg.seq & 0xFFFF, true);
  view.setInt16(2, Math.round(msg.moveX * QUANT_SCALE), true);
  view.setInt16(4, Math.round(msg.moveZ * QUANT_SCALE), true);
  view.setFloat32(6, msg.lookYaw, true);
  view.setInt16(10, Math.round(msg.lookPitch * QUANT_SCALE), true);

  let buttons = 0;
  if (msg.sprint)         buttons |= BTN_SPRINT;
  if (msg.aiming)         buttons |= BTN_AIMING;
  if (msg.crouchPressed)  buttons |= BTN_CROUCH_PRESS;
  if (msg.crouchReleased) buttons |= BTN_CROUCH_REL;
  if (msg.crouchHeld)     buttons |= BTN_CROUCH_HELD;
  if (msg.jumpPressed)    buttons |= BTN_JUMP_PRESS;
  if (msg.dashPressed)    buttons |= BTN_DASH_PRESS;
  view.setUint8(12, buttons);

  return new Uint8Array(buf);
}

export function encodeFireCmd(msg: {
  firing: boolean;
  aimDir: { x: number; y: number; z: number };
  clientPos?: { x: number; y: number; z: number };
}): Uint8Array {
  const buf = new ArrayBuffer(FIRE_CMD_SIZE);
  const view = new DataView(buf);

  view.setUint8(0, msg.firing ? 1 : 0);
  view.setFloat32(1, msg.aimDir.x, true);
  view.setFloat32(5, msg.aimDir.y, true);
  view.setFloat32(9, msg.aimDir.z, true);

  if (msg.clientPos) {
    view.setFloat32(13, msg.clientPos.x, true);
    view.setFloat32(17, msg.clientPos.y, true);
    view.setFloat32(21, msg.clientPos.z, true);
    view.setUint8(25, 1);
  } else {
    view.setUint8(25, 0);
  }

  return new Uint8Array(buf);
}
