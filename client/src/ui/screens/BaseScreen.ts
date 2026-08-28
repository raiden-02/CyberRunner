export abstract class BaseScreen {
  protected container: HTMLDivElement;
  protected visible = false;

  constructor(id: string, shell = false) {
    this.container = document.createElement("div");
    this.container.id = id;
    this.container.className = shell ? "cr-screen cr-screen--shell" : "cr-screen cr-screen--center";
    document.body.appendChild(this.container);
  }

  show(): void {
    this.visible = true;
    this.container.classList.add("is-visible");
    this.container.style.display = "flex";
    this.onShow();
  }

  hide(): void {
    this.visible = false;
    this.container.classList.remove("is-visible");
    this.container.style.display = "none";
    this.onHide();
  }

  isVisible(): boolean {
    return this.visible;
  }

  protected onShow(): void {}
  protected onHide(): void {}

  protected createPanel(extraClass = ""): HTMLDivElement {
    const panel = document.createElement("div");
    panel.className = `cr-panel ${extraClass}`.trim();
    return panel;
  }

  protected createTitle(text: string): HTMLHeadingElement {
    const title = document.createElement("h1");
    title.className = "cr-title";
    title.textContent = text;
    return title;
  }

  protected createButton(text: string, primary = true): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = primary ? "cr-button cr-button--primary" : "cr-button";
    button.textContent = text;
    return button;
  }

  protected createInput(placeholder: string, type = "text"): HTMLInputElement {
    const input = document.createElement("input");
    input.type = type;
    input.placeholder = placeholder;
    input.className = "cr-field";
    return input;
  }

  protected createLabel(text: string): HTMLLabelElement {
    const label = document.createElement("label");
    label.className = "cr-label";
    label.textContent = text;
    return label;
  }

  protected createSelect(options: Array<{ value: string; label: string }>): HTMLSelectElement {
    const select = document.createElement("select");
    select.className = "cr-field";
    for (const opt of options) {
      const option = document.createElement("option");
      option.value = opt.value;
      option.textContent = opt.label;
      select.appendChild(option);
    }
    return select;
  }

  protected createError(): HTMLDivElement {
    const error = document.createElement("div");
    error.className = "cr-status cr-status--error";
    error.setAttribute("role", "status");
    return error;
  }

  destroy(): void {
    this.container.remove();
  }
}
