-- Shared Wave 1 staging layer for master-data migration.
-- Source rows are validated and approved here before any canonical master table is changed.
BEGIN;

CREATE TABLE IF NOT EXISTS master_data_import_batch (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_no text NOT NULL UNIQUE,
  wave_no integer NOT NULL DEFAULT 1 CHECK (wave_no > 0),
  entity_kind text NOT NULL CHECK (entity_kind IN (
    'OPERATING_SITE', 'TRAIN', 'VENDOR', 'WAREHOUSE', 'WAREHOUSE_BIN',
    'MATERIAL', 'EQUIPMENT_GROUP', 'EQUIPMENT_ALIAS'
  )),
  source_type text NOT NULL CHECK (source_type IN ('CSV', 'EXCEL', 'JSON', 'DATABASE', 'MANUAL')),
  source_file_name text NOT NULL,
  source_file_hash text CHECK (source_file_hash IS NULL OR source_file_hash ~ '^[0-9A-Fa-f]{64}$'),
  source_sheet text,
  source_authority text,
  expected_rows integer CHECK (expected_rows IS NULL OR expected_rows >= 0),
  import_status text NOT NULL DEFAULT 'DRAFT' CHECK (import_status IN (
    'DRAFT', 'VALIDATED', 'APPROVED', 'APPLIED', 'REJECTED', 'CANCELLED'
  )),
  created_by uuid REFERENCES app_user(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  validated_at timestamptz,
  approved_by uuid REFERENCES app_user(id),
  approved_at timestamptz,
  applied_by uuid REFERENCES app_user(id),
  applied_at timestamptz,
  notes text
);

CREATE TABLE IF NOT EXISTS master_data_import_row (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES master_data_import_batch(id) ON DELETE CASCADE,
  source_row_no integer NOT NULL CHECK (source_row_no > 0),
  natural_key text NOT NULL CHECK (btrim(natural_key) <> ''),
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  normalized_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  payload_hash text CHECK (payload_hash IS NULL OR payload_hash ~ '^[0-9A-Fa-f]{64}$'),
  validation_status text NOT NULL DEFAULT 'PENDING' CHECK (validation_status IN (
    'PENDING', 'VALID', 'WARNING', 'INVALID', 'APPROVED', 'REJECTED', 'APPLIED'
  )),
  validation_messages jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(validation_messages) = 'array'),
  proposed_action text CHECK (proposed_action IS NULL OR proposed_action IN (
    'INSERT', 'UPDATE', 'NO_CHANGE', 'REJECT'
  )),
  target_id uuid,
  reviewed_by uuid REFERENCES app_user(id),
  reviewed_at timestamptz,
  applied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (batch_id, source_row_no),
  UNIQUE (batch_id, natural_key)
);

