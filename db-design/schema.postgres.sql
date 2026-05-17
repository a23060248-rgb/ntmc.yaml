-- 預檢工單系統資料庫設計
-- Target: PostgreSQL 15+
-- Purpose: P 預檢工單、C 故障工單、R 拆下件維修工單、物料表、周轉件履歷、庫存異動

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =========================================================
-- 1. 共用主檔
-- =========================================================

CREATE TABLE app_user (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_no text UNIQUE,
  display_name text NOT NULL,
  department text,
  role_name text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE app_user IS '系統人員主檔，供派工、經手、審核與簽核使用。';

CREATE TABLE train (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  train_no text NOT NULL UNIQUE,
  fleet_name text,
  site_code text NOT NULL DEFAULT 'D' CHECK (site_code IN ('D', 'K')),
  line_name text,
  former_train_no text,
  display_order integer,
  remark text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE train IS '車號主檔。淡海 D：101-115、117(215)、118(214)、119(213)；安坑 K：201-212。';
COMMENT ON COLUMN train.site_code IS 'D=淡海，K=安坑。';
COMMENT ON COLUMN train.former_train_no IS '原車號或對應車號，例如淡海 117 對應 215。';
COMMENT ON COLUMN train.display_order IS '車號排序用，避免文字排序錯亂。';

CREATE TABLE warehouse (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_code text NOT NULL UNIQUE,
  warehouse_name text NOT NULL,
  location_type text NOT NULL DEFAULT 'CENTER_WAREHOUSE',
  default_stock_status text NOT NULL DEFAULT 'AVAILABLE',
  is_issue_destination boolean NOT NULL DEFAULT false,
  location_note text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT warehouse_location_type_check CHECK (
    location_type IN ('CENTER_WAREHOUSE', 'SUB_STATION', 'FIELD', 'VEHICLE', 'PERSON', 'VENDOR', 'SCRAP', 'OTHER')
  ),
  CONSTRAINT warehouse_default_stock_status_check CHECK (
    default_stock_status IN ('AVAILABLE', 'ISSUED', 'IN_USE', 'QUARANTINE', 'REPAIR', 'SCRAPPED')
  )
);

COMMENT ON TABLE warehouse IS '庫存位置主檔。中心倉庫代表未領料可發料庫存；分存站、現場、車上、個人保管代表已領出後的去向。';
COMMENT ON COLUMN warehouse.location_type IS '位置型態：CENTER_WAREHOUSE、SUB_STATION、FIELD、VEHICLE、PERSON、VENDOR、SCRAP、OTHER。';
COMMENT ON COLUMN warehouse.default_stock_status IS '此位置預設庫存狀態。中心倉庫通常為 AVAILABLE，分存站或現場通常為 ISSUED。';
COMMENT ON COLUMN warehouse.is_issue_destination IS 'true 代表物料移到此位置時，業務上視為已領料或已發出。';

CREATE TABLE warehouse_bin (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id uuid NOT NULL REFERENCES warehouse(id),
  bin_code text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT warehouse_bin_unique UNIQUE (warehouse_id, bin_code)
);

COMMENT ON TABLE warehouse_bin IS '倉庫內儲位主檔，例如 DTS0001、DMW4312、DHW0112。';

CREATE TABLE vendor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_code text UNIQUE,
  vendor_name text NOT NULL,
  contact_name text,
  contact_phone text,
  contact_email text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE vendor IS '外修廠商、採購供應商主檔。';

CREATE TABLE workflow_option (
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

CREATE TABLE document_sequence (
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

-- =========================================================
-- 2. 設備、位置、物料主檔
-- =========================================================

CREATE TABLE equipment_group (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_code text NOT NULL UNIQUE,
  group_name text NOT NULL,
  system_name text NOT NULL,
  safety_level text,
  fleet_count integer NOT NULL DEFAULT 0,
  online_required_qty integer NOT NULL DEFAULT 0,
  min_safety_spare_qty integer NOT NULL DEFAULT 0,
  warning_spare_qty integer NOT NULL DEFAULT 0,
  default_material_part_no text,
  source_note text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE equipment_group IS '設備群組主檔，定義 EHU、DCU、空調控制器等設備類型與備品水位。';

CREATE TABLE vehicle_position (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  position_code text NOT NULL UNIQUE,
  parent_position_id uuid REFERENCES vehicle_position(id),
  parent_position_code text,
  site_code text NOT NULL DEFAULT 'D' CHECK (site_code IN ('D', 'K')),
  target_code text NOT NULL DEFAULT 'TS',
  train_id uuid REFERENCES train(id),
  train_set_no text,
  equipment_group_id uuid REFERENCES equipment_group(id),
  module_no text,
  position_name text NOT NULL,
  position_type text CHECK (position_type IS NULL OR position_type IN ('MODULE', 'CATEGORY', 'INDEPENDENT', 'ASSEMBLY', 'COMPONENT')),
  is_installable boolean NOT NULL DEFAULT true,
  current_asset_id uuid,
  position_status text NOT NULL DEFAULT '正常',
  last_replace_at timestamptz,
  source_file text,
  source_sheet text,
  source_row_no integer,
  remark text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE vehicle_position IS '車輛坑位主檔。坑位代表設備安裝在哪裡；設備序號本身放 asset，當前裝用關係由 current_asset_id 或 asset.current_position_id 連動。';
COMMENT ON COLUMN vehicle_position.position_code IS '坑位代碼 Location_ID，例如 50-D-TS101-M1-BCU-AIO。';
COMMENT ON COLUMN vehicle_position.parent_position_code IS '上層坑位代碼 Parent_ID，例如 50-D-TS101-M1-BCU。匯入後可解析為 parent_position_id。';
COMMENT ON COLUMN vehicle_position.position_type IS 'MODULE=車廂/模組節點，CATEGORY=分類不裝設備，INDEPENDENT=獨立件，ASSEMBLY=總成，COMPONENT=子件。';
COMMENT ON COLUMN vehicle_position.is_installable IS '是否可裝設備。CATEGORY 通常 false；INDEPENDENT、ASSEMBLY、COMPONENT 通常 true。';

CREATE TABLE material (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  part_no text NOT NULL UNIQUE,
  material_name text NOT NULL,
  spec text,
  unit text,
  system_code text,
  system_name text,
  category_code text,
  category_name text,
  sequence_no text,
  type_code text,
  material_type text,
  material_property text,
  repairable boolean NOT NULL DEFAULT false,
  is_serialized boolean NOT NULL DEFAULT false,
  safety_level text,
  lead_time_days integer,
  reorder_point numeric(14, 3) NOT NULL DEFAULT 0,
  estimated_unit_price numeric(14, 2),
  market_available boolean,
  review_note text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE material IS '物料主檔。消耗品只管數量；可修件或高價件可透過 asset 建立序號個體。';
COMMENT ON COLUMN material.part_no IS '正式料號，例如 50.88.0004.LO。';
COMMENT ON COLUMN material.system_code IS '料號第一段系統碼，例如 50、95、96。';
COMMENT ON COLUMN material.category_code IS '料號第二段類別碼，例如 88。';
COMMENT ON COLUMN material.category_name IS '類別名稱，來自料號定義或原始 Excel。';
COMMENT ON COLUMN material.sequence_no IS '料號第三段流水號，例如 0004。';
COMMENT ON COLUMN material.type_code IS '料號第四段型式碼，例如 LO。';
COMMENT ON COLUMN material.reorder_point IS '統一請購點／安全庫存水位。淡海、安坑調用快時先不分場站水位。';

CREATE TABLE asset (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id uuid NOT NULL REFERENCES material(id),
  equipment_group_id uuid REFERENCES equipment_group(id),
  serial_no text NOT NULL,
  batch_no text,
  current_status text NOT NULL,
  current_warehouse_id uuid REFERENCES warehouse(id),
  current_train_id uuid REFERENCES train(id),
  current_position_id uuid REFERENCES vehicle_position(id),
  current_vendor_id uuid REFERENCES vendor(id),
  last_work_order_id uuid,
  accumulated_mileage text,
  accumulated_hours numeric(14, 2),
  remark text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT asset_unique_material_serial UNIQUE (material_id, serial_no)
);

COMMENT ON TABLE asset IS '有序號設備或周轉件個體主檔。asset 保存目前狀態，asset_event 保存不可刪的履歷。';

ALTER TABLE vehicle_position
  ADD CONSTRAINT vehicle_position_current_asset_fk
  FOREIGN KEY (current_asset_id) REFERENCES asset(id);

CREATE INDEX idx_asset_material ON asset(material_id);
CREATE INDEX idx_asset_status ON asset(current_status);
CREATE INDEX idx_asset_train_position ON asset(current_train_id, current_position_id);

-- =========================================================
-- 3. 預檢模板、儀器、WI
-- =========================================================

CREATE TABLE instrument (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instrument_no text NOT NULL UNIQUE,
  instrument_name text NOT NULL,
  instrument_type text,
  location text,
  keeper_user_id uuid REFERENCES app_user(id),
  calibration_due_date date,
  status text NOT NULL DEFAULT '可使用',
  remark text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE instrument IS '儀器主檔，供預檢工單選用與校驗追蹤。';

CREATE TABLE wi_document (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wi_no text NOT NULL UNIQUE,
  wi_name text NOT NULL,
  wi_type text,
  version_no text,
  status text NOT NULL DEFAULT '啟用',
  remark text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE wi_document IS '工作說明書 WI 主檔。';

CREATE TABLE pm_template (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pm_code text NOT NULL UNIQUE,
  pm_label text NOT NULL,
  job_description text,
  maintenance_period text,
  latest_offset_days integer NOT NULL DEFAULT 0,
  default_corrective_action text,
  default_danger_start time,
  default_danger_end time,
  default_danger_total_hours numeric(8, 2),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE pm_template IS 'P1/P2/P3/P4 預檢等級模板。';

CREATE TABLE pm_template_material (
  pm_template_id uuid NOT NULL REFERENCES pm_template(id) ON DELETE CASCADE,
  material_id uuid NOT NULL REFERENCES material(id),
  default_qty numeric(14, 3),
  default_unit text,
  display_note text,
  sort_order integer NOT NULL DEFAULT 0,
  PRIMARY KEY (pm_template_id, material_id)
);

CREATE TABLE pm_template_instrument (
  pm_template_id uuid NOT NULL REFERENCES pm_template(id) ON DELETE CASCADE,
  instrument_id uuid NOT NULL REFERENCES instrument(id),
  sort_order integer NOT NULL DEFAULT 0,
  PRIMARY KEY (pm_template_id, instrument_id)
);

CREATE TABLE pm_template_wi (
  pm_template_id uuid NOT NULL REFERENCES pm_template(id) ON DELETE CASCADE,
  wi_document_id uuid NOT NULL REFERENCES wi_document(id),
  sort_order integer NOT NULL DEFAULT 0,
  PRIMARY KEY (pm_template_id, wi_document_id)
);

-- =========================================================
-- 4. 工單主表與類型明細
-- =========================================================

CREATE TABLE work_order (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_no text NOT NULL UNIQUE,
  work_order_type text NOT NULL CHECK (work_order_type IN ('P', 'C', 'R', 'J')),
  work_order_date date NOT NULL DEFAULT CURRENT_DATE,
  site_code text NOT NULL DEFAULT 'D' CHECK (site_code IN ('D', 'K')),
  target_code text NOT NULL DEFAULT 'TS',
  daily_sequence integer NOT NULL CHECK (daily_sequence BETWEEN 1 AND 999),
  title text NOT NULL,
  status text NOT NULL,
  train_id uuid REFERENCES train(id),
  source_work_order_id uuid REFERENCES work_order(id),
  created_by uuid REFERENCES app_user(id),
  assigned_to uuid REFERENCES app_user(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  planned_start_at timestamptz,
  actual_start_at timestamptz,
  actual_finish_at timestamptz,
  closed_at timestamptz,
  closed_by uuid REFERENCES app_user(id),
  remark text,
  deleted_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT work_order_no_format
    CHECK (work_order_no ~ '^[PCRJ]-[0-9]{7}-[DK]-[A-Z0-9]{2,6}-[0-9]{3}$'),
  CONSTRAINT work_order_daily_sequence_unique
    UNIQUE (work_order_type, work_order_date, site_code, target_code, daily_sequence)
);

COMMENT ON TABLE work_order IS '所有 P/C/R/J 工單共用主表。工單編號格式固定為 TYPE-YYYMMDD-SITE-TARGET-SEQ，例如 C-1150514-D-TS-031。';
COMMENT ON COLUMN work_order.work_order_no IS '正式工單編號：性質-民國日期-場站-對象-當日流水號。';
COMMENT ON COLUMN work_order.work_order_type IS 'P=預檢，C=故檢，R=維修，J=專案。';
COMMENT ON COLUMN work_order.work_order_date IS '工單日期，用西元 date 保存；顯示編號時轉為民國 YYYMMDD。';
COMMENT ON COLUMN work_order.site_code IS 'D=淡海，K=安坑。';
COMMENT ON COLUMN work_order.target_code IS 'TS=列車；後續可擴充其他對象代碼。';
COMMENT ON COLUMN work_order.daily_sequence IS '當日流水號，顯示時補成三碼，例如 31 顯示為 031。';

CREATE INDEX idx_work_order_type_status ON work_order(work_order_type, status);
CREATE INDEX idx_work_order_source ON work_order(source_work_order_id);
CREATE INDEX idx_work_order_train ON work_order(train_id);

CREATE TABLE pm_work_order (
  work_order_id uuid PRIMARY KEY REFERENCES work_order(id) ON DELETE CASCADE,
  pm_template_id uuid REFERENCES pm_template(id),
  pm_code text NOT NULL,
  plan_start_date date,
  latest_finish_date date,
  assigned_by uuid REFERENCES app_user(id),
  person_in_charge uuid REFERENCES app_user(id),
  system_name text,
  equipment_group_no text,
  equipment_group_name text,
  maintenance_type text,
  execution_type text,
  qty_plan numeric(14, 3),
  qty_completed numeric(14, 3),
  corrective_action text,
  danger_start time,
  danger_end time,
  danger_total_hours numeric(8, 2),
  cost_center text,
  ntmc_completed_by uuid REFERENCES app_user(id),
  ntmc_approved_by uuid REFERENCES app_user(id),
  form_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb
);

COMMENT ON TABLE pm_work_order IS 'P 預檢工單明細。form_snapshot 可保留當下列印表單欄位快照。';

CREATE TABLE fault_work_order (
  work_order_id uuid PRIMARY KEY REFERENCES work_order(id) ON DELETE CASCADE,
  fault_category text,
  fault_description text,
  main_system text,
  fault_component text,
  fault_sub_component text,
  vehicle_position_id uuid REFERENCES vehicle_position(id),
  removed_asset_id uuid REFERENCES asset(id),
  installed_asset_id uuid REFERENCES asset(id),
  fault_found_at timestamptz,
  fault_closed_at timestamptz
);

COMMENT ON TABLE fault_work_order IS 'C 故障工單明細，處理故障排除與拆裝來源。';

CREATE TABLE repair_work_order (
  work_order_id uuid PRIMARY KEY REFERENCES work_order(id) ON DELETE CASCADE,
  source_fault_work_order_id uuid REFERENCES work_order(id),
  removed_asset_id uuid REFERENCES asset(id),
  installed_asset_id uuid REFERENCES asset(id),
  original_position_id uuid REFERENCES vehicle_position(id),
  original_location_text text,
  main_system text,
  fault_component text,
  fault_sub_component text,
  repair_method text NOT NULL DEFAULT '待判定',
  current_place text NOT NULL DEFAULT '待修區',
  outsourcing_status text NOT NULL DEFAULT '未送修',
  acceptance_result text NOT NULL DEFAULT '未處理',
  next_action text,
  risk_tags text[] NOT NULL DEFAULT ARRAY[]::text[],
  stay_days integer NOT NULL DEFAULT 0
);

COMMENT ON TABLE repair_work_order IS 'R 工單明細。R 工單只管拆下來壞掉的設備；installed_asset_id 只作履歷參照。';
COMMENT ON COLUMN repair_work_order.repair_method IS '處理路線，對應 workflow_option.option_group = REPAIR_METHOD，例如待判定、內修、外修、報廢。';
COMMENT ON COLUMN repair_work_order.current_place IS '目前所在位置，對應 workflow_option.option_group = REPAIR_PLACE，例如待修區、內修區、廠商／採購驗收中、備品倉、報廢區。';
COMMENT ON COLUMN repair_work_order.outsourcing_status IS '外修進度，對應 workflow_option.option_group = OUTSOURCING_STATUS。內修件通常維持未送修。';
COMMENT ON COLUMN repair_work_order.acceptance_result IS '採購或維修驗收結果，對應 workflow_option.option_group = ACCEPTANCE_RESULT。';
COMMENT ON COLUMN repair_work_order.next_action IS '下一步處理建議，可由維修方式、位置、外修進度、驗收結果推導，也可人工覆寫。';
COMMENT ON COLUMN repair_work_order.risk_tags IS '看板風險標籤，例如外修中、逾期、履歷不完整、重複故障。';

CREATE INDEX idx_repair_work_order_source_fault ON repair_work_order(source_fault_work_order_id);
CREATE INDEX idx_repair_work_order_removed_asset ON repair_work_order(removed_asset_id);

CREATE TABLE project_work_order (
  work_order_id uuid PRIMARY KEY REFERENCES work_order(id) ON DELETE CASCADE,
  project_code text,
  project_name text NOT NULL,
  project_phase text,
  owner_user_id uuid REFERENCES app_user(id),
  budget_code text,
  start_date date,
  target_finish_date date,
  scope_summary text,
  acceptance_result text,
  form_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb
);

COMMENT ON TABLE project_work_order IS 'J 專案工單明細，處理改善案、改造案、批次專案與非例行工作。';

-- =========================================================
-- 5. 工單關聯明細
-- =========================================================

CREATE TABLE work_order_material (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id uuid NOT NULL REFERENCES work_order(id) ON DELETE CASCADE,
  material_id uuid NOT NULL REFERENCES material(id),
  planned_qty numeric(14, 3),
  actual_qty numeric(14, 3),
  unit text,
  warehouse_id uuid REFERENCES warehouse(id),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_work_order_material_order ON work_order_material(work_order_id);
CREATE INDEX idx_work_order_material_material ON work_order_material(material_id);

CREATE TABLE work_order_instrument (
  work_order_id uuid NOT NULL REFERENCES work_order(id) ON DELETE CASCADE,
  instrument_id uuid NOT NULL REFERENCES instrument(id),
  note text,
  PRIMARY KEY (work_order_id, instrument_id)
);

CREATE TABLE work_order_wi (
  work_order_id uuid NOT NULL REFERENCES work_order(id) ON DELETE CASCADE,
  wi_document_id uuid NOT NULL REFERENCES wi_document(id),
  note text,
  PRIMARY KEY (work_order_id, wi_document_id)
);

CREATE TABLE work_order_attachment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id uuid NOT NULL REFERENCES work_order(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_url text NOT NULL,
  file_type text,
  uploaded_by uuid REFERENCES app_user(id),
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

-- =========================================================
-- 6. 設備履歷、送修、報廢、任務
-- =========================================================

CREATE TABLE asset_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES asset(id),
  event_type text NOT NULL,
  from_status text,
  to_status text,
  from_location text,
  to_location text,
  from_position_id uuid REFERENCES vehicle_position(id),
  to_position_id uuid REFERENCES vehicle_position(id),
  work_order_id uuid REFERENCES work_order(id),
  related_asset_id uuid REFERENCES asset(id),
  event_at timestamptz NOT NULL DEFAULT now(),
  handled_by uuid REFERENCES app_user(id),
  approved_by uuid REFERENCES app_user(id),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE asset_event IS '設備履歷事件表。所有入庫、上線、下線、送修、回庫、報廢都記在這裡，不應硬刪。';

CREATE INDEX idx_asset_event_asset_time ON asset_event(asset_id, event_at DESC);
CREATE INDEX idx_asset_event_work_order ON asset_event(work_order_id);
CREATE INDEX idx_asset_event_type_time ON asset_event(event_type, event_at DESC);

CREATE TABLE repair_record (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES asset(id),
  work_order_id uuid REFERENCES work_order(id),
  vendor_id uuid REFERENCES vendor(id),
  rma_no text,
  send_date date,
  expected_return_date date,
  actual_return_date date,
  repair_status text NOT NULL DEFAULT '已送修',
  repair_result text,
  cost_amount numeric(14, 2),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_repair_record_asset ON repair_record(asset_id);
CREATE INDEX idx_repair_record_status ON repair_record(repair_status);

CREATE TABLE scrap_record (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES asset(id),
  work_order_id uuid REFERENCES work_order(id),
  scrap_reason text NOT NULL,
  description text,
  residual_value numeric(14, 2),
  disposal_method text,
  approval_status text NOT NULL DEFAULT '申請中',
  applied_by uuid REFERENCES app_user(id),
  reviewed_by uuid REFERENCES app_user(id),
  approved_by uuid REFERENCES app_user(id),
  applied_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_scrap_record_asset ON scrap_record(asset_id);
CREATE INDEX idx_scrap_record_status ON scrap_record(approval_status);

CREATE TABLE asset_task (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid REFERENCES asset(id),
  work_order_id uuid REFERENCES work_order(id),
  task_type text NOT NULL,
  task_status text NOT NULL DEFAULT '待處理',
  priority text NOT NULL DEFAULT '中',
  owner_user_id uuid REFERENCES app_user(id),
  due_date date,
  description text,
  follow_up_note text,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE asset_task IS '風險、送修逾期、備品不足、待補履歷等待辦事項。';

CREATE INDEX idx_asset_task_status_priority ON asset_task(task_status, priority);
CREATE INDEX idx_asset_task_owner ON asset_task(owner_user_id);

-- =========================================================
-- 7. 庫存數量與異動
-- =========================================================

CREATE TABLE inventory_balance (
  material_id uuid NOT NULL REFERENCES material(id),
  warehouse_id uuid NOT NULL REFERENCES warehouse(id),
  stock_status text NOT NULL DEFAULT 'AVAILABLE',
  qty numeric(14, 3) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (material_id, warehouse_id, stock_status),
  CONSTRAINT inventory_balance_stock_status_check CHECK (
    stock_status IN ('AVAILABLE', 'ISSUED', 'IN_USE', 'QUARANTINE', 'REPAIR', 'SCRAPPED')
  )
);

COMMENT ON TABLE inventory_balance IS '目前庫存快照，以物料、位置、庫存狀態彙總。中心倉庫 AVAILABLE 才是可發料數量。';
COMMENT ON COLUMN inventory_balance.stock_status IS 'AVAILABLE 可發料、ISSUED 已領出保管、IN_USE 已裝用、QUARANTINE 待判定、REPAIR 維修中、SCRAPPED 報廢。';

CREATE TABLE inventory_bin_balance (
  material_id uuid NOT NULL REFERENCES material(id),
  warehouse_id uuid NOT NULL REFERENCES warehouse(id),
  warehouse_bin_id uuid NOT NULL REFERENCES warehouse_bin(id),
  stock_status text NOT NULL DEFAULT 'AVAILABLE',
  qty numeric(14, 3) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (material_id, warehouse_id, warehouse_bin_id, stock_status),
  CONSTRAINT inventory_bin_balance_stock_status_check CHECK (
    stock_status IN ('AVAILABLE', 'ISSUED', 'IN_USE', 'QUARANTINE', 'REPAIR', 'SCRAPPED')
  )
);

COMMENT ON TABLE inventory_bin_balance IS '目前儲位庫存明細。inventory_balance 可視為此表依倉庫與狀態加總後的快照。';

CREATE TABLE material_import_source (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_batch text NOT NULL,
  source_file text NOT NULL,
  source_row_no integer NOT NULL,
  original_attribute text,
  part_no text NOT NULL,
  material_name text NOT NULL,
  spec text,
  unit text,
  warehouse_code text,
  warehouse_name text,
  warehouse_location_type text,
  bin_code text,
  stock_status text,
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

COMMENT ON TABLE material_import_source IS '保留 Excel 原始匯入列，方便追溯來源、儲位、原始屬性與匯入批次。';

CREATE TABLE material_usage_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id uuid NOT NULL REFERENCES material(id) ON DELETE CASCADE,
  period_type text NOT NULL DEFAULT 'YEAR',
  roc_year integer NOT NULL,
  usage_month integer,
  usage_type text NOT NULL DEFAULT 'ISSUE',
  qty numeric(14, 3) NOT NULL DEFAULT 0,
  amount numeric(14, 2),
  unit text,
  source_type text NOT NULL DEFAULT 'IMPORT',
  source_file text,
  source_row_no integer,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT material_usage_period_type_check CHECK (period_type IN ('YEAR', 'MONTH', 'ROLLING_12M')),
  CONSTRAINT material_usage_month_check CHECK (
    (period_type = 'MONTH' AND usage_month BETWEEN 1 AND 12)
    OR (period_type IN ('YEAR', 'ROLLING_12M') AND usage_month IS NULL)
  ),
  CONSTRAINT material_usage_type_check CHECK (
    usage_type IN ('ISSUE', 'FAULT', 'PM_STANDARD', 'OVERHAUL_STANDARD', 'FORECAST_FAULT', 'BOQ', 'OTHER')
  ),
  CONSTRAINT material_usage_source_type_check CHECK (source_type IN ('IMPORT', 'SYSTEM', 'MANUAL', 'CALCULATED')),
  CONSTRAINT material_usage_unique UNIQUE NULLS NOT DISTINCT (material_id, period_type, roc_year, usage_month, usage_type)
);

COMMENT ON TABLE material_usage_history IS '物料歷史用量統計。111、112、113 年發料量與 114 年各月份用量放這裡，不放 material 主檔。';
COMMENT ON COLUMN material_usage_history.period_type IS 'YEAR=全年統計，MONTH=月統計，ROLLING_12M=近一年滾動統計。';
COMMENT ON COLUMN material_usage_history.roc_year IS '民國年，例如 111、112、113、114。';
COMMENT ON COLUMN material_usage_history.usage_month IS '月份。period_type=MONTH 時必填 1-12；YEAR/ROLLING_12M 時為 NULL。';
COMMENT ON COLUMN material_usage_history.usage_type IS 'ISSUE=發料用量，FAULT=故障用量，PM_STANDARD=預檢標準用量，OVERHAUL_STANDARD=大修標準用量，FORECAST_FAULT=預估故障用量，BOQ=BOQ 基準量，OTHER=其他。';
COMMENT ON COLUMN material_usage_history.source_type IS 'IMPORT=從 Excel 匯入，SYSTEM=由工單或庫存異動統計，MANUAL=人工輸入，CALCULATED=系統推算。';

CREATE INDEX idx_material_code ON material(system_code, category_code, type_code);
CREATE INDEX idx_material_usage_material_period ON material_usage_history(material_id, period_type, roc_year, usage_month);
CREATE INDEX idx_material_usage_type_period ON material_usage_history(usage_type, period_type, roc_year, usage_month);

CREATE TABLE inventory_document (
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

CREATE TABLE inventory_document_line (
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

CREATE INDEX idx_inventory_document_no ON inventory_document(document_no);
CREATE INDEX idx_inventory_document_type_status ON inventory_document(movement_type, document_status);
CREATE INDEX idx_inventory_document_date ON inventory_document(document_date DESC);
CREATE INDEX idx_inventory_document_line_document ON inventory_document_line(inventory_document_id);
CREATE INDEX idx_inventory_document_line_material ON inventory_document_line(material_id);

CREATE TABLE asset_installation_import_batch (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_no text NOT NULL UNIQUE,
  site_code text NOT NULL DEFAULT 'D' CHECK (site_code IN ('D', 'K')),
  target_code text NOT NULL DEFAULT 'TS',
  fleet_scope text,
  source_file text,
  import_status text NOT NULL DEFAULT 'DRAFT' CHECK (import_status IN ('DRAFT', 'CHECKED', 'APPLIED', 'CANCELLED')),
  imported_by uuid REFERENCES app_user(id),
  imported_at timestamptz NOT NULL DEFAULT now(),
  applied_at timestamptz,
  remark text
);

COMMENT ON TABLE asset_installation_import_batch IS '設備序號與坑位裝用盤點匯入批次。先匯入暫存檢查，不直接覆蓋正式裝用關係。';

CREATE TABLE asset_installation_import_row (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES asset_installation_import_batch(id) ON DELETE CASCADE,
  row_no integer NOT NULL,
  site_code text NOT NULL DEFAULT 'D' CHECK (site_code IN ('D', 'K')),
  target_code text NOT NULL DEFAULT 'TS',
  train_no text NOT NULL,
  module_no text,
  position_code text NOT NULL,
  position_name text,
  position_type text CHECK (position_type IS NULL OR position_type IN ('INDEPENDENT', 'ASSEMBLY', 'COMPONENT')),
  parent_position_code text,
  asset_serial_no text,
  asset_name text,
  install_state text NOT NULL DEFAULT '待確認' CHECK (install_state IN ('裝用中', '空坑', '查無銘牌', '與清單不符', '待確認', '不適用')),
  checked_by_text text,
  checked_date date,
  photo_ref text,
  validation_status text NOT NULL DEFAULT '未檢查' CHECK (validation_status IN ('未檢查', '通過', '警告', '錯誤')),
  validation_message text,
  remark text,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT asset_installation_import_row_unique UNIQUE (batch_id, row_no)
);

COMMENT ON TABLE asset_installation_import_row IS '設備序號與坑位裝用盤點明細。position_code 對 vehicle_position，asset_serial_no 對 asset。';
COMMENT ON COLUMN asset_installation_import_row.install_state IS '裝用中、空坑、查無銘牌、與清單不符、待確認、不適用。';

CREATE TABLE inventory_transaction (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_document_id uuid REFERENCES inventory_document(id),
  inventory_document_line_id uuid REFERENCES inventory_document_line(id),
  material_id uuid NOT NULL REFERENCES material(id),
  warehouse_id uuid NOT NULL REFERENCES warehouse(id),
  warehouse_bin_id uuid REFERENCES warehouse_bin(id),
  stock_status text NOT NULL DEFAULT 'AVAILABLE',
  asset_id uuid REFERENCES asset(id),
  qty_change numeric(14, 3) NOT NULL,
  transaction_type text NOT NULL,
  work_order_id uuid REFERENCES work_order(id),
  event_id uuid REFERENCES asset_event(id),
  custodian_user_id uuid REFERENCES app_user(id),
  custodian_name text,
  transaction_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES app_user(id),
  note text,
  CONSTRAINT inventory_transaction_stock_status_check CHECK (
    stock_status IN ('AVAILABLE', 'ISSUED', 'IN_USE', 'QUARANTINE', 'REPAIR', 'SCRAPPED')
  )
);

COMMENT ON TABLE inventory_transaction IS '庫存異動履歷，包含入庫、領用、退庫、調撥、安裝、調整、報廢。每筆都要記錄位置與庫存狀態。';
COMMENT ON COLUMN inventory_transaction.inventory_document_id IS '若異動由庫存異動單過帳產生，指向 inventory_document。';
COMMENT ON COLUMN inventory_transaction.inventory_document_line_id IS '若異動由庫存異動單過帳產生，指向 inventory_document_line。';
COMMENT ON COLUMN inventory_transaction.stock_status IS '異動後所屬庫存狀態。領料到分存站或現場通常為 ISSUED，回中心倉庫通常為 AVAILABLE。';
COMMENT ON COLUMN inventory_transaction.custodian_user_id IS '已領料時的保管人員，可空白。';
COMMENT ON COLUMN inventory_transaction.custodian_name IS '保管人文字備註，供尚未建立人員主檔時使用。';

CREATE INDEX idx_inventory_tx_material_time ON inventory_transaction(material_id, transaction_at DESC);
CREATE INDEX idx_inventory_tx_work_order ON inventory_transaction(work_order_id);
CREATE INDEX idx_inventory_tx_document ON inventory_transaction(inventory_document_id);
CREATE INDEX idx_inventory_balance_status ON inventory_balance(stock_status);
CREATE INDEX idx_inventory_bin_balance_bin ON inventory_bin_balance(warehouse_bin_id);

-- =========================================================
-- 8. 報表用 View
-- =========================================================

CREATE VIEW v_asset_current_status AS
SELECT
  a.id AS asset_id,
  m.part_no,
  m.material_name,
  a.serial_no,
  eg.group_code,
  eg.group_name,
  a.current_status,
  t.train_no,
  vp.position_code,
  vp.position_name,
  w.warehouse_name,
  v.vendor_name,
  a.last_work_order_id,
  a.updated_at
FROM asset a
JOIN material m ON m.id = a.material_id
LEFT JOIN equipment_group eg ON eg.id = a.equipment_group_id
LEFT JOIN train t ON t.id = a.current_train_id
LEFT JOIN vehicle_position vp ON vp.id = a.current_position_id
LEFT JOIN warehouse w ON w.id = a.current_warehouse_id
LEFT JOIN vendor v ON v.id = a.current_vendor_id;

CREATE VIEW v_open_repair_work_orders AS
SELECT
  wo.id AS work_order_id,
  wo.work_order_no,
  wo.status,
  rwo.repair_method,
  rwo.current_place,
  rwo.outsourcing_status,
  rwo.acceptance_result,
  rwo.next_action,
  rwo.risk_tags,
  a.serial_no AS removed_serial_no,
  m.part_no,
  m.material_name,
  wo.created_at,
  wo.closed_at
FROM work_order wo
JOIN repair_work_order rwo ON rwo.work_order_id = wo.id
LEFT JOIN asset a ON a.id = rwo.removed_asset_id
LEFT JOIN material m ON m.id = a.material_id
WHERE wo.work_order_type = 'R'
  AND wo.deleted_at IS NULL
  AND wo.closed_at IS NULL;

CREATE VIEW v_material_stock_summary AS
SELECT
  m.id AS material_id,
  m.part_no,
  m.material_name,
  m.system_code,
  m.category_code,
  m.category_name,
  m.type_code,
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
GROUP BY m.id, m.part_no, m.material_name, m.system_code, m.category_code, m.category_name, m.type_code, m.unit, m.safety_level, m.reorder_point;

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

-- =========================================================
-- 9. updated_at trigger
-- =========================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_app_user_updated_at
BEFORE UPDATE ON app_user
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_train_updated_at
BEFORE UPDATE ON train
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_warehouse_updated_at
BEFORE UPDATE ON warehouse
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_warehouse_bin_updated_at
BEFORE UPDATE ON warehouse_bin
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_vendor_updated_at
BEFORE UPDATE ON vendor
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_workflow_option_updated_at
BEFORE UPDATE ON workflow_option
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_document_sequence_updated_at
BEFORE UPDATE ON document_sequence
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_equipment_group_updated_at
BEFORE UPDATE ON equipment_group
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_vehicle_position_updated_at
BEFORE UPDATE ON vehicle_position
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_material_updated_at
BEFORE UPDATE ON material
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_material_usage_history_updated_at
BEFORE UPDATE ON material_usage_history
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_inventory_document_updated_at
BEFORE UPDATE ON inventory_document
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_inventory_document_line_updated_at
BEFORE UPDATE ON inventory_document_line
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_asset_updated_at
BEFORE UPDATE ON asset
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_instrument_updated_at
BEFORE UPDATE ON instrument
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_wi_document_updated_at
BEFORE UPDATE ON wi_document
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_pm_template_updated_at
BEFORE UPDATE ON pm_template
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_work_order_updated_at
BEFORE UPDATE ON work_order
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_repair_record_updated_at
BEFORE UPDATE ON repair_record
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_scrap_record_updated_at
BEFORE UPDATE ON scrap_record
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_asset_task_updated_at
BEFORE UPDATE ON asset_task
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
