import { Router, Request, Response } from "express";
import { ARENA_FORGE_PREVIEW_MAP_ID } from "@shared/world/arena-forge-preview.js";
import { getDesignJobView } from "../arena-forge/design-jobs.js";
import { getForgeQuotaStore } from "../arena-forge/forge-quota.js";
import { admitLiveDesign, publicLiveCapability } from "../arena-forge/live-design-admission.js";
import { resolveLiveForgePolicy } from "../arena-forge/live-forge-policy.js";
import { recordedDemoView } from "../arena-forge/recorded-demo.js";
import { listForgeCatalog, loadForgeMap } from "../arena-forge/preview.js";
import { AuthService } from "../services/auth-service.js";
import { UserService } from "../services/user-service.js";
import { LobbyService } from "../services/lobby-service.js";
import { resolveQuickPlay } from "../services/quickplay.js";
import { requireAuth, requireProfile, requireLobbyAccess, getSessionCookieName } from "./middleware.js";
import { isDatabaseEnabled } from "../db/pool.js";

const router = Router();
const isProduction = process.env.NODE_ENV === "production";

// Cookie options
function getSessionCookieOptions() {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax" as const,
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    path: "/",
  };
}

// Health check
router.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    database: isDatabaseEnabled(),
    timestamp: new Date().toISOString(),
  });
});

router.get("/arena-forge/maps", (_req: Request, res: Response) => {
  res.json({ maps: listForgeCatalog() });
});

router.get("/arena-forge/preview-map", (req: Request, res: Response) => {
  try {
    const id = typeof req.query.id === "string" ? req.query.id : undefined;
    res.json(loadForgeMap(id));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(404).json({ error: message, mapId: ARENA_FORGE_PREVIEW_MAP_ID });
  }
});

router.get("/arena-forge/capability", async (req: Request, res: Response) => {
  const policy = resolveLiveForgePolicy(process.env, { databaseAvailable: isDatabaseEnabled() });
  let remainingRunsToday: number | undefined;
  if (policy.mode === "hosted" && policy.runnable && req.user) {
    const store = getForgeQuotaStore();
    if (store) {
      try {
        remainingRunsToday = await store.remaining(req.user.id);
      } catch {
        remainingRunsToday = undefined;
      }
    }
  }
  res.json(publicLiveCapability({
    liveAvailable: policy.runnable,
    accessMode: policy.mode,
    requiresSignIn: policy.requiresAuth,
    remainingRunsToday,
  }));
});

router.get("/arena-forge/demo/p5", (_req: Request, res: Response) => {
  try {
    res.json(recordedDemoView());
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(404).json({ error: message });
  }
});

router.post("/arena-forge/design", async (req: Request, res: Response) => {
  const policy = resolveLiveForgePolicy(process.env, { databaseAvailable: isDatabaseEnabled() });
  if (!policy.liveEnabled) {
    res.status(403).json({
      error: "Live design is off on this server. Load the recorded P5 demo instead.",
    });
    return;
  }
  if (!policy.runnable) {
    res.status(503).json({
      error: "Live design is unavailable. Quota storage is not configured.",
    });
    return;
  }
  if (policy.requiresAuth && !req.user) {
    res.status(401).json({ error: "Sign in to run live ArenaForge." });
    return;
  }

  const started = await admitLiveDesign(
    {
      brief: req.body?.brief,
      mapId: req.body?.mapId,
    },
    {
      userId: req.user?.id,
      quota: policy.requiresQuota ? getForgeQuotaStore() : null,
      policy,
    },
  );
  if (!started.ok) {
    res.status(started.status).json({ error: started.error });
    return;
  }
  res.status(started.status).json({ jobId: started.jobId });
});

router.get("/arena-forge/design/:jobId", (req: Request, res: Response) => {
  const jobId = Array.isArray(req.params.jobId) ? req.params.jobId[0] : req.params.jobId;
  const view = jobId ? getDesignJobView(jobId) : undefined;
  if (!view) {
    res.status(404).json({ error: "That design job is gone. Jobs live only in memory and disappear on restart." });
    return;
  }
  res.json(view);
});

// Auth: Google sign-in
router.post("/auth/google", async (req: Request, res: Response) => {
  try {
    const { idToken } = req.body;
    if (!idToken || typeof idToken !== "string") {
      res.status(400).json({ error: "Missing idToken" });
      return;
    }

    const { user, session } = await AuthService.authenticateWithGoogle(idToken);

    res.cookie(getSessionCookieName(), session.id, getSessionCookieOptions());
    res.json({
      user: {
        id: user.id,
        displayName: user.displayName,
        primaryWeaponId: user.primaryWeaponId,
        secondaryWeaponId: user.secondaryWeaponId,
        profileComplete: UserService.hasCompletedProfile(user),
      },
    });
  } catch (err: any) {
    console.error("[API] Google auth error:", err.message);
    res.status(401).json({ error: "Authentication failed" });
  }
});

