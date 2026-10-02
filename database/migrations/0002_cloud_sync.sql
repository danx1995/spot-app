ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_guest boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

CREATE INDEX IF NOT EXISTS users_guest_idx
  ON users(is_guest)
  WHERE is_guest = true;

CREATE TABLE IF NOT EXISTS user_state_snapshots (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  revision bigint NOT NULL DEFAULT 0,
  state jsonb NOT NULL DEFAULT '{"selected_city":"spb","saved_spots":[],"collections":[]}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_state_snapshots_updated_idx
  ON user_state_snapshots(updated_at DESC);
