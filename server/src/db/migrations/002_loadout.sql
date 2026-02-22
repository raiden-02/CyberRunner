-- Loadout System Migration
-- Adds primary and secondary weapon columns, removes default_weapon_id

-- Add new columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS primary_weapon_id VARCHAR(50) DEFAULT 'AR_1';
ALTER TABLE users ADD COLUMN IF NOT EXISTS secondary_weapon_id VARCHAR(50) DEFAULT 'PISTOL_1';

-- Migrate existing data (copy default_weapon_id to primary_weapon_id)
UPDATE users SET primary_weapon_id = default_weapon_id WHERE primary_weapon_id = 'AR_1' AND default_weapon_id != 'AR_1';

-- Drop old column (commented out for safety - run manually after verifying migration)
-- ALTER TABLE users DROP COLUMN IF EXISTS default_weapon_id;
