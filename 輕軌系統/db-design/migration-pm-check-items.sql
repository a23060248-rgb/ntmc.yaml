BEGIN;

-- 預留預檢檢查表數位化資料結構。
-- 目前仍以紙本 Word 檢查表為主；此 migration 只先建立模板項目與工單回填結果表。

CREATE TABLE IF NOT EXISTS pm_template_check_item (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pm_template_id uuid NOT NULL REFERENCES pm_template(id) ON DELETE CASCADE,
  section text NOT NULL,
  item_no text NOT NULL,
  item_description text NOT NULL,
  check_type text NOT NULL DEFAULT 'checkbox'
    CHECK (check_type IN ('checkbox', 'value', 'text')),
  standard_value text,
  unit text,
  default_status text NOT NULL DEFAULT '未填'
    CHECK (default_status IN ('正常', '異常', 'N/A', '未填')),
  requires_value boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pm_template_id, item_no)
);

COMMENT ON TABLE pm_template_check_item IS '預檢模板檢查項目定義。先預留數位化結構，P1/P2/P3/P4 可逐步拆成可回填項目。';
COMMENT ON COLUMN pm_template_check_item.check_type IS 'checkbox=勾選/狀態，value=需填量測值，text=文字備註。';
COMMENT ON COLUMN pm_template_check_item.default_status IS '新工單產生檢查結果時的預設狀態，例如未填或 N/A。';
COMMENT ON COLUMN pm_template_check_item.requires_value IS '此項是否要求填入 result_value；例如絕緣值、壓力值等量測項。';

CREATE INDEX IF NOT EXISTS idx_pm_template_check_item_template
  ON pm_template_check_item(pm_template_id, is_active, sort_order);

CREATE INDEX IF NOT EXISTS idx_pm_template_check_item_section
  ON pm_template_check_item(pm_template_id, section, sort_order);

CREATE TABLE IF NOT EXISTS pm_work_order_check_result (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id uuid NOT NULL REFERENCES work_order(id) ON DELETE CASCADE,
  check_item_id uuid NOT NULL REFERENCES pm_template_check_item(id) ON DELETE RESTRICT,
  result_status text NOT NULL DEFAULT '未填'
    CHECK (result_status IN ('正常', '異常', 'N/A', '未填')),
  result_value text,
  remark text,
  filled_by uuid REFERENCES app_user(id),
  filled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (work_order_id, check_item_id)
);

COMMENT ON TABLE pm_work_order_check_result IS 'P 工單檢查項目實際結果。現階段先預留，未來數位化回填時由 pm_template_check_item 產生。';
COMMENT ON COLUMN pm_work_order_check_result.result_status IS '正常、異常、N/A、未填。';
COMMENT ON COLUMN pm_work_order_check_result.result_value IS '量測值或文字結果；value 型檢查項主要使用此欄位。';

CREATE INDEX IF NOT EXISTS idx_pm_work_order_check_result_order
  ON pm_work_order_check_result(work_order_id);

CREATE INDEX IF NOT EXISTS idx_pm_work_order_check_result_item
  ON pm_work_order_check_result(check_item_id);

CREATE INDEX IF NOT EXISTS idx_pm_work_order_check_result_status
  ON pm_work_order_check_result(result_status);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pm_template_check_item_updated_at ON pm_template_check_item;
CREATE TRIGGER trg_pm_template_check_item_updated_at
BEFORE UPDATE ON pm_template_check_item
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_pm_work_order_check_result_updated_at ON pm_work_order_check_result;
CREATE TRIGGER trg_pm_work_order_check_result_updated_at
BEFORE UPDATE ON pm_work_order_check_result
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;
