// Physics constants (UE values → TS)
export const MOVE = {
  MaxSprintSpeed: 7.5,
  WalkMaxSpeed:   5.0,
  AdsMaxSpeed:    3.0,    // Slower than walking when aiming
  JumpImpulse:    5.5,
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

// Character capsule (approx UE defaults) - used for movement physics
export const CAPSULE = {
  Radius:      0.35,
  HalfHeight:  0.90,
  ProneHalf:   0.35,
  CrouchHalf:  0.60,
};

// Collision groups for separating physics from hit detection
export const COLLISION_GROUPS = {
  WORLD: 0x0001,      // Static world geometry
  PLAYER_BODY: 0x0002, // Player movement capsule (physics only)
  HITBOX: 0x0004,      // Hitbox sensors (hit detection only)
  PROJECTILE: 0x0008,  // Projectiles
};

// Body part hitboxes - stacked vertically relative to capsule center (Y=0)
export const HITBOX = {
  Head:       { radius: 0.16, offsetY: 0.50 },
  UpperTorso: { halfExtents: { x: 0.30, y: 0.17, z: 0.18 }, offsetY: 0.17 },
  LowerTorso: { halfExtents: { x: 0.28, y: 0.15, z: 0.16 }, offsetY: -0.15 },
  Arm:        { radius: 0.07, halfHeight: 0.22, offsetX: 0.38, offsetY: 0.10 },
  Leg:        { radius: 0.10, halfHeight: 0.30, offsetX: 0.12, offsetY: -0.60 },
};

// Damage multipliers per body part (head uses weapon-specific headshotMultiplier instead)
export const DAMAGE_MULTIPLIERS = {
  head: 2.0,
  upperTorso: 1.0,
  lowerTorso: 0.95,
  arm: 0.9,
  leg: 0.85,
};
