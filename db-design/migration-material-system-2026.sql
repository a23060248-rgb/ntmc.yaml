-- 系統別清單（MATERIAL_SYSTEM）改版：14 → 15 項，整組重建。
-- MATERIAL_SYSTEM 目前未被任何資料表外鍵引用（material.system_name 存的是設備大類文字，
-- 非此代碼），整組刪除重建安全。退場代碼：ESS / AUXP / SIGCOM / PANTO。
-- 可重複執行（先全刪再插入）。
BEGIN;

DELETE FROM workflow_option WHERE option_group = 'MATERIAL_SYSTEM';

INSERT INTO workflow_option
  (option_group, option_code, option_label, sort_order, is_terminal, is_active, description)
VALUES
  ('MATERIAL_SYSTEM', 'DOOR', '車門系統', 10, false, true, ''),
  ('MATERIAL_SYSTEM', 'COUPLER', '車間連結系統', 20, false, true, '車輛間連結器'),
  ('MATERIAL_SYSTEM', 'CONTROL', '車輛操作及控制設備系統', 30, false, true, '司機操作、控制設備'),
  ('MATERIAL_SYSTEM', 'BODY', '車體系統', 40, false, true, '車體結構、車輛通用'),
  ('MATERIAL_SYSTEM', 'HVAC', '空調與通風系統', 50, false, true, ''),
  ('MATERIAL_SYSTEM', 'BRAKE', '煞車系統', 60, false, true, ''),
  ('MATERIAL_SYSTEM', 'LIGHT', '照明系統', 70, false, true, ''),
  ('MATERIAL_SYSTEM', 'PROP', '電力與推進系統', 80, false, true, '牽引、推進、供電、儲能'),
  ('MATERIAL_SYSTEM', 'SAFETY', '監控與安全裝置系統', 90, false, true, '監視、偵測、安全裝置'),
  ('MATERIAL_SYSTEM', 'BOGIE', '轉向架系統', 100, false, true, '轉向架及懸吊'),
  ('MATERIAL_SYSTEM', 'COMM', '車載通訊系統', 110, false, true, ''),
  ('MATERIAL_SYSTEM', 'SIGNAL', '車載號誌系統', 120, false, true, ''),
  ('MATERIAL_SYSTEM', 'COMMON', '共通性物料', 130, false, true, '跨系統可用'),
  ('MATERIAL_SYSTEM', 'TOOL', '工具(95)', 140, false, true, '95 工具類'),
  ('MATERIAL_SYSTEM', 'INSTR', '儀器(96)', 150, false, true, '96 儀器類');

COMMIT;
