// Physics constants - MUST match server/src/physics/constants.ts exactly

export const MOVE = {
  MaxSprintSpeed: 7.5,
  WalkMaxSpeed: 5.0,
  JumpImpulse: 5.5,
};

export const CROUCH = {
  MaxSpeed: 3.0,
  HeightScale: 0.6,
};

export const SLIDE = {
  MinSlideSpeed: 4.0,
  MaxSlideSpeed: 12.0,
  EnterImpulse: 4.0,
  GravityForce: 40.0,
  FrictionFactor: 0.06,
  Braking: 10.0,
  ExitThreshold: 2.0,
};

export const PRONE = {
  EnterHold: 0.20,
  SlideEnterImpulse: 3.0,
  MaxProneSpeed: 3.0,
  Braking: 25.0,
};

export const DASH = {
  Cooldown: 2.0,
  AuthCooldown: 0.9,
  Impulse: 12.0,
  UpwardBoost: 1.5,
};

export const CAPSULE = {
  Radius: 0.35,
  HalfHeight: 0.90,
  ProneHalf: 0.35,
  CrouchHalf: 0.60,
};
