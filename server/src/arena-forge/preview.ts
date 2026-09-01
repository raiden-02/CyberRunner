import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { SERVER_DIR } from "../project-paths.js";
import { ARENA_FORGE_PREVIEW_MAP_ID } from "@shared/world/arena-forge-preview.js";
import type { GameplayMapDefinition } from "@shared/world/map-types.js";
import { assertSearchDestroyMap } from "@shared/world/map-registry.js";
import { allEvalCases, getEvalCase } from "./eval-cases.js";
import { getP4BCase, p4bHeldOutCases } from "./eval-cases-p4b.js";
import { getDesignJobMap } from "./design-jobs.js";
import { exportGameplayMap } from "./export-map.js";
import { parseDemoCatalogId, parseJobCatalogId } from "./design-view.js";
import { recordedDemoMap } from "./recorded-demo.js";
import type { ArenaMap } from "./types.js";

const RESULTS_ROOT = path.join(SERVER_DIR, ".arena-forge-results");

export type ForgeCatalogEntry = {
  id: string;
  suite: "p4a" | "p4b" | "run";
  title: string;
  subtitle: string;
  which: "initial" | "final";
};

export function defaultPreviewPath(): string {
  return process.env.ARENA_FORGE_PREVIEW_PATH?.trim()
    ? path.resolve(process.env.ARENA_FORGE_PREVIEW_PATH)
    : path.join(RESULTS_ROOT, "preview.json");
}

export function isArenaForgePreviewMapId(mapId: string): boolean {
  return mapId === ARENA_FORGE_PREVIEW_MAP_ID || mapId.startsWith(`${ARENA_FORGE_PREVIEW_MAP_ID}::`);
}

export function catalogIdFromMapId(mapId: string): string | undefined {
  if (mapId === ARENA_FORGE_PREVIEW_MAP_ID) return undefined;
  const prefix = `${ARENA_FORGE_PREVIEW_MAP_ID}::`;
  if (!mapId.startsWith(prefix)) return undefined;
  return mapId.slice(prefix.length);
}

export function roomMapIdForCatalog(catalogId: string): string {
  return `${ARENA_FORGE_PREVIEW_MAP_ID}::${catalogId}`;
}

function asPreview(map: GameplayMapDefinition, name: string): GameplayMapDefinition {
  const next = { ...map, id: ARENA_FORGE_PREVIEW_MAP_ID, name };
  assertSearchDestroyMap(next);
  return next;
}

