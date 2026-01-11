export class Crosshair {
  private element: HTMLDivElement;

  constructor() {
    this.element = document.createElement("div");
    this.element.style.cssText = `
      position: fixed;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      width: 12px;
      height: 12px;
      border: 2px solid #0f0;
      border-radius: 50%;
      pointer-events: none;
    `;
    document.body.appendChild(this.element);
  }

  public setColor(color: string): void {
    this.element.style.borderColor = color;
  }

  public setVisible(visible: boolean): void {
    this.element.style.display = visible ? "block" : "none";
  }
}
