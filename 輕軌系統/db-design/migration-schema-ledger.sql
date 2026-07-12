-- Migration ledger bootstrap. The rehearsal runner records this file as sequence 0.
-- Applying this DDL is safe to repeat, but checksum drift is rejected by the runner.
BEGIN;

CREATE TABLE IF NOT EXISTS schema_migration (
  migration_id text PRIMARY KEY,
  sequence_no integer NOT NULL UNIQUE,
  file_name text NOT NULL UNIQUE,
  file_sha256 char(64) NOT NULL CHECK (file_sha256 ~ '^[0-9A-F]{64}$'),
  migration_status text NOT NULL
    CHECK (migration_status IN ('APPLIED', 'BASELINED')),
  applied_at timestamptz NOT NULL DEFAULT now(),
  applied_by text NOT NULL DEFAULT current_user,
  database_name text NOT NULL DEFAULT current_database(),
  execution_ms integer,
  note text
);

CREATE INDEX IF NOT EXISTS idx_schema_migration_sequence
  ON schema_migration(sequence_no);

COMMENT ON TABLE schema_migration IS
  'Append-only migration ledger. BASELINED means the runner verified an existing schema before registration.';
COMMENT ON COLUMN schema_migration.file_sha256 IS
  'SHA256 of the exact SQL file. A changed checksum must use a new migration file instead of editing history.';

COMMIT;
