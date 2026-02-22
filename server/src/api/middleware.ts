import { Request, Response, NextFunction } from "express";
import { AuthService } from "../services/auth-service.js";
import { User } from "../services/user-service.js";
import { isDatabaseEnabled } from "../db/pool.js";

// Extend Express Request to include auth info
declare global {
  namespace Express {
    interface Request {
      user?: User;
      sessionId?: string;
    }
  }
}

const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || "cr_session";

export function getSessionCookieName(): string {
  return SESSION_COOKIE_NAME;
}

// Middleware: Attach user to request if session is valid
export async function attachUser(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const sessionId = req.cookies?.[SESSION_COOKIE_NAME];
    if (sessionId) {
      const result = await AuthService.validateSession(sessionId);
      if (result) {
        req.user = result.user;
        req.sessionId = sessionId;
      }
    }
  } catch {
    // Ignore auth errors, just don't attach user
  }
  next();
}

// Middleware: Require authenticated user
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  next();
}

// Middleware: Require completed profile
export function requireProfile(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  if (!req.user.displayName || req.user.displayName.trim().length === 0) {
    res.status(403).json({ error: "Profile not completed", code: "PROFILE_REQUIRED" });
    return;
  }
  next();
}

// Middleware: Allow lobby access (auth required only when database is enabled)
export function requireLobbyAccess(req: Request, res: Response, next: NextFunction): void {
  // When database is disabled, allow anonymous access to lobby
  if (!isDatabaseEnabled()) {
    next();
    return;
  }
  // Otherwise require a completed profile
  requireProfile(req, res, next);
}
