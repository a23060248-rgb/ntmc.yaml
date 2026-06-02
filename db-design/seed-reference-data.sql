-- 預檢工單系統參考資料
-- 執行順序：先 schema.postgres.sql，再執行本檔。

INSERT INTO app_user (employee_no, display_name, department, role_name)
VALUES
  ('U001', '楊文甲', '車輛課', '主管'),
  ('U002', '李孟哲', '車輛課', '承辦'),
  ('U003', '謝宗凱', '車輛課', '承辦'),
  ('U004', '張雍', '車輛課', '承辦'),
  ('U005', '蔡佳慶', '車輛課', '承辦'),
  ('U006', '黃申傑', '車輛課', '承辦'),
  ('U007', '張芳誠', '車輛課', '庫管'),
  ('U008', '吳琮彬', '車輛課', '承辦'),
  ('U009', '江國平', '車輛課', '承辦'),
  ('U010', '許瑋平', '車輛課', '承辦')
ON CONFLICT DO NOTHING;

INSERT INTO train (
  train_no,
  fleet_name,
  site_code,
  line_name,
  former_train_no,
  display_order,
  is_active,
  remark
)
VALUES
  ('101車', '淡海輕軌', 'D', '淡海', NULL, 101, true, NULL),
  ('102車', '淡海輕軌', 'D', '淡海', NULL, 102, true, NULL),
  ('103車', '淡海輕軌', 'D', '淡海', NULL, 103, true, NULL),
  ('104車', '淡海輕軌', 'D', '淡海', NULL, 104, true, NULL),
  ('105車', '淡海輕軌', 'D', '淡海', NULL, 105, true, NULL),
  ('106車', '淡海輕軌', 'D', '淡海', NULL, 106, true, NULL),
  ('107車', '淡海輕軌', 'D', '淡海', NULL, 107, true, NULL),
  ('108車', '淡海輕軌', 'D', '淡海', NULL, 108, true, NULL),
  ('109車', '淡海輕軌', 'D', '淡海', NULL, 109, true, NULL),
  ('110車', '淡海輕軌', 'D', '淡海', NULL, 110, true, NULL),
  ('111車', '淡海輕軌', 'D', '淡海', NULL, 111, true, NULL),
  ('112車', '淡海輕軌', 'D', '淡海', NULL, 112, true, NULL),
  ('113車', '淡海輕軌', 'D', '淡海', NULL, 113, true, NULL),
  ('114車', '淡海輕軌', 'D', '淡海', NULL, 114, true, NULL),
  ('115車', '淡海輕軌', 'D', '淡海', NULL, 115, true, NULL),
  ('117車', '淡海輕軌', 'D', '淡海', '215車', 117, true, '原/對應車號 215'),
  ('118車', '淡海輕軌', 'D', '淡海', '214車', 118, true, '原/對應車號 214'),
  ('119車', '淡海輕軌', 'D', '淡海', '213車', 119, true, '原/對應車號 213'),
  ('201車', '安坑輕軌', 'K', '安坑', NULL, 201, true, NULL),
  ('202車', '安坑輕軌', 'K', '安坑', NULL, 202, true, NULL),
  ('203車', '安坑輕軌', 'K', '安坑', NULL, 203, true, NULL),
  ('204車', '安坑輕軌', 'K', '安坑', NULL, 204, true, NULL),
  ('205車', '安坑輕軌', 'K', '安坑', NULL, 205, true, NULL),
  ('206車', '安坑輕軌', 'K', '安坑', NULL, 206, true, NULL),
  ('207車', '安坑輕軌', 'K', '安坑', NULL, 207, true, NULL),
  ('208車', '安坑輕軌', 'K', '安坑', NULL, 208, true, NULL),
  ('209車', '安坑輕軌', 'K', '安坑', NULL, 209, true, NULL),
  ('210車', '安坑輕軌', 'K', '安坑', NULL, 210, true, NULL),
  ('211車', '安坑輕軌', 'K', '安坑', NULL, 211, true, NULL),
  ('212車', '安坑輕軌', 'K', '安坑', NULL, 212, true, NULL)
