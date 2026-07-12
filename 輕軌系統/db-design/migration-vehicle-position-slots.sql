BEGIN;

ALTER TABLE vehicle_position
  ADD COLUMN IF NOT EXISTS parent_position_id uuid REFERENCES vehicle_position(id),
  ADD COLUMN IF NOT EXISTS parent_position_code text,
  ADD COLUMN IF NOT EXISTS site_code text,
  ADD COLUMN IF NOT EXISTS target_code text,
  ADD COLUMN IF NOT EXISTS train_set_no text,
  ADD COLUMN IF NOT EXISTS is_installable boolean,
  ADD COLUMN IF NOT EXISTS source_file text,
  ADD COLUMN IF NOT EXISTS source_sheet text,
  ADD COLUMN IF NOT EXISTS source_row_no integer;

UPDATE vehicle_position
SET
  site_code = COALESCE(site_code, 'D'),
  target_code = COALESCE(target_code, 'TS'),
  is_installable = COALESCE(is_installable, true);

ALTER TABLE vehicle_position
  ALTER COLUMN site_code SET DEFAULT 'D',
  ALTER COLUMN site_code SET NOT NULL,
  ALTER COLUMN target_code SET DEFAULT 'TS',
  ALTER COLUMN target_code SET NOT NULL,
  ALTER COLUMN is_installable SET DEFAULT true,
  ALTER COLUMN is_installable SET NOT NULL;

ALTER TABLE vehicle_position
  DROP CONSTRAINT IF EXISTS vehicle_position_site_code_check,
  DROP CONSTRAINT IF EXISTS vehicle_position_position_type_check;

ALTER TABLE vehicle_position
  ADD CONSTRAINT vehicle_position_site_code_check
  CHECK (site_code IN ('D', 'K')),
  ADD CONSTRAINT vehicle_position_position_type_check
  CHECK (position_type IS NULL OR position_type IN ('MODULE', 'CATEGORY', 'INDEPENDENT', 'ASSEMBLY', 'COMPONENT'));

COMMENT ON TABLE vehicle_position IS '車輛坑位主檔。坑位代表設備安裝在哪裡；設備序號本身放 asset，當前裝用關係由 current_asset_id 或 asset.current_position_id 連動。';
COMMENT ON COLUMN vehicle_position.position_code IS '坑位代碼 Location_ID，例如 50-D-TS101-M1-BCU-AIO。';
COMMENT ON COLUMN vehicle_position.parent_position_code IS '上層坑位代碼 Parent_ID，例如 50-D-TS101-M1-BCU。匯入後可解析為 parent_position_id。';
COMMENT ON COLUMN vehicle_position.position_type IS 'MODULE=車廂/模組節點，CATEGORY=分類不裝設備，INDEPENDENT=獨立件，ASSEMBLY=總成，COMPONENT=子件。';
COMMENT ON COLUMN vehicle_position.is_installable IS '是否可裝設備。CATEGORY 通常 false；INDEPENDENT、ASSEMBLY、COMPONENT 通常 true。';

COMMIT;
