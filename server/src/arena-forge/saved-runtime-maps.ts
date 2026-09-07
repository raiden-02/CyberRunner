import type { GameplayMapDefinition } from "@shared/world/map-types.js";

const runtime = new Map<string, GameplayMapDefinition>();

export function registerSavedRuntimeMap(id: string, map: GameplayMapDefinition): void {
  runtime.set(id, map);
}

export function getSavedRuntimeMap(id: string): GameplayMapDefinition | undefined {
  return runtime.get(id);
}

export function resetSavedRuntimeMaps(): void {
  runtime.clear();
}
