import { getPublicMap, type PublicGameMode } from "@shared/world/map-registry.js";
import { LobbyService, type RoomInfo } from "./lobby-service.js";

export type QuickPlayPreference = {
  gameMode: PublicGameMode;
  mapId: string;
};

export type QuickPlayDecision =
  | { ok: true; action: "join"; room: RoomInfo; preference: QuickPlayPreference }
  | { ok: true; action: "create"; room: null; preference: QuickPlayPreference }
  | { ok: false; error: string };

export function parseQuickPlayPreference(body: unknown):
  | { ok: true; preference: QuickPlayPreference }
  | { ok: false; error: string } {
  const obj = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const gameMode = obj.gameMode;
  const mapId = obj.mapId;

  if (gameMode !== "deathmatch" && gameMode !== "search_destroy") {
    return { ok: false, error: "Unsupported game mode." };
  }
  if (typeof mapId !== "string" || mapId.trim().length === 0) {
    return { ok: false, error: "Choose a production map." };
  }

  const map = getPublicMap(mapId);
  if (!map) {
    return { ok: false, error: "That map is not available for Quick Play." };
  }
  if (!map.modes.includes(gameMode)) {
    return { ok: false, error: `${map.title} does not support that mode.` };
  }

  return { ok: true, preference: { gameMode, mapId: map.id } };
}

export function resolveQuickPlay(body: unknown): QuickPlayDecision {
  const parsed = parseQuickPlayPreference(body);
  if (!parsed.ok) return parsed;

  const room = LobbyService.findAvailableRoom(parsed.preference);
  if (room) {
    return { ok: true, action: "join", room, preference: parsed.preference };
  }
  return { ok: true, action: "create", room: null, preference: parsed.preference };
}
