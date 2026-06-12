/**
 * Local measurements for protocol size, payload bandwidth, delayed-ack
 * prediction, and a synthetic server tick. Not a production load test.
 *
 *   npm run benchmark
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";
import { encodeFireCmd, encodeInputCmd } from "../../client/src/network/BinaryCodec.ts";
import { initRapier, PhysicsWorld } from "../../client/src/physics/PhysicsWorld.ts";
import { LocalPlayer } from "../../client/src/player/LocalPlayer.ts";
import { FIXED_DT, FIXED_TICK_HZ } from "../../shared/net/fixed-tick.js";
import { createPlayerPhysics, buildMapColliders } from "../../shared/world/map-physics.js";
import { SHOOT_HOUSE_NEON_COLLISION } from "../../shared/world/maps/shoot-house-neon.js";
import { CharacterController } from "../../shared/movement/character-controller.js";
import { CAPSULE } from "../../shared/physics/constants.js";
import type { InputMsg } from "../../shared/movement/types.js";
import RAPIER from "@dimforge/rapier3d-compat";

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "../../benchmarks/latest.json");
const TICKS = 180;
const LATENCIES_MS = [0, 50, 100, 150] as const;
/** RFC 6455: client-to-server frame is masked. Payload <= 125 uses 2-byte header + 4-byte mask. */
const WS_CLIENT_FRAME_OVERHEAD = 6;

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function holdForward(seq: number): InputMsg {
  return {
    seq,
    moveX: 0,
    moveZ: 1,
    lookYaw: 0.4,
    lookPitch: -0.2,
    sprint: true,
    aiming: false,
    crouchPressed: false,
    crouchReleased: false,
    crouchHeld: false,
    jumpPressed: false,
  };
}

function measureProtocol() {
  const inputMsg = {
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
  };
  const fireMsg = { firing: true, aimDir: { x: 0, y: 0.1, z: -1 } };
  const inputBin = encodeInputCmd(inputMsg);
  const fireBin = encodeFireCmd(fireMsg);
  return {
    kind: "measured" as const,
    inputBytes: inputBin.byteLength,
    fireBytes: fireBin.byteLength,
    inputJsonUtf8Bytes: Buffer.byteLength(JSON.stringify(inputMsg), "utf8"),
    fireJsonUtf8Bytes: Buffer.byteLength(JSON.stringify(fireMsg), "utf8"),
  };
}

function estimateBandwidth(inputBytes: number) {
  const payloadBytesPerSec = inputBytes * FIXED_TICK_HZ;
  return {
    kind: "estimate" as const,
    inputHz: FIXED_TICK_HZ,
    payloadBytesPerSec,
    payloadBytesPerMin: payloadBytesPerSec * 60,
    wsClientFrameOverheadBytesPerFrame: WS_CLIENT_FRAME_OVERHEAD,
    estimatedWsAppPlusFramingBytesPerSec: (inputBytes + WS_CLIENT_FRAME_OVERHEAD) * FIXED_TICK_HZ,
    note: "Payload is the 15-byte INPUT_CMD only. Framing is an RFC 6455 estimate for a masked client frame (2-byte header + 4-byte mask) when payload <= 125. TLS, TCP, IP, and Colyseus room wrappers are not included. Fire is not in this 60 Hz path.",
  };
}