ON CONFLICT (train_no) DO UPDATE SET
  fleet_name = EXCLUDED.fleet_name,
  site_code = EXCLUDED.site_code,
  line_name = EXCLUDED.line_name,
  former_train_no = EXCLUDED.former_train_no,
  display_order = EXCLUDED.display_order,
  is_active = EXCLUDED.is_active,
  remark = EXCLUDED.remark,
  updated_at = now();

UPDATE train
SET
  is_active = false,
  remark = COALESCE(remark, '') || CASE WHEN COALESCE(remark, '') = '' THEN '' ELSE '；' END || '依目前車隊定義，淡海無 116 車。'
WHERE train_no = '116車';

INSERT INTO warehouse (warehouse_code, warehouse_name, location_type, default_stock_status, is_issue_destination, location_note)
VALUES
  ('TH-CENTER', '淡海機廠主庫房', 'CENTER_WAREHOUSE', 'AVAILABLE', false, '未領料、可發料庫存'),
  ('TH-SUB', '淡海分存站(機械工廠)', 'SUB_STATION', 'ISSUED', true, '已領料後保管位置'),
  ('TH-SUB-14', '淡海14號分存站', 'SUB_STATION', 'ISSUED', true, '已領料後保管位置'),
  ('TH-SUB-19', '淡海19號分存站', 'SUB_STATION', 'ISSUED', true, '已領料後保管位置'),
  ('AK-CENTER', '安坑機廠主庫房 B2', 'CENTER_WAREHOUSE', 'AVAILABLE', false, '未領料、可發料庫存'),
  ('AK-TEMP-C215', '安坑暫存區 C215', 'FIELD', 'QUARANTINE', true, '待修、待判定或暫存'),
  ('AK-BRIDGE-01', '安坑橋下倉庫 01', 'SUB_STATION', 'ISSUED', true, '已領料後保管位置'),
  ('AK-BRIDGE-02', '安坑橋下倉庫 02', 'SUB_STATION', 'ISSUED', true, '已領料後保管位置'),
  ('SHOP-REPAIR', '機廠待修區', 'FIELD', 'QUARANTINE', true, '待修、待判定'),
  ('SCRAP-HOLD', '報廢暫存區', 'SCRAP', 'SCRAPPED', true, '報廢申請或已報廢暫存')
ON CONFLICT (warehouse_code) DO UPDATE SET
  warehouse_name = EXCLUDED.warehouse_name,
  location_type = EXCLUDED.location_type,
  default_stock_status = EXCLUDED.default_stock_status,
  is_issue_destination = EXCLUDED.is_issue_destination,
  location_note = EXCLUDED.location_note,
  updated_at = now();

INSERT INTO vendor (vendor_code, vendor_name)
VALUES
  ('OEM-REPAIR', '原廠維修商'),
  ('PROC-ACCEPT', '採購驗收單位')
ON CONFLICT DO NOTHING;

INSERT INTO equipment_group (
  group_code,
  group_name,
  system_name,
  safety_level,
  fleet_count,
  online_required_qty,
  min_safety_spare_qty,
  warning_spare_qty,
  default_material_part_no,
  source_note
)
VALUES
  ('EHU', 'EHU煞車液壓單元', '煞車系統', '高', 18, 54, 2, 4, '50.88.0004.LO', '每車 M1/M3/M5 EHU'),
  ('CALIPER', '煞車卡鉗', '煞車系統', '高', 18, 216, 6, 12, '50.94.0054.LO', '每車多組卡鉗'),
  ('MOTOR', '牽引馬達', '推進系統', '高', 18, 144, 4, 8, '50.88.0005.LO', 'M1/M5 各4具馬達'),
  ('GEAR', '齒輪箱', '推進系統', '高', 18, 144, 4, 8, '50.88.0006.LO', 'M1/M5 多組齒輪箱'),
  ('AC', '空調機組', '空調系統', '中', 18, 72, 3, 6, '50.88.0004.LO', 'M1/M2/M4/M5 空調'),
  ('ESS', 'ESS與冷卻器', '儲能系統', '高', 18, 72, 2, 4, '50.94.0055.LO', 'M2/M4 ESS 與冷卻器'),
  ('DCU', '車門控制器DCU', '車門系統', '中', 18, 144, 5, 10, '50.88.0005.LO', '每車 M1/M2/M4/M5 DCU'),
  ('BCU', 'BCU煞車控制單元', '煞車系統', '高', 18, 54, 2, 4, '50.88.0006.LO', '每車 M1/M3/M5 BCU')
