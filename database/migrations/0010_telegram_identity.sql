ALTER TABLE auth_identities
  DROP CONSTRAINT IF EXISTS auth_identities_provider_check;

ALTER TABLE auth_identities
  ADD CONSTRAINT auth_identities_provider_check
  CHECK (provider IN ('google', 'apple', 'telegram'));