function listRunFiles(dir: string, prefix = ""): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${name.name}` : name.name;
    const full = path.join(dir, name.name);
    if (name.isDirectory()) {
      if (name.name.startsWith(".")) continue;
      out.push(...listRunFiles(full, rel));
      continue;
    }
    if (!name.name.endsWith(".json")) continue;
    if (name.name === "suite.json" || name.name === "manifest.json" || name.name === "preview.json") continue;
    out.push(rel.replace(/\\/g, "/"));
  }
  return out.sort();
}

export function listForgeCatalog(): ForgeCatalogEntry[] {
  const entries: ForgeCatalogEntry[] = [];
  for (const evalCase of allEvalCases()) {
    entries.push({
      id: `fixture:${evalCase.id}`,
      suite: "p4a",
      title: evalCase.title,
      subtitle: `${evalCase.split} start - ${evalCase.id}`,
      which: "initial",
    });
  }
  for (const evalCase of p4bHeldOutCases()) {
    entries.push({
      id: `fixture:${evalCase.id}`,
      suite: "p4b",
      title: evalCase.title,
      subtitle: `Interaction evaluation start - ${evalCase.id}`,
      which: "initial",
    });
  }
  for (const rel of listRunFiles(RESULTS_ROOT)) {
    const base = path.basename(rel, ".json");
    const parts = base.split("__");
    const caseId = parts[0] ?? base;
    const arm = parts[1] ?? "run";
    const rep = parts[2] ?? "";
    const armLabel = arm === "one_shot" ? "one-shot" : arm === "agent" ? "iterative" : arm;
    for (const which of ["initial", "final"] as const) {
      entries.push({
        id: `run:${rel}:${which}`,
        suite: "run",
        title: caseId,
        subtitle: `${armLabel} ${rep} - ${which === "initial" ? "before" : "after model"}`,
        which,
      });
    }
  }
  return entries;
}

function resolveRunPath(rel: string): string {
  if (rel.includes("..") || path.isAbsolute(rel)) {
    throw new Error("invalid forge run path");
  }
  const full = path.resolve(RESULTS_ROOT, rel);
  const root = path.resolve(RESULTS_ROOT);
  if (!full.startsWith(root + path.sep) && full !== root) {
    throw new Error("invalid forge run path");
  }
  if (!existsSync(full)) throw new Error(`forge run not found: ${rel}`);
  return full;
}

export function loadForgeMap(catalogId?: string): GameplayMapDefinition {
  if (!catalogId) {
    return loadArenaForgePreview();
  }
  const jobRef = parseJobCatalogId(catalogId);
  if (jobRef) {
    const map = getDesignJobMap(jobRef.jobId, jobRef.which);
    if (!map) throw new Error(`forge job map not found: ${catalogId}`);
    const name = `ArenaForge job ${jobRef.which}`;
    return asPreview(exportGameplayMap(map, { id: ARENA_FORGE_PREVIEW_MAP_ID, name }), name);
  }
  const demoWhich = parseDemoCatalogId(catalogId);
  if (demoWhich) {
    const map = recordedDemoMap(demoWhich);
    const name = `Recorded agent run ${demoWhich}`;
    return asPreview(exportGameplayMap(map, { id: ARENA_FORGE_PREVIEW_MAP_ID, name }), name);
  }
  if (catalogId.startsWith("fixture:")) {
    const caseId = catalogId.slice("fixture:".length);
    if (caseId.startsWith("p4b-")) {
      const evalCase = getP4BCase(caseId);
      return asPreview(
        exportGameplayMap(evalCase.buildMap(), { id: ARENA_FORGE_PREVIEW_MAP_ID, name: evalCase.title }),
        `${evalCase.title} start`,
      );
    }
    const evalCase = getEvalCase(caseId);
    return asPreview(
      exportGameplayMap(evalCase.buildMap(), { id: ARENA_FORGE_PREVIEW_MAP_ID, name: evalCase.title }),
      `${evalCase.title} start`,
    );
  }
  if (catalogId.startsWith("run:")) {
    const rest = catalogId.slice("run:".length);
    const split = rest.lastIndexOf(":");
    if (split <= 0) throw new Error(`bad run catalog id: ${catalogId}`);
    const rel = rest.slice(0, split);
    const which = rest.slice(split + 1);
    if (which !== "initial" && which !== "final") throw new Error("run which must be initial or final");
    const raw = JSON.parse(readFileSync(resolveRunPath(rel), "utf8")) as {
      caseId?: string;
      initialMap?: ArenaMap;
      finalMap?: ArenaMap;
    };
    const map = which === "initial" ? raw.initialMap : raw.finalMap;
    if (!map) throw new Error(`run JSON missing ${which} map`);
    const name = `${raw.caseId ?? rel} ${which}`;
    return asPreview(exportGameplayMap(map, { id: ARENA_FORGE_PREVIEW_MAP_ID, name }), name);
  }
  throw new Error(`unknown forge catalog id: ${catalogId}`);
}

export function loadArenaForgePreview(filePath = defaultPreviewPath()): GameplayMapDefinition {
  if (!existsSync(filePath)) {
    throw new Error(
      `ArenaForge preview map not found at ${filePath}. Pick a map from Forge, or export one with server/scripts/arena-forge-preview.ts`,
    );
  }
  const raw = JSON.parse(readFileSync(filePath, "utf8")) as GameplayMapDefinition;
  return asPreview(raw, raw.name || "ArenaForge preview");
}
