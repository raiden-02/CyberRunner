import { IMovementState, MovementCtx } from "./types.js";
import { MovementState } from "../PlayerState.js";

/**
 * StateFactory - Centralized factory for creating movement states
 * This eliminates circular dependencies by providing a single point of state creation
 */
export class StateFactory {
  
  /**
   * Create a Walking state
   */
  createWalkingState(): IMovementState {
    const state = new WalkingStateImpl();
    (state as any).factory = this; // Inject factory reference
    return state;
  }
  
  /**
   * Create a Crouching state  
   */
  createCrouchingState(): IMovementState {
    const state = new CrouchingStateImpl();
    (state as any).factory = this; // Inject factory reference
    return state;
  }
  
  /**
   * Create a Sliding state
   */
  createSlidingState(): IMovementState {
    const state = new SlidingStateImpl();
    (state as any).factory = this; // Inject factory reference
    return state;
  }
  
  /**
   * Create a Prone state
   */
  createProneState(fromSlide: boolean = false): IMovementState {
    const state = new ProneStateImpl(fromSlide);
    (state as any).factory = this; // Inject factory reference
    return state;
  }
}

// Import all the actual state implementations here
// This way, only the factory knows about all states, eliminating circular deps
import { WalkingState as WalkingStateImpl } from "./states/walking.js";
import { CrouchingState as CrouchingStateImpl } from "./states/crouching.js"; 
import { SlidingState as SlidingStateImpl } from "./states/sliding.js";
import { ProneState as ProneStateImpl } from "./states/prone.js";

// Export a singleton factory instance
export const stateFactory = new StateFactory();
