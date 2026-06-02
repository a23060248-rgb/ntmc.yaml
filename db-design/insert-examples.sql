-- 常用新增範例
-- 使用前請先執行 schema.postgres.sql 與 seed-reference-data.sql。

BEGIN;

-- 1. 新增物料
INSERT INTO material (
  part_no,
  material_name,
  spec,
  unit,
  system_code,
  system_name,
  category_code,
  category_name,
  sequence_no,
  type_code,
  material_type,
  material_property,
  repairable,
  is_serialized,
  safety_level,
  reorder_point,
  estimated_unit_price,
  market_available
)
VALUES (
  '50.88.0010.LO',
  '空調控制器保險絲',
  '250V / 5A',
  'PC',
  '50',
  '空調系統',
  '88',
  '電聯車特殊設備空調類',
  '0010',
  'LO',
  '消耗品',
  '消耗品',
  false,
  false,
  '4',
  20,
  35,
  true
)
ON CONFLICT (part_no) DO UPDATE
SET material_name = EXCLUDED.material_name,
    spec = EXCLUDED.spec,
    system_code = EXCLUDED.system_code,
    category_code = EXCLUDED.category_code,
    category_name = EXCLUDED.category_name,
    sequence_no = EXCLUDED.sequence_no,
    type_code = EXCLUDED.type_code,
    updated_at = now();

-- 2. 新增庫存與庫存異動
INSERT INTO inventory_balance (material_id, warehouse_id, qty)
SELECT m.id, w.id, 100
FROM material m
JOIN warehouse w ON w.warehouse_code = 'TH-CENTER'
WHERE m.part_no = '50.88.0010.LO'
ON CONFLICT (material_id, warehouse_id)
DO UPDATE SET qty = inventory_balance.qty + EXCLUDED.qty,
              updated_at = now();

INSERT INTO inventory_transaction (
  material_id,
  warehouse_id,
  qty_change,
  transaction_type,
  note
)
SELECT m.id, w.id, 100, '初始入庫', '新增物料時帶入初始庫存'
FROM material m
JOIN warehouse w ON w.warehouse_code = 'TH-CENTER'
WHERE m.part_no = '50.88.0010.LO';

-- 2A. 建立庫存異動單：領料、退料、調撥都共用 I 單號
WITH doc AS (
  INSERT INTO inventory_document (
    document_no,
    movement_type,
    document_status,
    document_date,
    site_code,
    source_warehouse_id,
    destination_warehouse_id,
    note
  )
  SELECT
    next_document_no('I', CURRENT_DATE, 'D', 'MAT'),
    'ISSUE',
    'DRAFT',
    CURRENT_DATE,
    'D',
    src.id,
    dst.id,
    '庫存異動單範例：中心倉庫領料到淡海分存站'
  FROM warehouse src
  JOIN warehouse dst ON dst.warehouse_code = 'TH-SUB'
  WHERE src.warehouse_code = 'TH-CENTER'
  RETURNING id
)
INSERT INTO inventory_document_line (
  inventory_document_id,
  line_no,
  material_id,
  from_warehouse_id,
  from_stock_status,
  to_warehouse_id,
  to_stock_status,
  qty,
  unit,
  note
)
SELECT
  doc.id,
  1,
  m.id,
  src.id,
  'AVAILABLE',
  dst.id,
  'ISSUED',
  5,
  m.unit,
  '領料明細範例'
FROM doc
JOIN material m ON m.part_no = '50.88.0010.LO'
JOIN warehouse src ON src.warehouse_code = 'TH-CENTER'
JOIN warehouse dst ON dst.warehouse_code = 'TH-SUB';

-- 3. 新增有序號設備
INSERT INTO asset (
  material_id,
  equipment_group_id,
  serial_no,
  batch_no,
  current_status,
  current_warehouse_id,
  remark
)
SELECT
  m.id,
  eg.id,
  'DCU-L-009',
  'BATCH-115-DCU',
  '備品庫存',
  w.id,
  '新增周轉件個體'
FROM material m
JOIN equipment_group eg ON eg.group_code = 'DCU'
JOIN warehouse w ON w.warehouse_code = 'TH-CENTER'
WHERE m.part_no = '50.88.0005.LO'
ON CONFLICT (material_id, serial_no) DO NOTHING;

INSERT INTO asset_event (
  asset_id,
  event_type,
  to_status,
  to_location,
  event_at,
  note
)
SELECT
  a.id,
  '入庫',
  a.current_status,
  '淡海倉庫 A-01',
  now(),
  '新增設備序號並入庫'
FROM asset a
WHERE a.serial_no = 'DCU-L-009'
  AND NOT EXISTS (
    SELECT 1
    FROM asset_event e
    WHERE e.asset_id = a.id
      AND e.event_type = '入庫'
      AND e.note = '新增設備序號並入庫'
  );

COMMIT;
