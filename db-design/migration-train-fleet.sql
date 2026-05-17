BEGIN;

ALTER TABLE train
  ADD COLUMN IF NOT EXISTS site_code text,
  ADD COLUMN IF NOT EXISTS line_name text,
  ADD COLUMN IF NOT EXISTS former_train_no text,
  ADD COLUMN IF NOT EXISTS display_order integer,
  ADD COLUMN IF NOT EXISTS remark text;

UPDATE train
SET
  site_code = COALESCE(site_code, CASE WHEN train_no ~ '^2' THEN 'K' ELSE 'D' END),
  line_name = COALESCE(line_name, CASE WHEN train_no ~ '^2' THEN '安坑' ELSE '淡海' END),
  display_order = COALESCE(display_order, NULLIF(regexp_replace(train_no, '\D', '', 'g'), '')::integer);

ALTER TABLE train
  ALTER COLUMN site_code SET DEFAULT 'D',
  ALTER COLUMN site_code SET NOT NULL;

ALTER TABLE train
  DROP CONSTRAINT IF EXISTS train_site_code_check;

ALTER TABLE train
  ADD CONSTRAINT train_site_code_check
  CHECK (site_code IN ('D', 'K'));

UPDATE train
SET
  is_active = false,
  remark = COALESCE(remark, '') || CASE WHEN COALESCE(remark, '') = '' THEN '' ELSE '；' END || '依目前車隊定義，淡海無 116 車。'
WHERE train_no = '116車';

COMMENT ON TABLE train IS '車號主檔。淡海 D：101-115、117(215)、118(214)、119(213)；安坑 K：201-212。';
COMMENT ON COLUMN train.site_code IS 'D=淡海，K=安坑。';
COMMENT ON COLUMN train.former_train_no IS '原車號或對應車號，例如淡海 117 對應 215。';
COMMENT ON COLUMN train.display_order IS '車號排序用，避免文字排序錯亂。';

COMMIT;
