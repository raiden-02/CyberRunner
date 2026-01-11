// Collision layers
export const LAYERS = {
  WORLD: 0b0001,
  PLAYER: 0b0010,
};

export const MASKS = {
  PLAYER: LAYERS.WORLD, // player collides with world only
  WORLD:  LAYERS.PLAYER,
};
