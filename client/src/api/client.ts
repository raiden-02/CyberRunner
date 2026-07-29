// API client for server communication

export interface UserProfile {
  id: string;
  displayName: string | null;
  email: string | null;
  primaryWeaponId: string;
  secondaryWeaponId: string;
  profileComplete: boolean;
}

export interface RoomInfo {
  joinCode: string;
  playerCount: number;
  maxPlayers: number;
}

export interface QuickPlayResult {
  action: "join" | "create";
  roomId: string | null;
  joinCode: string | null;
}

export interface JoinResult {
  roomId: string;
  joinCode: string;
  playerCount: number;
  maxPlayers: number;
}

export interface ForgeCatalogEntry {
  id: string;
  suite: "p4a" | "p4b" | "run";
  title: string;
  subtitle: string;
  which: "initial" | "final";
}

class ApiClient {
  private baseUrl = "/api";

  async health(): Promise<{ status: string; database: boolean }> {
    const res = await fetch(`${this.baseUrl}/health`);
    return res.json();
  }

  async googleAuth(idToken: string): Promise<UserProfile> {
    const res = await fetch(`${this.baseUrl}/auth/google`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
      credentials: "include",
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Authentication failed");
    }
    const data = await res.json();
    return data.user;
  }

  async logout(): Promise<void> {
    await fetch(`${this.baseUrl}/auth/logout`, {
      method: "POST",
      credentials: "include",
    });
  }

  async getMe(): Promise<UserProfile | null> {
    const res = await fetch(`${this.baseUrl}/me`, {
      credentials: "include",
    });
    if (res.status === 401) {
      return null;
    }
    if (!res.ok) {
      return null;
    }
    return res.json();
  }

  async updateProfile(data: { displayName?: string; primaryWeaponId?: string; secondaryWeaponId?: string }): Promise<UserProfile> {
    const res = await fetch(`${this.baseUrl}/me`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
      credentials: "include",
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Failed to update profile");
    }
    return res.json();
  }

  async getRooms(): Promise<RoomInfo[]> {
    const res = await fetch(`${this.baseUrl}/lobby/rooms`, {
      credentials: "include",
    });
    if (!res.ok) {
      return [];
    }
    const data = await res.json();
    return data.rooms;
  }

  async quickPlay(): Promise<QuickPlayResult> {
    const res = await fetch(`${this.baseUrl}/lobby/quickplay`, {
      method: "POST",
      credentials: "include",
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Quick play failed");
    }
    return res.json();
  }

  async listForgeMaps(): Promise<ForgeCatalogEntry[]> {
    const res = await fetch(`${this.baseUrl}/arena-forge/maps`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as { error?: string }).error || "Failed to list Forge maps");
    }
    const data = (await res.json()) as { maps: ForgeCatalogEntry[] };
    return data.maps;
  }

  async joinByCode(joinCode: string): Promise<JoinResult> {
    const res = await fetch(`${this.baseUrl}/lobby/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ joinCode }),
      credentials: "include",
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Failed to join room");
    }
    return res.json();
  }
}

export const api = new ApiClient();
