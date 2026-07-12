-- P work-package, exact Word output tracking, backfill, attachment, and fault-link data.
-- Review before applying. This migration is intentionally not executed by Codex.
BEGIN;

CREATE TABLE IF NOT EXISTS form_template (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_code text NOT NULL,
  template_name text NOT NULL,
  pm_template_id uuid REFERENCES pm_template(id),
  version_no text NOT NULL,
  source_file_name text NOT NULL,
  storage_path text NOT NULL,
  file_hash text,
  file_format text NOT NULL DEFAULT 'DOC' CHECK (file_format IN ('DOC', 'DOCX')),
  effective_from date,
  effective_to date,
  lifecycle_status text NOT NULL DEFAULT 'DRAFT'
    CHECK (lifecycle_status IN ('DRAFT', 'PUBLISHED', 'RETIRED')),
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES app_user(id),
  published_by uuid REFERENCES app_user(id),
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_code, version_no)
);

ALTER TABLE form_template
  ADD COLUMN IF NOT EXISTS lifecycle_status text NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN IF NOT EXISTS published_by uuid REFERENCES app_user(id),
  ADD COLUMN IF NOT EXISTS published_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'form_template_lifecycle_status_chk'
  ) THEN
    ALTER TABLE form_template
      ADD CONSTRAINT form_template_lifecycle_status_chk
      CHECK (lifecycle_status IN ('DRAFT', 'PUBLISHED', 'RETIRED'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS form_template_field_mapping (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_template_id uuid NOT NULL REFERENCES form_template(id) ON DELETE CASCADE,
  field_key text NOT NULL,
  source_path text NOT NULL,
  word_target_type text NOT NULL DEFAULT 'PLACEHOLDER'
    CHECK (word_target_type IN ('PLACEHOLDER', 'BOOKMARK')),
  word_target text NOT NULL,
  transform_code text,
  default_value text,
  is_required boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (form_template_id, field_key)
);

CREATE TABLE IF NOT EXISTS work_order_print_job (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id uuid NOT NULL REFERENCES work_order(id) ON DELETE CASCADE,
  form_template_id uuid NOT NULL REFERENCES form_template(id),
  print_stage text NOT NULL CHECK (print_stage IN ('PRE_WORK', 'POST_COMPLETION')),
  job_status text NOT NULL DEFAULT 'QUEUED'
    CHECK (job_status IN ('QUEUED', 'GENERATING', 'READY', 'FAILED')),
  copies integer NOT NULL DEFAULT 1 CHECK (copies BETWEEN 1 AND 20),
  input_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  output_file_name text,
  output_path text,
  output_hash text,
  requested_by uuid REFERENCES app_user(id),
  requested_at timestamptz NOT NULL DEFAULT now(),
  generated_at timestamptz,
  error_message text
);

CREATE TABLE IF NOT EXISTS pm_template_attachment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pm_template_id uuid NOT NULL REFERENCES pm_template(id) ON DELETE CASCADE,
  attachment_code text NOT NULL,
  attachment_name text NOT NULL,
  attachment_type text NOT NULL CHECK (attachment_type IN ('SEAT_MAP', 'MEASUREMENT_TABLE', 'OTHER')),
  schema_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pm_template_id, attachment_code)
);

CREATE TABLE IF NOT EXISTS pm_work_order_danger_period (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id uuid NOT NULL REFERENCES work_order(id) ON DELETE CASCADE,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  hours numeric(8,2) GENERATED ALWAYS AS (EXTRACT(epoch FROM (end_at - start_at)) / 3600.0) STORED,
  note text,
  CHECK (end_at > start_at)
);

CREATE TABLE IF NOT EXISTS pm_work_order_attachment_result (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id uuid NOT NULL REFERENCES work_order(id) ON DELETE CASCADE,
  template_attachment_id uuid NOT NULL REFERENCES pm_template_attachment(id) ON DELETE RESTRICT,
  item_key text NOT NULL,
  result_status text NOT NULL DEFAULT '正常' CHECK (result_status IN ('正常', '異常', 'N/A', '未填')),
  result_value jsonb NOT NULL DEFAULT '{}'::jsonb,
  remark text,
  abnormal_action text CHECK (abnormal_action IS NULL OR abnormal_action IN ('CREATE_C', 'UPDATE_C', 'RECORD_ONLY')),
  linked_fault_work_order_id uuid REFERENCES work_order(id),
  abnormal_reason text,
  filled_by uuid REFERENCES app_user(id),
  filled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (work_order_id, template_attachment_id, item_key)
);

