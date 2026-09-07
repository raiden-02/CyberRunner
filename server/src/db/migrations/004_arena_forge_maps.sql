-- Personal ArenaForge maps. One JSONB artifact per saved design.

CREATE TABLE IF NOT EXISTS arena_forge_maps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(40) NOT NULL,
  game_mode VARCHAR(32) NOT NULL,
  brief TEXT NOT NULL,
  design_plan JSONB NOT NULL,
  map_definition JSONB NOT NULL,
  map_format_version INTEGER NOT NULL DEFAULT 1,
  source_job_id UUID,
  provider VARCHAR(32),
  model VARCHAR(80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_arena_forge_maps_user_id ON arena_forge_maps(user_id);
CREATE INDEX IF NOT EXISTS idx_arena_forge_maps_user_updated ON arena_forge_maps(user_id, updated_at DESC);

DROP TRIGGER IF EXISTS arena_forge_maps_updated_at ON arena_forge_maps;
CREATE TRIGGER arena_forge_maps_updated_at
  BEFORE UPDATE ON arena_forge_maps
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
