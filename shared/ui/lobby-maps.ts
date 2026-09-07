import type { PublicGameMode, PublicMapInfo } from "../world/map-registry.js";

export type PersonalMapMeta = {
  id: string;
  name: string;
  mode: PublicGameMode;
  createdAt: string;
  updatedAt?: string;
  sessionOnly?: boolean;
};

export function officialMapTitle(map: PublicMapInfo): string {
  return map.title;
}

export function forgeMapTitle(name: string): string {
  return `FORGE · ${name}`;
}

export function personalMapsForMode(
  maps: readonly PersonalMapMeta[],
  mode: PublicGameMode,
): PersonalMapMeta[] {
  return maps.filter((m) => m.mode === mode);
}

export function isOfficialQuickPlayMap(mapId: string, officialIds: readonly string[]): boolean {
  return officialIds.includes(mapId);
}

export type LobbyCreateSelection =
  | { kind: "official"; gameMode: PublicGameMode; mapId: string }
  | { kind: "personal"; gameMode: PublicGameMode; savedMapId: string };

export function createGameUsesLaunchGrant(selection: LobbyCreateSelection): boolean {
  return selection.kind === "personal";
}
