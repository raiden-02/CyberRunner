import * as THREE from "three";

export class Skybox {
  private scene: THREE.Scene;
  private cubeTexture?: THREE.CubeTexture;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  public async loadFromFolder(folderUrl: string): Promise<void> {
    const loader = new THREE.CubeTextureLoader();
    const urls = [
      `${folderUrl}/px.png`,
      `${folderUrl}/nx.png`,
      `${folderUrl}/py.png`,
      `${folderUrl}/ny.png`,
      `${folderUrl}/pz.png`,
      `${folderUrl}/nz.png`
    ];

    return new Promise((resolve) => {
      loader.load(
        urls,
        (texture) => {
          this.cubeTexture = texture;
          this.cubeTexture.colorSpace = THREE.SRGBColorSpace;
          this.scene.background = this.cubeTexture;
          resolve();
        },
        undefined,
        () => {
          // Keep existing background if texture fails to load.
          resolve();
        }
      );
    });
  }

  public dispose(): void {
    if (this.cubeTexture) {
      this.cubeTexture.dispose();
      this.cubeTexture = undefined;
    }
  }
}