CREATE INDEX IF NOT EXISTS idx_master_data_import_batch_status
  ON master_data_import_batch(entity_kind, import_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_master_data_import_row_status
  ON master_data_import_row(batch_id, validation_status, source_row_no);
CREATE INDEX IF NOT EXISTS idx_master_data_import_row_target
  ON master_data_import_row(target_id) WHERE target_id IS NOT NULL;

CREATE OR REPLACE FUNCTION assert_master_data_import_batch_transition()
RETURNS trigger AS $$
DECLARE
  transition_allowed boolean;
BEGIN
  IF OLD.import_status IN ('APPLIED', 'REJECTED', 'CANCELLED') THEN
    IF NEW IS DISTINCT FROM OLD THEN
      RAISE EXCEPTION 'Terminal master-data import batch cannot be changed: %', OLD.batch_no
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  transition_allowed := CASE OLD.import_status
    WHEN 'DRAFT' THEN NEW.import_status IN ('DRAFT', 'VALIDATED', 'REJECTED', 'CANCELLED')
    WHEN 'VALIDATED' THEN NEW.import_status IN ('DRAFT', 'VALIDATED', 'APPROVED', 'REJECTED', 'CANCELLED')
    WHEN 'APPROVED' THEN NEW.import_status IN ('APPROVED', 'APPLIED', 'REJECTED', 'CANCELLED')
    ELSE false
  END;
  IF NOT transition_allowed THEN
    RAISE EXCEPTION 'Invalid master-data import batch transition: % -> %', OLD.import_status, NEW.import_status
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.import_status <> 'VALIDATED' AND NEW.import_status = 'VALIDATED' THEN
    NEW.validated_at := COALESCE(NEW.validated_at, now());
  END IF;
  IF OLD.import_status <> 'APPROVED' AND NEW.import_status = 'APPROVED' THEN
    NEW.approved_at := COALESCE(NEW.approved_at, now());
  END IF;
  IF OLD.import_status <> 'APPLIED' AND NEW.import_status = 'APPLIED' THEN
    NEW.applied_at := COALESCE(NEW.applied_at, now());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_master_data_import_batch_transition ON master_data_import_batch;
CREATE TRIGGER trg_master_data_import_batch_transition
BEFORE UPDATE ON master_data_import_batch
FOR EACH ROW EXECUTE FUNCTION assert_master_data_import_batch_transition();

CREATE OR REPLACE FUNCTION assert_master_data_import_row_mutable()
RETURNS trigger AS $$
DECLARE
  parent_status text;
BEGIN
  SELECT import_status INTO parent_status
    FROM master_data_import_batch
   WHERE id = COALESCE(NEW.batch_id, OLD.batch_id);
  IF parent_status IN ('APPLIED', 'REJECTED', 'CANCELLED') THEN
    RAISE EXCEPTION 'Rows of terminal master-data import batch cannot be changed'
      USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.validation_status = 'APPLIED' AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'Applied master-data import row cannot be changed'
      USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_master_data_import_row_mutable ON master_data_import_row;
CREATE TRIGGER trg_master_data_import_row_mutable
BEFORE INSERT OR UPDATE OR DELETE ON master_data_import_row
FOR EACH ROW EXECUTE FUNCTION assert_master_data_import_row_mutable();

CREATE OR REPLACE VIEW v_master_data_import_batch_summary AS
SELECT
  batch.id, batch.batch_no, batch.wave_no, batch.entity_kind, batch.source_type,
  batch.source_file_name, batch.source_file_hash, batch.source_sheet,
  batch.source_authority, batch.expected_rows, batch.import_status,
  batch.created_at, batch.validated_at, batch.approved_at, batch.applied_at,
  count(row.id)::integer AS staged_rows,
  count(*) FILTER (WHERE row.validation_status IN ('VALID', 'APPROVED', 'APPLIED'))::integer AS valid_rows,
  count(*) FILTER (WHERE row.validation_status = 'WARNING')::integer AS warning_rows,
  count(*) FILTER (WHERE row.validation_status IN ('INVALID', 'REJECTED'))::integer AS invalid_rows,
  count(*) FILTER (WHERE row.validation_status = 'APPLIED')::integer AS applied_rows,
  count(*) FILTER (WHERE row.proposed_action = 'INSERT')::integer AS insert_rows,
  count(*) FILTER (WHERE row.proposed_action = 'UPDATE')::integer AS update_rows,
  count(*) FILTER (WHERE row.proposed_action = 'NO_CHANGE')::integer AS unchanged_rows
FROM master_data_import_batch batch
LEFT JOIN master_data_import_row row ON row.batch_id = batch.id
GROUP BY batch.id;

COMMENT ON TABLE master_data_import_batch IS 'Wave 1 主檔搬移批次。保存來源、核准與套用狀態；未核准前不得寫入正式主檔。';
COMMENT ON TABLE master_data_import_row IS 'Wave 1 主檔搬移逐列暫存。保留原始值、正規化值、自然鍵、驗證結果與目標資料 ID。';
COMMENT ON VIEW v_master_data_import_batch_summary IS '主檔搬移批次即時摘要，避免批次計數與逐列狀態失去同步。';

COMMIT;