ON CONFLICT DO NOTHING;

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
VALUES
  ('50.88.0004.LO', 'R134快速接頭', '適用於填充R134冷媒', 'ST', '50', '共通性物料', '88', '電聯車特殊設備空調類', '0004', 'LO', '系統備品', '系統備品', false, true, '4', 0, 1400, true),
  ('50.88.0005.LO', 'R134冷媒錶組', '適用於填充R134冷媒', 'ST', '50', '共通性物料', '88', '電聯車特殊設備空調類', '0005', 'LO', '系統備品', '系統備品', false, true, '4', 0, 2200, true),
  ('50.88.0006.LO', '6尺長冷媒管線組', '長度 6 尺', 'ST', '50', '共通性物料', '88', '電聯車特殊設備空調類', '0006', 'LO', '系統備品', '系統備品', false, true, '4', 0, 1400, true),
  ('50.94.0054.LO', '管束', '不鏽鋼 #410，適用範圍 22mm-32mm', 'PC', '50', '共通性物料', '94', '電聯車特殊設備其他耗材類', '0054', 'LO', '消耗品', '消耗品', false, false, '4', 16, 4.7, true),
  ('50.94.0055.LO', '萬用強力快乾膠', '容量 20 公克', 'PC', '50', '共通性物料', '94', '電聯車特殊設備其他耗材類', '0055', 'LO', '消耗品', '消耗品', false, false, '4', 30, 17.3, true)
ON CONFLICT DO NOTHING;

INSERT INTO instrument (instrument_no, instrument_name, instrument_type, location, calibration_due_date, status)
VALUES
  ('15530037', '絕緣電阻計', '量測儀器', '車輛課儀器櫃', '2026-12-31', '可使用'),
  ('101831232', '扭力扳手', '手工具', '車輛課工具室', '2026-10-31', '可使用'),
  ('V091118', '萬用電錶', '量測儀器', '車輛課儀器櫃', '2026-09-30', '可使用'),
  ('03470114101', '游標卡尺', '量測儀器', '車輛課儀器櫃', '2026-08-31', '可使用'),
  ('V090166', '壓力錶', '量測儀器', '車輛課儀器櫃', '2026-06-30', '需校驗')
ON CONFLICT DO NOTHING;

INSERT INTO wi_document (wi_no, wi_name, wi_type, version_no, status)
VALUES
  ('3-WI-H110-ERS001', '車輛外觀與一般檢查', '車輛系統', 'Rev.0', '啟用'),
  ('3-WI-H110-ERS002', '車門系統檢查', '車門系統', 'Rev.0', '啟用'),
  ('3-WI-H110-ERS003', '煞車系統檢查', '煞車系統', 'Rev.0', '啟用'),
  ('3-WI-H110-ERS004', '空調系統檢查', '空調系統', 'Rev.0', '啟用'),
  ('3-WI-H110-ERS005', '車載設備檢查', '車輛系統', 'Rev.0', '啟用'),
  ('3-WI-H110-ERS006', '轉向架相關檢查', '車輛系統', 'Rev.0', '啟用'),
  ('3-WI-H110-ERS007', '連結器檢查', '車輛系統', 'Rev.0', '啟用'),
  ('3-WI-H110-ERS008', '車下設備檢查', '車輛系統', 'Rev.0', '啟用'),
  ('3-WI-H110-ERS009', '年度深度檢查', '通用', 'Rev.0', '啟用')
