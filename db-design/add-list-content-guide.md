# 怎樣新增清單內容

資料庫版的原則是：**清單內容不是新增到畫面，而是新增到對應資料表；畫面再用 API 或查詢把資料讀出來。**

目前系統常見清單大概分成五種：

1. 物料清單：新增到 `material`
2. 有序號設備 / 周轉件清單：新增到 `asset`
3. 儀器清單：新增到 `instrument`
4. WI 清單：新增到 `wi_document`
5. 工單清單：新增到 `work_order`，再依類型新增到 `pm_work_order`、`fault_work_order` 或 `repair_work_order`

## 1. 新增物料清單

適合新增料號、品名、規格、單位、安全等級、請購點。

```sql
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
);
```

如果要同時給初始庫存：

```sql
INSERT INTO inventory_balance (material_id, warehouse_id, qty)
SELECT m.id, w.id, 100
FROM material m
JOIN warehouse w ON w.warehouse_code = 'TH-A01'
WHERE m.part_no = '50.88.0010.LO'
ON CONFLICT (material_id, warehouse_id)
DO UPDATE SET qty = inventory_balance.qty + EXCLUDED.qty;

INSERT INTO inventory_transaction (
  material_id,
  warehouse_id,
  qty_change,
  transaction_type,
  note
)
SELECT m.id, w.id, 100, '初始入庫', '建立物料時帶入初始庫存'
FROM material m
JOIN warehouse w ON w.warehouse_code = 'TH-A01'
WHERE m.part_no = '50.88.0010.LO';
```

## 2. 新增有序號設備 / 周轉件清單

適合新增一顆可追蹤履歷的設備，例如 DCU、EHU、控制器。

```sql
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
  '新建周轉件個體'
FROM material m
JOIN equipment_group eg ON eg.group_code = 'DCU'
JOIN warehouse w ON w.warehouse_code = 'TH-A01'
WHERE m.part_no = '50.88.0005.LO';
```

新增設備後，建議一定補一筆履歷事件：

```sql
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
  '新建設備序號並入庫'
FROM asset a
WHERE a.serial_no = 'DCU-L-009';
```

## 3. 新增儀器清單

```sql
INSERT INTO instrument (
  instrument_no,
  instrument_name,
  instrument_type,
  location,
  calibration_due_date,
  status
)
VALUES (
  'V123456',
  '紅外線測溫槍',
  '量測儀器',
  '車輛課儀器櫃',
  '2027-05-31',
  '可使用'
);
```

如果這個儀器要加入 P4 預設清單：

```sql
INSERT INTO pm_template_instrument (pm_template_id, instrument_id, sort_order)
SELECT pt.id, i.id, 100
FROM pm_template pt
JOIN instrument i ON i.instrument_no = 'V123456'
WHERE pt.pm_code = 'P4'
ON CONFLICT DO NOTHING;
```

## 4. 新增 WI 清單

```sql
INSERT INTO wi_document (
  wi_no,
  wi_name,
  wi_type,
  version_no,
  status
)
VALUES (
  '3-WI-H110-ERS010',
  '空調控制器檢查程序',
  '空調系統',
  'Rev.0',
  '啟用'
);
```

如果要加入 P3 預設 WI：

```sql
INSERT INTO pm_template_wi (pm_template_id, wi_document_id, sort_order)
SELECT pt.id, wi.id, 100
FROM pm_template pt
JOIN wi_document wi ON wi.wi_no = '3-WI-H110-ERS010'
WHERE pt.pm_code = 'P3'
ON CONFLICT DO NOTHING;
```

## 5. 新增 P 預檢工單

先新增共用工單主表，再新增 P 工單明細。

