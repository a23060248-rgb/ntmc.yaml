BEGIN;

ALTER TABLE work_order
  DROP CONSTRAINT IF EXISTS work_order_work_order_type_check;

ALTER TABLE work_order
  ADD CONSTRAINT work_order_work_order_type_check
  CHECK (work_order_type IN ('P', 'C', 'R', 'J'));

ALTER TABLE work_order
  ADD COLUMN IF NOT EXISTS work_order_date date,
  ADD COLUMN IF NOT EXISTS site_code text,
  ADD COLUMN IF NOT EXISTS target_code text,
  ADD COLUMN IF NOT EXISTS daily_sequence integer;

UPDATE work_order
SET
  work_order_date = COALESCE(work_order_date, created_at::date, CURRENT_DATE),
  site_code = COALESCE(site_code, 'D'),
  target_code = COALESCE(target_code, 'TS'),
  daily_sequence = COALESCE(
    daily_sequence,
    CASE
      WHEN work_order_no ~ '-[0-9]{3}$' THEN (regexp_match(work_order_no, '([0-9]{3})$'))[1]::integer
      ELSE 1
    END
  );

ALTER TABLE work_order
  ALTER COLUMN work_order_date SET DEFAULT CURRENT_DATE,
  ALTER COLUMN work_order_date SET NOT NULL,
  ALTER COLUMN site_code SET DEFAULT 'D',
  ALTER COLUMN site_code SET NOT NULL,
  ALTER COLUMN target_code SET DEFAULT 'TS',
  ALTER COLUMN target_code SET NOT NULL,
  ALTER COLUMN daily_sequence SET NOT NULL;

ALTER TABLE work_order
  DROP CONSTRAINT IF EXISTS work_order_site_code_check,
  DROP CONSTRAINT IF EXISTS work_order_daily_sequence_check,
  DROP CONSTRAINT IF EXISTS work_order_no_format;

ALTER TABLE work_order
  ADD CONSTRAINT work_order_site_code_check
  CHECK (site_code IN ('D', 'K')),
  ADD CONSTRAINT work_order_daily_sequence_check
  CHECK (daily_sequence BETWEEN 1 AND 999),
  ADD CONSTRAINT work_order_no_format
  CHECK (work_order_no ~ '^[PCRJ]-[0-9]{7}-[DK]-[A-Z0-9]{2,6}-[0-9]{3}$') NOT VALID;

DO $$
BEGIN
  ALTER TABLE work_order
    ADD CONSTRAINT work_order_daily_sequence_unique
    UNIQUE (work_order_type, work_order_date, site_code, target_code, daily_sequence);
EXCEPTION
  WHEN duplicate_object THEN
    RAISE NOTICE 'work_order_daily_sequence_unique already exists, skipping.';
  WHEN unique_violation THEN
    RAISE NOTICE 'Existing work_order rows have duplicated sequence values. Fix old rows before adding work_order_daily_sequence_unique.';
END $$;

CREATE TABLE IF NOT EXISTS project_work_order (
  work_order_id uuid PRIMARY KEY REFERENCES work_order(id) ON DELETE CASCADE,
  project_code text,
  project_name text NOT NULL,
  project_phase text,
  owner_user_id uuid REFERENCES app_user(id),
  budget_code text,
  start_date date,
  target_finish_date date,
  scope_summary text,
  acceptance_result text,
  form_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb
);

COMMENT ON TABLE work_order IS '所有 P/C/R/J 工單共用主表。工單編號格式固定為 TYPE-YYYMMDD-SITE-TARGET-SEQ，例如 C-1150514-D-TS-031。';
COMMENT ON COLUMN work_order.work_order_no IS '正式工單編號：性質-民國日期-場站-對象-當日流水號。';
COMMENT ON COLUMN work_order.work_order_type IS 'P=預檢，C=故檢，R=維修，J=專案。';
COMMENT ON COLUMN work_order.work_order_date IS '工單日期，用西元 date 保存；顯示編號時轉為民國 YYYMMDD。';
COMMENT ON COLUMN work_order.site_code IS 'D=淡海，K=安坑。';
COMMENT ON COLUMN work_order.target_code IS 'TS=列車；後續可擴充其他對象代碼。';
COMMENT ON COLUMN work_order.daily_sequence IS '當日流水號，顯示時補成三碼，例如 31 顯示為 031。';
COMMENT ON TABLE project_work_order IS 'J 專案工單明細，處理改善案、改造案、批次專案與非例行工作。';

COMMIT;
