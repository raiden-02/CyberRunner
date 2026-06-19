import { beforeAll, describe, expect, it } from "vitest";
import { LocalPlayer } from "../../client/src/player/LocalPlayer.ts";
import { initRapier } from "../../client/src/physics/PhysicsWorld.ts";
import type { InputMsg } from "../../shared/movement/types.js";
import { getGameplayMap } from "../../shared/world/map-registry.js";

const MAP = getGameplayMap("shoot-house-neon");

function holdForward(seq: number): InputMsg {
  return {
    seq,
    moveX: 0,
    moveZ: 1,
    lookYaw: 0,
    lookPitch: 0,
    sprint: false,
    aiming: false,
    crouchPressed: false,
    crouchReleased: false,
    crouchHeld: false,
    jumpPressed: false,
  };
}

describe("respawn prediction", () => {
  beforeAll(async () => {
    await initRapier();
  });

  it("does not buffer movement while dead, then snaps to spawn", () => {
    const player = new LocalPlayer({} as any);
    player.configureMap(MAP);
    player.setInitialPosition(0, 1.25, 0);

    player.isDead = true;
    for (let seq = 1; seq <= 180; seq++) {
      player.applyFixedTick(holdForward(seq), true);
    }
    expect(player.getPendingInputCount()).toBe(0);
    expect(player.getCapsuleCenter().z).toBeCloseTo(0, 4);

    player.hardResetTo(8, 1.25, -12);
    player.isDead = false;
    expect(player.getPendingInputCount()).toBe(0);
    expect(player.getCapsuleCenter()).toEqual({ x: 8, y: 1.25, z: -12 });
  });
});
