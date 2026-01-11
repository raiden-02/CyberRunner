// Physics constants (UE values → TS)
export const MOVE = {
  MaxSprintSpeed: 7.5,    // UE 750 uu/s ~ 7.5 m/s
  WalkMaxSpeed:   5.0,    // UE 500 uu/s
  JumpImpulse:    5.5,    // tune to your mass for ~1.2–1.6m jump
};

// Phase 3: Crouch constants
export const CROUCH = {
  MaxSpeed:       3.0,    // Slower movement while crouched
  HeightScale:    0.6,    // Crouch reduces height to 60% of standing
};

export const SLIDE = {
  MinSlideSpeed:  4.0,    // UE: 400 units ≈ 4.0 m/s (below walking speed, requires sprint flag)
  MaxSlideSpeed:  12.0,   // Keep higher for satisfying slide distance (UE: 400 was too limiting)
  EnterImpulse:   4.0,    // UE: 400 units ≈ 4.0 m/s initial boost
  GravityForce:   40.0,   // UE: 4000 units ≈ 40.0 m/s² extra downforce
  FrictionFactor: 0.06,   // UE: 0.06 multiplier on ground friction
  Braking:        10.0,   // UE: 1000 units ≈ 10.0 m/s² deceleration (corrected from 8.0)
  ExitThreshold:  2.0,    // Speed below which slide ends
};

export const PRONE = {
  EnterHold:      0.20,   // seconds you must hold crouch
  SlideEnterImpulse: 3.0,
  MaxProneSpeed:  3.0,
  Braking:        25.0,
};

export const DASH = {
  Cooldown:       2.0,
  AuthCooldown:   0.9,
  Impulse:        12.0,   
  UpwardBoost:   1.5,    
};

export const MANTLE = {
  MaxDistance:    2.0,    // meters ahead to look for wall/ledge
  ReachHeight:    0.5,
  MinDepth:       0.3,
  MinWallSteepDeg:75,
  MaxSurfaceDeg:  40,
  MaxAlignDeg:    45,
  // Mantle durations (root-motion analogue)
  MinDuration:    0.10,
  MaxDuration:    0.25,
};

export const WALLRUN = {
  MinSpeed:       2.0,
  MaxSpeed:       8.0,
  MaxVertical:    2.0,
  DisengageDeg:   75,
  MagnetForce:    20.0,
  MinHeight:      0.5,
  EjectForce:     3.0,
  GravityScaleAlongInput: (tangentDot: number) => {
    // UE uses curve; here a simple map: when pushing forward, gravity reduced
    // tangentDot in [-1..1] (alignment of accel to velocity)
    return tangentDot > 0 ? 0.2 : 0.6;
  }
};

// Character capsule (approx UE defaults)
export const CAPSULE = {
  Radius:      0.35,
  HalfHeight:  0.90,
  ProneHalf:   0.35,
  CrouchHalf:  0.60,
};




