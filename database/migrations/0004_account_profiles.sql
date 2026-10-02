ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_guest boolean NOT NULL DEFAULT true;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

CREATE INDEX IF NOT EXISTS users_guest_created_idx
  ON users(is_guest, created_at DESC);

CREATE INDEX IF NOT EXISTS users_last_seen_idx
  ON users(last_seen_at DESC);

UPDATE users
SET last_seen_at = COALESCE(last_seen_at, updated_at, created_at)
WHERE last_seen_at IS NULL;
