ALTER TABLE collections
  ADD COLUMN IF NOT EXISTS route_plan jsonb NOT NULL DEFAULT '{}'::jsonb;
