import { THEME } from "../../theme.js";

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
      background: ${THEME.overlay};
      z-index: 1000;
      font-family: ${THEME.font};
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
      background: ${THEME.panel};
      border: 1px solid ${THEME.panelBorder};
      border-radius: 4px;
      padding: 32px;
      width: ${width};
      max-width: 90vw;
      box-shadow: 0 16px 48px rgba(0, 0, 0, 0.45);
    `;
    return panel;
  }

  protected createTitle(text: string): HTMLHeadingElement {
    const title = document.createElement("h1");
    title.textContent = text;
    title.style.cssText = `
      margin: 0 0 24px 0;
      color: ${THEME.paper};
      font-size: 26px;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-align: center;
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
      border: 1px solid ${primary ? THEME.accent : THEME.panelBorder};
      border-radius: 3px;
      background: ${primary ? THEME.accent : "transparent"};
      color: ${primary ? THEME.ink : THEME.paper};
      font-size: 15px;
      font-weight: 600;
      letter-spacing: 0.03em;
      cursor: pointer;
      transition: background 0.15s, border-color 0.15s;
    `;
    button.onmouseenter = () => {
      button.style.background = primary ? THEME.accentHover : "rgba(237, 230, 217, 0.08)";
      button.style.borderColor = THEME.accent;
    };
    button.onmouseleave = () => {
      button.style.background = primary ? THEME.accent : "transparent";
      button.style.borderColor = primary ? THEME.accent : THEME.panelBorder;
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
      border: 1px solid ${THEME.panelBorder};
      border-radius: 3px;
      background: ${THEME.ink};
      color: ${THEME.paper};
      font-size: 16px;
      box-sizing: border-box;
    `;
    input.onfocus = () => { input.style.borderColor = THEME.accent; };
    input.onblur = () => { input.style.borderColor = THEME.panelBorder; };
    return input;
  }

  protected createLabel(text: string): HTMLLabelElement {
    const label = document.createElement("label");
    label.textContent = text;
    label.style.cssText = `
      display: block;
      margin: 16px 0 4px 0;
      color: ${THEME.muted};
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
      border: 1px solid ${THEME.panelBorder};
      border-radius: 3px;
      background: ${THEME.ink};
      color: ${THEME.paper};
      font-size: 16px;
      cursor: pointer;
    `;
    for (const opt of options) {
      const option = document.createElement("option");
      option.value = opt.value;
      option.textContent = opt.label;
      option.style.background = THEME.panel;
      select.appendChild(option);
    }
    return select;
  }

  protected createError(): HTMLDivElement {
    const error = document.createElement("div");
    error.style.cssText = `
      color: ${THEME.danger};
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
