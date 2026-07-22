BEGIN;

CREATE TABLE IF NOT EXISTS master_data_import_issue_resolution (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES master_data_import_batch(id) ON DELETE CASCADE,
  issue_code text NOT NULL CHECK (btrim(issue_code) <> ''),
  issue_key text NOT NULL CHECK (btrim(issue_key) <> ''),
  affected_rows integer NOT NULL CHECK (affected_rows > 0),
  issue_evidence jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(issue_evidence) = 'object'),
  proposed_resolution jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(proposed_resolution) = 'object'),
  resolution_status text NOT NULL DEFAULT 'PENDING'
    CHECK (resolution_status IN ('PENDING', 'APPROVED', 'REJECTED')),
  review_notes text,
  reviewed_by uuid REFERENCES app_user(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (batch_id, issue_code, issue_key)
);

CREATE INDEX IF NOT EXISTS idx_master_data_import_issue_resolution_status
  ON master_data_import_issue_resolution(batch_id, resolution_status, issue_code, issue_key);

CREATE OR REPLACE FUNCTION assert_master_data_import_issue_resolution_mutable()
RETURNS trigger AS $$
DECLARE
  parent_status text;
BEGIN
  SELECT import_status INTO parent_status
    FROM master_data_import_batch
   WHERE id = COALESCE(NEW.batch_id, OLD.batch_id);
  IF parent_status IN ('APPLIED', 'REJECTED', 'CANCELLED') THEN
    RAISE EXCEPTION 'Issue resolutions of terminal import batches cannot be changed'
      USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.resolution_status IN ('APPROVED', 'REJECTED')
     AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'Reviewed issue resolution cannot be changed'
      USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  NEW.updated_at := now();
  IF NEW.resolution_status IN ('APPROVED', 'REJECTED') AND OLD.resolution_status = 'PENDING' THEN
    NEW.reviewed_at := COALESCE(NEW.reviewed_at, now());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_master_data_import_issue_resolution_mutable
  ON master_data_import_issue_resolution;
CREATE TRIGGER trg_master_data_import_issue_resolution_mutable
BEFORE INSERT OR UPDATE OR DELETE ON master_data_import_issue_resolution
FOR EACH ROW EXECUTE FUNCTION assert_master_data_import_issue_resolution_mutable();

CREATE OR REPLACE VIEW v_master_data_import_issue_resolution_summary AS
SELECT
  batch.id AS batch_id,
  batch.batch_no,
  count(resolution.id)::integer AS issue_groups,
  count(*) FILTER (WHERE resolution.resolution_status = 'PENDING')::integer AS pending_groups,
  count(*) FILTER (WHERE resolution.resolution_status = 'APPROVED')::integer AS approved_groups,
  count(*) FILTER (WHERE resolution.resolution_status = 'REJECTED')::integer AS rejected_groups,
  COALESCE(sum(resolution.affected_rows), 0)::integer AS affected_rows
FROM master_data_import_batch batch
LEFT JOIN master_data_import_issue_resolution resolution ON resolution.batch_id = batch.id
GROUP BY batch.id;

COMMIT;
