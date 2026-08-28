import { ARENA_FORGE_PREVIEW_MAP_ID } from "./arena-forge-preview.js";

export type ShowcaseRendererPath = "shoot-house-neon" | "core";

export type ShowcaseSource = {
  mapId: string;
  renderer: ShowcaseRendererPath;
};

export function showcaseSourceForGameplayMapId(mapId: string): ShowcaseSource {
  return {
    mapId,
    renderer: mapId === "shoot-house-neon" ? "shoot-house-neon" : "core",
  };
}

export function showcaseSourceForForgePreview(): ShowcaseSource {
  return {
    mapId: ARENA_FORGE_PREVIEW_MAP_ID,
    renderer: "core",
  };
}
