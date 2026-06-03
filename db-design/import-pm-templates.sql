-- 預檢各等級用料／儀器／WI 對應匯入（P1~P4）
-- 來源：db-design/templates/pm_template_material.csv、pm_template_instrument.csv、pm_template_wi.csv
--
-- 依賴（要先存在，否則對應不到會被跳過）：
--   pm_template … seed-reference-data.sql
--   material    … material-import-tamhai.sql
--   instrument 、 wi_document … import-master-data.sql
--
-- 語意：以 CSV 為準。會先刪掉 CSV 內出現之等級的舊對應，再依 CSV 重建，
--       所以你在 CSV 增、減、改列都會同步到資料庫（= 直接修改）。
-- 用法：cd db-design 後 →  psql "$DATABASE_URL" -f import-pm-templates.sql

BEGIN;

-- 1) 各等級用料 pm_template_material（鍵：pm_code + part_no）
CREATE TEMP TABLE _imp_pmtm (
  pm_code text, part_no text, default_qty numeric, default_unit text, sort_order integer
) ON COMMIT DROP;
\copy _imp_pmtm FROM 'templates/pm_template_material.csv' WITH (FORMAT csv, HEADER true)
DELETE FROM pm_template_material
WHERE pm_template_id IN (SELECT id FROM pm_template WHERE pm_code IN (SELECT DISTINCT pm_code FROM _imp_pmtm));
INSERT INTO pm_template_material (pm_template_id, material_id, default_qty, default_unit, sort_order)
SELECT pt.id, m.id, x.default_qty, COALESCE(NULLIF(x.default_unit, ''), m.unit), COALESCE(x.sort_order, 0)
FROM _imp_pmtm x
JOIN pm_template pt ON pt.pm_code = x.pm_code
JOIN material m ON m.part_no = x.part_no
ON CONFLICT (pm_template_id, material_id) DO UPDATE SET
  default_qty  = EXCLUDED.default_qty,
  default_unit = EXCLUDED.default_unit,
  sort_order   = EXCLUDED.sort_order;

-- 2) 各等級儀器 pm_template_instrument（鍵：pm_code + instrument_no）
CREATE TEMP TABLE _imp_pmti (
  pm_code text, instrument_no text, sort_order integer
) ON COMMIT DROP;
\copy _imp_pmti FROM 'templates/pm_template_instrument.csv' WITH (FORMAT csv, HEADER true)
DELETE FROM pm_template_instrument
WHERE pm_template_id IN (SELECT id FROM pm_template WHERE pm_code IN (SELECT DISTINCT pm_code FROM _imp_pmti));
INSERT INTO pm_template_instrument (pm_template_id, instrument_id, sort_order)
SELECT pt.id, i.id, COALESCE(x.sort_order, 0)
FROM _imp_pmti x
JOIN pm_template pt ON pt.pm_code = x.pm_code
JOIN instrument i ON i.instrument_no = x.instrument_no
ON CONFLICT (pm_template_id, instrument_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

-- 3) 各等級 WI pm_template_wi（鍵：pm_code + wi_no）
CREATE TEMP TABLE _imp_pmtw (
  pm_code text, wi_no text, sort_order integer
) ON COMMIT DROP;
\copy _imp_pmtw FROM 'templates/pm_template_wi.csv' WITH (FORMAT csv, HEADER true)
DELETE FROM pm_template_wi
WHERE pm_template_id IN (SELECT id FROM pm_template WHERE pm_code IN (SELECT DISTINCT pm_code FROM _imp_pmtw));
INSERT INTO pm_template_wi (pm_template_id, wi_document_id, sort_order)
SELECT pt.id, w.id, COALESCE(x.sort_order, 0)
FROM _imp_pmtw x
JOIN pm_template pt ON pt.pm_code = x.pm_code
JOIN wi_document w ON w.wi_no = x.wi_no
ON CONFLICT (pm_template_id, wi_document_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

COMMIT;
