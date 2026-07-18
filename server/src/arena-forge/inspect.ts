import type { ArenaEvaluation, ArenaMap } from "./types.js";

/**
 * Detached snapshot for a later agent. No design advice.
 * Mutating the return value cannot change the source map or evaluation.
 */
export type ArenaInspection = ReturnType<typeof inspectArena>;

export function inspectArena(map: ArenaMap, evaluation?: ArenaEvaluation) {
  return structuredClone({
    sourceMapId: map.sourceMapId,
    boundsHalfSize: map.boundsHalfSize,
    wallHeight: map.wallHeight,
    wallThickness: map.wallThickness,
    groundThickness: map.groundThickness,
    solids: map.solids.map((s) => ({
      id: s.id,
      kind: s.kind,
      x: s.x,
      y: s.y,
      z: s.z,
      hx: s.hx,
      hy: s.hy,
      hz: s.hz,
      hp: s.hp,
    })),
    spawns: map.spawns.map((s) => ({
      id: s.id,
      role: s.role,
      x: s.x,
      y: s.y,
      z: s.z,
    })),
    objectives: map.objectives.map((o) => ({
      id: o.id,
      x: o.x,
      y: o.y,
      z: o.z,
      radius: o.radius,
    })),
    spikeSpawnLocation: map.spikeSpawnLocation,
    evaluation: evaluation
      ? {
          mode: evaluation.mode,
          hardFailureCount: evaluation.summary.hardFailureCount,
          hardFailures: evaluation.summary.hardFailures,
          spawns: evaluation.spawns.results,
          objectives: evaluation.objectives.results,
          navigation: {
            components: evaluation.navigation.components,
            anchors: evaluation.navigation.anchors,
            paths: evaluation.navigation.paths,
            aggregates: evaluation.navigation.aggregates,
          },
          lineOfSight: evaluation.lineOfSight.pairs,
        }
      : undefined,
  });
}
