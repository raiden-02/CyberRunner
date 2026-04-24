// Collision layers (membership bits)
export const LAYER = {
  WORLD:   0b0001,
  PLAYER:  0b0010,
  HITBOX:  0b0100,
  PROJECTILE: 0b1000,
};

// Collision filters (what each layer collides with)
export const FILTER = {
  WORLD:      LAYER.PLAYER | LAYER.PROJECTILE,
  PLAYER:     LAYER.WORLD,
  HITBOX:     0,
  PROJECTILE: LAYER.WORLD,
};

export function makeCollisionGroups(membership: number, filter: number): number {
  return (membership << 16) | filter;
}

export const COLLISION_GROUPS = {
  WORLD:      makeCollisionGroups(LAYER.WORLD, FILTER.WORLD),
  PLAYER:     makeCollisionGroups(LAYER.PLAYER, FILTER.PLAYER),
  HITBOX:     makeCollisionGroups(LAYER.HITBOX, FILTER.HITBOX),
  PROJECTILE: makeCollisionGroups(LAYER.PROJECTILE, FILTER.PROJECTILE),
};
