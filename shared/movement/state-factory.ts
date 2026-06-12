import type { IMovementState, MovementStateSnapshot } from "./types.js";
import { MovementState } from "./types.js";
import { WalkingState } from "./states/walking.js";
import { CrouchingState } from "./states/crouching.js";
import { SlidingState } from "./states/sliding.js";
import { ProneState } from "./states/prone.js";
import type { BaseState } from "./states/base.js";

export class StateFactory {
  createWalkingState(): IMovementState {
    return this.attach(new WalkingState());
  }

  createCrouchingState(): IMovementState {
    return this.attach(new CrouchingState());
  }

  createSlidingState(): IMovementState {
    return this.attach(new SlidingState());
  }

  createProneState(fromSlide = false): IMovementState {
    return this.attach(new ProneState(fromSlide));
  }

  createFromSnapshot(data: MovementStateSnapshot): IMovementState {
    let state: IMovementState;
    switch (data.kind) {
      case MovementState.Crouching:
        state = this.createCrouchingState();
        break;
      case MovementState.Sliding:
        state = this.createSlidingState();
        break;
      case MovementState.Prone:
        state = this.createProneState(false);
        break;
      default:
        state = this.createWalkingState();
        break;
    }
    state.applySnapshot(data);
    return state;
  }

  private attach(state: BaseState): IMovementState {
    state.attachFactory(this);
    return state;
  }
}

export const stateFactory = new StateFactory();
