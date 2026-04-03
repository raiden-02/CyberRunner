/**
 * Action Prompt Component
 * Shows context-sensitive keybind prompts (e.g., "Press E to Upload")
 */

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
      background: rgba(0, 10, 20, 0.9);
      border: 2px solid #00ffff;
      border-radius: 6px;
      font-family: 'Segoe UI', system-ui, sans-serif;
      font-size: 16px;
      color: #fff;
      text-align: center;
      pointer-events: none;
      z-index: 200;
      box-shadow: 0 4px 30px rgba(0, 255, 255, 0.3);
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
      background: linear-gradient(180deg, #333 0%, #222 100%);
      border: 2px solid #00ffff;
      border-radius: 4px;
      padding: 4px 12px;
      margin: 0 4px;
      font-weight: bold;
      color: #00ffff;
      text-shadow: 0 0 8px #00ffff;
    `;

    switch (state.action) {
      case "upload":
        this.container.style.borderColor = "#ff6600";
        html = `
          <div style="color: #ff6600; font-weight: bold; margin-bottom: 6px;">
            TERMINAL ${state.terminalId || ""}
          </div>
          <div>
            Hold <span style="${keyStyle}">E</span> to <span style="color: #ff6600;">UPLOAD DATA SPIKE</span>
          </div>
        `;
        break;

      case "decrypt":
        this.container.style.borderColor = "#00ff00";
        html = `
          <div style="color: #ff0000; font-weight: bold; margin-bottom: 6px;">
            SPIKE ACTIVE - TERMINAL ${state.terminalId || ""}
          </div>
          <div>
            Hold <span style="${keyStyle}">E</span> to <span style="color: #00ff00;">DECRYPT SPIKE</span>
          </div>
        `;
        break;

      case "pickup":
        this.container.style.borderColor = "#ffaa00";
        html = `
          <div style="color: #ffaa00; font-weight: bold; margin-bottom: 6px;">
            SPIKE DROPPED
          </div>
          <div>
            Press <span style="${keyStyle}">E</span> to <span style="color: #ffaa00;">ACQUIRE SPIKE</span>
          </div>
        `;
        break;

      case "uploading":
        this.container.style.borderColor = "#ff6600";
        const uploadProgress = state.progress || 0;
        html = `
          <div style="color: #ff6600; font-weight: bold; margin-bottom: 8px;">
            UPLOADING... ${Math.floor(uploadProgress)}%
          </div>
          <div style="
            background: #333;
            height: 8px;
            width: 200px;
            border-radius: 4px;
            overflow: hidden;
          ">
            <div style="
              background: linear-gradient(90deg, #ff6600, #ff3300);
              height: 100%;
              width: ${uploadProgress}%;
              transition: width 0.1s;
            "></div>
          </div>
          <div style="margin-top: 8px; font-size: 12px; color: #888;">
            Release E to cancel
          </div>
        `;
        break;

      case "decrypting":
        this.container.style.borderColor = "#00ff00";
        const decryptProgress = state.progress || 0;
        html = `
          <div style="color: #00ff00; font-weight: bold; margin-bottom: 8px;">
            DECRYPTING... ${Math.floor(decryptProgress)}%
          </div>
          <div style="
            background: #333;
            height: 8px;
            width: 200px;
            border-radius: 4px;
            overflow: hidden;
          ">
            <div style="
              background: linear-gradient(90deg, #00ff00, #00cc00);
              height: 100%;
              width: ${decryptProgress}%;
              transition: width 0.1s;
            "></div>
          </div>
          <div style="margin-top: 8px; font-size: 12px; color: #888;">
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
