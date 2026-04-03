import { api, type UserProfile } from "../api/client.js";
import { AuthScreen } from "./screens/AuthScreen.js";
import { ProfileScreen } from "./screens/ProfileScreen.js";
import { LobbyScreen, type PlayAction } from "./screens/LobbyScreen.js";
import { SettingsScreen } from "./screens/SettingsScreen.js";

export interface GameStartOptions {
  user: UserProfile;
  action: PlayAction;
}

export class MainMenu {
  private authScreen: AuthScreen;
  private profileScreen: ProfileScreen;
  private lobbyScreen: LobbyScreen;
  private settingsScreen: SettingsScreen;
  private currentUser: UserProfile | null = null;
  private onGameStart: (options: GameStartOptions) => void = () => {};

  constructor() {
    this.authScreen = new AuthScreen();
    this.profileScreen = new ProfileScreen();
    this.lobbyScreen = new LobbyScreen();
    this.settingsScreen = new SettingsScreen();

    this.setupCallbacks();
  }

  private setupCallbacks(): void {
    this.authScreen.setOnAuthenticated((user) => {
      this.currentUser = user;
      this.authScreen.hide();
      
      if (!user.profileComplete) {
        this.profileScreen.setUser(user);
        this.profileScreen.setEditMode(false);
        this.profileScreen.show();
      } else {
        this.lobbyScreen.setUser(user);
        this.lobbyScreen.show();
      }
    });

    this.profileScreen.setOnComplete((user) => {
      this.currentUser = user;
      this.profileScreen.hide();
      this.lobbyScreen.setUser(user);
      this.lobbyScreen.show();
    });

    this.lobbyScreen.setOnPlay((action) => {
      if (this.currentUser) {
        this.lobbyScreen.hide();
        this.onGameStart({ user: this.currentUser, action });
      }
    });

    this.lobbyScreen.setOnLogout(() => {
      this.currentUser = null;
      this.lobbyScreen.hide();
      this.authScreen.show();
    });

    this.lobbyScreen.setOnEditProfile(() => {
      if (this.currentUser) {
        this.lobbyScreen.hide();
        this.profileScreen.setUser(this.currentUser);
        this.profileScreen.setEditMode(true);
        this.profileScreen.show();
      }
    });

    this.lobbyScreen.setOnSettings(() => {
      this.settingsScreen.setOnClose(() => {
        this.lobbyScreen.show();
      });
      this.lobbyScreen.hide();
      this.settingsScreen.show();
    });
  }

  setGoogleClientId(clientId: string): void {
    this.authScreen.setGoogleClientId(clientId);
  }

  setOnGameStart(callback: (options: GameStartOptions) => void): void {
    this.onGameStart = callback;
  }

  async start(): Promise<void> {
    // Check for existing session
    try {
      const user = await api.getMe();
      if (user) {
        this.currentUser = user;
        if (!user.profileComplete) {
          this.profileScreen.setUser(user);
          this.profileScreen.setEditMode(false);
          this.profileScreen.show();
        } else {
          this.lobbyScreen.setUser(user);
          this.lobbyScreen.show();
        }
        return;
      }
    } catch {
      // No existing session, show auth
    }

    // Skip menu only in development mode with ?skip_menu=1
    if (import.meta.env.DEV) {
      const skipMenu = new URLSearchParams(window.location.search).get("skip_menu");
      if (skipMenu === "1") {
        const mockUser: UserProfile = {
          id: "dev-user-" + Date.now(),
          displayName: "DevPlayer",
          email: "dev@test.com",
          primaryWeaponId: "AR_1",
          secondaryWeaponId: "PISTOL_1",
          profileComplete: true,
        };
        this.currentUser = mockUser;
        this.onGameStart({ user: mockUser, action: { type: "create" } });
        return;
      }
    }

    // Show auth screen
    this.authScreen.show();
  }

  hideAll(): void {
    this.authScreen.hide();
    this.profileScreen.hide();
    this.lobbyScreen.hide();
    this.settingsScreen.hide();
  }

  showLobby(): void {
    if (this.currentUser) {
      this.lobbyScreen.setUser(this.currentUser);
      this.lobbyScreen.show();
    } else {
      this.authScreen.show();
    }
  }

  getCurrentUser(): UserProfile | null {
    return this.currentUser;
  }

  destroy(): void {
    this.authScreen.destroy();
    this.profileScreen.destroy();
    this.lobbyScreen.destroy();
    this.settingsScreen.destroy();
  }
}
