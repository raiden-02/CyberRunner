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
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    // Create scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x101010);
    this.scene.fog = new THREE.Fog(0x0d0f12, 35, 110);

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
    const ambientLight = new THREE.AmbientLight(0x20242a, 0.8);
    this.scene.add(ambientLight);

    const hemiLight = new THREE.HemisphereLight(0x8aa6ff, 0x0b0f14, 0.55);
    this.scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xd9f2ff, 1.1);
    dirLight.position.set(10, 20, -5);
    this.scene.add(dirLight);
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
