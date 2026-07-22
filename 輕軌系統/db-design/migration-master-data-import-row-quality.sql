BEGIN;

ALTER TABLE master_data_import_row
  DROP CONSTRAINT IF EXISTS master_data_import_row_batch_id_natural_key_key;

ALTER TABLE master_data_import_row
  DROP CONSTRAINT IF EXISTS master_data_import_row_natural_key_check;

ALTER TABLE master_data_import_row
  ALTER COLUMN natural_key DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_master_data_import_row_natural_key
  ON master_data_import_row(batch_id, natural_key)
  WHERE natural_key IS NOT NULL;

COMMENT ON COLUMN master_data_import_row.natural_key IS
  'Normalized business key. Nullable so invalid source rows remain available for review; duplicates are retained and reported by validation.';

COMMIT;
