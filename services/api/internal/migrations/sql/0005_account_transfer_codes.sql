CREATE TABLE IF NOT EXISTS account_transfer_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash bytea NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS account_transfer_codes_user_idx
  ON account_transfer_codes(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS account_transfer_codes_expiry_idx
  ON account_transfer_codes(expires_at)
  WHERE used_at IS NULL;
