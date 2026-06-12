export const MOVE = {
  MaxSprintSpeed: 7.5,
  WalkMaxSpeed:   5.0,
  AdsMaxSpeed:    3.0,
  JumpImpulse:    5.5,
};

export const CROUCH = {
  MaxSpeed:       3.0,
  HeightScale:    0.6,
};

export const SLIDE = {
  MinSlideSpeed:  4.0,
  MaxSlideSpeed:  12.0,
  EnterImpulse:   4.0,
  GravityForce:   40.0,
  FrictionFactor: 0.06,
  Braking:        10.0,
  ExitThreshold:  2.0,
};

export const PRONE = {
  EnterHold:      0.20,
  SlideEnterImpulse: 3.0,
  MaxProneSpeed:  3.0,
  Braking:        25.0,
};

export const CAPSULE = {
  Radius:      0.35,
  HalfHeight:  0.90,
  ProneHalf:   0.35,
  CrouchHalf:  0.60,
};

export const HITBOX = {
  Head:       { radius: 0.16, offsetY: 1.00 },
  UpperTorso: { halfExtents: { x: 0.30, y: 0.17, z: 0.18 }, offsetY: 0.60 },
  LowerTorso: { halfExtents: { x: 0.28, y: 0.15, z: 0.16 }, offsetY: 0.25 },
  Arm:        { radius: 0.07, halfHeight: 0.22, offsetX: 0.38, offsetY: 0.55 },
  Leg:        { radius: 0.10, halfHeight: 0.30, offsetX: 0.12, offsetY: -0.55 },
};

export const DAMAGE_MULTIPLIERS = {
  head: 2.0,
  upperTorso: 1.0,
  lowerTorso: 0.95,
  arm: 0.9,
  leg: 0.85,
};
