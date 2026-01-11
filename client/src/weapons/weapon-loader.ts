import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";

// Asset loader functions (based on My-FPS-Game AssetLoader.ts)
const manager = new THREE.LoadingManager();
const gltfLoader = new GLTFLoader(manager);
const cache = new Map<string, Promise<GLTF>>();

/**
 * Load a GLTF model and cache the result.
 */
function loadGLTF(path: string): Promise<GLTF> {
  if (!cache.has(path)) {
    const promise = gltfLoader.loadAsync(path);
    cache.set(path, promise);
  }
  return cache.get(path)!;
}

/**
 * Simple weapon loader for displaying first-person weapons
 * Based on My-FPS-Game patterns
 */
export class WeaponLoader {
  /**
   * Load a weapon model by ID (e.g., "AR_1", "Pistol_1")
   */
  static async loadWeapon(weaponId: string): Promise<THREE.Object3D> {
    const path = `/weapons/glTF/${weaponId}.gltf`;
    const gltf = await loadGLTF(path);
    return gltf.scene.clone(true);
  }
}

/**
 * First-person weapon view manager
 * Handles positioning and displaying weapons attached to camera
 */
export class WeaponView {
  private camera: THREE.Object3D;
  private currentWeapon?: THREE.Object3D;
  private currentWeaponId?: string;

  private weaponConfigs: Record<string, { position: THREE.Vector3; rotation: THREE.Euler; scale: THREE.Vector3 }> = {
    AR_1: {
      position: new THREE.Vector3(0.7, -0.7, -1.65),
      rotation: new THREE.Euler(0, Math.PI / 2, 0),
      scale: new THREE.Vector3(1.1, 1.1, 1.1)
    },
    Pistol_1: {
      position: new THREE.Vector3(0.7, -0.7, -1.4),
      rotation: new THREE.Euler(0, Math.PI / 2, 0),
      scale: new THREE.Vector3(1.1, 1.1, 1.1)
    },
    AR_2: {
      position: new THREE.Vector3(0.7, -0.7, -1.7),
      rotation: new THREE.Euler(0, Math.PI / 2, 0),
      scale: new THREE.Vector3(1.1, 1.1, 1.1)
    },
    Sniper_1: {
      position: new THREE.Vector3(0.7, -0.75, -1.9),
      rotation: new THREE.Euler(0, Math.PI / 2, 0),
      scale: new THREE.Vector3(1.1, 1.1, 1.1)
    }
  };

  constructor(camera: THREE.Object3D) {
    this.camera = camera;
  }

  /**
   * Switch to a different weapon
   */
  async switchWeapon(weaponId: string): Promise<void> {
    if (this.currentWeaponId === weaponId) {
      return;
    }

    if (this.currentWeapon) {
      this.camera.remove(this.currentWeapon);
      this.currentWeapon = undefined;
    }

    try {
      const weaponModel = await WeaponLoader.loadWeapon(weaponId);
      const config = this.weaponConfigs[weaponId];

      if (!config) {
        console.warn(`No config for weapon: ${weaponId}`);
        return;
      }

      weaponModel.position.copy(config.position);
      weaponModel.rotation.copy(config.rotation);
      weaponModel.scale.copy(config.scale);

      weaponModel.traverse((child: THREE.Object3D) => {
        if (child instanceof THREE.Mesh) {
          child.renderOrder = 999;
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          materials.forEach((mat: THREE.Material) => {
            mat.depthTest = false;
            mat.depthWrite = false;
          });
        }
      });

      this.camera.add(weaponModel);
      this.currentWeapon = weaponModel;
      this.currentWeaponId = weaponId;
    } catch (error) {
      console.error(`Failed to load weapon ${weaponId}:`, error);
    }
  }

  /**
   * Get currently equipped weapon ID
   */
  getCurrentWeaponId(): string | undefined {
    return this.currentWeaponId;
  }

  /**
   * Set visibility of the current weapon
   */
  setVisible(visible: boolean): void {
    if (this.currentWeapon) {
      this.currentWeapon.visible = visible;
    }
  }

  /**
   * Update weapon view (call in animation loop if needed)
   */
  update(_deltaTime: number): void {
    // Future: Add weapon sway, ADS transitions, etc.
  }

  /**
   * Remove current weapon
   */
  dispose(): void {
    if (this.currentWeapon) {
      this.camera.remove(this.currentWeapon);
      this.currentWeapon = undefined;
      this.currentWeaponId = undefined;
    }
  }
}

/**
 * Third-person weapon view for other players
 * Simulates the same weapon positioning as first-person but viewed externally
 */
