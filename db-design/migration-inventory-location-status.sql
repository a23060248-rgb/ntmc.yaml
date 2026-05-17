-- 升級既有資料庫：加入中心倉庫/已領料/儲位庫存設計
-- 適用於已經跑過舊版 schema.postgres.sql 的資料庫。

BEGIN;

ALTER TABLE warehouse
  ADD COLUMN IF NOT EXISTS location_type text NOT NULL DEFAULT 'CENTER_WAREHOUSE',
  ADD COLUMN IF NOT EXISTS default_stock_status text NOT NULL DEFAULT 'AVAILABLE',
  ADD COLUMN IF NOT EXISTS is_issue_destination boolean NOT NULL DEFAULT false;

UPDATE warehouse
SET
  location_type = CASE
    WHEN warehouse_name LIKE '%中心倉庫%' THEN 'CENTER_WAREHOUSE'
    WHEN warehouse_name LIKE '%分存站%' THEN 'SUB_STATION'
    WHEN warehouse_name LIKE '%報廢%' THEN 'SCRAP'
    WHEN warehouse_name LIKE '%外修%' OR warehouse_name LIKE '%廠商%' THEN 'VENDOR'
    WHEN warehouse_name LIKE '%車上%' OR warehouse_name LIKE '%裝車%' THEN 'VEHICLE'
    WHEN warehouse_name LIKE '%個人%' OR warehouse_name LIKE '%保管%' THEN 'PERSON'
    WHEN warehouse_name LIKE '%現場%' OR warehouse_name LIKE '%機廠%' OR warehouse_name LIKE '%倉%' OR warehouse_name LIKE '%庫%' THEN 'FIELD'
    ELSE 'OTHER'
  END,
  default_stock_status = CASE
    WHEN warehouse_name LIKE '%中心倉庫%' THEN 'AVAILABLE'
    WHEN warehouse_name LIKE '%報廢%' THEN 'SCRAPPED'
    WHEN warehouse_name LIKE '%外修%' OR warehouse_name LIKE '%廠商%' THEN 'REPAIR'
    WHEN warehouse_name LIKE '%車上%' OR warehouse_name LIKE '%裝車%' THEN 'IN_USE'
    ELSE 'ISSUED'
  END,
  is_issue_destination = CASE
    WHEN warehouse_name LIKE '%中心倉庫%' THEN false
    ELSE true
  END;

CREATE TABLE IF NOT EXISTS warehouse_bin (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id uuid NOT NULL REFERENCES warehouse(id),
  bin_code text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT warehouse_bin_unique UNIQUE (warehouse_id, bin_code)
);

ALTER TABLE inventory_balance
  ADD COLUMN IF NOT EXISTS stock_status text NOT NULL DEFAULT 'AVAILABLE';

ALTER TABLE inventory_balance DROP CONSTRAINT IF EXISTS inventory_balance_pkey;
ALTER TABLE inventory_balance
  ADD CONSTRAINT inventory_balance_pkey PRIMARY KEY (material_id, warehouse_id, stock_status);

CREATE TABLE IF NOT EXISTS inventory_bin_balance (
  material_id uuid NOT NULL REFERENCES material(id),
  warehouse_id uuid NOT NULL REFERENCES warehouse(id),
  warehouse_bin_id uuid NOT NULL REFERENCES warehouse_bin(id),
  stock_status text NOT NULL DEFAULT 'AVAILABLE',
  qty numeric(14, 3) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (material_id, warehouse_id, warehouse_bin_id, stock_status)
);

CREATE TABLE IF NOT EXISTS material_import_source (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_batch text NOT NULL,
  source_file text NOT NULL,
  source_row_no integer NOT NULL,
  original_attribute text,
  part_no text NOT NULL,
  material_name text NOT NULL,
  spec text,
  unit text,
  warehouse_name text,
  bin_code text,
  stock_qty numeric(14, 3),
  preservation_date_text text,
  system_code text,
  system_name text,
  category_code text,
  category_name text,
  sequence_no text,
  type_code text,
  imported_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT material_import_source_unique UNIQUE (import_batch, source_file, source_row_no)
);

ALTER TABLE material_import_source
  ADD COLUMN IF NOT EXISTS warehouse_code text,
  ADD COLUMN IF NOT EXISTS warehouse_location_type text,
  ADD COLUMN IF NOT EXISTS stock_status text;

ALTER TABLE inventory_transaction
  ADD COLUMN IF NOT EXISTS warehouse_bin_id uuid REFERENCES warehouse_bin(id),
  ADD COLUMN IF NOT EXISTS stock_status text NOT NULL DEFAULT 'AVAILABLE',
  ADD COLUMN IF NOT EXISTS custodian_user_id uuid REFERENCES app_user(id),
  ADD COLUMN IF NOT EXISTS custodian_name text;

DROP VIEW IF EXISTS v_material_location_balance;
DROP VIEW IF EXISTS v_material_stock_summary;

CREATE VIEW v_material_stock_summary AS
SELECT
  m.id AS material_id,
  m.part_no,
  m.material_name,
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
GROUP BY m.id, m.part_no, m.material_name, m.unit, m.safety_level, m.reorder_point;

CREATE VIEW v_material_location_balance AS
SELECT
  m.part_no,
  m.material_name,
  m.unit,
  w.warehouse_code,
  w.warehouse_name,
  w.location_type,
  wb.bin_code,
  ibb.stock_status,
  ibb.qty
FROM inventory_bin_balance ibb
JOIN material m ON m.id = ibb.material_id
JOIN warehouse w ON w.id = ibb.warehouse_id
JOIN warehouse_bin wb ON wb.id = ibb.warehouse_bin_id;

CREATE INDEX IF NOT EXISTS idx_inventory_balance_status ON inventory_balance(stock_status);
CREATE INDEX IF NOT EXISTS idx_inventory_bin_balance_bin ON inventory_bin_balance(warehouse_bin_id);

COMMIT;
