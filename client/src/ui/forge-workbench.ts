import type {
  ForgeDesignTurn,
  ForgeDesignView,
  ForgeP0Summary,
  ForgePlaytestSummary,
} from "../api/client.js";

export function forgeActivityText(view: ForgeDesignView): string {
  if (view.status === "queued") return "Inspecting map…";
  if (view.status === "failed") return view.error ?? "Design failed.";
  if (view.status === "completed") return "Finished";
  const last = view.turns[view.turns.length - 1];
  if (!last) return "Inspecting map…";
  if (last.kind === "playtest") return "Running scripted playtest…";
  if (last.kind === "edit") {
    return last.rejected ? "Edit rejected. Reassessing…" : "Applying map edit…";
  }
  if (last.kind === "finish") return "Finished";
  return "Inspecting map…";
}

export function formatP0Line(p0: ForgeP0Summary): string {
  const routes =
    p0.totalPaths === 0
      ? "no S&D routes"
      : p0.reachablePaths === p0.totalPaths
        ? "all S&D routes reachable"
        : `${p0.reachablePaths}/${p0.totalPaths} S&D routes reachable`;
  return `${p0.hardFailures} hard failure${p0.hardFailures === 1 ? "" : "s"}. ${routes}.`;
}

export function formatPlaytestLines(pt: ForgePlaytestSummary): string[] {
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  return [
    `Ghost scripted routes  A ${pt.ghost.siteChoice.A} / B ${pt.ghost.siteChoice.B}`,
    `Mean route exposure  ${pt.ghost.meanRouteExposureFraction}`,
    `Route concentration  ${pt.ghost.routeConcentration}`,
    `First-contact occurrence  ${pct(pt.firstContact.occurrenceFraction)}`,
  ];
}

export function revisionCaption(revision: number, finalRevision: number): string {
  if (revision <= 0) return "Original";
  if (revision >= finalRevision && finalRevision > 0) return "Result";
  return `Revision ${revision} of ${finalRevision}`;
}

export function recordedStoryLine(view: ForgeDesignView): string | undefined {
  if (view.source !== "recorded" || view.jobId !== "p5-demo") return undefined;
  const playtests = view.turns.filter((t) => t.playtest);
  if (playtests.length < 3) return undefined;
  const a = playtests[0]?.playtest?.ghost.siteChoice;
  const b = playtests[1]?.playtest?.ghost.siteChoice;
  const c = playtests[2]?.playtest?.ghost.siteChoice;
  if (!a || !b || !c) return undefined;
  if (a.A !== 15 || a.B !== 49 || b.A !== 44 || b.B !== 20 || c.A !== 30 || c.B !== 34) {
    return undefined;
  }
  return "The first edit overcorrected the scripted route split, so the agent resized the same new occluder after observing the next playtest.";
}

export function formatTurnCard(turn: ForgeDesignTurn): string {
  const n = String(turn.turn).padStart(2, "0");
  if (turn.kind === "playtest" && turn.playtest) {
    const g = turn.playtest.ghost.siteChoice;
    return `${n} PLAYTEST\nA ${g.A} / B ${g.B}`;
  }
  if (turn.kind === "finish") {
    return `${n} COMPLETE\n${turn.finishSummary ?? ""}`.trim();
  }
  const title = turn.target ? `${turn.tool} ${turn.target}` : turn.tool;
  const lines = [`${n} MAP EDIT`, title];
  if (turn.intent) lines.push(turn.intent);
  if (turn.rejected) lines.push("Rejected.");
  if (turn.p0) lines.push(`Static checks: ${formatP0Line(turn.p0)}`);
  return lines.join("\n");
}

export function playtestLabel(view: ForgeDesignView): string {
  if (!view.lastPlaytest) return "No playtest yet";
  if (view.lastPlaytestIsOnFinalMap) return "Last observed playtest (on the final map)";
  return "Last observed playtest (before later edits)";
}
