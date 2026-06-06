import type { IMovementState } from "./types.js";

// Concrete state imports are at the bottom to break the circular dependency:
// states -> base -> StateFactory interface vs StateFactory class -> states
import { WalkingState } from "./states/walking.js";
import { CrouchingState } from "./states/crouching.js";
import { SlidingState } from "./states/sliding.js";
import { ProneState } from "./states/prone.js";

export class StateFactory {
  createWalkingState(): IMovementState {
    const state = new WalkingState();
    (state as any).factory = this;
    return state;
  }

  createCrouchingState(): IMovementState {
    const state = new CrouchingState();
    (state as any).factory = this;
    return state;
  }

  createSlidingState(): IMovementState {
    const state = new SlidingState();
    (state as any).factory = this;
    return state;
  }

  createProneState(fromSlide = false): IMovementState {
    const state = new ProneState(fromSlide);
    (state as any).factory = this;
    return state;
  }
}

export const stateFactory = new StateFactory();
