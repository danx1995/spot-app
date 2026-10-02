ALTER TABLE user_places
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE collection_places
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS user_places_user_saved_idx
  ON user_places(user_id, saved_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS user_places_user_status_idx
  ON user_places(user_id, status, saved_at DESC);

CREATE INDEX IF NOT EXISTS collections_owner_created_idx
  ON collections(owner_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS collection_places_order_idx
  ON collection_places(collection_id, sort_order, created_at);
