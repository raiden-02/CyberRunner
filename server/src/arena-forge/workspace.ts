import {
  applyArenaEdit,
  cloneArenaMap,
  createIdAllocator,
  type ArenaEditAction,
  type ArenaEditError,
  type IdAllocator,
} from "./actions.js";
import { evaluateArena } from "./evaluator.js";
import { exportGameplayMap } from "./export-map.js";
import { importGameplayMap } from "./import-map.js";
import { inspectArena } from "./inspect.js";
import type { ArenaEvaluation, ArenaEvaluationMode, ArenaMap } from "./types.js";
import type { GameplayMapDefinition } from "@shared/world/map-types.js";

export type ArenaActionSuccess = {
  ok: true;
  action: ArenaEditAction;
  changedIds: string[];
  map: ArenaMap;
  evaluation: ArenaEvaluation;
};

export type ArenaActionFailure = {
  ok: false;
  error: ArenaEditError;
};

export type ArenaActionResult = ArenaActionSuccess | ArenaActionFailure;

/**
 * One-shot edit + P0 evaluation. Derives a fresh allocator from `map`.
 * Does not mutate `map`. Does not keep session ID state.
 *
 * Callers that apply more than one edit must use `ArenaWorkspace`.
 * Only the workspace preserves "removed IDs are never reused in this session".
 */
export function applyArenaAction(
  map: ArenaMap,
  action: ArenaEditAction,
  mode: ArenaEvaluationMode = "search_destroy",
): ArenaActionResult {
  const edited = applyArenaEdit(map, action, createIdAllocator(map));
  if (!edited.ok) return edited;
  return {
    ok: true,
    action,
    changedIds: edited.changedIds,
    map: edited.map,
    evaluation: evaluateArena(edited.map, mode),
  };
}

/** One edit session. IDs stay stable. Successful edits re-run the P0 evaluator. */
export class ArenaWorkspace {
  readonly mode: ArenaEvaluationMode;
  private map: ArenaMap;
  private ids: IdAllocator;
  evaluation: ArenaEvaluation;

  constructor(map: ArenaMap, mode: ArenaEvaluationMode = "search_destroy") {
    this.map = cloneArenaMap(map);
    this.ids = createIdAllocator(this.map);
    this.mode = mode;
    this.evaluation = evaluateArena(this.map, mode);
  }

  static fromGameplay(
    def: GameplayMapDefinition,
    mode: ArenaEvaluationMode = "search_destroy",
  ): ArenaWorkspace {
    return new ArenaWorkspace(importGameplayMap(def), mode);
  }

  currentMap(): ArenaMap {
    return cloneArenaMap(this.map);
  }

  inspect() {
    return inspectArena(this.map, this.evaluation);
  }

  apply(action: ArenaEditAction): ArenaActionResult {
    const edited = applyArenaEdit(this.map, action, this.ids);
    if (!edited.ok) return edited;
    this.map = edited.map;
    this.ids = edited.ids;
    this.evaluation = evaluateArena(this.map, this.mode);
    return {
      ok: true,
      action,
      changedIds: edited.changedIds,
      map: cloneArenaMap(this.map),
      evaluation: this.evaluation,
    };
  }

  exportToGameplay(id: string, name: string): GameplayMapDefinition {
    return exportGameplayMap(this.map, { id, name });
  }
}