function measurePrediction(latencyMs: number) {
  const delayTicks = Math.round(latencyMs / (1000 / FIXED_TICK_HZ));
  const client = new LocalPlayer({} as ConstructorParameters<typeof LocalPlayer>[0]);
  const server = new PhysicsWorld();
  const spawnY = CAPSULE.HalfHeight + CAPSULE.Radius;
  client.hardResetTo(0, spawnY, 0);
  server.hardResetTo(0, spawnY, 0);

  const pendingCounts: number[] = [];
  const corrections: number[] = [];

  for (let seq = 1; seq <= TICKS; seq++) {
    const cmd = holdForward(seq);
    client.applyFixedTick(cmd, true);

    const ackSeq = seq - delayTicks;
    if (ackSeq > client.lastAckedSeq && ackSeq >= 1) {
      server.simulateTick(holdForward(ackSeq), ackSeq * FIXED_DT);
      const serverPos = server.getPosition();
      const before = client.getCapsuleCenter();
      client.reconcileWithServer(serverPos.x, serverPos.y, serverPos.z, ackSeq, FIXED_DT);
      const after = client.getCapsuleCenter();
      corrections.push(Math.hypot(
        before.x - after.x,
        before.y - after.y,
        before.z - after.z,
      ));
    }
    pendingCounts.push(client.getPendingInputCount());
  }

  const tail = pendingCounts.slice(-30);
  const tailCorr = corrections.slice(-30);
  server.dispose();

  return {
    latencyMs,
    delayTicks,
    meanPending: Number(mean(pendingCounts).toFixed(3)),
    maxPending: pendingCounts.length ? Math.max(...pendingCounts) : 0,
    tailMeanPending: Number(mean(tail).toFixed(3)),
    meanCorrectionM: Number(mean(corrections).toFixed(5)),
    maxCorrectionM: Number((corrections.length ? Math.max(...corrections) : 0).toFixed(5)),
    tailMeanCorrectionM: Number(mean(tailCorr).toFixed(5)),
  };
}

function measureServerTick(playerCount: number) {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = FIXED_DT;
  buildMapColliders(RAPIER, world, SHOOT_HOUSE_NEON_COLLISION);
  const ctrls: CharacterController[] = [];
  const spawnY = CAPSULE.HalfHeight + CAPSULE.Radius;
  for (let i = 0; i < playerCount; i++) {
    const { body, collider, controller } = createPlayerPhysics(
      RAPIER, world, i * 2, spawnY, 0, CAPSULE.HalfHeight, CAPSULE.Radius,
    );
    ctrls.push(new CharacterController(body, collider, controller));
  }

  const cmd = holdForward(1);
  for (let w = 0; w < 30; w++) {
    for (const ctrl of ctrls) {
      ctrl.updateInput(cmd);
      ctrl.update(world, FIXED_DT, (w + 1) * FIXED_DT);
    }
    world.step();
  }

  const samples: number[] = [];
  for (let t = 0; t < TICKS; t++) {
    const t0 = performance.now();
    for (const ctrl of ctrls) {
      ctrl.updateInput({ ...cmd, seq: t + 1 });
      ctrl.update(world, FIXED_DT, (t + 1) * FIXED_DT);
    }
    world.step();
    samples.push(performance.now() - t0);
  }
  world.free();

  return {
    players: playerCount,
    meanMs: Number(mean(samples).toFixed(4)),
    maxMs: Number(Math.max(...samples).toFixed(4)),
  };
}

async function main() {
  await initRapier();
  const protocol = measureProtocol();
  const bandwidth = estimateBandwidth(protocol.inputBytes);
  const prediction = LATENCIES_MS.map((ms) => measurePrediction(ms));
  const serverTick = [1, 4, 8].map((n) => measureServerTick(n));

  const report = {
    date: new Date().toISOString(),
    command: "npm run benchmark",
    node: process.version,
    platform: {
      os: `${os.platform()} ${os.release()}`,
      arch: os.arch(),
      cpu: os.cpus()[0]?.model ?? "unknown",
      logicalCpus: os.cpus().length,
    },
    protocol,
    bandwidth,
    prediction: {
      kind: "synthetic_local",
      ticks: TICKS,
      samples: prediction,
    },
    serverTick: {
      kind: "synthetic_local",
      ticks: TICKS,
      byPlayers: serverTick,
    },
    caveats: [
      "Input and fire sizes are measured from encodeInputCmd / encodeFireCmd.",
      "JSON sizes are UTF-8 byte lengths of JSON.stringify on the same objects. That is not Colyseus schema patch size and not MsgPack.",
      "Bandwidth numbers are application payload (and an RFC 6455 framing estimate). They are not captured wire bytes.",
      "Prediction uses LocalPlayer.reconcileWithServer against a local PhysicsWorld and a delayed ack. It is not a browser tab against a Colyseus room.",
      "Server tick timing is RAPIER + CharacterController only. No Colyseus broadcast, hitboxes, rewind, or sockets.",
      "Do not treat these numbers as production scalability.",
    ],
  };

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(report, null, 2) + "\n", "utf8");
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  process.stdout.write(`wrote ${OUT}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
