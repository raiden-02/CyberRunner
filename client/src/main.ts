import './style.css'
import * as THREE from "three";
import { Client, Room } from "colyseus.js";

// Initialize Three.js
const canvas = document.createElement("canvas");
canvas.id = "gameCanvas";
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

// Test object
const geometry = new THREE.BoxGeometry(1, 1, 1);
const material = new THREE.MeshBasicMaterial({ color: 0xff0099 });
const cube = new THREE.Mesh(geometry, material);
scene.add(cube);

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener("resize", onResize);

function animate() {
  requestAnimationFrame(animate);
  cube.rotation.y += 0.01;
  renderer.render(scene, camera);
}
animate();

// Connect to Colyseus server
let room: Room | undefined;
(async () => {
  try {
    const client = new Client(
      (location.protocol === "https:" ? "wss://" : "ws://") +
        (location.hostname || "localhost") +
        ":2567"
    );
    room = await client.joinOrCreate("game_room");
    console.log("Joined room:", room.name, (room as any).sessionId ?? "");
    room.onMessage("welcome", (data: any) => {
      console.log(data.message);
    });
  } catch (e) {
    console.error("Join error", e);
  }
})();
