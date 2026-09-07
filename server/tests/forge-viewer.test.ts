import { describe, expect, it } from "vitest";
import {
  evidenceForSelectedTurn,
  selectionAfterPoll,
  selectionAfterUserPick,
  selectionFollowLatest,
  shouldHighlightEdit,
  shouldShowReplay,
  shouldShowRoute,
  snapshotForTurn,
  turnIndexForRevision,
  type ViewerDesign,
  type ViewerTurn,
} from "../../shared/ui/forge-viewer.js";

function turn(partial: Partial<ViewerTurn> & Pick<ViewerTurn, "turn" | "kind" | "tool" | "mapRevision">): ViewerTurn {
  return partial;
}

const maps = ["orig", "r1", "r2"];

const view: ViewerDesign = {
  turns: [
    turn({ turn: 1, kind: "plan", tool: "propose_design_plan", mapRevision: 0, p0: "initial" }),
    turn({ turn: 2, kind: "edit", tool: "add_block", mapRevision: 1, p0: "after-block" }),
    turn({ turn: 3, kind: "route", tool: "trace_route", mapRevision: 1, route: { fromId: "g", toId: "A", reachable: true, waypoints: [] } }),
    turn({ turn: 4, kind: "playtest", tool: "run_playtest", mapRevision: 1, playtest: { A: 10 } }),
    turn({ turn: 5, kind: "edit", tool: "resize_solid", mapRevision: 2, p0: "after-resize" }),
    turn({ turn: 6, kind: "finish", tool: "finish_design", mapRevision: 2, p0: "final" }),
  ],
  revisionMaps: maps,
  finalMapRevision: 2,
  initialP0: "initial-p0",
  finalP0: "final-p0",
};

describe("forge viewer selection", () => {
  it("maps a selected turn to its revision snapshot", () => {
    expect(snapshotForTurn({ ...view, revisionMaps: maps }, 0)).toBe("orig");
    expect(snapshotForTurn({ ...view, revisionMaps: maps }, 1)).toBe("r1");
    expect(snapshotForTurn({ ...view, revisionMaps: maps }, 3)).toBe("r1");
    expect(snapshotForTurn({ ...view, revisionMaps: maps }, 4)).toBe("r2");
  });

  it("throws on an invalid revision instead of clamping", () => {
    const bad = { ...view, turns: [turn({ turn: 1, kind: "edit", tool: "add_block", mapRevision: 9 })] };
    expect(() => snapshotForTurn({ ...bad, revisionMaps: maps }, 0)).toThrow(/invalid mapRevision/);
  });

  it("selects the mutating turn that created a revision", () => {
    expect(turnIndexForRevision(view.turns, 0, 2)).toBe(0);
    expect(turnIndexForRevision(view.turns, 1, 2)).toBe(1);
    expect(turnIndexForRevision(view.turns, 2, 2)).toBe(5);
  });
});

describe("live followLatest", () => {
  it("follows new turns until the user picks an older step", () => {
    let state = { selectedTurn: 2, followLatest: true };
    state = selectionAfterPoll(state, 4);
    expect(state).toEqual({ selectedTurn: 3, followLatest: true });

    state = selectionAfterUserPick(1);
    expect(state).toEqual({ selectedTurn: 1, followLatest: false });

    state = selectionAfterPoll(state, 5);
    expect(state).toEqual({ selectedTurn: 1, followLatest: false });

    state = selectionFollowLatest(5);
    expect(state).toEqual({ selectedTurn: 4, followLatest: true });
  });
});

describe("selected-step evidence", () => {
  it("uses plan / edit / playtest / route evidence without leaking the last playtest", () => {
    expect(evidenceForSelectedTurn(view, 0)).toMatchObject({
      p0: "initial-p0",
      playtestNote: "No playtest on this step.",
    });
    expect(evidenceForSelectedTurn(view, 1)).toMatchObject({
      p0: "after-block",
      playtestNote: "No playtest on this step.",
    });
    expect(evidenceForSelectedTurn(view, 2).route?.fromId).toBe("g");
    expect(evidenceForSelectedTurn(view, 2).playtest).toBeUndefined();
    expect(evidenceForSelectedTurn(view, 3).playtest).toEqual({ A: 10 });
    expect(shouldShowReplay(view.turns[3])).toBe(true);
    expect(shouldShowRoute(view.turns[2])).toBe(true);
    expect(shouldHighlightEdit(view.turns[2])).toBe(false);
    expect(shouldHighlightEdit(view.turns[1])).toBe(true);
  });
});
