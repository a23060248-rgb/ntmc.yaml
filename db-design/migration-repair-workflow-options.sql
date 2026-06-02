-- R 維修流程狀態清單主檔
-- 用於既有資料庫升級；全新建庫時 schema.postgres.sql 已包含此表。

CREATE TABLE IF NOT EXISTS workflow_option (
  option_group text NOT NULL,
  option_code text NOT NULL,
  option_label text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_terminal boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (option_group, option_code)
);

COMMENT ON TABLE workflow_option IS '流程下拉選項主檔。P/C/R/J 工單狀態、處理路線、位置、驗收結果等共用這張表，避免前台與後台各自寫死。';
COMMENT ON COLUMN workflow_option.option_group IS '選項群組，例如 R_STATUS、REPAIR_METHOD、REPAIR_PLACE、OUTSOURCING_STATUS、ACCEPTANCE_RESULT。';
COMMENT ON COLUMN workflow_option.option_code IS '程式與 API 使用的穩定代碼。';
COMMENT ON COLUMN workflow_option.option_label IS '畫面顯示文字。';
COMMENT ON COLUMN workflow_option.is_terminal IS 'true 代表結案或不可再往後流轉的狀態。';

COMMENT ON COLUMN repair_work_order.repair_method IS '處理路線，對應 workflow_option.option_group = REPAIR_METHOD，例如待判定、內修、外修、報廢。';
COMMENT ON COLUMN repair_work_order.current_place IS '目前所在位置，對應 workflow_option.option_group = REPAIR_PLACE，例如待修區、內修區、廠商／採購驗收中、備品倉、報廢區。';
COMMENT ON COLUMN repair_work_order.outsourcing_status IS '外修進度，對應 workflow_option.option_group = OUTSOURCING_STATUS。內修件通常維持未送修。';
COMMENT ON COLUMN repair_work_order.acceptance_result IS '採購或維修驗收結果，對應 workflow_option.option_group = ACCEPTANCE_RESULT。';
COMMENT ON COLUMN repair_work_order.next_action IS '下一步處理建議，可由維修方式、位置、外修進度、驗收結果推導，也可人工覆寫。';
COMMENT ON COLUMN repair_work_order.risk_tags IS '看板風險標籤，例如外修中、逾期、履歷不完整、重複故障。';
