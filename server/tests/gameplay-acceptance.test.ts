import { describe, expect, it } from "vitest";
import { HealthSystem } from "../src/systems/health-system.js";
import { GAME_MODES } from "../src/game-modes/game-mode-config.js";
import { makeDeathmatchRoom, makeSearchDestroyRoom } from "./match-test-harness.js";

describe("Deathmatch acceptance", () => {
  it("starts with the configured score and time contract", () => {
    const { mode, room } = makeDeathmatchRoom();
    expect(mode.getModeId()).toBe("deathmatch");
    expect(mode.isGameEnded()).toBe(false);
    expect(room.state.scoreLimit).toBe(GAME_MODES.deathmatch.scoreLimit);
    expect(room.state.timeRemaining).toBe(GAME_MODES.deathmatch.timeLimit);
    expect(room.state.lobbyState).toBe("playing");
  });

  it("awards a kill, ends at the score limit, and records the winner", () => {
    const { match, mode, room } = makeDeathmatchRoom();
    const limit = GAME_MODES.deathmatch.scoreLimit;

    for (let i = 0; i < limit - 1; i++) {
      match.handlePlayerKill("victim", "killer");
      expect(mode.isGameEnded()).toBe(false);
    }

    expect(room.players.get("killer")?.schema.kills).toBe(limit - 1);
    expect(room.players.get("killer")?.schema.score).toBe((limit - 1) * 100);
    expect(room.players.get("victim")?.schema.deaths).toBe(limit - 1);

    match.handlePlayerKill("victim", "killer");
    expect(mode.isGameEnded()).toBe(true);
    expect(mode.getWinner()).toBe("killer");
    expect(room.state.isGameOver).toBe(true);
    expect(room.state.winnerId).toBe("killer");
    expect(room.state.lobbyState).toBe("ended");
    expect(room.broadcasts.some((b) => b.type === "game_over")).toBe(true);
  });

  it("marks death and respawns after the existing delay", () => {
    const player = makeDeathmatchRoom().room.players.get("victim")!;
    player.schema.health = 20;
    const lethal = HealthSystem.applyDamage(player.schema, 20, "killer", "AR_1", "hitscan");
    expect(lethal.killed).toBe(true);
    expect(player.schema.isDead).toBe(true);
    expect(player.schema.respawnTime).toBe(3);

    expect(HealthSystem.updateRespawn(player.schema, 2.9, { x: 1, y: 1, z: 2 }, true).respawned).toBe(
      false,
    );
    expect(HealthSystem.updateRespawn(player.schema, 0.2, { x: 1, y: 1, z: 2 }, true).respawned).toBe(
      true,
    );
    expect(player.schema.isDead).toBe(false);
    expect(player.schema.health).toBe(player.schema.maxHealth);
    expect(player.schema.x).toBe(1);
    expect(player.schema.z).toBe(2);
  });
});

describe("Search & Destroy team lobby", () => {
  it("blocks start until both teams have a player", () => {
    const { mode } = makeSearchDestroyRoom();
    const tm = mode.getTeamManager();
    tm.removePlayer("sentinel");
    expect(tm.canStartGame()).toBe(false);
    tm.assignToTeam("sentinel", "sentinels");
    expect(tm.canStartGame()).toBe(true);
  });

  it("allows Forge solo-start without leaking into ordinary rooms", () => {
    const ordinary = makeSearchDestroyRoom();
    ordinary.mode.getTeamManager().removePlayer("sentinel");
    expect(ordinary.mode.getTeamManager().canStartGame()).toBe(false);

    const forge = makeSearchDestroyRoom({ allowSoloStart: true });
    forge.mode.getTeamManager().removePlayer("sentinel");
    expect(forge.mode.getTeamManager().canStartGame()).toBe(true);
    expect(ordinary.mode.getTeamManager().canStartGame()).toBe(false);
  });
});

describe("Search & Destroy round and match", () => {
  it("runs a round, increments score, resets, then ends the match", () => {
    const { match, mode, room } = makeSearchDestroyRoom();
    match.startTeamGame();
    expect(room.state.lobbyState).toBe("playing");
    expect(room.state.isRoundActive).toBe(true);
    expect(room.state.currentRound).toBe(1);
    expect(room.players.get("ghost")?.schema.livesRemaining).toBe(GAME_MODES.search_destroy.maxLives);
    expect(room.state.spikeState).toBe("ground");

    const lives = GAME_MODES.search_destroy.maxLives;
    for (let i = 0; i < lives; i++) {
      match.handlePlayerKill("sentinel", "ghost");
    }

    expect(room.state.isRoundActive).toBe(false);
    expect(room.state.ghostsRoundsWon).toBe(1);
    expect(room.state.roundWinnerTeam).toBe("ghosts");
    expect(room.broadcasts.some((b) => b.type === "round_end")).toBe(true);

    room.flushScheduled();
    expect(room.state.currentRound).toBe(2);
    expect(room.state.isRoundActive).toBe(true);
    expect(room.state.spikeState).toBe("ground");
    expect(room.players.get("sentinel")?.schema.isDead).toBe(false);
    expect(room.players.get("sentinel")?.schema.livesRemaining).toBe(lives);
    expect(room.players.get("sentinel")?.schema.hasSpike).toBe(false);

    for (let round = 2; round <= GAME_MODES.search_destroy.roundsToWin; round++) {
      for (let i = 0; i < lives; i++) {
        match.handlePlayerKill("sentinel", "ghost");
      }
      if (round < GAME_MODES.search_destroy.roundsToWin) {
        room.flushScheduled();
      }
    }

    expect(room.state.ghostsRoundsWon).toBe(GAME_MODES.search_destroy.roundsToWin);
    expect(room.state.isGameOver).toBe(true);
    expect(room.state.gameWinnerTeam).toBe("ghosts");
    expect(room.state.lobbyState).toBe("ended");
    expect(mode.getTeamManager().getTeamRoundsWon("ghosts")).toBe(GAME_MODES.search_destroy.roundsToWin);
  });
});

describe("combat to game-mode consequence", () => {
  it("applies a lethal hitscan and scores a Deathmatch kill", () => {
    const { match, room } = makeDeathmatchRoom();
    const victim = room.players.get("victim")!;
    const hit = HealthSystem.applyDamage(victim.schema, 100, "killer", "AR_1", "hitscan");
    expect(hit.killed).toBe(true);
    expect(victim.schema.isDead).toBe(true);

    match.handlePlayerKill("victim", "killer");
    expect(room.players.get("killer")?.schema.kills).toBe(1);
    expect(room.players.get("victim")?.schema.deaths).toBe(1);
    expect(room.broadcasts.some((b) => b.type === "player_killed")).toBe(true);
  });
});
