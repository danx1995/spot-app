CREATE TABLE IF NOT EXISTS place_shares (
  id text PRIMARY KEY,
  place_id uuid NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(created_by, place_id)
);

CREATE INDEX IF NOT EXISTS place_shares_place_idx
  ON place_shares(place_id);

CREATE INDEX IF NOT EXISTS place_shares_creator_idx
  ON place_shares(created_by, created_at DESC);
