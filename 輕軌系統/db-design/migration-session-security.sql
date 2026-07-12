-- Formal session security fields. Existing rehearsal bearer fixtures remain
-- compatible through user_session.token; new logins store only token_hash.
BEGIN;

ALTER TABLE app_user
  ADD COLUMN IF NOT EXISTS password_changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS failed_login_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until timestamptz,
  ADD COLUMN IF NOT EXISTS last_login_at timestamptz;

ALTER TABLE user_session
  ADD COLUMN IF NOT EXISTS token_hash char(64),
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS ip_address text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'app_user_failed_login_count_chk'
  ) THEN
    ALTER TABLE app_user
      ADD CONSTRAINT app_user_failed_login_count_chk
      CHECK (failed_login_count >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_session_token_hash_chk'
  ) THEN
    ALTER TABLE user_session
      ADD CONSTRAINT user_session_token_hash_chk
      CHECK (token_hash IS NULL OR token_hash ~ '^[0-9a-f]{64}$');
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_session_token_hash
  ON user_session(token_hash)
  WHERE token_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_session_active_expiry
  ON user_session(expires_at, revoked_at);

COMMENT ON COLUMN app_user.password_hash IS
  'One-way password hash. Formal login currently uses the versioned scrypt format.';
COMMENT ON COLUMN app_user.failed_login_count IS
  'Consecutive failed formal login attempts; reset after a successful login.';
COMMENT ON COLUMN app_user.locked_until IS
  'Formal login is blocked until this timestamp after repeated failures.';
COMMENT ON COLUMN user_session.token IS
  'Legacy bearer token or opaque row identifier. New credential material is stored only as token_hash.';
COMMENT ON COLUMN user_session.token_hash IS
  'SHA256 of the raw session credential. The raw credential is only sent in an HttpOnly cookie.';
COMMENT ON COLUMN user_session.revoked_at IS
  'Logout/revocation timestamp. A revoked session cannot authenticate.';

COMMIT;
