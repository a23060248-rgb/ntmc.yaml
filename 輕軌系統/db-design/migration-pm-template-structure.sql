-- Structured PM sections, controlled import staging, and immutable printed snapshots.
-- Apply through the migration ledger only. Do not run against a formal database without approval.
BEGIN;

CREATE TABLE IF NOT EXISTS pm_template_section (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pm_template_id uuid NOT NULL REFERENCES pm_template(id) ON DELETE CASCADE,
  section_code text NOT NULL,
  section_name text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  display_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pm_template_id, section_code)
);

CREATE INDEX IF NOT EXISTS idx_pm_template_section_template
  ON pm_template_section(pm_template_id, is_active, sort_order, section_code);

-- Preserve the legacy display columns while making every check item belong to a managed section.
ALTER TABLE pm_template_check_item
  ADD COLUMN IF NOT EXISTS section_id uuid REFERENCES pm_template_section(id) ON DELETE RESTRICT;

WITH source_sections AS (
  SELECT
    pm_template_id,
    section,
    min(section_sort_order) AS sort_order,
    'SEC-' || upper(substr(md5(section), 1, 10)) AS section_code
  FROM pm_template_check_item
  GROUP BY pm_template_id, section
)
INSERT INTO pm_template_section (
  pm_template_id, section_code, section_name, sort_order, is_active
)
SELECT pm_template_id, section_code, section, sort_order, true
FROM source_sections
ON CONFLICT (pm_template_id, section_code) DO UPDATE SET
  section_name = EXCLUDED.section_name,
  sort_order = LEAST(pm_template_section.sort_order, EXCLUDED.sort_order),
  updated_at = now();

UPDATE pm_template_check_item AS item
SET section_id = section.id,
    section = section.section_name,
    section_sort_order = section.sort_order,
    updated_at = now()
FROM pm_template_section AS section
WHERE item.pm_template_id = section.pm_template_id
  AND item.section_id IS NULL
  AND item.section = section.section_name;

ALTER TABLE pm_template_check_item
  ALTER COLUMN section_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pm_template_check_item_section_id
  ON pm_template_check_item(pm_template_id, section_id, is_active, sort_order, item_no);

