import { CAPSULE } from "../physics/constants.js";
import {
  circleInsideRect,
  isFiniteNumber,
  type MapBoundsRect,
} from "./map-bounds.js";

export const DESIGN_BRIEF_MAX = 800;

export const ENVELOPE_MIN_SIZE = 16;
export const ENVELOPE_MAX_SIZE = 80;
export const ENVELOPE_SNAP = 0.5;

/** Wall clearance so a 4-point cluster plus standing capsules stay inside. */
export const TEAM_ANCHOR_MARGIN = 3;
export const TEAM_ANCHOR_MIN_SEPARATION = 12;
export const DEATHMATCH_SPAWN_MARGIN = 1.5;
export const DEATHMATCH_MIN_SPAWNS = 4;
export const DEATHMATCH_MAX_SPAWNS = 8;

export const SPAWN_CLUSTER_OFFSETS: ReadonlyArray<{ x: number; z: number }> = [
  { x: -1.2, z: -1.2 },
  { x: 1.2, z: -1.2 },
  { x: -1.2, z: 1.2 },
  { x: 1.2, z: 1.2 },
];

export const STANDING_SPAWN_Y = CAPSULE.HalfHeight + CAPSULE.Radius;

export const DEFAULT_SND_BRIEF =
  "Build three distinct routes between the teams. Keep a faster but exposed central route, give both sites viable approaches, and break up long sightlines without making the arena cramped.";

export const DEFAULT_DEATHMATCH_BRIEF =
  "Build a compact arena with several loops, enough cover to break long sightlines, and no single central position that sees most spawn approaches.";

export type ArenaGameMode = "search_destroy" | "deathmatch";

export type ArenaEnvelope = MapBoundsRect;

export type ArenaPoint = { x: number; z: number };

export type SearchDestroySpawnSetup = {
  kind: "search_destroy";
  ghostAnchor: ArenaPoint;
  sentinelAnchor: ArenaPoint;
};

export type DeathmatchSpawnSetup = {
  kind: "deathmatch";
  general: ArenaPoint[];
};

export type ArenaSpawnSetup = SearchDestroySpawnSetup | DeathmatchSpawnSetup;

export type ArenaDesignSpec = {
  version: 1;
  mode: ArenaGameMode;
  envelope: ArenaEnvelope;
  spawnSetup: ArenaSpawnSetup;
  brief: string;
};

export type DesignSpecIssue = { code: string; message: string };

export type DesignSpecResult =
  | { ok: true; spec: ArenaDesignSpec }
  | { ok: false; issues: DesignSpecIssue[] };

export function snapWorld(n: number, step = ENVELOPE_SNAP): number {
  return Math.round(n / step) * step;
}

export function sampleBriefForMode(mode: ArenaGameMode): string {
  return mode === "deathmatch" ? DEFAULT_DEATHMATCH_BRIEF : DEFAULT_SND_BRIEF;
}

function finitePoint(p: unknown): p is ArenaPoint {
  return (
    typeof p === "object" &&
    p !== null &&
    isFiniteNumber((p as ArenaPoint).x) &&
    isFiniteNumber((p as ArenaPoint).z)
  );
}

function parseEnvelope(raw: unknown): { ok: true; envelope: ArenaEnvelope } | { ok: false; issues: DesignSpecIssue[] } {
  const issues: DesignSpecIssue[] = [];
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, issues: [{ code: "missing-envelope", message: "Draw an arena envelope." }] };
  }
  const rec = raw as Record<string, unknown>;
  const centerX = rec.centerX;
  const centerZ = rec.centerZ;
  const halfWidth = rec.halfWidth;
  const halfDepth = rec.halfDepth;
  if (
    !isFiniteNumber(centerX as number) ||
    !isFiniteNumber(centerZ as number) ||
    !isFiniteNumber(halfWidth as number) ||
    !isFiniteNumber(halfDepth as number)
  ) {
    return { ok: false, issues: [{ code: "invalid-envelope", message: "Arena envelope must use finite numbers." }] };
  }
  if ((halfWidth as number) <= 0 || (halfDepth as number) <= 0) {
    issues.push({ code: "degenerate-envelope", message: "Arena envelope cannot be inverted or empty." });
  }
  const width = (halfWidth as number) * 2;
  const depth = (halfDepth as number) * 2;
  if (width < ENVELOPE_MIN_SIZE || depth < ENVELOPE_MIN_SIZE) {
    issues.push({
      code: "envelope-too-small",
      message: `Arena must be at least ${ENVELOPE_MIN_SIZE} m × ${ENVELOPE_MIN_SIZE} m.`,
    });
  }
  if (width > ENVELOPE_MAX_SIZE || depth > ENVELOPE_MAX_SIZE) {
    issues.push({
      code: "envelope-too-large",
      message: `Arena cannot exceed ${ENVELOPE_MAX_SIZE} m × ${ENVELOPE_MAX_SIZE} m.`,
    });
  }
  if (issues.length) return { ok: false, issues };
  return {
    ok: true,
    envelope: {
      centerX: centerX as number,
      centerZ: centerZ as number,
      halfWidth: halfWidth as number,
      halfDepth: halfDepth as number,
    },
  };
}

function pointKey(p: ArenaPoint): string {
  return `${p.x},${p.z}`;
}

function clusterFits(anchor: ArenaPoint, envelope: ArenaEnvelope, margin: number): boolean {
  if (!circleInsideRect(anchor.x, anchor.z, margin, envelope)) return false;
  for (const off of SPAWN_CLUSTER_OFFSETS) {
    if (!circleInsideRect(anchor.x + off.x, anchor.z + off.z, CAPSULE.Radius, envelope)) {
      return false;
    }
  }
  return true;
}