export class ThirdPersonWeaponView {
  private playerMesh: THREE.Object3D;
  private virtualCamera: THREE.Object3D; // Virtual camera that matches player's view
  private pitchContainer: THREE.Object3D; // Handles pitch rotation
  private currentWeapon?: THREE.Object3D;
  private currentWeaponId?: string;

  constructor(playerMesh: THREE.Object3D) {
    this.playerMesh = playerMesh;
    
    // Create virtual camera setup that mirrors the first-person setup
    this.virtualCamera = new THREE.Object3D(); // Handles yaw (same as player rotation)
    this.pitchContainer = new THREE.Object3D(); // Handles pitch (up/down look)
    
    // Position the virtual camera at "hip level" for realistic weapon holding
    // AAA games typically show weapons held at torso/hip level, not eye level
    this.virtualCamera.position.set(0, 0.3, 0); // Hip height above player center (much lower than 1.6)
    
    // Chain: playerMesh -> virtualCamera -> pitchContainer -> weapon
    this.playerMesh.add(this.virtualCamera);
    this.virtualCamera.add(this.pitchContainer);
  }

  /**
   * Switch to a different weapon for this player
   */
  async switchWeapon(weaponId: string): Promise<void> {
    if (this.currentWeaponId === weaponId) {
      return;
    }

    if (this.currentWeapon) {
      this.pitchContainer.remove(this.currentWeapon);
      this.currentWeapon = undefined;
    }

    try {
      const weaponModel = await WeaponLoader.loadWeapon(weaponId);
      
      const thirdPersonConfigs: Record<string, { position: THREE.Vector3; rotation: THREE.Euler; scale: THREE.Vector3 }> = {
        AR_1: {
          position: new THREE.Vector3(0.4, -0.2, -1.0),
          rotation: new THREE.Euler(0, Math.PI / 2, 0),
          scale: new THREE.Vector3(1.0, 1.0, 1.0)
        },
        Pistol_1: {
          position: new THREE.Vector3(0.3, -0.1, -0.8),
          rotation: new THREE.Euler(0, Math.PI / 2, 0),
          scale: new THREE.Vector3(1.0, 1.0, 1.0)
        },
        AR_2: {
          position: new THREE.Vector3(0.4, -0.2, -1.1),
          rotation: new THREE.Euler(0, Math.PI / 2, 0),
          scale: new THREE.Vector3(1.0, 1.0, 1.0)
        },
        Sniper_1: {
          position: new THREE.Vector3(0.4, -0.2, -1.3),
          rotation: new THREE.Euler(0, Math.PI / 2, 0),
          scale: new THREE.Vector3(1.0, 1.0, 1.0)
        }
      };

      const config = thirdPersonConfigs[weaponId];
      if (!config) {
        return;
      }

      weaponModel.position.copy(config.position);
      weaponModel.rotation.copy(config.rotation);
      weaponModel.scale.copy(config.scale);

      weaponModel.traverse((child: THREE.Object3D) => {
        if (child instanceof THREE.Mesh) {
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          materials.forEach((mat: THREE.Material) => {
            mat.depthTest = true;
            mat.depthWrite = true;
            mat.transparent = false;
            mat.side = THREE.FrontSide;
            mat.needsUpdate = true;
          });
          
          child.renderOrder = 0;
          child.frustumCulled = true;
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });

      this.pitchContainer.add(weaponModel);
      this.currentWeapon = weaponModel;
      this.currentWeaponId = weaponId;
    } catch (error) {
      console.error(`Failed to load weapon for remote player:`, error);
    }
  }

  /**
   * Update the virtual camera to match player's look direction
   * This makes the weapon point exactly where the player is looking
   */
  updateLookDirection(_yaw: number, pitch: number): void {
    // Update virtual camera rotation to match player's view
    // Yaw is handled by the player mesh rotation, so we don't need to set it again
    // But we need to set pitch on the pitch container
    this.pitchContainer.rotation.x = pitch;
  }

  /**
   * Get currently equipped weapon ID
   */
  getCurrentWeaponId(): string | undefined {
    return this.currentWeaponId;
  }

  /**
   * Set visibility of the weapon (used when player dies/respawns)
   */
  setVisible(visible: boolean): void {
    if (this.currentWeapon) {
      this.currentWeapon.visible = visible;
    }
    // Also hide the virtual camera container
    this.virtualCamera.visible = visible;
  }

  /**
   * Remove current weapon
   */
  dispose(): void {
    if (this.currentWeapon) {
      this.pitchContainer.remove(this.currentWeapon);
      this.currentWeapon = undefined;
      this.currentWeaponId = undefined;
    }
    // Clean up the virtual camera hierarchy
    if (this.virtualCamera.parent) {
      this.virtualCamera.parent.remove(this.virtualCamera);
    }
  }
}