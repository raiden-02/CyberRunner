-- ArenaForge hosted live usage. One row per user (or __global__) per UTC day.

CREATE TABLE IF NOT EXISTS arena_forge_usage (
  user_id TEXT NOT NULL,
  usage_date DATE NOT NULL,
  jobs_started INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, usage_date)
);