// Auth: Logout
router.post("/auth/logout", requireAuth, async (req: Request, res: Response) => {
  try {
    if (req.sessionId) {
      await AuthService.logout(req.sessionId);
    }
    res.clearCookie(getSessionCookieName());
    res.json({ success: true });
  } catch (err: any) {
    console.error("[API] Logout error:", err.message);
    res.status(500).json({ error: "Logout failed" });
  }
});

// User: Get current user
router.get("/me", requireAuth, (req: Request, res: Response) => {
  const user = req.user!;
  res.json({
    id: user.id,
    displayName: user.displayName,
    email: user.email,
    primaryWeaponId: user.primaryWeaponId,
    secondaryWeaponId: user.secondaryWeaponId,
    profileComplete: UserService.hasCompletedProfile(user),
  });
});

// User: Update profile
router.patch("/me", requireAuth, async (req: Request, res: Response) => {
  try {
    const { displayName, primaryWeaponId, secondaryWeaponId } = req.body;

    if (displayName !== undefined) {
      if (typeof displayName !== "string" || displayName.trim().length < 2 || displayName.trim().length > 20) {
        res.status(400).json({ error: "Display name must be 2-20 characters" });
        return;
      }
    }

    const validWeapons = ["AR_1", "SMG_1", "LMG_1", "SHOTGUN_1", "SNIPER_1", "PISTOL_1", "ROCKET_1", "GL_1"];
    if (primaryWeaponId !== undefined && !validWeapons.includes(primaryWeaponId)) {
      res.status(400).json({ error: "Invalid primary weapon ID" });
      return;
    }
    if (secondaryWeaponId !== undefined && !validWeapons.includes(secondaryWeaponId)) {
      res.status(400).json({ error: "Invalid secondary weapon ID" });
      return;
    }

    const updated = await UserService.updateProfile(req.user!.id, {
      displayName: displayName?.trim(),
      primaryWeaponId,
      secondaryWeaponId,
    });

    if (!updated) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json({
      id: updated.id,
      displayName: updated.displayName,
      primaryWeaponId: updated.primaryWeaponId,
      secondaryWeaponId: updated.secondaryWeaponId,
      profileComplete: UserService.hasCompletedProfile(updated),
    });
  } catch (err: any) {
    console.error("[API] Update profile error:", err.message);
    res.status(500).json({ error: "Failed to update profile" });
  }
});

// Lobby: Get available rooms
router.get("/lobby/rooms", requireLobbyAccess, (_req: Request, res: Response) => {
  const rooms = LobbyService.getAllRooms().map((r) => ({
    joinCode: r.joinCode,
    playerCount: r.playerCount,
    maxPlayers: r.maxPlayers,
  }));
  res.json({ rooms });
});

// Lobby: Quick play. Public like join-by-code. Body must name mode + public map.
router.post("/lobby/quickplay", (req: Request, res: Response) => {
  const decision = resolveQuickPlay(req.body);
  if (!decision.ok) {
    res.status(400).json({ error: decision.error });
    return;
  }
  if (decision.action === "join" && decision.room) {
    res.json({
      action: "join",
      roomId: decision.room.roomId,
      joinCode: decision.room.joinCode,
      gameMode: decision.room.gameMode,
      mapId: decision.room.mapId,
    });
    return;
  }
  res.json({
    action: "create",
    roomId: null,
    joinCode: null,
    gameMode: decision.preference.gameMode,
    mapId: decision.preference.mapId,
  });
});

// Lobby: Join by code (public)
router.post("/lobby/join", (req: Request, res: Response) => {
  const { joinCode } = req.body;
  if (!joinCode || typeof joinCode !== "string") {
    res.status(400).json({ error: "Missing join code" });
    return;
  }

  const room = LobbyService.getRoomByCode(joinCode.toUpperCase());
  if (!room) {
    res.status(404).json({ error: "Room not found" });
    return;
  }

  if (room.playerCount >= room.maxPlayers) {
    res.status(409).json({ error: "Room is full" });
    return;
  }

  res.json({
    roomId: room.roomId,
    joinCode: room.joinCode,
    playerCount: room.playerCount,
    maxPlayers: room.maxPlayers,
  });
});

export default router;