CREATE TABLE IF NOT EXISTS pm_template_check_item_import_batch (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pm_template_id uuid REFERENCES pm_template(id) ON DELETE RESTRICT,
  import_kind text NOT NULL DEFAULT 'CHECK_ITEMS'
    CHECK (import_kind IN ('CHECK_ITEMS')),
  source_file_name text NOT NULL,
  source_file_hash text,
  source_profile_code text,
  import_status text NOT NULL DEFAULT 'DRAFT'
    CHECK (import_status IN ('DRAFT', 'VALIDATED', 'APPROVED', 'APPLIED', 'REJECTED')),
  total_rows integer NOT NULL DEFAULT 0 CHECK (total_rows >= 0),
  valid_rows integer NOT NULL DEFAULT 0 CHECK (valid_rows >= 0),
  invalid_rows integer NOT NULL DEFAULT 0 CHECK (invalid_rows >= 0),
  notes text,
  created_by uuid REFERENCES app_user(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  validated_at timestamptz,
  approved_by uuid REFERENCES app_user(id),
  approved_at timestamptz,
  applied_by uuid REFERENCES app_user(id),
  applied_at timestamptz,
  CHECK (valid_rows + invalid_rows <= total_rows)
);

CREATE TABLE IF NOT EXISTS pm_template_check_item_import_row (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES pm_template_check_item_import_batch(id) ON DELETE CASCADE,
  source_row_no integer NOT NULL CHECK (source_row_no > 0),
  source_page_no integer,
  section_code text,
  section_name text NOT NULL,
  item_no text NOT NULL,
  item_description text NOT NULL,
  check_type text NOT NULL DEFAULT 'checkbox'
    CHECK (check_type IN ('checkbox', 'value', 'text')),
  standard_value text,
  unit text,
  requires_value boolean NOT NULL DEFAULT false,
  is_required boolean NOT NULL DEFAULT true,
  min_value numeric,
  max_value numeric,
  sort_order integer NOT NULL DEFAULT 0,
  source_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  validation_status text NOT NULL DEFAULT 'PENDING'
    CHECK (validation_status IN ('PENDING', 'VALID', 'INVALID', 'APPROVED', 'REJECTED', 'APPLIED')),
  validation_messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  reviewed_by uuid REFERENCES app_user(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (batch_id, source_row_no),
  UNIQUE (batch_id, item_no),
  CHECK (min_value IS NULL OR max_value IS NULL OR min_value <= max_value)
);

CREATE INDEX IF NOT EXISTS idx_pm_template_check_item_import_batch_status
  ON pm_template_check_item_import_batch(pm_template_id, import_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pm_template_check_item_import_row_status
  ON pm_template_check_item_import_row(batch_id, validation_status, sort_order, source_row_no);

CREATE OR REPLACE FUNCTION assert_pm_template_structure_draft()
RETURNS trigger AS $$
DECLARE
  target_template_id uuid;
  target_status text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_template_id := OLD.pm_template_id;
  ELSE
    target_template_id := NEW.pm_template_id;
  END IF;

  SELECT lifecycle_status INTO target_status FROM pm_template WHERE id = target_template_id;
  IF target_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'Published or retired PM template structure cannot be changed; create a revision first.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pm_template_section_draft_only ON pm_template_section;
CREATE TRIGGER trg_pm_template_section_draft_only
BEFORE INSERT OR UPDATE ON pm_template_section
FOR EACH ROW EXECUTE FUNCTION assert_pm_template_structure_draft();

DROP TRIGGER IF EXISTS trg_pm_template_check_item_draft_only ON pm_template_check_item;
CREATE TRIGGER trg_pm_template_check_item_draft_only
BEFORE INSERT OR UPDATE ON pm_template_check_item
FOR EACH ROW EXECUTE FUNCTION assert_pm_template_structure_draft();

DROP TRIGGER IF EXISTS trg_pm_template_attachment_draft_only ON pm_template_attachment;
CREATE TRIGGER trg_pm_template_attachment_draft_only
BEFORE INSERT OR UPDATE ON pm_template_attachment
FOR EACH ROW EXECUTE FUNCTION assert_pm_template_structure_draft();

DROP TRIGGER IF EXISTS trg_pm_template_material_draft_only ON pm_template_material;
CREATE TRIGGER trg_pm_template_material_draft_only
BEFORE INSERT OR UPDATE ON pm_template_material
FOR EACH ROW EXECUTE FUNCTION assert_pm_template_structure_draft();

DROP TRIGGER IF EXISTS trg_pm_template_instrument_draft_only ON pm_template_instrument;
CREATE TRIGGER trg_pm_template_instrument_draft_only
BEFORE INSERT OR UPDATE ON pm_template_instrument
FOR EACH ROW EXECUTE FUNCTION assert_pm_template_structure_draft();

DROP TRIGGER IF EXISTS trg_pm_template_wi_draft_only ON pm_template_wi;
CREATE TRIGGER trg_pm_template_wi_draft_only
BEFORE INSERT OR UPDATE ON pm_template_wi
FOR EACH ROW EXECUTE FUNCTION assert_pm_template_structure_draft();

CREATE OR REPLACE FUNCTION assert_printed_pm_snapshot_immutable()
RETURNS trigger AS $$
BEGIN
  IF NEW.template_snapshot IS DISTINCT FROM OLD.template_snapshot
     OR NEW.template_snapshot_hash IS DISTINCT FROM OLD.template_snapshot_hash
     OR NEW.form_template_id IS DISTINCT FROM OLD.form_template_id THEN
    IF EXISTS (
      SELECT 1
      FROM work_order_print_job
      WHERE work_order_id = OLD.work_order_id
        AND job_status IN ('GENERATING', 'READY')
    ) THEN
      RAISE EXCEPTION 'A printed PM work order keeps its original template snapshot.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pm_work_order_printed_snapshot_immutable ON pm_work_order;
CREATE TRIGGER trg_pm_work_order_printed_snapshot_immutable
BEFORE UPDATE ON pm_work_order
FOR EACH ROW EXECUTE FUNCTION assert_printed_pm_snapshot_immutable();

DROP TRIGGER IF EXISTS trg_pm_template_section_updated_at ON pm_template_section;
CREATE TRIGGER trg_pm_template_section_updated_at
BEFORE UPDATE ON pm_template_section
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_pm_template_check_item_import_row_updated_at ON pm_template_check_item_import_row;
CREATE TRIGGER trg_pm_template_check_item_import_row_updated_at
BEFORE UPDATE ON pm_template_check_item_import_row
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE pm_template_section IS 'Versioned PM template sections. Draft templates may be changed; published templates require a new revision.';
COMMENT ON TABLE pm_template_check_item_import_batch IS 'Staging batch for extracted PM check items. Validation and business approval are required before application.';
COMMENT ON TABLE pm_template_check_item_import_row IS 'Imported PM check item candidate with source evidence and review status.';
COMMENT ON COLUMN pm_work_order.template_snapshot IS 'Immutable after a PRE_WORK or POST_COMPLETION Word print job starts.';

COMMIT;
