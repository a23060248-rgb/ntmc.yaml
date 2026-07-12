-- 子系統清單（MATERIAL_SYSTEM）：12 項，整組重建。
-- 原為「系統別清單」，依官方物料編碼原則改名為「子系統清單」，並移除
-- 共通性物料 / 工具(95) / 儀器(96)（後三者在官方編碼屬獨立系統碼 95/96，不屬車輛子系統）。
-- MATERIAL_SYSTEM 未被任何資料表外鍵引用，整組刪除重建安全。可重複執行。
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
  ('MATERIAL_SYSTEM', 'SIGNAL', '車載號誌系統', 120, false, true, '');

COMMIT;
