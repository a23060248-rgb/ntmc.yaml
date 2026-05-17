BEGIN;

CREATE TEMP TABLE tmp_vehicle_position_slots (
  source_sheet text,
  source_row_no text,
  site_code text,
  target_code text,
  train_no text,
  module_no text,
  slot_name text,
  location_id text,
  parent_location_id text,
  slot_kind text,
  is_installable text,
  needs_review text,
  original_attribute text
);

\copy tmp_vehicle_position_slots FROM 'vehicle-position-slots-tamhai.csv' WITH (FORMAT csv, HEADER true)

INSERT INTO vehicle_position (
  position_code,
  parent_position_code,
  site_code,
  target_code,
  train_id,
  train_set_no,
  module_no,
  position_name,
  position_type,
  is_installable,
  position_status,
  source_file,
  source_sheet,
  source_row_no,
  remark
)
SELECT
  s.location_id,
  NULLIF(s.parent_location_id, ''),
  s.site_code,
  s.target_code,
  t.id,
  s.train_no,
  s.module_no,
  s.slot_name,
  s.slot_kind,
  lower(s.is_installable) = 'true',
  '正常',
  '周轉建0304.xlsx',
  s.source_sheet,
  NULLIF(s.source_row_no, '')::integer,
  CASE
    WHEN lower(s.needs_review) = 'true' THEN '來源坑位資料需人工確認'
    ELSE NULL
  END
FROM tmp_vehicle_position_slots s
JOIN train t ON regexp_replace(t.train_no, '\D', '', 'g') = s.train_no
WHERE NULLIF(s.location_id, '') IS NOT NULL
ON CONFLICT (position_code) DO UPDATE SET
  parent_position_code = EXCLUDED.parent_position_code,
  site_code = EXCLUDED.site_code,
  target_code = EXCLUDED.target_code,
  train_id = EXCLUDED.train_id,
  train_set_no = EXCLUDED.train_set_no,
  module_no = EXCLUDED.module_no,
  position_name = EXCLUDED.position_name,
  position_type = EXCLUDED.position_type,
  is_installable = EXCLUDED.is_installable,
  source_file = EXCLUDED.source_file,
  source_sheet = EXCLUDED.source_sheet,
  source_row_no = EXCLUDED.source_row_no,
  remark = EXCLUDED.remark,
  updated_at = now();

UPDATE vehicle_position child
SET parent_position_id = parent.id
FROM vehicle_position parent
WHERE child.parent_position_code = parent.position_code;

COMMIT;

SELECT
  site_code,
  train_set_no,
  position_type,
  is_installable,
  count(*) AS count
FROM vehicle_position
WHERE source_file = '周轉建0304.xlsx'
GROUP BY site_code, train_set_no, position_type, is_installable
ORDER BY site_code, train_set_no, position_type;
