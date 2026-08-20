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

export type ForgeDesignStatus = "queued" | "running" | "completed" | "failed";

export interface ForgeP0Summary {
  hardFailures: number;
  reachablePaths: number;
  totalPaths: number;
  ghostAMedian?: number;
  ghostBMedian?: number;
  sentinelAMedian?: number;
  sentinelBMedian?: number;
}

export interface ForgePlaytestSummary {
  seed: number;
  rollouts: number;
  ghost: {
    siteChoice: { A: number; B: number };
    medianArrivalSeconds: { A?: number; B?: number };
    meanRouteExposureFraction: number;
    routeConcentration: number;
  };
  sentinel: {
    siteChoice: { A: number; B: number };
    medianArrivalSeconds: { A?: number; B?: number };
    meanRouteExposureFraction: number;
    routeConcentration: number;
  };
  firstContact: {
    occurrenceFraction: number;
    medianSeconds?: number;
    hotspot?: { x: number; z: number; sampleCount: number };
  };
  mapRevision: number;
}

export interface ForgePublicSolid {
  id: string;
  kind: "obstacle" | "occluder" | "breakable";
  x: number;
  y: number;
  z: number;
  hx: number;
  hy: number;
  hz: number;
  hp?: number;
}

export interface ForgePublicSpawn {
  id: string;
  role: "general" | "ghost" | "sentinel";
  x: number;
  y: number;
  z: number;
}

export interface ForgePublicObjective {
  id: "A" | "B";
  x: number;
  y: number;
  z: number;
  radius: number;
}

export interface ForgePublicMapView {
  boundsHalfSize: number;
  wallHeight: number;
  wallThickness: number;
  groundThickness: number;
  solids: ForgePublicSolid[];
  spawns: ForgePublicSpawn[];
  objectives: ForgePublicObjective[];
}

export interface ForgePlaytestReplay {
  seed: number;
  ghost?: { site: "A" | "B"; spawn: { x: number; z: number }; path: Array<{ x: number; z: number }> };
  sentinel?: { site: "A" | "B"; spawn: { x: number; z: number }; path: Array<{ x: number; z: number }> };
  firstContact?: { seconds: number; x: number; z: number };
}

export interface ForgeDesignTurn {
  turn: number;
  kind: "edit" | "playtest" | "finish";
  tool: string;
  intent?: string;
  target?: string;
  rejected?: boolean;
  p0?: ForgeP0Summary;
  playtest?: ForgePlaytestSummary;
  finishSummary?: string;
  mapRevision: number;
}

export interface ForgeDesignView {
  jobId: string;
  status: ForgeDesignStatus;
  source: "live" | "recorded";
  startingMapId: string;
  brief: string;
  error?: string;
  finishSummary?: string;
  turns: ForgeDesignTurn[];
  editAttempts: number;
  successfulEdits: number;
  playtestCalls: number;
  modelCalls: number;
  totalTokens?: number;
  latencyMs?: number;
  modelRequested?: string;
  modelReturned?: string;
  initialP0: ForgeP0Summary;
  finalP0?: ForgeP0Summary;
  firstPlaytest?: ForgePlaytestSummary;
  lastPlaytest?: ForgePlaytestSummary;
  lastPlaytestMapRevision?: number;
  finalMapRevision: number;
  lastPlaytestIsOnFinalMap: boolean;
  playOriginalId: string;
  playResultId?: string;
  revisionMaps?: ForgePublicMapView[];
  revisionReplays?: ForgePlaytestReplay[];
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

  async forgeCapability(): Promise<{ liveAgentAvailable: boolean }> {
    const res = await fetch(`${this.baseUrl}/arena-forge/capability`);
    if (!res.ok) throw new Error("Failed to read Forge capability");
    return res.json();
  }

  async startForgeDesign(input: { brief: string; mapId: string }): Promise<{ jobId: string }> {
    const res = await fetch(`${this.baseUrl}/arena-forge/design`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const body = (await res.json().catch(() => ({}))) as { jobId?: string; error?: string };
    if (!res.ok) throw new Error(body.error || "Failed to start design");
    if (!body.jobId) throw new Error("Design job id missing");
    return { jobId: body.jobId };
  }

  async getForgeDesign(jobId: string): Promise<ForgeDesignView> {
    const res = await fetch(`${this.baseUrl}/arena-forge/design/${encodeURIComponent(jobId)}`);
    const body = (await res.json().catch(() => ({}))) as ForgeDesignView & { error?: string };
    if (!res.ok) throw new Error(body.error || "Design job not found");
    return body;
  }

  async getRecordedP5Demo(): Promise<ForgeDesignView> {
    const res = await fetch(`${this.baseUrl}/arena-forge/demo/p5`);
    const body = (await res.json().catch(() => ({}))) as ForgeDesignView & { error?: string };
    if (!res.ok) throw new Error(body.error || "Recorded demo not found");
    return body;
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
