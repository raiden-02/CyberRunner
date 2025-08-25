import './style.css'
import * as THREE from "three";
import { Client, Room } from "colyseus.js";

// Initialize Three.js
const canvas = document.createElement("canvas");
canvas.id = "gameCanvas";
canvas.tabIndex = 0; // allow focus for keyboard events
document.body.innerHTML = ""; // clear vite starter markup

document.body.appendChild(canvas);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101010);
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(0, 1.6, 5);

// Ground for reference
const grid = new THREE.GridHelper(100, 100, 0x4444ff, 0x222222);
scene.add(grid);
const axes = new THREE.AxesHelper(2);
scene.add(axes);

// Add some reference boxes around
for (let i = -2; i <= 2; i++) {
  for (let j = -2; j <= 2; j++) {
    if (i === 0 && j === 0) continue;
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: (i + j) % 2 === 0 ? 0xff4477 : 0x44ffaa })
    );
    box.position.set(i * 5, 0.5, j * 5);
    scene.add(box);
  }
}

// Crosshair overlay
const crosshair = document.createElement("div");
crosshair.style.position = "fixed";
crosshair.style.left = "50%";
crosshair.style.top = "50%";
crosshair.style.transform = "translate(-50%, -50%)";
crosshair.style.width = "12px";
crosshair.style.height = "12px";
crosshair.style.border = "2px solid #0f0";
crosshair.style.borderRadius = "50%";
crosshair.style.pointerEvents = "none";
document.body.appendChild(crosshair);

// Placeholder map for remote players meshes
const playerMeshes = new Map<string, THREE.Object3D>();

// Resize handling
function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener("resize", onResize);

// Pointer lock + mouse look
let yaw = 0, pitch = 0;
canvas.addEventListener("click", () => {
  canvas.focus();
  canvas.requestPointerLock();
});
document.addEventListener("mousemove", (event) => {
  if (document.pointerLockElement === canvas) {
    const mx = event.movementX || 0;
    const my = event.movementY || 0;
    yaw -= mx * 0.002;
    pitch -= my * 0.002;
    pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitch));
    // Use YXZ to avoid gimbal and apply FPS style rotations
    camera.rotation.order = "YXZ";
    camera.rotation.y = yaw;
    camera.rotation.x = pitch;
  }
});

// Keyboard input
const keys: Record<string, boolean> = {};
document.addEventListener("keydown", (e) => {
  // prevent page scrolling on space/arrow keys if used later
  if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) {
    e.preventDefault();
  }
  keys[e.code] = true;
});
document.addEventListener("keyup", (e) => {
  keys[e.code] = false;
});

// Connect to Colyseus server
let room: Room | undefined;
const debugEl = document.getElementById("debug");
const playersEl = document.getElementById("players");
(async () => {
  try {
    const client = new Client(
      (location.protocol === "https:" ? "wss://" : "ws://") +
        (location.hostname || "localhost") +
        ":2567"
    );
    room = await client.joinOrCreate("game_room");
    console.log("Joined room:", room.name, (room as any).sessionId ?? "");
    const sid = (room as any).sessionId ?? "";
    if (debugEl) debugEl.textContent = `Connected: ${sid}`;

    // Removed players.onAdd/onRemove setup to avoid schema reflection issues.
    // Remote players are handled in the animation loop by iterating over room.state.players.

    // Start input send loop
    startInputLoop();
  } catch (e) {
    console.error("Join error", e);
    debugEl && (debugEl.textContent = `Join error: ${e}`);
  }
})();

function startInputLoop() {
  const sendRate = 20; // Hz
  setInterval(() => {
    if (!room) return;
    let forward = 0, strafe = 0;
    if (keys["KeyW"]) forward += 1;
    if (keys["KeyS"]) forward -= 1;
    if (keys["KeyD"]) strafe += 1;
    if (keys["KeyA"]) strafe -= 1;
    const len = Math.hypot(strafe, forward);
    if (len > 0) { strafe /= len; forward /= len; }
    const cos = Math.cos(yaw), sin = Math.sin(yaw);
    const wx = strafe * cos - forward * sin;
    const wz = -strafe * sin - forward * cos;
    room.send("move", { x: wx, z: wz, rotate: yaw });
    if (debugEl) debugEl.textContent = `Connected: ${(room as any).sessionId} | inputLocal=(strafe:${strafe.toFixed(2)}, fwd:${forward.toFixed(2)})`;
  }, 1000 / sendRate);
}

// Movement constants (keep in sync with server)
const MOVE_SPEED = 5; // units/sec

// Local prediction state
const predictedPos = new THREE.Vector3(0, 1.6, 0);
let lastTime = performance.now();

// Animation loop
function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const dt = Math.min(100, Math.max(0, now - lastTime)) / 1000;
  lastTime = now;

  let forward = 0, strafe = 0;
  if (keys["KeyW"]) forward += 1;
  if (keys["KeyS"]) forward -= 1;
  if (keys["KeyD"]) strafe += 1;
  if (keys["KeyA"]) strafe -= 1;
  const len = Math.hypot(strafe, forward);
  if (len > 0) { strafe /= len; forward /= len; }
  const cos = Math.cos(yaw), sin = Math.sin(yaw);
  const wx = strafe * cos - forward * sin;
  const wz = -strafe * sin - forward * cos;
  predictedPos.x += wx * MOVE_SPEED * dt;
  predictedPos.z += wz * MOVE_SPEED * dt;

  // Server reconciliation and remote players update
  const r = room as any;
  const state = r?.state as any;
  const playersState = state?.players;
  const myId = r?.sessionId;
  let me: any;
  const presentIds = new Set<string>();
  if (playersState && typeof playersState.forEach === "function") {
    let count = 0;
    try {
      playersState.forEach((player: any, sessionId: string) => {
        count++;
        if (!player) return;
        presentIds.add(sessionId);
        if (sessionId === myId) { me = player; return; }
        let m = playerMeshes.get(sessionId);
        if (!m) {
          m = new THREE.Mesh(
            new THREE.BoxGeometry(1, 2, 1),
            new THREE.MeshBasicMaterial({ color: 0x00ff88 })
          );
          scene.add(m);
          playerMeshes.set(sessionId, m);
        }
        m.position.set(player.x, player.y + 1, player.z);
        (m as any).rotation.y = player.rotationY || 0;
      });
    } catch {}
    if (playersEl) playersEl.textContent = `Players: ${count}`;
  }
  for (const [sid, mesh] of playerMeshes) {
    if (!presentIds.has(sid)) { scene.remove(mesh); playerMeshes.delete(sid); }
  }

  if (me) {
    const authoritative = new THREE.Vector3(me.x, me.y + 1.6, me.z);
    predictedPos.lerp(authoritative, 0.1);
    if (debugEl) debugEl.textContent = `Connected: ${myId} | inputLocal=(strafe:${strafe.toFixed(2)}, fwd:${forward.toFixed(2)}) | pos=(${me.x.toFixed(2)}, ${me.y.toFixed(2)}, ${me.z.toFixed(2)})`;
  }

  camera.position.copy(predictedPos);
  renderer.render(scene, camera);
}
animate();
