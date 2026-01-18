/**
 * Debug Weapon Preview Viewer
 * Shows all weapons in a grid with side/top/front views for debugging geometry
 */
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { WEAPON_DEFINITIONS, ATTACHMENT_DEFINITIONS } from "../weapons/definitions.js";
import { WeaponViewModel } from "../weapons/weapon-viewmodel.js";

export function createWeaponPreview(): void {
  const container = document.createElement("div");
  container.id = "weapon-preview";
  container.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: #0a0a0a;
    z-index: 10000;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    grid-template-rows: repeat(2, 1fr);
    gap: 4px;
    padding: 4px;
    box-sizing: border-box;
  `;

  const closeBtn = document.createElement("button");
  closeBtn.textContent = "✕ Close Preview";
  closeBtn.style.cssText = `
    position: fixed;
    top: 10px;
    right: 10px;
    z-index: 10001;
    padding: 10px 20px;
    background: #ff3366;
    color: white;
    border: none;
    cursor: pointer;
    font-size: 14px;
    font-weight: bold;
  `;
  closeBtn.onclick = () => container.remove();
  container.appendChild(closeBtn);

  document.body.appendChild(container);

  const weaponIds = Object.keys(WEAPON_DEFINITIONS);

  weaponIds.forEach((weaponId, index) => {
    const cell = document.createElement("div");
    cell.style.cssText = `
      position: relative;
      background: #111;
      border: 1px solid #333;
      overflow: hidden;
    `;

    const label = document.createElement("div");
    label.textContent = `${index + 1}: ${WEAPON_DEFINITIONS[weaponId].name} (${WEAPON_DEFINITIONS[weaponId].family})`;
    label.style.cssText = `
      position: absolute;
      top: 5px;
      left: 5px;
      color: #0ff;
      font-family: monospace;
      font-size: 12px;
      z-index: 1;
      background: rgba(0,0,0,0.7);
      padding: 4px 8px;
    `;
    cell.appendChild(label);

    container.appendChild(cell);

    // Create mini Three.js scene for each weapon
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111111);

    const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 10);
    camera.position.set(0.8, 0.3, 0.8);
    camera.lookAt(0, 0, -0.3);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    cell.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0, -0.3);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.update();

    // Lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambient);
    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(1, 2, 1);
    scene.add(dirLight);

    // Grid helper
    const grid = new THREE.GridHelper(2, 20, 0x333333, 0x222222);
    grid.rotation.x = Math.PI / 2;
    grid.position.z = -0.5;
    scene.add(grid);

    // Axis helper
    const axes = new THREE.AxesHelper(0.2);
    scene.add(axes);

    // Create weapon
    const def = WEAPON_DEFINITIONS[weaponId];
    const attachments = def.attachments
      .map(id => ATTACHMENT_DEFINITIONS[id])
      .filter(Boolean);

    const viewModel = new WeaponViewModel(def, attachments, { thirdPerson: true });
    
    // Reset position for debug view
    viewModel.weaponRoot.position.set(0, 0, 0);
    viewModel.weaponRoot.rotation.set(0, 0, 0);
    
    scene.add(viewModel.viewRoot);

    // Add sight line indicator (red line from optic eye forward)
    if (viewModel.opticEye) {
      const eyeWorld = new THREE.Vector3();
      viewModel.viewRoot.updateMatrixWorld(true);
      viewModel.opticEye.getWorldPosition(eyeWorld);
      
      const lineMat = new THREE.LineBasicMaterial({ color: 0xff0000 });
      const lineGeo = new THREE.BufferGeometry().setFromPoints([
        eyeWorld,
        new THREE.Vector3(eyeWorld.x, eyeWorld.y, eyeWorld.z - 2)
      ]);
      const sightLine = new THREE.Line(lineGeo, lineMat);
      scene.add(sightLine);

      // Mark optic eye with sphere
      const eyeSphere = new THREE.Mesh(
        new THREE.SphereGeometry(0.01),
        new THREE.MeshBasicMaterial({ color: 0x00ff00 })
      );
      eyeSphere.position.copy(eyeWorld);
      scene.add(eyeSphere);
    }

    // Resize and animate
    const resize = () => {
      const rect = cell.getBoundingClientRect();
      renderer.setSize(rect.width, rect.height);
      camera.aspect = rect.width / rect.height;
      camera.updateProjectionMatrix();
    };
    resize();
    window.addEventListener("resize", resize);

    const animate = () => {
      if (!document.body.contains(container)) return;
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();
  });
}

// Export for console access
(window as any).showWeaponPreview = createWeaponPreview;

console.log("%c[DEBUG] Weapon preview available: showWeaponPreview()", "color: #0ff");