ALTER TABLE pm_work_order
  ADD COLUMN IF NOT EXISTS form_template_id uuid REFERENCES form_template(id),
  ADD COLUMN IF NOT EXISTS backfill_status text NOT NULL DEFAULT 'NOT_STARTED'
    CHECK (backfill_status IN ('NOT_STARTED', 'DRAFT', 'IN_PROGRESS', 'COMPLETED')),
  ADD COLUMN IF NOT EXISTS actual_work_date date,
  ADD COLUMN IF NOT EXISTS workforce_count integer,
  ADD COLUMN IF NOT EXISTS workforce_hours numeric(8,2),
  ADD COLUMN IF NOT EXISTS external_service_na boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS external_service_detail text,
  ADD COLUMN IF NOT EXISTS maintenance_result text,
  ADD COLUMN IF NOT EXISTS actual_material_note text,
  ADD COLUMN IF NOT EXISTS backfill_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE pm_template_check_item
  ADD COLUMN IF NOT EXISTS is_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS min_value numeric,
  ADD COLUMN IF NOT EXISTS max_value numeric,
  ADD COLUMN IF NOT EXISTS validation_rule text,
  ADD COLUMN IF NOT EXISTS section_sort_order integer NOT NULL DEFAULT 0;

ALTER TABLE pm_work_order_check_result
  ADD COLUMN IF NOT EXISTS abnormal_action text
    CHECK (abnormal_action IS NULL OR abnormal_action IN ('CREATE_C', 'UPDATE_C', 'RECORD_ONLY')),
  ADD COLUMN IF NOT EXISTS linked_fault_work_order_id uuid REFERENCES work_order(id),
  ADD COLUMN IF NOT EXISTS abnormal_reason text;

ALTER TABLE fault_work_order
  ADD COLUMN IF NOT EXISTS source_pm_work_order_id uuid REFERENCES work_order(id),
  ADD COLUMN IF NOT EXISTS source_check_section text,
  ADD COLUMN IF NOT EXISTS source_check_item text;

CREATE INDEX IF NOT EXISTS idx_form_template_pm_active ON form_template(pm_template_id, is_active, effective_from);
CREATE INDEX IF NOT EXISTS idx_form_template_lifecycle ON form_template(pm_template_id, lifecycle_status, is_active);
CREATE INDEX IF NOT EXISTS idx_print_job_work_order ON work_order_print_job(work_order_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_pm_attachment_result_order ON pm_work_order_attachment_result(work_order_id, result_status);
CREATE INDEX IF NOT EXISTS idx_fault_source_pm ON fault_work_order(source_pm_work_order_id);

DROP TRIGGER IF EXISTS trg_form_template_updated_at ON form_template;
CREATE TRIGGER trg_form_template_updated_at BEFORE UPDATE ON form_template
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_form_template_field_mapping_updated_at ON form_template_field_mapping;
CREATE TRIGGER trg_form_template_field_mapping_updated_at BEFORE UPDATE ON form_template_field_mapping
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_pm_template_attachment_updated_at ON pm_template_attachment;
CREATE TRIGGER trg_pm_template_attachment_updated_at BEFORE UPDATE ON pm_template_attachment
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_pm_work_order_attachment_result_updated_at ON pm_work_order_attachment_result;
CREATE TRIGGER trg_pm_work_order_attachment_result_updated_at BEFORE UPDATE ON pm_work_order_attachment_result
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE form_template IS '原始 Word 範本版本主檔；storage_path 指向不可改版的 DOC/DOCX。';
COMMENT ON TABLE form_template_field_mapping IS '系統欄位對 Word bookmark 或 {{placeholder}} 的對應。';
COMMENT ON TABLE work_order_print_job IS '作業前與完工後每次 Word 產生、列印人、版本、快照與輸出雜湊。';
COMMENT ON TABLE pm_template_attachment IS '預檢附件結構，例如 P1 座椅圖與電磁式軌道煞車六測點。';

COMMIT;
