import { BaseScreen } from "./BaseScreen.js";
import { api, type UserProfile } from "../../api/client.js";

// Google Identity Services types
declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: any) => void;
          renderButton: (element: HTMLElement, config: any) => void;
          prompt: () => void;
        };
      };
    };
  }
}

export class AuthScreen extends BaseScreen {
  private onAuthenticated: (user: UserProfile) => void = () => {};
  private googleClientId: string | null = null;
  private errorDiv!: HTMLDivElement;

  constructor() {
    super("auth-screen");
    this.buildUI();
  }

  private buildUI(): void {
    const panel = this.createPanel("380px");
    
    const title = this.createTitle("CYBER RUNNER");
    panel.appendChild(title);

    const subtitle = document.createElement("p");
    subtitle.textContent = "Sign in to play";
    subtitle.style.cssText = `
      color: #888;
      text-align: center;
      margin: 0 0 24px 0;
    `;
    panel.appendChild(subtitle);

    const googleBtnContainer = document.createElement("div");
    googleBtnContainer.id = "google-signin-btn";
    googleBtnContainer.style.cssText = `
      display: flex;
      justify-content: center;
      margin: 16px 0;
    `;
    panel.appendChild(googleBtnContainer);

    this.errorDiv = this.createError();
    panel.appendChild(this.errorDiv);

    const separator = document.createElement("div");
    separator.style.cssText = `
      display: flex;
      align-items: center;
      margin: 20px 0;
      color: #666;
    `;
    separator.innerHTML = `
      <div style="flex: 1; height: 1px; background: #333;"></div>
      <span style="padding: 0 16px;">OR</span>
      <div style="flex: 1; height: 1px; background: #333;"></div>
    `;
    panel.appendChild(separator);

    const guestBtn = this.createButton("Play as Guest", false);
    guestBtn.onclick = () => this.handleGuestMode();
    panel.appendChild(guestBtn);

    const guestNote = document.createElement("p");
    guestNote.textContent = "Guest progress is not saved";
    guestNote.style.cssText = `
      color: #666;
      text-align: center;
      margin: 8px 0 0 0;
      font-size: 12px;
    `;
    panel.appendChild(guestNote);

    const devBtnContainer = document.createElement("div");
    devBtnContainer.id = "dev-mode-container";
    devBtnContainer.style.marginTop = "16px";
    panel.appendChild(devBtnContainer);

    this.container.appendChild(panel);
  }

  private generateGuestName(): string {
    const id = Math.floor(Math.random() * 10000).toString().padStart(4, "0");
    return `Guest${id}`;
  }

  private handleGuestMode(): void {
    const guestName = this.generateGuestName();
    const guestUser: UserProfile = {
      id: "guest-" + Date.now(),
      displayName: guestName,
      email: null,
      primaryWeaponId: "AR_1",
      secondaryWeaponId: "PISTOL_1",
      profileComplete: true,
    };
    this.onAuthenticated(guestUser);
  }

  setGoogleClientId(clientId: string): void {
    this.googleClientId = clientId;
  }

  setOnAuthenticated(callback: (user: UserProfile) => void): void {
    this.onAuthenticated = callback;
  }

  protected override onShow(): void {
    this.errorDiv.textContent = "";
    this.initGoogleSignIn();
    this.updateDevModeButton();
  }

  private updateDevModeButton(): void {
    const container = document.getElementById("dev-mode-container");
    if (!container) return;
    container.innerHTML = "";

    if (import.meta.env.DEV) {
      const devBtn = this.createButton("Dev Mode (Skip Auth)", false);
      devBtn.onclick = () => this.handleDevMode();
      container.appendChild(devBtn);
    }
  }

  private initGoogleSignIn(): void {
    if (!this.googleClientId) {
      this.errorDiv.textContent = "Google Client ID not configured";
      return;
    }

    if (!window.google?.accounts?.id) {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.onload = () => this.renderGoogleButton();
      document.head.appendChild(script);
    } else {
      this.renderGoogleButton();
    }
  }

  private renderGoogleButton(): void {
    if (!window.google?.accounts?.id || !this.googleClientId) return;

    window.google.accounts.id.initialize({
      client_id: this.googleClientId,
      callback: (response: any) => this.handleGoogleCallback(response),
    });

    const container = document.getElementById("google-signin-btn");
    if (container) {
      container.innerHTML = "";
      window.google.accounts.id.renderButton(container, {
        theme: "filled_black",
        size: "large",
        width: 300,
        text: "signin_with",
      });
    }
  }

  private async handleGoogleCallback(response: { credential: string }): Promise<void> {
    try {
      this.errorDiv.textContent = "";
      const user = await api.googleAuth(response.credential);
      this.onAuthenticated(user);
    } catch (err: any) {
      this.errorDiv.textContent = err.message || "Sign in failed";
    }
  }

  private async handleDevMode(): Promise<void> {
    const mockUser: UserProfile = {
      id: "dev-user-" + Date.now(),
      displayName: null,
      email: "dev@test.com",
      primaryWeaponId: "AR_1",
      secondaryWeaponId: "PISTOL_1",
      profileComplete: false,
    };
    this.onAuthenticated(mockUser);
  }
}
