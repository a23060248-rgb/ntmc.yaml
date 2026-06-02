BEGIN;

CREATE TABLE IF NOT EXISTS asset_installation_import_batch (
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

CREATE TABLE IF NOT EXISTS asset_installation_import_row (
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

COMMENT ON TABLE asset_installation_import_batch IS '設備序號與坑位裝用盤點匯入批次。先匯入暫存檢查，不直接覆蓋正式裝用關係。';
COMMENT ON TABLE asset_installation_import_row IS '設備序號與坑位裝用盤點明細。position_code 對 vehicle_position，asset_serial_no 對 asset。';
COMMENT ON COLUMN asset_installation_import_row.install_state IS '裝用中、空坑、查無銘牌、與清單不符、待確認、不適用。';

COMMIT;
