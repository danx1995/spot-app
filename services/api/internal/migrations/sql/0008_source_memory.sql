ALTER TABLE user_places
  ADD COLUMN IF NOT EXISTS source_title text,
  ADD COLUMN IF NOT EXISTS source_excerpt text;
