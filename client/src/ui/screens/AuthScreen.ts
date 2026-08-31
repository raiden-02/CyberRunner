import { BaseScreen } from "./BaseScreen.js";
import { api, type UserProfile } from "../../api/client.js";
import { getGameplayMap } from "@shared/world/map-registry.js";
import { MapShowcase } from "../../world/MapShowcase.js";

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
  private backdrop = document.createElement("div");
  private showcase = new MapShowcase();

  constructor() {
    super("auth-screen");
    this.buildUI();
  }

  private buildUI(): void {
    this.backdrop.className = "cr-backdrop";
    this.container.appendChild(this.backdrop);
    const scrim = document.createElement("div");
    scrim.className = "cr-scrim";
    this.container.appendChild(scrim);

    const panel = this.createPanel("cr-auth");

    const kicker = document.createElement("div");
    kicker.className = "cr-kicker";
    kicker.textContent = "Authoritative multiplayer FPS";
    panel.appendChild(kicker);

    const title = this.createTitle("CyberRunner");
    panel.appendChild(title);

    const subtitle = document.createElement("p");
    subtitle.className = "cr-copy";
    subtitle.textContent = "Server-owned physics and hits. Play as guest or sign in.";
    panel.appendChild(subtitle);

    const guestBtn = this.createButton("Play as Guest", true);
    guestBtn.onclick = () => this.handleGuestMode();
    panel.appendChild(guestBtn);

    const guestNote = document.createElement("p");
    guestNote.className = "cr-copy";
    guestNote.textContent = "Guest progress is not saved.";
    panel.appendChild(guestNote);

    const googleBtnContainer = document.createElement("div");
    googleBtnContainer.id = "google-signin-btn";
    googleBtnContainer.style.cssText = "display:flex;justify-content:center;margin:8px 0;";
    panel.appendChild(googleBtnContainer);

    this.errorDiv = this.createError();
    panel.appendChild(this.errorDiv);

    const devBtnContainer = document.createElement("div");
    devBtnContainer.id = "dev-mode-container";
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
    this.showcase.attach(this.backdrop);
    this.showcase.setGameplayMap(getGameplayMap("shoot-house-neon"));
    this.showcase.start();
    this.initGoogleSignIn();
    this.updateDevModeButton();
  }

  protected override onHide(): void {
    this.showcase.dispose();
  }

  private updateDevModeButton(): void {
    const container = document.getElementById("dev-mode-container");
    if (!container) return;
    container.replaceChildren();

    if (import.meta.env.DEV) {
      const devBtn = this.createButton("Skip sign-in (local)", false);
      devBtn.onclick = () => this.handleDevMode();
      container.appendChild(devBtn);
    }
  }

  private initGoogleSignIn(): void {
    if (!this.googleClientId) return;

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
      container.replaceChildren();
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

  override destroy(): void {
    this.showcase.dispose();
    super.destroy();
  }
}
