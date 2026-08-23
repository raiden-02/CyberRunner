import { describe, expect, it } from "vitest";
import { getGameplayMap } from "../../shared/world/map-registry.js";
import { GameState } from "../src/GameState.js";
import { PlayerState } from "../src/PlayerState.js";
import { SpikeManager } from "../src/game-modes/spike-manager.js";
import { teamMaySpikeAction } from "../src/game-modes/spike-rules.js";

const map = getGameplayMap("map-contract-smoke");
const siteA = map.uploadTerminals![0];

function playerAt(x: number, z: number): PlayerState {
  const p = new PlayerState();
  p.x = x;
  p.z = z;
  return p;
}

function groundSpike(state: GameState): void {
  state.spikeState = "ground";
  state.spikeX = map.spikeSpawnLocation!.x;
  state.spikeZ = map.spikeSpawnLocation!.z;
}

describe("spike lifecycle", () => {
  it("lets a Ghost pick up a ground spike and rejects Sentinel pickup at the room gate", () => {
    const spike = new SpikeManager(map.uploadTerminals);
    const state = new GameState();
    groundSpike(state);
    const ghost = playerAt(state.spikeX, state.spikeZ);
    expect(teamMaySpikeAction("ghosts", "pickup")).toBe(true);
    expect(spike.pickupSpike("ghost", state, ghost)).toBe(true);
    expect(state.spikeState).toBe("carried");
    expect(ghost.hasSpike).toBe(true);

    const dropped = new GameState();
    groundSpike(dropped);
    const sentinel = playerAt(dropped.spikeX, dropped.spikeZ);
    expect(teamMaySpikeAction("sentinels", "pickup")).toBe(false);
    expect(teamMaySpikeAction("sentinels", "upload")).toBe(false);
    expect(teamMaySpikeAction("ghosts", "decrypt")).toBe(false);
    expect(spike.pickupSpike("sentinel", dropped, sentinel)).toBe(true);
  });

  it("drops the spike on carrier death and keeps planted spikes planted", () => {
    const spike = new SpikeManager(map.uploadTerminals);
    const state = new GameState();
    const carrier = playerAt(3, 4);
    carrier.hasSpike = true;
    const players = new Map([["ghost", { schema: carrier }]]);
    state.spikeState = "carried";
    state.spikeCarrierId = "ghost";

    spike.onCarrierDeath("ghost", "sentinel", state, players);
    expect(state.spikeState).toBe("dropped");
    expect(state.spikeX).toBe(3);
    expect(state.spikeZ).toBe(4);
    expect(carrier.hasSpike).toBe(false);
    expect(state.spikeCarrierId).toBe("");

    const planted = new GameState();
    planted.spikeState = "uploaded";
    planted.spikeCarrierId = "ghost";
    const planter = playerAt(siteA.x, siteA.z);
    planter.hasSpike = true;
    spike.onCarrierDeath("ghost", "sentinel", planted, new Map([["ghost", { schema: planter }]]));
    expect(planted.spikeState).toBe("uploaded");
  });

  it("uploads at a valid site, decrypts, or detonates", () => {
    const spike = new SpikeManager(map.uploadTerminals);
    const state = new GameState();
    const ghost = playerAt(siteA.x, siteA.z);
    ghost.hasSpike = true;
    state.spikeState = "carried";
    state.spikeCarrierId = "ghost";
    const players = new Map([["ghost", { schema: ghost }]]);

    expect(spike.startUpload("ghost", state, ghost, siteA)).toBe(true);
    expect(state.spikeState).toBe("uploading");
    for (let i = 0; i < 240; i++) spike.update(1 / 60, state, players);
    expect(state.spikeState).toBe("uploaded");

    const sentinel = playerAt(siteA.x, siteA.z);
    players.set("sentinel", { schema: sentinel });
    expect(teamMaySpikeAction("sentinels", "decrypt")).toBe(true);
    expect(spike.startDecrypt("sentinel", state, sentinel)).toBe(true);
    for (let i = 0; i < 420; i++) spike.update(1 / 60, state, players);
    expect(state.spikeState).toBe("decrypted");
  });

  it("detonates if nobody decrypts in time", () => {
    const spike = new SpikeManager(map.uploadTerminals);
    const state = new GameState();
    const ghost = playerAt(siteA.x, siteA.z);
    ghost.hasSpike = true;
    state.spikeState = "carried";
    state.spikeCarrierId = "ghost";
    const players = new Map([["ghost", { schema: ghost }]]);
    spike.startUpload("ghost", state, ghost, siteA);
    for (let i = 0; i < 240; i++) spike.update(1 / 60, state, players);
    expect(state.spikeState).toBe("uploaded");

    let ended = { ended: false, reason: "" as string | undefined };
    for (let i = 0; i < 2700; i++) {
      ended = spike.update(1 / 60, state, players);
      if (ended.ended) break;
    }
    expect(ended.ended).toBe(true);
    expect(ended.reason).toBe("spike_detonated");
  });

  it("cancels upload and clears transient state on reset", () => {
    const spike = new SpikeManager(map.uploadTerminals);
    const state = new GameState();
    const ghost = playerAt(siteA.x, siteA.z);
    ghost.hasSpike = true;
    state.spikeState = "carried";
    state.spikeCarrierId = "ghost";
    spike.startUpload("ghost", state, ghost, siteA);
    spike.cancelUpload("ghost", state, ghost);
    expect(state.spikeState).toBe("carried");
    expect(ghost.isUploading).toBe(false);

    spike.reset(state);
    expect(state.spikeState).toBe("ground");
    expect(state.spikeCarrierId).toBe("");
    expect(state.spikeUploadProgress).toBe(0);
    expect(state.spikeDecryptProgress).toBe(0);
    expect(state.spikeDetonationTimer).toBe(0);
    expect(state.spikeTerminalId).toBe("");
  });
});
