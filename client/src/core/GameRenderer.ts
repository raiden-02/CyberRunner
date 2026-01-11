import * as THREE from "three";

export class GameRenderer {
  public canvas: HTMLCanvasElement;
  public renderer: THREE.WebGLRenderer;
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  private disposed = false;
  private handleResize: () => void;

  constructor() {
    // Create canvas
    this.canvas = document.createElement("canvas");
    this.canvas.id = "gameCanvas";
    this.canvas.tabIndex = 0;
    document.body.innerHTML = "";
    document.body.appendChild(this.canvas);

    // Create renderer
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    // Create scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x101010);

    // Create camera
    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    this.camera.position.set(0, 1.6, 5);
    this.scene.add(this.camera);

    // Add lights
    this.setupLights();

    // Handle resize
    this.handleResize = this.onResize.bind(this);
    window.addEventListener("resize", this.handleResize);
  }

  private setupLights(): void {
    const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
    this.scene.add(ambientLight);

    const hemiLight = new THREE.HemisphereLight(0xffffbb, 0x080820, 0.4);
    this.scene.add(hemiLight);
  }

  private onResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  public render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    window.removeEventListener("resize", this.handleResize);
    this.renderer.dispose();
  }
}