ON CONFLICT DO NOTHING;

INSERT INTO pm_template (
  pm_code,
  pm_label,
  job_description,
  maintenance_period,
  latest_offset_days,
  default_corrective_action,
  default_danger_start,
  default_danger_end,
  default_danger_total_hours
)
VALUES
  ('P1', '第一級 1M / 月檢', '第一級(1M)', '月檢', 0, '已完成1M預檢作業。', '13:00', '15:00', 2),
  ('P2', '第二級 3M / 季檢', '第二級(3M)', '季檢', 3, '已完成3M預檢作業。', '13:00', '15:00', 2),
  ('P3', '第三級 6M / 半年檢', '第三級(6M)', '半年檢', 1, '已完成6M預檢作業。', '13:00', '17:00', 4),
  ('P4', '第四級 1Y / 年檢', '第四級(1Y)', '年檢', 2, '已完成1Y預檢作業。', '09:30', '16:00', 4)
ON CONFLICT DO NOTHING;

INSERT INTO pm_template_material (pm_template_id, material_id, default_qty, default_unit, sort_order)
SELECT pt.id, m.id, x.qty, x.unit, x.sort_order
FROM (
  VALUES
    ('P1', '50.88.0004.LO', 1, 'ST', 10),
    ('P1', '50.94.0054.LO', 10, 'PC', 20),
    ('P2', '50.88.0004.LO', 1, 'ST', 10),
    ('P2', '50.88.0005.LO', 1, 'ST', 20),
    ('P3', '50.88.0004.LO', 1, 'ST', 10),
    ('P3', '50.88.0005.LO', 1, 'ST', 20),
    ('P3', '50.94.0054.LO', 16, 'PC', 30),
    ('P4', '50.88.0004.LO', 1, 'ST', 10),
    ('P4', '50.88.0005.LO', 1, 'ST', 20),
    ('P4', '50.88.0006.LO', 1, 'ST', 30),
    ('P4', '50.94.0054.LO', 16, 'PC', 40)
) AS x(pm_code, part_no, qty, unit, sort_order)
JOIN pm_template pt ON pt.pm_code = x.pm_code
JOIN material m ON m.part_no = x.part_no
ON CONFLICT DO NOTHING;

INSERT INTO pm_template_instrument (pm_template_id, instrument_id, sort_order)
SELECT pt.id, i.id, x.sort_order
FROM (
  VALUES
    ('P1', '15530037', 10),
    ('P1', '101831232', 20),
    ('P1', 'V091118', 30),
    ('P2', '101831232', 10),
    ('P2', '15530037', 20),
    ('P2', 'V091118', 30),
    ('P2', '03470114101', 40),
    ('P4', '15530037', 10),
    ('P4', 'V091118', 20),
    ('P4', 'V090166', 30)
) AS x(pm_code, instrument_no, sort_order)
JOIN pm_template pt ON pt.pm_code = x.pm_code
JOIN instrument i ON i.instrument_no = x.instrument_no
ON CONFLICT DO NOTHING;

INSERT INTO pm_template_wi (pm_template_id, wi_document_id, sort_order)
SELECT pt.id, wi.id, x.sort_order
FROM (
  VALUES
    ('P1', '3-WI-H110-ERS001', 10),
    ('P1', '3-WI-H110-ERS002', 20),
    ('P1', '3-WI-H110-ERS003', 30),
    ('P1', '3-WI-H110-ERS004', 40),
    ('P2', '3-WI-H110-ERS005', 50),
    ('P2', '3-WI-H110-ERS006', 60),
    ('P3', '3-WI-H110-ERS007', 70),
    ('P3', '3-WI-H110-ERS008', 80),
    ('P4', '3-WI-H110-ERS009', 90)
) AS x(pm_code, wi_no, sort_order)
JOIN pm_template pt ON pt.pm_code = x.pm_code
JOIN wi_document wi ON wi.wi_no = x.wi_no
ON CONFLICT DO NOTHING;
