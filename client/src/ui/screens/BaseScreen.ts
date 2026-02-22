// Base class for all UI screens
export abstract class BaseScreen {
  protected container: HTMLDivElement;
  protected visible = false;

  constructor(id: string) {
    this.container = document.createElement("div");
    this.container.id = id;
    this.container.className = "screen";
    this.container.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      display: none;
      justify-content: center;
      align-items: center;
      background: rgba(0, 0, 0, 0.9);
      z-index: 1000;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    `;
    document.body.appendChild(this.container);
  }

  show(): void {
    this.visible = true;
    this.container.style.display = "flex";
    this.onShow();
  }

  hide(): void {
    this.visible = false;
    this.container.style.display = "none";
    this.onHide();
  }

  isVisible(): boolean {
    return this.visible;
  }

  protected onShow(): void {}
  protected onHide(): void {}

  protected createPanel(width = "400px"): HTMLDivElement {
    const panel = document.createElement("div");
    panel.style.cssText = `
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      border: 2px solid #0f3460;
      border-radius: 12px;
      padding: 32px;
      width: ${width};
      max-width: 90vw;
      box-shadow: 0 0 40px rgba(0, 255, 255, 0.1);
    `;
    return panel;
  }

  protected createTitle(text: string): HTMLHeadingElement {
    const title = document.createElement("h1");
    title.textContent = text;
    title.style.cssText = `
      margin: 0 0 24px 0;
      color: #00ffff;
      font-size: 28px;
      text-align: center;
      text-shadow: 0 0 10px rgba(0, 255, 255, 0.5);
    `;
    return title;
  }

  protected createButton(text: string, primary = true): HTMLButtonElement {
    const button = document.createElement("button");
    button.textContent = text;
    button.style.cssText = `
      width: 100%;
      padding: 14px 24px;
      margin: 8px 0;
      border: 2px solid ${primary ? "#00ffff" : "#666"};
      border-radius: 8px;
      background: ${primary ? "linear-gradient(135deg, #00ffff22, #00ffff11)" : "transparent"};
      color: ${primary ? "#00ffff" : "#aaa"};
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    `;
    button.onmouseenter = () => {
      button.style.background = primary 
        ? "linear-gradient(135deg, #00ffff44, #00ffff22)" 
        : "rgba(255,255,255,0.1)";
      button.style.transform = "scale(1.02)";
    };
    button.onmouseleave = () => {
      button.style.background = primary 
        ? "linear-gradient(135deg, #00ffff22, #00ffff11)" 
        : "transparent";
      button.style.transform = "scale(1)";
    };
    return button;
  }

  protected createInput(placeholder: string, type = "text"): HTMLInputElement {
    const input = document.createElement("input");
    input.type = type;
    input.placeholder = placeholder;
    input.style.cssText = `
      width: 100%;
      padding: 12px 16px;
      margin: 8px 0;
      border: 2px solid #333;
      border-radius: 8px;
      background: rgba(0, 0, 0, 0.5);
      color: #fff;
      font-size: 16px;
      box-sizing: border-box;
    `;
    input.onfocus = () => { input.style.borderColor = "#00ffff"; };
    input.onblur = () => { input.style.borderColor = "#333"; };
    return input;
  }

  protected createLabel(text: string): HTMLLabelElement {
    const label = document.createElement("label");
    label.textContent = text;
    label.style.cssText = `
      display: block;
      margin: 16px 0 4px 0;
      color: #aaa;
      font-size: 14px;
    `;
    return label;
  }

  protected createSelect(options: Array<{ value: string; label: string }>): HTMLSelectElement {
    const select = document.createElement("select");
    select.style.cssText = `
      width: 100%;
      padding: 12px 16px;
      margin: 8px 0;
      border: 2px solid #333;
      border-radius: 8px;
      background: rgba(0, 0, 0, 0.5);
      color: #fff;
      font-size: 16px;
      cursor: pointer;
    `;
    for (const opt of options) {
      const option = document.createElement("option");
      option.value = opt.value;
      option.textContent = opt.label;
      option.style.background = "#1a1a2e";
      select.appendChild(option);
    }
    return select;
  }

  protected createError(): HTMLDivElement {
    const error = document.createElement("div");
    error.style.cssText = `
      color: #ff4444;
      font-size: 14px;
      margin: 8px 0;
      text-align: center;
      min-height: 20px;
    `;
    return error;
  }

  destroy(): void {
    this.container.remove();
  }
}
