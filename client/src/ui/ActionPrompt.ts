/**
 * Action Prompt Component
 * Shows context-sensitive keybind prompts (e.g., "Press E to Upload")
 */

import { THEME } from "../theme.js";

export type ActionType = 
  | "upload"      // Carrier near terminal
  | "decrypt"     // Non-carrier near uploaded terminal
  | "pickup"      // Near dropped spike
  | "uploading"   // Currently uploading (show progress)
  | "decrypting"  // Currently decrypting (show progress)
  | null;         // No action available

export interface ActionPromptState {
  action: ActionType;
  terminalId?: "A" | "B";
  progress?: number; // 0-100
}

export class ActionPrompt {
  private container: HTMLDivElement;

  constructor() {
    this.container = document.createElement("div");
    this.container.style.cssText = `
      position: fixed;
      bottom: 25%;
      left: 50%;
      transform: translateX(-50%);
      padding: 12px 24px;
      background: ${THEME.hudBg};
      border: 1px solid ${THEME.panelBorder};
      border-radius: 3px;
      font-family: ${THEME.font};
      font-size: 16px;
      color: ${THEME.paper};
      text-align: center;
      pointer-events: none;
      z-index: 200;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
      display: none;
    `;
    document.body.appendChild(this.container);
  }

  update(state: ActionPromptState): void {
    if (!state.action) {
      this.container.style.display = "none";
      return;
    }

    this.container.style.display = "block";

    let html = "";
    const keyStyle = `
      display: inline-block;
      background: ${THEME.ink};
      border: 1px solid ${THEME.accent};
      border-radius: 3px;
      padding: 4px 12px;
      margin: 0 4px;
      font-weight: bold;
      color: ${THEME.accent};
    `;

    switch (state.action) {
      case "upload":
        this.container.style.borderColor = THEME.danger;
        html = `
          <div style="color: ${THEME.danger}; font-weight: bold; margin-bottom: 6px;">
            TERMINAL ${state.terminalId || ""}
          </div>
          <div>
            Hold <span style="${keyStyle}">E</span> to <span style="color: ${THEME.danger};">UPLOAD DATA SPIKE</span>
          </div>
        `;
        break;

      case "decrypt":
        this.container.style.borderColor = THEME.teammate;
        html = `
          <div style="color: ${THEME.danger}; font-weight: bold; margin-bottom: 6px;">
            SPIKE ACTIVE - TERMINAL ${state.terminalId || ""}
          </div>
          <div>
            Hold <span style="${keyStyle}">E</span> to <span style="color: ${THEME.teammate};">DECRYPT SPIKE</span>
          </div>
        `;
        break;

      case "pickup":
        this.container.style.borderColor = THEME.accent;
        html = `
          <div style="color: ${THEME.accent}; font-weight: bold; margin-bottom: 6px;">
            SPIKE DROPPED
          </div>
          <div>
            Press <span style="${keyStyle}">E</span> to <span style="color: ${THEME.accent};">ACQUIRE SPIKE</span>
          </div>
        `;
        break;

      case "uploading":
        this.container.style.borderColor = THEME.danger;
        const uploadProgress = state.progress || 0;
        html = `
          <div style="color: ${THEME.danger}; font-weight: bold; margin-bottom: 8px;">
            UPLOADING... ${Math.floor(uploadProgress)}%
          </div>
          <div style="
            background: ${THEME.ink};
            height: 8px;
            width: 200px;
            border-radius: 3px;
            overflow: hidden;
          ">
            <div style="
              background: ${THEME.danger};
              height: 100%;
              width: ${uploadProgress}%;
              transition: width 0.1s;
            "></div>
          </div>
          <div style="margin-top: 8px; font-size: 12px; color: ${THEME.muted};">
            Release E to cancel
          </div>
        `;
        break;

      case "decrypting":
        this.container.style.borderColor = THEME.teammate;
        const decryptProgress = state.progress || 0;
        html = `
          <div style="color: ${THEME.teammate}; font-weight: bold; margin-bottom: 8px;">
            DECRYPTING... ${Math.floor(decryptProgress)}%
          </div>
          <div style="
            background: ${THEME.ink};
            height: 8px;
            width: 200px;
            border-radius: 3px;
            overflow: hidden;
          ">
            <div style="
              background: ${THEME.teammate};
              height: 100%;
              width: ${decryptProgress}%;
              transition: width 0.1s;
            "></div>
          </div>
          <div style="margin-top: 8px; font-size: 12px; color: ${THEME.muted};">
            Release E to cancel
          </div>
        `;
        break;
    }

    this.container.innerHTML = html;
  }

  hide(): void {
    this.container.style.display = "none";
  }

  dispose(): void {
    this.container.remove();
  }
}
