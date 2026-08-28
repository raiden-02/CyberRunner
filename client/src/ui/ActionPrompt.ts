/**
 * Action Prompt Component
 * Shows context-sensitive keybind prompts (e.g., "Press E to Upload")
 */

export type ActionType =
  | "upload"
  | "decrypt"
  | "pickup"
  | "uploading"
  | "decrypting"
  | null;

export interface ActionPromptState {
  action: ActionType;
  terminalId?: "A" | "B";
  progress?: number;
}

export class ActionPrompt {
  private container: HTMLDivElement;

  constructor() {
    this.container = document.createElement("div");
    this.container.className = "cr-action-prompt";
    document.body.appendChild(this.container);
  }

  update(state: ActionPromptState): void {
    if (!state.action) {
      this.container.style.display = "none";
      return;
    }

    this.container.style.display = "block";
    const key = `<span class="cr-action-prompt__key">E</span>`;
    const site = state.terminalId ?? "";

    switch (state.action) {
      case "upload":
        this.container.innerHTML = `
          <div class="cr-hud-label">Spike pickup · Terminal ${site}</div>
          <div>Hold ${key} to upload</div>`;
        break;
      case "decrypt":
        this.container.innerHTML = `
          <div class="cr-hud-label">Spike live · Terminal ${site}</div>
          <div>Hold ${key} to decrypt</div>`;
        break;
      case "pickup":
        this.container.innerHTML = `
          <div class="cr-hud-label">Spike dropped</div>
          <div>Press ${key} to pick up</div>`;
        break;
      case "uploading": {
        const uploadProgress = state.progress || 0;
        this.container.innerHTML = `
          <div class="cr-hud-label">Upload ${Math.floor(uploadProgress)}%</div>
          <div class="cr-action-prompt__bar"><div class="cr-action-prompt__fill" style="width:${uploadProgress}%"></div></div>
          <div class="cr-hud-label" style="margin-top:8px">Release E to cancel</div>`;
        break;
      }
      case "decrypting": {
        const decryptProgress = state.progress || 0;
        this.container.innerHTML = `
          <div class="cr-hud-label">Decrypt ${Math.floor(decryptProgress)}%</div>
          <div class="cr-action-prompt__bar"><div class="cr-action-prompt__fill" style="width:${decryptProgress}%;background:var(--cr-sentinel)"></div></div>
          <div class="cr-hud-label" style="margin-top:8px">Release E to cancel</div>`;
        break;
      }
    }
  }

  hide(): void {
    this.container.style.display = "none";
  }

  dispose(): void {
    this.container.remove();
  }
}
