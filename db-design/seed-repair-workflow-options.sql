-- R 維修流程狀態清單
-- 執行前請先確認 workflow_option 已存在：
-- \i migration-repair-workflow-options.sql

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
  ('R_STATUS', 'PENDING', '待處理', 10, false, true, 'R 工單已建立，拆下件已登錄，但尚未判定內修、外修或報廢。'),
  ('R_STATUS', 'REPAIRING', '維修中', 20, false, true, '已進入維修處理，包含內修、外修、驗收或報廢判定中的開放案件。'),
  ('R_STATUS', 'CLOSED_STOCKED', '已入庫結案', 90, true, true, '維修或驗收合格，設備已回到備品倉或可用庫存並結案。'),
  ('R_STATUS', 'CLOSED_SCRAPPED', '已報廢結案', 99, true, true, '設備已完成報廢判定與報廢結案。'),

  ('REPAIR_METHOD', 'UNDECIDED', '待判定', 10, false, true, '尚未決定處理路線。'),
  ('REPAIR_METHOD', 'INHOUSE', '內修', 20, false, true, '由內部維修或測試處理。'),
  ('REPAIR_METHOD', 'OUTSOURCE', '外修', 30, false, true, '送外部廠商、原廠或採購流程處理。'),
  ('REPAIR_METHOD', 'SCRAP', '報廢', 90, true, true, '不再維修，走報廢流程。'),

  ('REPAIR_PLACE', 'WAITING_AREA', '待修區', 10, false, true, '拆下件等待判定或等待維修處理。'),
  ('REPAIR_PLACE', 'INHOUSE_AREA', '內修區', 20, false, true, '設備在內部維修或測試位置。'),
  ('REPAIR_PLACE', 'VENDOR_ACCEPTANCE', '廠商／採購驗收中', 30, false, true, '設備在外修、廠商回件或採購驗收流程中。'),
  ('REPAIR_PLACE', 'SPARE_WAREHOUSE', '備品倉', 90, true, true, '修復合格後回到可用備品庫存。'),
  ('REPAIR_PLACE', 'SCRAP_AREA', '報廢區', 99, true, true, '設備已判定報廢，等待或完成報廢處理。'),

  ('OUTSOURCING_STATUS', 'NOT_SENT', '未送修', 10, false, true, '尚未送外修；內修件通常維持此狀態。'),
  ('OUTSOURCING_STATUS', 'SENT', '已送修', 20, false, true, '已送廠商或原廠維修。'),
  ('OUTSOURCING_STATUS', 'RETURNED', '已修回', 30, false, true, '廠商已修回，等待驗收或後續判定。'),
  ('OUTSOURCING_STATUS', 'PROCUREMENT_ACCEPTING', '採購驗收中', 40, false, true, '採購或驗收單位正在確認維修結果。'),
  ('OUTSOURCING_STATUS', 'PROCUREMENT_ACCEPTED', '採購驗收完成', 50, false, true, '驗收流程已完成，可進行入庫結案或後續處置。'),

  ('ACCEPTANCE_RESULT', 'NOT_PROCESSED', '未處理', 10, false, true, '尚未進行驗收或不需要驗收。'),
  ('ACCEPTANCE_RESULT', 'PASS', '合格', 20, false, true, '驗收合格，可回庫或結案。'),
  ('ACCEPTANCE_RESULT', 'RETURN', '退回', 30, false, true, '驗收退回廠商或退回上一流程補件。'),
  ('ACCEPTANCE_RESULT', 'FAIL', '不合格', 40, false, true, '驗收不合格，需重新判定維修、退回或報廢。'),

  ('REPAIR_NEXT_ACTION', 'DECIDE_ROUTE', '判定內修、外修或報廢', 10, false, true, '待處理案件的第一個必要動作。'),
  ('REPAIR_NEXT_ACTION', 'REGISTER_REPAIR_RESULT', '登錄維修結果', 20, false, true, '內修或外修完成後，補上測試、維修與更換紀錄。'),
  ('REPAIR_NEXT_ACTION', 'WAIT_ACCEPTANCE', '等待驗收完成', 30, false, true, '已修回或已處理完成，等待採購或維修驗收結果。'),
  ('REPAIR_NEXT_ACTION', 'STOCK_IN_CLOSE', '入庫結案', 90, true, true, '驗收合格後回到備品倉並結案。'),
  ('REPAIR_NEXT_ACTION', 'SCRAP_CLOSE', '報廢結案', 99, true, true, '完成報廢紀錄並結案。'),
  ('REPAIR_NEXT_ACTION', 'FILL_HISTORY', '補拆下件序號或履歷', 15, false, true, '設備序號、來源坑位、拆裝履歷或照片資料不足。'),
  ('REPAIR_NEXT_ACTION', 'CLOSED', '已結案', 100, true, true, '案件已完成，僅供查詢。'),

  ('REPAIR_QUEUE', 'NEED_DECISION', '需判定', 10, false, true, '待處理且維修方式為待判定的案件。'),
  ('REPAIR_QUEUE', 'REPAIR_TRACKING', '維修追蹤', 20, false, true, '內修或外修中的開放案件。'),
  ('REPAIR_QUEUE', 'WAIT_ACCEPTANCE', '等待驗收', 30, false, true, '已修回或採購驗收中的案件。'),
  ('REPAIR_QUEUE', 'READY_TO_CLOSE', '可入庫結案', 40, false, true, '驗收合格且可回庫結案的案件。'),
  ('REPAIR_QUEUE', 'NEED_HISTORY', '需補履歷', 50, false, true, '設備序號、坑位、拆裝紀錄或照片資料不足。'),
  ('REPAIR_QUEUE', 'SCRAP_PROCESS', '報廢處理', 60, false, true, '判定報廢但尚未完成報廢紀錄的案件。'),
  ('REPAIR_QUEUE', 'CLOSED', '結案查詢', 90, true, true, '已入庫結案或已報廢結案的案件。'),

  ('R_RISK_TAG', 'OVERDUE', '逾期', 10, false, true, '停留天數超過設定門檻。'),
  ('R_RISK_TAG', 'OUTSOURCING', '外修中', 20, false, true, '案件目前走外修流程。'),
  ('R_RISK_TAG', 'MISSING_SERIAL', '設備序號待補', 30, false, true, '拆下件或裝上件設備序號尚未完整。'),
  ('R_RISK_TAG', 'INCOMPLETE_HISTORY', '履歷不完整', 40, false, true, 'asset_event、來源坑位或工單關聯不完整。'),
  ('R_RISK_TAG', 'REPEAT_FAULT', '重複故障', 50, false, true, '同一設備或同類設備短期內重複故障。'),
  ('R_RISK_TAG', 'HIGH_RISK', '高風險', 60, false, true, '影響行車、備品水位或安全等級較高。'),
  ('R_RISK_TAG', 'SCRAP_RECOMMENDED', '建議報廢', 70, false, true, '維修不具效益或已達報廢判定條件。')
ON CONFLICT (option_group, option_code) DO UPDATE
SET
  option_label = EXCLUDED.option_label,
  sort_order = EXCLUDED.sort_order,
  is_terminal = EXCLUDED.is_terminal,
  is_active = EXCLUDED.is_active,
  description = EXCLUDED.description,
  updated_at = now();
