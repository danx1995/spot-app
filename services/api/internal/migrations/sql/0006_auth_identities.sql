CREATE TABLE IF NOT EXISTS auth_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('google', 'apple')),
  provider_subject text NOT NULL,
  email text,
  email_verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider, provider_subject),
  UNIQUE(user_id, provider)
);

CREATE INDEX IF NOT EXISTS auth_identities_user_idx
  ON auth_identities(user_id);

CREATE INDEX IF NOT EXISTS auth_identities_email_idx
  ON auth_identities(lower(email))
  WHERE email IS NOT NULL;
