import {
  type MapId,
  getDefaultMapId,
  getGameplayMap,
} from "@shared/world/map-registry.js";

export type { MapId };
export { getDefaultMapId, getGameplayMap };

export function isShootHouseNeonMap(mapId: string): boolean {
  return mapId === "shoot-house-neon";
}

export type MapVisuals = {
  displayName: string;
  generatedSkybox?: boolean;
};

/** Shoot House has a custom theme. Every other registered map is unstyled. */
export function getMapVisuals(mapId: string): MapVisuals {
  const map = getGameplayMap(mapId);
  if (isShootHouseNeonMap(map.id)) {
    return {
      displayName: "Shoot House Neon",
      generatedSkybox: true,
    };
  }
  return { displayName: map.name };
}

export type LevelRendererKind = "bespoke" | "core";

/**
 * Registered maps only. Shoot House has its own level. Everyone else uses CoreLevel.
 * getGameplayMap throws on unknown ids.
 */
export function resolveLevelRenderer(mapId: string): LevelRendererKind {
  getGameplayMap(mapId);
  return isShootHouseNeonMap(mapId) ? "bespoke" : "core";
}
