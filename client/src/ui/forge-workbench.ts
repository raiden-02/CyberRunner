import type { ForgeDesignTurn, ForgeDesignView, ForgeP0Summary, ForgePlaytestSummary } from "../api/client.js";

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
  const lines = [
    `Ghost site choice: A ${pt.ghost.siteChoice.A} / B ${pt.ghost.siteChoice.B}`,
    `Sentinel site choice: A ${pt.sentinel.siteChoice.A} / B ${pt.sentinel.siteChoice.B}`,
    `Ghost exposure: ${pt.ghost.meanRouteExposureFraction}  concentration: ${pt.ghost.routeConcentration}`,
    `First contact: ${pct(pt.firstContact.occurrenceFraction)}`,
  ];
  if (pt.firstContact.hotspot) {
    const h = pt.firstContact.hotspot;
    lines.push(`Hotspot: x=${h.x} z=${h.z}`);
  }
  return lines;
}

export function formatTurnCard(turn: ForgeDesignTurn): string {
  if (turn.kind === "playtest" && turn.playtest) {
    return ["Playtest", ...formatPlaytestLines(turn.playtest)].join("\n");
  }
  if (turn.kind === "finish") {
    return `Finished\n${turn.finishSummary ?? ""}`.trim();
  }
  const title = turn.target ? `${turn.tool} ${turn.target}` : turn.tool;
  const lines = ["Edit", title];
  if (turn.intent) lines.push(`Intent: ${turn.intent}`);
  if (turn.rejected) lines.push("Rejected by P1.");
  if (turn.p0) lines.push(`P0: ${formatP0Line(turn.p0)}`);
  return lines.join("\n");
}

export function playtestLabel(view: ForgeDesignView): string {
  if (!view.lastPlaytest) return "No playtest yet";
  if (view.lastPlaytestIsOnFinalMap) return "Last observed playtest (on the final map)";
  return "Last observed playtest (before later edits)";
}
