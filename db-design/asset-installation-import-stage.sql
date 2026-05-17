\if :{?import_batch}
\else
\set import_batch 'TAMHAI-FIELD-CHECK-001'
\endif

BEGIN;

CREATE TEMP TABLE tmp_asset_installation_import (
  row_no integer,
  site_code text,
  target_code text,
  train_no text,
  module_no text,
  position_code text,
  position_name text,
  position_type text,
  parent_position_code text,
  asset_serial_no text,
  asset_name text,
  install_state text,
  checked_by_text text,
  checked_date text,
  photo_ref text,
  remark text
);

\copy tmp_asset_installation_import FROM 'asset-installation-field-checklist-tamhai.csv' WITH (FORMAT csv, HEADER true)

WITH batch AS (
  INSERT INTO asset_installation_import_batch (
    batch_no,
    site_code,
    target_code,
    fleet_scope,
    source_file,
    import_status,
    remark
  )
  VALUES (
    :'import_batch',
    'D',
    'TS',
    '淡海 18 台',
    'asset-installation-field-checklist-tamhai.csv',
    'DRAFT',
    '現場盤點匯入暫存，尚未套用正式裝用關係'
  )
  ON CONFLICT (batch_no) DO UPDATE SET
    source_file = EXCLUDED.source_file,
    import_status = 'DRAFT',
    imported_at = now(),
    remark = EXCLUDED.remark
  RETURNING id
),
cleared AS (
  DELETE FROM asset_installation_import_row
  WHERE batch_id IN (SELECT id FROM batch)
)
INSERT INTO asset_installation_import_row (
  batch_id,
  row_no,
  site_code,
  target_code,
  train_no,
  module_no,
  position_code,
  position_name,
  position_type,
  parent_position_code,
  asset_serial_no,
  asset_name,
  install_state,
  checked_by_text,
  checked_date,
  photo_ref,
  remark,
  validation_status,
  validation_message,
  raw_payload
)
SELECT
  batch.id,
  row_no,
  site_code,
  target_code,
  train_no,
  module_no,
  position_code,
  position_name,
  CASE position_type
    WHEN '獨立件' THEN 'INDEPENDENT'
    WHEN '總成' THEN 'ASSEMBLY'
    WHEN '子件' THEN 'COMPONENT'
    ELSE position_type
  END,
  NULLIF(parent_position_code, ''),
  NULLIF(asset_serial_no, ''),
  NULLIF(asset_name, ''),
  COALESCE(NULLIF(install_state, ''), '待確認'),
  NULLIF(checked_by_text, ''),
  NULLIF(checked_date, '')::date,
  NULLIF(photo_ref, ''),
  NULLIF(remark, ''),
  CASE
    WHEN vp.id IS NULL THEN '錯誤'
    WHEN COALESCE(NULLIF(install_state, ''), '待確認') = '裝用中' AND NULLIF(asset_serial_no, '') IS NULL THEN '警告'
    ELSE '通過'
  END,
  CASE
    WHEN vp.id IS NULL THEN '找不到對應 position_code'
    WHEN COALESCE(NULLIF(install_state, ''), '待確認') = '裝用中' AND NULLIF(asset_serial_no, '') IS NULL THEN '裝用中但未填設備序號'
    ELSE NULL
  END,
  to_jsonb(tmp_asset_installation_import)
FROM tmp_asset_installation_import
CROSS JOIN batch
LEFT JOIN vehicle_position vp ON vp.position_code = tmp_asset_installation_import.position_code;

COMMIT;

SELECT
  validation_status,
  count(*) AS count
FROM asset_installation_import_row r
JOIN asset_installation_import_batch b ON b.id = r.batch_id
WHERE b.batch_no = :'import_batch'
GROUP BY validation_status
ORDER BY validation_status;
