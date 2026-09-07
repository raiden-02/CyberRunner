/** Pure viewer helpers. No DOM. Used by ForgeScreen and tests. */

export type ViewerTurnKind = "plan" | "edit" | "playtest" | "finish" | "route";

export type ViewerTurn = {
  turn: number;
  kind: ViewerTurnKind;
  tool: string;
  intent?: string;
  target?: string;
  rejected?: boolean;
  changedIds?: string[];
  mapRevision: number;
  p0?: unknown;
  playtest?: unknown;
  route?: {
    fromId: string;
    toId: string;
    reachable: boolean;
    distanceMeters?: number;
    waypoints: Array<{ x: number; z: number }>;
  };
};

export type ViewerDesign = {
  turns: ViewerTurn[];
  revisionMaps: unknown[];
  finalMapRevision: number;
  initialP0: unknown;
  finalP0?: unknown;
};

export type LiveTimelineSelection = {
  selectedTurn: number;
  followLatest: boolean;
};

export function snapshotIndexForTurn(view: ViewerDesign, selectedTurn: number): number {
  const turn = view.turns[selectedTurn];
  const revision = turn?.mapRevision ?? 0;
  if (revision < 0 || revision >= view.revisionMaps.length) {
    throw new Error(`invalid mapRevision ${revision} for selected turn ${selectedTurn}`);
  }
  return revision;
}

export function snapshotForTurn<T>(view: ViewerDesign & { revisionMaps: T[] }, selectedTurn: number): T {
  return view.revisionMaps[snapshotIndexForTurn(view, selectedTurn)]!;
}

export function previousSnapshot<T>(view: { revisionMaps: T[] }, revision: number): T | undefined {
  if (revision <= 0) return undefined;
  return view.revisionMaps[revision - 1];
}

export function turnIndexForRevision(turns: ViewerTurn[], revision: number, finalRevision: number): number {
  if (turns.length === 0) return 0;
  if (revision <= 0) {
    const plan = turns.findIndex((t) => t.kind === "plan");
    return plan >= 0 ? plan : 0;
  }
  if (revision >= finalRevision && finalRevision > 0) {
    const finish = [...turns].reverse().findIndex((t) => t.kind === "finish");
    if (finish >= 0) return turns.length - 1 - finish;
    return turns.length - 1;
  }
  const created = turns.findIndex((t) => t.kind === "edit" && !t.rejected && t.mapRevision === revision);
  return created >= 0 ? created : 0;
}

export function selectionAfterPoll(state: LiveTimelineSelection, turnCount: number): LiveTimelineSelection {
  if (turnCount <= 0) return { selectedTurn: 0, followLatest: state.followLatest };
  if (state.followLatest) return { selectedTurn: turnCount - 1, followLatest: true };
  const max = turnCount - 1;
  return {
    selectedTurn: Math.min(Math.max(0, state.selectedTurn), max),
    followLatest: false,
  };
}

export function selectionAfterUserPick(index: number): LiveTimelineSelection {
  return { selectedTurn: Math.max(0, index), followLatest: false };
}

export function selectionFollowLatest(turnCount: number): LiveTimelineSelection {
  return { selectedTurn: Math.max(0, turnCount - 1), followLatest: true };
}

export type ViewerEvidence = {
  p0Title?: string;
  p0?: unknown;
  playtest?: unknown;
  route?: ViewerTurn["route"];
  playtestNote?: string;
};

export function evidenceForSelectedTurn(view: ViewerDesign, selectedTurn: number): ViewerEvidence {
  const turn = view.turns[selectedTurn];
  if (!turn) {
    return { p0Title: "Static checks", p0: view.initialP0, playtestNote: "No playtest on this step." };
  }
  if (turn.kind === "plan") {
    return { p0Title: "Static checks", p0: view.initialP0, playtestNote: "No playtest on this step." };
  }
  if (turn.kind === "playtest") {
    return {
      p0Title: "Static checks after this step",
      p0: turn.p0 ?? view.finalP0,
      playtest: turn.playtest,
    };
  }
  if (turn.kind === "route") {
    return {
      p0Title: "Static checks after this step",
      p0: turn.p0,
      route: turn.route,
      playtestNote: "No playtest on this step.",
    };
  }
  if (turn.kind === "finish") {
    return {
      p0Title: "Static checks after this step",
      p0: turn.p0 ?? view.finalP0,
      playtestNote: "No playtest on this step.",
    };
  }
  return {
    p0Title: "Static checks after this step",
    p0: turn.p0,
    playtestNote: "No playtest on this step.",
  };
}

export function shouldHighlightEdit(turn: ViewerTurn | undefined): boolean {
  return Boolean(turn && turn.kind === "edit" && !turn.rejected);
}

export function shouldShowReplay(turn: ViewerTurn | undefined): boolean {
  return turn?.kind === "playtest";
}

export function shouldShowRoute(turn: ViewerTurn | undefined): boolean {
  return Boolean(turn?.kind === "route" && turn.route);
}
