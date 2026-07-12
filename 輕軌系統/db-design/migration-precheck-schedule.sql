-- Precheck schedule data layer.
-- Review before applying. This migration is intentionally not executed by Codex.
BEGIN;

CREATE TABLE IF NOT EXISTS pm_schedule_import_batch (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_no text NOT NULL UNIQUE,
  source_file text,
  source_year integer NOT NULL CHECK (source_year BETWEEN 2000 AND 2200),
  site_code text NOT NULL DEFAULT 'D' CHECK (site_code IN ('D', 'K')),
  target_type text NOT NULL CHECK (target_type IN ('VEHICLE', 'DEPOT_EQUIPMENT')),
  import_status text NOT NULL DEFAULT 'DRAFT'
    CHECK (import_status IN ('DRAFT', 'VALIDATED', 'APPLIED', 'REJECTED')),
  total_rows integer NOT NULL DEFAULT 0,
  valid_rows integer NOT NULL DEFAULT 0,
  invalid_rows integer NOT NULL DEFAULT 0,
  imported_by uuid REFERENCES app_user(id),
  imported_at timestamptz NOT NULL DEFAULT now(),
  applied_at timestamptz,
  raw_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  remark text
);

CREATE TABLE IF NOT EXISTS pm_schedule_item (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_batch_id uuid REFERENCES pm_schedule_import_batch(id),
  schedule_year integer NOT NULL CHECK (schedule_year BETWEEN 2000 AND 2200),
  schedule_month integer NOT NULL CHECK (schedule_month BETWEEN 1 AND 12),
  site_code text NOT NULL DEFAULT 'D' CHECK (site_code IN ('D', 'K')),
  target_type text NOT NULL CHECK (target_type IN ('VEHICLE', 'DEPOT_EQUIPMENT')),
  target_key text NOT NULL,
  target_name text NOT NULL,
  train_id uuid REFERENCES train(id),
  equipment_group_id uuid REFERENCES equipment_group(id),
  pm_level text NOT NULL CHECK (pm_level IN ('1M', '3M', '6M', '1Y', '5Y/1Y')),
  fixed_cycle_months integer CHECK (fixed_cycle_months IS NULL OR fixed_cycle_months IN (1, 3, 6, 12)),
  latest_actual_finish_date date,
  planned_start_date date,
  planned_end_date date,
  lathe_start_date date,
  lathe_end_date date,
  generated_work_order_id uuid REFERENCES work_order(id),
  schedule_status text NOT NULL DEFAULT 'DRAFT'
    CHECK (schedule_status IN ('DRAFT', 'PLANNED', 'PUBLISHED', 'WORK_ORDER_DRAFT', 'PRINTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
  is_published boolean NOT NULL DEFAULT false,
  published_at timestamptz,
  is_manual boolean NOT NULL DEFAULT false,
  is_forced boolean NOT NULL DEFAULT false,
  needs_review boolean NOT NULL DEFAULT false,
  review_reasons text[] NOT NULL DEFAULT ARRAY[]::text[],
  source_row_no integer,
  schedule_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL DEFAULT 1,
  created_by uuid REFERENCES app_user(id),
  updated_by uuid REFERENCES app_user(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (site_code, target_type, target_key, schedule_year, schedule_month)
);

CREATE TABLE IF NOT EXISTS pm_schedule_change_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_item_id uuid NOT NULL REFERENCES pm_schedule_item(id) ON DELETE CASCADE,
  change_type text NOT NULL,
  before_data jsonb,
  after_data jsonb,
  reason text,
  changed_by uuid REFERENCES app_user(id),
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pm_calendar_exception (
  calendar_date date PRIMARY KEY,
  site_code text NOT NULL DEFAULT 'D' CHECK (site_code IN ('D', 'K')),
  day_type text NOT NULL CHECK (day_type IN ('HOLIDAY', 'WORKDAY')),
  name text NOT NULL,
  source text NOT NULL DEFAULT 'MANUAL',
  created_by uuid REFERENCES app_user(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pm_schedule_month
  ON pm_schedule_item(schedule_year, schedule_month, target_type, planned_start_date);
CREATE INDEX IF NOT EXISTS idx_pm_schedule_target
  ON pm_schedule_item(target_type, target_key, planned_start_date DESC);
CREATE INDEX IF NOT EXISTS idx_pm_schedule_status
  ON pm_schedule_item(schedule_status, is_published, needs_review);
CREATE INDEX IF NOT EXISTS idx_pm_schedule_change_item
  ON pm_schedule_change_log(schedule_item_id, changed_at DESC);

DROP TRIGGER IF EXISTS trg_pm_schedule_item_updated_at ON pm_schedule_item;
CREATE TRIGGER trg_pm_schedule_item_updated_at
BEFORE UPDATE ON pm_schedule_item
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_pm_calendar_exception_updated_at ON pm_calendar_exception;
CREATE TRIGGER trg_pm_calendar_exception_updated_at
BEFORE UPDATE ON pm_calendar_exception
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE pm_schedule_import_batch IS '年度或月度預排匯入批次；套用前保留驗證結果。';
COMMENT ON TABLE pm_schedule_item IS '24 個月預檢排程項目。年度表決定級別，最新實際完工日與規則服務決定日期。';
COMMENT ON TABLE pm_schedule_change_log IS '排程匯入、改期、重排、發布與人工強制操作的不可刪異動紀錄。';
COMMENT ON TABLE pm_calendar_exception IS '國定假日、颱風假、臨時假日及補班日覆寫。';

COMMIT;
