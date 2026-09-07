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

export type LobbyMapOption = {
  source: "official" | "personal";
  id: string;
  title: string;
  modes: PublicGameMode[];
  sessionOnly?: boolean;
  blurb?: string;
};

export type SelectedLobbyMap =
  | { source: "official"; id: string }
  | { source: "personal"; id: string };

export function officialLobbyOption(map: PublicMapInfo): LobbyMapOption {
  return {
    source: "official",
    id: map.id,
    title: map.title,
    modes: [...map.modes],
    blurb: map.blurb,
  };
}

export function personalLobbyOption(map: PersonalMapMeta): LobbyMapOption {
  return {
    source: "personal",
    id: map.id,
    title: map.name,
    modes: [map.mode],
    sessionOnly: map.sessionOnly,
  };
}

export function lobbyOptionsForMode(
  official: readonly PublicMapInfo[],
  personal: readonly PersonalMapMeta[],
  mode: PublicGameMode,
): LobbyMapOption[] {
  return [
    ...official.map(officialLobbyOption),
    ...personalMapsForMode(personal, mode).map(personalLobbyOption),
  ];
}

export function selectedLobbyOption(
  selected: SelectedLobbyMap | undefined,
  official: readonly PublicMapInfo[],
  personal: readonly PersonalMapMeta[],
): LobbyMapOption | undefined {
  if (!selected) return undefined;
  if (selected.source === "official") {
    const map = official.find((m) => m.id === selected.id);
    return map ? officialLobbyOption(map) : undefined;
  }
  const map = personal.find((m) => m.id === selected.id);
  return map ? personalLobbyOption(map) : undefined;
}

export function quickPlayDisabledReason(selected: LobbyMapOption | undefined): string | undefined {
  if (selected?.source === "personal") return "Official maps only";
  return undefined;
}

export function officialQuickPlaySelection(
  selected: SelectedLobbyMap | undefined,
  official: readonly PublicMapInfo[],
  mode: PublicGameMode,
): { gameMode: PublicGameMode; mapId: string } | { error: string } {
  if (selected?.source === "personal") {
    return { error: "Official maps only" };
  }
  const mapId = selected?.source === "official" ? selected.id : official.find((m) => m.modes.includes(mode))?.id;
  const map = official.find((m) => m.id === mapId);
  if (!map) return { error: "Choose a production map." };
  if (!map.modes.includes(mode)) return { error: `${map.title} does not support that mode.` };
  return { gameMode: mode, mapId: map.id };
}
