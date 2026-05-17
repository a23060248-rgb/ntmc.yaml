-- 物料主檔拆解欄位與歷史用量表
-- 用途：
-- 1. 將料號 50.88.0004.LO 拆成 system_code/category_code/sequence_no/type_code
-- 2. 將 111、112、113、114 年/月用量從 material 主檔拆到 material_usage_history
-- 3. 安全庫存維持 material.reorder_point 統一請購點，不分淡海/安坑水位

ALTER TABLE material
  ADD COLUMN IF NOT EXISTS system_code text,
  ADD COLUMN IF NOT EXISTS category_code text,
  ADD COLUMN IF NOT EXISTS category_name text,
  ADD COLUMN IF NOT EXISTS sequence_no text,
  ADD COLUMN IF NOT EXISTS type_code text;

COMMENT ON COLUMN material.part_no IS '正式料號，例如 50.88.0004.LO。';
COMMENT ON COLUMN material.system_code IS '料號第一段系統碼，例如 50、95、96。';
COMMENT ON COLUMN material.category_code IS '料號第二段類別碼，例如 88。';
COMMENT ON COLUMN material.category_name IS '類別名稱，來自料號定義或原始 Excel。';
COMMENT ON COLUMN material.sequence_no IS '料號第三段流水號，例如 0004。';
COMMENT ON COLUMN material.type_code IS '料號第四段型式碼，例如 LO。';
COMMENT ON COLUMN material.reorder_point IS '統一請購點／安全庫存水位。淡海、安坑調用快時先不分場站水位。';

UPDATE material
SET
  system_code = COALESCE(NULLIF(system_code, ''), split_part(part_no, '.', 1)),
  category_code = COALESCE(NULLIF(category_code, ''), split_part(part_no, '.', 2)),
  sequence_no = COALESCE(NULLIF(sequence_no, ''), split_part(part_no, '.', 3)),
  type_code = COALESCE(NULLIF(type_code, ''), split_part(part_no, '.', 4))
WHERE part_no ~ '^[^.]+\.[^.]+\.[^.]+\.[^.]+$';

DO $$
BEGIN
  IF to_regclass('public.material_import_source') IS NOT NULL THEN
    UPDATE material m
    SET category_name = src.category_name
    FROM (
      SELECT part_no, max(category_name) AS category_name
      FROM material_import_source
      WHERE category_name IS NOT NULL AND category_name <> ''
      GROUP BY part_no
    ) src
    WHERE m.part_no = src.part_no
      AND (m.category_name IS NULL OR m.category_name = '');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS material_usage_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id uuid NOT NULL REFERENCES material(id) ON DELETE CASCADE,
  period_type text NOT NULL DEFAULT 'YEAR',
  roc_year integer NOT NULL,
  usage_month integer,
  usage_type text NOT NULL DEFAULT 'ISSUE',
  qty numeric(14, 3) NOT NULL DEFAULT 0,
  amount numeric(14, 2),
  unit text,
  source_type text NOT NULL DEFAULT 'IMPORT',
  source_file text,
  source_row_no integer,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT material_usage_period_type_check CHECK (period_type IN ('YEAR', 'MONTH', 'ROLLING_12M')),
  CONSTRAINT material_usage_month_check CHECK (
    (period_type = 'MONTH' AND usage_month BETWEEN 1 AND 12)
    OR (period_type IN ('YEAR', 'ROLLING_12M') AND usage_month IS NULL)
  ),
  CONSTRAINT material_usage_type_check CHECK (
    usage_type IN ('ISSUE', 'FAULT', 'PM_STANDARD', 'OVERHAUL_STANDARD', 'FORECAST_FAULT', 'BOQ', 'OTHER')
  ),
  CONSTRAINT material_usage_source_type_check CHECK (source_type IN ('IMPORT', 'SYSTEM', 'MANUAL', 'CALCULATED')),
  CONSTRAINT material_usage_unique UNIQUE NULLS NOT DISTINCT (material_id, period_type, roc_year, usage_month, usage_type)
);

COMMENT ON TABLE material_usage_history IS '物料歷史用量統計。111、112、113 年發料量與 114 年各月份用量放這裡，不放 material 主檔。';
COMMENT ON COLUMN material_usage_history.period_type IS 'YEAR=全年統計，MONTH=月統計，ROLLING_12M=近一年滾動統計。';
COMMENT ON COLUMN material_usage_history.roc_year IS '民國年，例如 111、112、113、114。';
COMMENT ON COLUMN material_usage_history.usage_month IS '月份。period_type=MONTH 時必填 1-12；YEAR/ROLLING_12M 時為 NULL。';
COMMENT ON COLUMN material_usage_history.usage_type IS 'ISSUE=發料用量，FAULT=故障用量，PM_STANDARD=預檢標準用量，OVERHAUL_STANDARD=大修標準用量，FORECAST_FAULT=預估故障用量，BOQ=BOQ 基準量，OTHER=其他。';
COMMENT ON COLUMN material_usage_history.source_type IS 'IMPORT=從 Excel 匯入，SYSTEM=由工單或庫存異動統計，MANUAL=人工輸入，CALCULATED=系統推算。';

CREATE INDEX IF NOT EXISTS idx_material_code ON material(system_code, category_code, type_code);
CREATE INDEX IF NOT EXISTS idx_material_usage_material_period ON material_usage_history(material_id, period_type, roc_year, usage_month);
CREATE INDEX IF NOT EXISTS idx_material_usage_type_period ON material_usage_history(usage_type, period_type, roc_year, usage_month);

DROP VIEW IF EXISTS v_material_stock_summary;

CREATE VIEW v_material_stock_summary AS
SELECT
  m.id AS material_id,
  m.part_no,
  m.material_name,
  m.system_code,
  m.category_code,
  m.category_name,
  m.type_code,
  m.unit,
  m.safety_level,
  m.reorder_point,
  COALESCE(SUM(CASE WHEN ib.stock_status = 'AVAILABLE' THEN ib.qty ELSE 0 END), 0) AS available_qty,
  COALESCE(SUM(CASE WHEN ib.stock_status = 'ISSUED' THEN ib.qty ELSE 0 END), 0) AS issued_qty,
  COALESCE(SUM(CASE WHEN ib.stock_status = 'IN_USE' THEN ib.qty ELSE 0 END), 0) AS in_use_qty,
  COALESCE(SUM(CASE WHEN ib.stock_status IN ('QUARANTINE', 'REPAIR', 'SCRAPPED') THEN ib.qty ELSE 0 END), 0) AS unavailable_qty,
  COALESCE(SUM(ib.qty), 0) AS total_tracked_qty,
  CASE
    WHEN COALESCE(SUM(CASE WHEN ib.stock_status = 'AVAILABLE' THEN ib.qty ELSE 0 END), 0) <= m.reorder_point THEN '需請購'
    ELSE '充足'
  END AS stock_advice
FROM material m
LEFT JOIN inventory_balance ib ON ib.material_id = m.id
GROUP BY m.id, m.part_no, m.material_name, m.system_code, m.category_code, m.category_name, m.type_code, m.unit, m.safety_level, m.reorder_point;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_material_usage_history_updated_at'
  ) THEN
    EXECUTE 'CREATE TRIGGER trg_material_usage_history_updated_at
      BEFORE UPDATE ON material_usage_history
      FOR EACH ROW EXECUTE FUNCTION set_updated_at()';
  END IF;
END $$;
