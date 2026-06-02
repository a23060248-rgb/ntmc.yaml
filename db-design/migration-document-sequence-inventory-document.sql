-- 單號流水表與庫存異動單
-- 原則：
-- 1. 不建立請購單號。
-- 2. 領料、退料、調撥共用 I 庫存異動單號。
-- 3. 單號格式建議：I-1150514-D-MAT-001。

CREATE TABLE IF NOT EXISTS document_sequence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_type text NOT NULL,
  sequence_date date NOT NULL,
  site_code text NOT NULL DEFAULT 'D' CHECK (site_code IN ('D', 'K')),
  target_code text NOT NULL DEFAULT 'TS',
  last_sequence integer NOT NULL DEFAULT 0,
  remark text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT document_sequence_unique UNIQUE (document_type, sequence_date, site_code, target_code)
);

COMMENT ON TABLE document_sequence IS '單號流水控制表。P/C/R/J 工單與 I 庫存異動單都可共用此表產生日流水號。';
COMMENT ON COLUMN document_sequence.document_type IS '文件類型，例如 P、C、R、J、I。I=庫存異動單，不再分領料單號、退料單號、調撥單號。';
COMMENT ON COLUMN document_sequence.sequence_date IS '流水號日期，依文件日期每天重新計算。';
COMMENT ON COLUMN document_sequence.target_code IS '對象代碼。工單常用 TS；庫存異動單建議用 MAT。';
COMMENT ON COLUMN document_sequence.last_sequence IS '該 document_type + date + site + target 已使用到的最大流水號。';

CREATE OR REPLACE FUNCTION next_document_no(
  p_document_type text,
  p_document_date date DEFAULT CURRENT_DATE,
  p_site_code text DEFAULT 'D',
  p_target_code text DEFAULT 'TS'
)
RETURNS text AS $$
DECLARE
  v_next integer;
  v_roc_date text;
BEGIN
  INSERT INTO document_sequence (
    document_type,
    sequence_date,
    site_code,
    target_code,
    last_sequence
  )
  VALUES (
    upper(p_document_type),
    p_document_date,
    upper(p_site_code),
    upper(p_target_code),
    1
  )
  ON CONFLICT (document_type, sequence_date, site_code, target_code)
  DO UPDATE SET
    last_sequence = document_sequence.last_sequence + 1,
    updated_at = now()
  RETURNING last_sequence INTO v_next;

  v_roc_date := lpad((EXTRACT(YEAR FROM p_document_date)::integer - 1911)::text, 3, '0')
    || to_char(p_document_date, 'MMDD');

  RETURN upper(p_document_type)
    || '-' || v_roc_date
    || '-' || upper(p_site_code)
    || '-' || upper(p_target_code)
    || '-' || lpad(v_next::text, 3, '0');
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION next_document_no(text, date, text, text) IS '產生共用文件單號，例如 C-1150514-D-TS-031 或 I-1150514-D-MAT-001。';

