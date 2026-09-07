import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";

/** HttpOnly browser session for guest Forge maps. Never a Postgres user id. */
export const GUEST_MAP_COOKIE = "cr_guest_maps";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function guestMapOwnerId(sessionId: string): string {
  return `guest-session:${sessionId}`;
}

export function isGuestMapOwnerId(id: string): boolean {
  return id.startsWith("guest-session:");
}

export function readGuestMapSession(req: Request): string | undefined {
  const raw = req.cookies?.[GUEST_MAP_COOKIE];
  if (typeof raw === "string" && UUID_RE.test(raw)) return raw;
  return undefined;
}

export function ensureGuestMapSession(req: Request, res: Response): string {
  const existing = readGuestMapSession(req);
  if (existing) return existing;
  const id = randomUUID();
  const https = (process.env.APP_ORIGIN ?? "").startsWith("https");
  res.cookie(GUEST_MAP_COOKIE, id, {
    httpOnly: true,
    secure: https,
    sameSite: "lax",
    path: "/",
  });
  return id;
}