export function teamClusterPoints(anchor: ArenaPoint): ArenaPoint[] {
  return SPAWN_CLUSTER_OFFSETS.map((off) => ({
    x: anchor.x + off.x,
    z: anchor.z + off.z,
  }));
}

export function clusterCentroid(points: ArenaPoint[]): ArenaPoint {
  const n = points.length || 1;
  return {
    x: points.reduce((s, p) => s + p.x, 0) / n,
    z: points.reduce((s, p) => s + p.z, 0) / n,
  };
}

export function parseArenaDesignSpec(raw: unknown): DesignSpecResult {
  const issues: DesignSpecIssue[] = [];
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, issues: [{ code: "invalid-spec", message: "Design setup is missing." }] };
  }
  const rec = raw as Record<string, unknown>;
  if (rec.version !== 1 && rec.version !== undefined) {
    return { ok: false, issues: [{ code: "unsupported-version", message: "Unsupported design spec version." }] };
  }
  const mode = rec.mode;
  if (mode !== "search_destroy" && mode !== "deathmatch") {
    return { ok: false, issues: [{ code: "invalid-mode", message: "Choose Search & Destroy or Deathmatch." }] };
  }

  const brief = typeof rec.brief === "string" ? rec.brief.trim() : "";
  if (!brief) issues.push({ code: "missing-brief", message: "Write a design brief." });
  else if (brief.length > DESIGN_BRIEF_MAX) {
    issues.push({
      code: "brief-too-long",
      message: `Brief must be at most ${DESIGN_BRIEF_MAX} characters.`,
    });
  }

  const env = parseEnvelope(rec.envelope);
  if (!env.ok) issues.push(...env.issues);
  const envelope = env.ok ? env.envelope : undefined;

  const setupRaw = rec.spawnSetup;
  if (typeof setupRaw !== "object" || setupRaw === null) {
    issues.push({
      code: "missing-spawns",
      message: mode === "deathmatch" ? "Place Deathmatch spawns." : "Place both team starts.",
    });
    return { ok: false, issues };
  }
  const setup = setupRaw as Record<string, unknown>;

  if (mode === "search_destroy") {
    if (!finitePoint(setup.ghostAnchor)) {
      issues.push({ code: "missing-ghost-anchor", message: "Place the Ghost start." });
    }
    if (!finitePoint(setup.sentinelAnchor)) {
      issues.push({ code: "missing-sentinel-anchor", message: "Place the Sentinel start." });
    }
    if (envelope && finitePoint(setup.ghostAnchor) && finitePoint(setup.sentinelAnchor)) {
      if (!clusterFits(setup.ghostAnchor, envelope, TEAM_ANCHOR_MARGIN)) {
        issues.push({
          code: "ghost-anchor-margin",
          message: "Ghost start is too close to the arena wall.",
        });
      }
      if (!clusterFits(setup.sentinelAnchor, envelope, TEAM_ANCHOR_MARGIN)) {
        issues.push({
          code: "sentinel-anchor-margin",
          message: "Sentinel start is too close to the arena wall.",
        });
      }
      const dx = setup.ghostAnchor.x - setup.sentinelAnchor.x;
      const dz = setup.ghostAnchor.z - setup.sentinelAnchor.z;
      if (Math.hypot(dx, dz) < TEAM_ANCHOR_MIN_SEPARATION) {
        issues.push({
          code: "anchors-too-close",
          message: `Ghost and Sentinel starts must be at least ${TEAM_ANCHOR_MIN_SEPARATION} m apart.`,
        });
      }
      if (
        setup.ghostAnchor.x === setup.sentinelAnchor.x &&
        setup.ghostAnchor.z === setup.sentinelAnchor.z
      ) {
        issues.push({ code: "duplicate-anchors", message: "Team starts cannot share the same point." });
      }
    }
    if (issues.length) return { ok: false, issues };
    return {
      ok: true,
      spec: {
        version: 1,
        mode,
        envelope: envelope!,
        spawnSetup: {
          kind: "search_destroy",
          ghostAnchor: setup.ghostAnchor as ArenaPoint,
          sentinelAnchor: setup.sentinelAnchor as ArenaPoint,
        },
        brief,
      },
    };
  }

  const general = Array.isArray(setup.general) ? setup.general : [];
  const points: ArenaPoint[] = [];
  const seen = new Set<string>();
  for (const item of general) {
    if (!finitePoint(item)) {
      issues.push({ code: "invalid-spawn", message: "Each Deathmatch spawn must be a finite point." });
      continue;
    }
    const key = pointKey(item);
    if (seen.has(key)) {
      issues.push({ code: "duplicate-spawn", message: "Deathmatch spawns cannot occupy the same point." });
      continue;
    }
    seen.add(key);
    if (envelope && !circleInsideRect(item.x, item.z, DEATHMATCH_SPAWN_MARGIN, envelope)) {
      issues.push({
        code: "spawn-margin",
        message: "A Deathmatch spawn is too close to the arena wall or outside the envelope.",
      });
      continue;
    }
    points.push(item);
  }
  if (points.length < DEATHMATCH_MIN_SPAWNS) {
    issues.push({
      code: "need-more-spawns",
      message: `Add at least ${DEATHMATCH_MIN_SPAWNS} Deathmatch spawns.`,
    });
  }
  if (points.length > DEATHMATCH_MAX_SPAWNS) {
    issues.push({
      code: "too-many-spawns",
      message: `Use at most ${DEATHMATCH_MAX_SPAWNS} Deathmatch spawns.`,
    });
  }
  if (issues.length || !envelope) return { ok: false, issues };
  return {
    ok: true,
    spec: {
      version: 1,
      mode,
      envelope,
      spawnSetup: { kind: "deathmatch", general: points },
      brief,
    },
  };
}
