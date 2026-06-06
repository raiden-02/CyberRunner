import type { IMovementState, MovementCtx } from "./types.js";

export class StateMachine {
  private current: IMovementState;
  
  constructor(initial: IMovementState) {
    this.current = initial;
  }
  
  set(state: IMovementState, ctx: MovementCtx) {
    this.current?.exit(ctx, state);
    const prev = this.current;
    this.current = state;
    this.current.enter(ctx, prev);
  }
  
  update(ctx: MovementCtx) {
    const nextState = this.current.update(ctx);
    if (nextState && nextState !== this.current) {
      this.set(nextState, ctx);
    }
  }
  
  snapshot() { 
    return this.current; 
  }
}
