-- 清單維護參考選項（非維修流程、非倉庫）
-- 對齊前端「清單維護」鎖定的內容；代碼與前台 referenceDefaultLists 一致。
-- 執行前請先確認 workflow_option 已存在：
--   \i migration-repair-workflow-options.sql      （建立 workflow_option 表）
-- 維修流程 8 群請見 seed-repair-workflow-options.sql；倉庫請見 seed-reference-data.sql / update-warehouse-locations.sql。
-- 本檔可重複執行（ON CONFLICT DO UPDATE）。

INSERT INTO workflow_option (
  option_group,
  option_code,
  option_label,
  sort_order,
  is_terminal,
  is_active,
  description
)
VALUES
  -- 系統別（功能系統，一個料號對應一個系統別）對應前端 material_system
  ('MATERIAL_SYSTEM', 'BODY', '車體/車輛通用', 10, false, true, ''),
  ('MATERIAL_SYSTEM', 'DOOR', '車門系統', 20, false, true, ''),
  ('MATERIAL_SYSTEM', 'BRAKE', '煞車系統', 30, false, true, ''),
  ('MATERIAL_SYSTEM', 'PROP', '推進系統', 40, false, true, '牽引馬達、齒輪箱'),
  ('MATERIAL_SYSTEM', 'BOGIE', '轉向架系統', 50, false, true, '轉向架及懸吊'),
  ('MATERIAL_SYSTEM', 'HVAC', '空調系統', 60, false, true, ''),
  ('MATERIAL_SYSTEM', 'ESS', '儲能系統', 70, false, true, 'ESS 與冷卻'),
  ('MATERIAL_SYSTEM', 'AUXP', '輔助電力系統', 80, false, true, ''),
  ('MATERIAL_SYSTEM', 'SIGCOM', '號誌通訊系統', 90, false, true, ''),
  ('MATERIAL_SYSTEM', 'PANTO', '集電系統', 100, false, true, '受電弓'),
  ('MATERIAL_SYSTEM', 'COUPLER', '連結器系統', 110, false, true, ''),
  ('MATERIAL_SYSTEM', 'COMMON', '共通性物料', 120, false, true, '跨系統可用'),
  ('MATERIAL_SYSTEM', 'TOOL', '工具', 130, false, true, '95 工具'),
  ('MATERIAL_SYSTEM', 'INSTR', '儀器', 140, false, true, '96 儀器'),

  -- 物料屬性 對應前端 material_property
  ('MATERIAL_PROPERTY', 'spare', '系統備品', 10, false, true, ''),
  ('MATERIAL_PROPERTY', 'consumable', '消耗品', 20, false, true, ''),
  ('MATERIAL_PROPERTY', 'wear', '磨耗件', 30, false, true, ''),
  ('MATERIAL_PROPERTY', 'facility', '機廠設備', 40, false, true, ''),
  ('MATERIAL_PROPERTY', 'tool', '工具', 50, false, true, ''),
  ('MATERIAL_PROPERTY', 'instrument', '儀器', 60, false, true, ''),
  ('MATERIAL_PROPERTY', 'turnaround', '周轉件', 70, false, true, ''),
  ('MATERIAL_PROPERTY', 'exclusive', '專屬物料', 80, false, true, ''),
  ('MATERIAL_PROPERTY', 'general', '一般物料', 90, false, true, ''),

  -- 單位 對應前端 unit
  ('UNIT', 'ST', 'ST', 10, false, true, '組/套'),
  ('UNIT', 'PC', 'PC', 20, false, true, '個/件'),
  ('UNIT', 'SET', '組', 30, false, true, ''),
  ('UNIT', 'EA', '個', 40, false, true, ''),
  ('UNIT', 'PCS', '片', 50, false, true, ''),
  ('UNIT', 'M', '公尺', 60, false, true, ''),
  ('UNIT', 'L', '公升', 70, false, true, ''),
  ('UNIT', 'CAN', '罐', 80, false, true, ''),
  ('UNIT', 'BOX', '箱', 90, false, true, ''),

  -- 工單類型 對應前端 work_order_type；單號第一碼由此控管
  ('WORK_ORDER_TYPE', 'C', 'C 故檢工單', 10, false, true, '故檢系統'),
  ('WORK_ORDER_TYPE', 'P', 'P 預檢工單', 20, false, true, '預檢系統'),
  ('WORK_ORDER_TYPE', 'R', 'R 維修工單', 30, false, true, '故障設備拆下後維修'),
  ('WORK_ORDER_TYPE', 'J', 'J 專案工單', 40, false, true, '專案、改善、改造'),

  -- 專案階段 對應前端 project_phase
  ('PROJECT_PHASE', 'PLAN', '規劃', 10, false, true, ''),
  ('PROJECT_PHASE', 'DESIGN', '設計', 20, false, true, ''),
  ('PROJECT_PHASE', 'BUILD', '施工', 30, false, true, ''),
  ('PROJECT_PHASE', 'TEST', '測試', 40, false, true, ''),
  ('PROJECT_PHASE', 'ACCEPT', '驗收', 50, false, true, ''),
  ('PROJECT_PHASE', 'CLOSE', '結案', 60, true, true, ''),

  -- 專案工單狀態 對應前端 project_status
  ('PROJECT_STATUS', 'J-DRAFT', '草稿', 10, false, true, ''),
  ('PROJECT_STATUS', 'J-DOING', '進行中', 20, false, true, ''),
  ('PROJECT_STATUS', 'J-ACCEPT', '驗收中', 30, false, true, ''),
  ('PROJECT_STATUS', 'J-CLOSED', '結案', 90, true, true, ''),
  ('PROJECT_STATUS', 'J-CANCEL', '取消', 99, true, true, '')
ON CONFLICT (option_group, option_code) DO UPDATE SET
  option_label = EXCLUDED.option_label,
  sort_order = EXCLUDED.sort_order,
  is_terminal = EXCLUDED.is_terminal,
  is_active = EXCLUDED.is_active,
  description = EXCLUDED.description,
  updated_at = now();
