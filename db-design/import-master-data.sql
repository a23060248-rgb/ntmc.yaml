-- 主檔填寫匯入：人員 / 設備群組 / 儀器 / WI
-- 來源：db-design/templates/*.csv（直接用 Excel 或文字編輯器填寫）
--
-- 用法（在 db-design 目錄下，用 psql 連到資料庫）：
--   psql "$DATABASE_URL" -f import-master-data.sql
--
-- 初期可重複執行：以 ON CONFLICT DO UPDATE 覆蓋，
-- 你只要改 CSV 再跑一次，資料庫就同步更新（= 直接修改）。
-- 前置：schema.postgres.sql 已建立；建議先跑 seed-reference-data.sql 再跑本檔。

BEGIN;

-- 1) 人員 app_user（鍵：employee_no）
CREATE TEMP TABLE _imp_app_user (
  employee_no text, display_name text, department text, role_name text, is_active boolean
) ON COMMIT DROP;
\copy _imp_app_user FROM 'templates/app_user.csv' WITH (FORMAT csv, HEADER true)
INSERT INTO app_user (employee_no, display_name, department, role_name, is_active)
SELECT employee_no, display_name, department, role_name, COALESCE(is_active, true)
FROM _imp_app_user
WHERE COALESCE(display_name, '') <> ''
ON CONFLICT (employee_no) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  department   = EXCLUDED.department,
  role_name    = EXCLUDED.role_name,
  is_active    = EXCLUDED.is_active,
  updated_at   = now();

-- 2) 設備群組 equipment_group（鍵：group_code）
CREATE TEMP TABLE _imp_equipment_group (
  group_code text, group_name text, system_name text, safety_level text,
  fleet_count integer, online_required_qty integer, min_safety_spare_qty integer,
  warning_spare_qty integer, default_material_part_no text, source_note text
) ON COMMIT DROP;
\copy _imp_equipment_group FROM 'templates/equipment_group.csv' WITH (FORMAT csv, HEADER true)
INSERT INTO equipment_group (
  group_code, group_name, system_name, safety_level, fleet_count,
  online_required_qty, min_safety_spare_qty, warning_spare_qty, default_material_part_no, source_note
)
SELECT group_code, group_name, system_name, safety_level, COALESCE(fleet_count, 0),
  COALESCE(online_required_qty, 0), COALESCE(min_safety_spare_qty, 0),
  COALESCE(warning_spare_qty, 0), NULLIF(default_material_part_no, ''), source_note
FROM _imp_equipment_group
WHERE COALESCE(group_code, '') <> ''
ON CONFLICT (group_code) DO UPDATE SET
  group_name               = EXCLUDED.group_name,
  system_name              = EXCLUDED.system_name,
  safety_level             = EXCLUDED.safety_level,
  fleet_count              = EXCLUDED.fleet_count,
  online_required_qty      = EXCLUDED.online_required_qty,
  min_safety_spare_qty     = EXCLUDED.min_safety_spare_qty,
  warning_spare_qty        = EXCLUDED.warning_spare_qty,
  default_material_part_no = EXCLUDED.default_material_part_no,
  source_note              = EXCLUDED.source_note,
  updated_at               = now();

-- 3) 儀器 instrument（鍵：instrument_no；keeper_name 自動對應 app_user.display_name）
CREATE TEMP TABLE _imp_instrument (
  instrument_no text, instrument_name text, instrument_type text, location text,
  calibration_due_date text, status text, keeper_name text
) ON COMMIT DROP;
\copy _imp_instrument FROM 'templates/instrument.csv' WITH (FORMAT csv, HEADER true)
INSERT INTO instrument (
  instrument_no, instrument_name, instrument_type, location, calibration_due_date, status, keeper_user_id
)
SELECT i.instrument_no, i.instrument_name, i.instrument_type, i.location,
  CASE WHEN i.calibration_due_date ~ '^\d{4}-\d{2}-\d{2}$' THEN i.calibration_due_date::date ELSE NULL END,
  COALESCE(NULLIF(i.status, ''), '可使用'),
  (SELECT u.id FROM app_user u WHERE u.display_name = i.keeper_name LIMIT 1)
FROM _imp_instrument i
WHERE COALESCE(i.instrument_no, '') <> ''
ON CONFLICT (instrument_no) DO UPDATE SET
  instrument_name      = EXCLUDED.instrument_name,
  instrument_type      = EXCLUDED.instrument_type,
  location             = EXCLUDED.location,
  calibration_due_date = EXCLUDED.calibration_due_date,
  status               = EXCLUDED.status,
  keeper_user_id       = EXCLUDED.keeper_user_id,
  updated_at           = now();

-- 4) 工作說明書 wi_document（鍵：wi_no）
CREATE TEMP TABLE _imp_wi (
  wi_no text, wi_name text, wi_type text, version_no text, status text
) ON COMMIT DROP;
\copy _imp_wi FROM 'templates/wi_document.csv' WITH (FORMAT csv, HEADER true)
INSERT INTO wi_document (wi_no, wi_name, wi_type, version_no, status)
SELECT wi_no, wi_name, wi_type, version_no, COALESCE(NULLIF(status, ''), '啟用')
FROM _imp_wi
WHERE COALESCE(wi_no, '') <> ''
ON CONFLICT (wi_no) DO UPDATE SET
  wi_name    = EXCLUDED.wi_name,
  wi_type    = EXCLUDED.wi_type,
  version_no = EXCLUDED.version_no,
  status     = EXCLUDED.status,
  updated_at = now();

COMMIT;