CREATE TABLE IF NOT EXISTS inventory_document (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_no text NOT NULL UNIQUE,
  document_type text NOT NULL DEFAULT 'I' CHECK (document_type = 'I'),
  movement_type text NOT NULL CHECK (movement_type IN ('ISSUE', 'RETURN', 'TRANSFER')),
  document_status text NOT NULL DEFAULT 'DRAFT' CHECK (document_status IN ('DRAFT', 'CHECKING', 'APPROVED', 'APPLIED', 'CANCELLED')),
  document_date date NOT NULL DEFAULT CURRENT_DATE,
  site_code text NOT NULL DEFAULT 'D' CHECK (site_code IN ('D', 'K')),
  source_warehouse_id uuid REFERENCES warehouse(id),
  destination_warehouse_id uuid REFERENCES warehouse(id),
  work_order_id uuid REFERENCES work_order(id),
  requested_by uuid REFERENCES app_user(id),
  handled_by uuid REFERENCES app_user(id),
  approved_by uuid REFERENCES app_user(id),
  applied_at timestamptz,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE inventory_document IS '庫存異動單抬頭。領料、退料、調撥共用 I 單號，靠 movement_type 與庫存狀態區分，不分三套單號。';
COMMENT ON COLUMN inventory_document.document_no IS '庫存異動單號，建議格式 I-1150514-D-MAT-001。';
COMMENT ON COLUMN inventory_document.movement_type IS 'ISSUE=領料，RETURN=退料，TRANSFER=調撥。';
COMMENT ON COLUMN inventory_document.document_status IS 'DRAFT 草稿、CHECKING 待確認、APPROVED 已核准、APPLIED 已過帳、CANCELLED 已取消。';
COMMENT ON COLUMN inventory_document.applied_at IS '過帳時間。過帳後才寫入 inventory_transaction 並更新庫存快照。';

CREATE TABLE IF NOT EXISTS inventory_document_line (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_document_id uuid NOT NULL REFERENCES inventory_document(id) ON DELETE CASCADE,
  line_no integer NOT NULL DEFAULT 1,
  material_id uuid NOT NULL REFERENCES material(id),
  asset_id uuid REFERENCES asset(id),
  from_warehouse_id uuid REFERENCES warehouse(id),
  from_warehouse_bin_id uuid REFERENCES warehouse_bin(id),
  from_stock_status text CHECK (from_stock_status IS NULL OR from_stock_status IN ('AVAILABLE', 'ISSUED', 'IN_USE', 'QUARANTINE', 'REPAIR', 'SCRAPPED')),
  to_warehouse_id uuid REFERENCES warehouse(id),
  to_warehouse_bin_id uuid REFERENCES warehouse_bin(id),
  to_stock_status text CHECK (to_stock_status IS NULL OR to_stock_status IN ('AVAILABLE', 'ISSUED', 'IN_USE', 'QUARANTINE', 'REPAIR', 'SCRAPPED')),
  qty numeric(14, 3) NOT NULL CHECK (qty > 0),
  unit text,
  line_status text NOT NULL DEFAULT 'DRAFT' CHECK (line_status IN ('DRAFT', 'APPLIED', 'CANCELLED')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventory_document_line_unique UNIQUE (inventory_document_id, line_no)
);

COMMENT ON TABLE inventory_document_line IS '庫存異動單明細。每列記錄物料、數量、來源位置/狀態與目的位置/狀態。';
COMMENT ON COLUMN inventory_document_line.asset_id IS '若此物料是序號管理品，可指定 asset；一般消耗品可空白。';
COMMENT ON COLUMN inventory_document_line.from_stock_status IS '異動前庫存狀態，例如 AVAILABLE、ISSUED、IN_USE。';
COMMENT ON COLUMN inventory_document_line.to_stock_status IS '異動後庫存狀態，例如領料到分存站為 ISSUED，退回中心倉庫為 AVAILABLE 或 QUARANTINE。';

ALTER TABLE inventory_transaction
  ADD COLUMN IF NOT EXISTS inventory_document_id uuid REFERENCES inventory_document(id),
  ADD COLUMN IF NOT EXISTS inventory_document_line_id uuid REFERENCES inventory_document_line(id);

COMMENT ON COLUMN inventory_transaction.inventory_document_id IS '若異動由庫存異動單過帳產生，指向 inventory_document。';
COMMENT ON COLUMN inventory_transaction.inventory_document_line_id IS '若異動由庫存異動單過帳產生，指向 inventory_document_line。';

CREATE INDEX IF NOT EXISTS idx_inventory_document_no ON inventory_document(document_no);
CREATE INDEX IF NOT EXISTS idx_inventory_document_type_status ON inventory_document(movement_type, document_status);
CREATE INDEX IF NOT EXISTS idx_inventory_document_date ON inventory_document(document_date DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_document_line_document ON inventory_document_line(inventory_document_id);
CREATE INDEX IF NOT EXISTS idx_inventory_document_line_material ON inventory_document_line(material_id);
CREATE INDEX IF NOT EXISTS idx_inventory_tx_document ON inventory_transaction(inventory_document_id);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_document_sequence_updated_at') THEN
    EXECUTE 'CREATE TRIGGER trg_document_sequence_updated_at BEFORE UPDATE ON document_sequence FOR EACH ROW EXECUTE FUNCTION set_updated_at()';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_inventory_document_updated_at') THEN
    EXECUTE 'CREATE TRIGGER trg_inventory_document_updated_at BEFORE UPDATE ON inventory_document FOR EACH ROW EXECUTE FUNCTION set_updated_at()';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_inventory_document_line_updated_at') THEN
    EXECUTE 'CREATE TRIGGER trg_inventory_document_line_updated_at BEFORE UPDATE ON inventory_document_line FOR EACH ROW EXECUTE FUNCTION set_updated_at()';
  END IF;
END $$;