```sql
WITH new_work_order AS (
  INSERT INTO work_order (
    work_order_no,
    work_order_type,
    work_order_date,
    site_code,
    target_code,
    daily_sequence,
    title,
    status,
    train_id,
    created_by,
    planned_start_at
  )
  SELECT
    'P-1150515-D-TS-001',
    'P',
    '2026-05-15',
    'D',
    'TS',
    1,
    '第一級(1M) 預檢',
    '待派工',
    t.id,
    u.id,
    '2026-05-15 13:00:00+08'
  FROM train t
  JOIN app_user u ON u.employee_no = 'U001'
  WHERE t.train_no = '101車'
  RETURNING id
)
INSERT INTO pm_work_order (
  work_order_id,
  pm_template_id,
  pm_code,
  plan_start_date,
  latest_finish_date,
  assigned_by,
  person_in_charge,
  system_name,
  equipment_group_no,
  equipment_group_name,
  maintenance_type,
  execution_type,
  qty_plan,
  form_snapshot
)
SELECT
  n.id,
  pt.id,
  'P1',
  '2026-05-15',
  '2026-05-15',
  u1.id,
  u2.id,
  'ERS',
  'ERS',
  '輕軌列車',
  '預防性維修',
  '自辦',
  1,
  '{"source":"manual create example"}'::jsonb
FROM new_work_order n
JOIN pm_template pt ON pt.pm_code = 'P1'
JOIN app_user u1 ON u1.employee_no = 'U001'
JOIN app_user u2 ON u2.employee_no = 'U002';
```

## 6. 新增 R 維修工單

R 工單通常由 C 工單結案或拆換後產生。這裡示範直接建立一張 R 工單，修拆下件 `DCU-L-009`。

```sql
WITH removed_asset AS (
  SELECT id
  FROM asset
  WHERE serial_no = 'DCU-L-009'
),
new_work_order AS (
  INSERT INTO work_order (
    work_order_no,
    work_order_type,
    work_order_date,
    site_code,
    target_code,
    daily_sequence,
    title,
    status,
    created_by,
    planned_start_at
  )
  SELECT
    'R-1150515-D-TS-001',
    'R',
    '2026-05-15',
    'D',
    'TS',
    1,
    '拆下件維修：DCU-L-009',
    '待處理',
    u.id,
    now()
  FROM app_user u
  WHERE u.employee_no = 'U002'
  RETURNING id
)
INSERT INTO repair_work_order (
  work_order_id,
  removed_asset_id,
  main_system,
  fault_component,
  fault_sub_component,
  repair_method,
  current_place,
  outsourcing_status,
  acceptance_result,
  next_action,
  risk_tags
)
SELECT
  n.id,
  a.id,
  '車門系統',
  '門控器',
  '控制板',
  '待判定',
  '待修區',
  '未送修',
  '未處理',
  '判定內修、外修或報廢',
  ARRAY['待判定']
FROM new_work_order n
CROSS JOIN removed_asset a;
```

R 工單建立後，補設備事件：

```sql
INSERT INTO asset_event (
  asset_id,
  event_type,
  from_status,
  to_status,
  work_order_id,
  event_at,
  note
)
SELECT
  a.id,
  '建立R工單',
  a.current_status,
  '待修',
  wo.id,
  now(),
  '拆下件建立 R 工單，裝上件只作履歷參照。'
FROM asset a
JOIN work_order wo ON wo.work_order_no = 'R-1150515-D-TS-001'
WHERE a.serial_no = 'DCU-L-009';
```

最後同步設備目前狀態：

```sql
UPDATE asset
SET current_status = '待修',
    updated_at = now()
WHERE serial_no = 'DCU-L-009';
```

## 目前 HTML 要怎麼接

現在的 HTML 還是寫死資料，所以資料庫新增後，畫面不會自動變。下一步要做其中一種：

1. 做一個後端 API，讓 HTML 從資料庫讀清單。
2. 暫時把資料寫進 `seed-reference-data.sql`，用 SQL 當主資料來源。
3. 先做簡單管理頁：新增物料、儀器、WI、P 工單、R 工單。

正式方向建議是第 1 種：畫面不要再存清單，清單全部從資料庫查。
