import { describe, expect, it } from "vitest";
import { encodeFireCmd, encodeInputCmd } from "../../client/src/network/BinaryCodec.ts";
import { decodeFireCmd, decodeInputCmd } from "../src/net/BinaryCodec.js";

describe("decodeInputCmd", () => {
  it("returns null for short payloads", () => {
    expect(decodeInputCmd(new Uint8Array(14))).toBeNull();
  });

  it("round-trips the client encoder into the server decoder", () => {
    const bytes = encodeInputCmd({
      seq: 42,
      moveX: -0.5,
      moveZ: 1,
      lookYaw: 1.25,
      lookPitch: -0.4,
      sprint: true,
      aiming: false,
      crouchPressed: false,
      crouchReleased: false,
      crouchHeld: false,
      jumpPressed: true,
    });
    expect(bytes.byteLength).toBe(15);
    const decoded = decodeInputCmd(bytes);
    expect(decoded).not.toBeNull();
    expect(decoded!.seq).toBe(42);
    expect(decoded!.moveX).toBeCloseTo(-0.5);
    expect(decoded!.moveZ).toBeCloseTo(1);
    expect(decoded!.lookYaw).toBeCloseTo(1.25, 5);
    expect(decoded!.lookPitch).toBeCloseTo(-0.4);
    expect(decoded!.sprint).toBe(true);
    expect(decoded!.jumpPressed).toBe(true);
    expect(decoded!.aiming).toBe(false);
  });

  it("round-trips sequence numbers above 65535", () => {
    const bytes = encodeInputCmd({
      seq: 65536,
      moveX: 0,
      moveZ: 0,
      lookYaw: 0,
      lookPitch: 0,
      sprint: false,
      aiming: false,
      crouchPressed: false,
      crouchReleased: false,
      crouchHeld: false,
      jumpPressed: false,
    });
    expect(bytes.byteLength).toBe(15);
    expect(decodeInputCmd(bytes)!.seq).toBe(65536);
  });

  it("round-trips a sequence near uint32 max", () => {
    const seq = 0xffffffff;
    const bytes = encodeInputCmd({
      seq,
      moveX: 0,
      moveZ: 0,
      lookYaw: 0,
      lookPitch: 0,
      sprint: false,
      aiming: false,
      crouchPressed: false,
      crouchReleased: false,
      crouchHeld: false,
      jumpPressed: false,
    });
    expect(decodeInputCmd(bytes)!.seq).toBe(4294967295);
  });

  it("quantizes move to the documented ±1 range", () => {
    const bytes = encodeInputCmd({
      seq: 1,
      moveX: -1,
      moveZ: 1,
      lookYaw: 0,
      lookPitch: 0,
      sprint: false,
      aiming: false,
      crouchPressed: false,
      crouchReleased: false,
      crouchHeld: false,
      jumpPressed: false,
    });
    const decoded = decodeInputCmd(bytes)!;
    expect(decoded.moveX).toBeCloseTo(-1);
    expect(decoded.moveZ).toBeCloseTo(1);
  });

  it("round-trips every button bit and look angles", () => {
    const bytes = encodeInputCmd({
      seq: 7,
      moveX: 0.25,
      moveZ: -0.75,
      lookYaw: -2.4,
      lookPitch: Math.PI / 2,
      sprint: true,
      aiming: true,
      crouchPressed: true,
      crouchReleased: true,
      crouchHeld: true,
      jumpPressed: true,
    });
    const decoded = decodeInputCmd(bytes)!;
    expect(decoded.sprint).toBe(true);
    expect(decoded.aiming).toBe(true);
    expect(decoded.crouchPressed).toBe(true);
    expect(decoded.crouchReleased).toBe(true);
    expect(decoded.crouchHeld).toBe(true);
    expect(decoded.jumpPressed).toBe(true);
    expect(decoded.lookYaw).toBeCloseTo(-2.4, 5);
    expect(decoded.lookPitch).toBeCloseTo(Math.PI / 2, 2);
    expect(decoded.moveX).toBeCloseTo(0.25);
    expect(decoded.moveZ).toBeCloseTo(-0.75);
  });
});

describe("decodeFireCmd", () => {
  it("returns null for short payloads", () => {
    expect(decodeFireCmd(new Uint8Array(12))).toBeNull();
  });

  it("round-trips the client fire encoder into the server decoder", () => {
    const bytes = encodeFireCmd({
      firing: true,
      aimDir: { x: 0, y: 1, z: 0 },
    });
    expect(bytes.byteLength).toBe(13);
    const decoded = decodeFireCmd(bytes);
    expect(decoded).not.toBeNull();
    expect(decoded!.firing).toBe(true);
    expect(decoded!.aimDir).toEqual({ x: 0, y: 1, z: 0 });
    expect(decoded).not.toHaveProperty("clientPos");
  });

  it("round-trips firing false", () => {
    const bytes = encodeFireCmd({
      firing: false,
      aimDir: { x: 1, y: 0, z: 0 },
    });
    expect(bytes.byteLength).toBe(13);
    const decoded = decodeFireCmd(bytes);
    expect(decoded!.firing).toBe(false);
    expect(decoded!.aimDir.x).toBeCloseTo(1);
  });
});
