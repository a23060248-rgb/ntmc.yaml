-- Master-data versioning for PM templates and shared UI options.
-- Review and test in a non-production database before applying.
BEGIN;

CREATE TABLE IF NOT EXISTS operating_site (
  site_code text PRIMARY KEY,
  site_name text NOT NULL,
  line_name text,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  remark text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO operating_site (site_code, site_name, line_name, display_order)
VALUES
  ('D', '淡海機廠', '淡海輕軌', 10),
  ('K', '安坑機廠', '安坑輕軌', 20)
ON CONFLICT (site_code) DO NOTHING;

ALTER TABLE pm_template
  DROP CONSTRAINT IF EXISTS pm_template_pm_code_key;

ALTER TABLE pm_template
  ADD COLUMN IF NOT EXISTS version_no text NOT NULL DEFAULT '1',
  ADD COLUMN IF NOT EXISTS revision_no integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS lifecycle_status text NOT NULL DEFAULT 'PUBLISHED',
  ADD COLUMN IF NOT EXISTS effective_from date,
  ADD COLUMN IF NOT EXISTS effective_to date,
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS published_by uuid REFERENCES app_user(id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pm_template_lifecycle_status_chk'
  ) THEN
    ALTER TABLE pm_template
      ADD CONSTRAINT pm_template_lifecycle_status_chk
      CHECK (lifecycle_status IN ('DRAFT', 'PUBLISHED', 'RETIRED'));
  END IF;
END $$;

UPDATE pm_template
   SET lifecycle_status = 'PUBLISHED',
       is_active = true,
       published_at = COALESCE(published_at, created_at)
 WHERE lifecycle_status IS NULL OR lifecycle_status = '';

CREATE UNIQUE INDEX IF NOT EXISTS uq_pm_template_code_version
  ON pm_template(pm_code, version_no);

CREATE UNIQUE INDEX IF NOT EXISTS uq_pm_template_active_published
  ON pm_template(pm_code)
  WHERE lifecycle_status = 'PUBLISHED' AND is_active = true;

CREATE INDEX IF NOT EXISTS idx_pm_template_family_revision
  ON pm_template(pm_code, revision_no DESC, lifecycle_status);

ALTER TABLE pm_template_material
  ADD COLUMN IF NOT EXISTS condition_code text NOT NULL DEFAULT 'ALWAYS',
  ADD COLUMN IF NOT EXISTS condition_options jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS is_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

ALTER TABLE pm_template_instrument
  ADD COLUMN IF NOT EXISTS is_required boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

ALTER TABLE pm_template_wi
  ADD COLUMN IF NOT EXISTS is_required boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

ALTER TABLE pm_template_check_item
  ADD COLUMN IF NOT EXISTS is_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS min_value numeric,
  ADD COLUMN IF NOT EXISTS max_value numeric,
  ADD COLUMN IF NOT EXISTS validation_rule text,
  ADD COLUMN IF NOT EXISTS section_sort_order integer NOT NULL DEFAULT 0;

ALTER TABLE workflow_option
  ADD COLUMN IF NOT EXISTS ui_tone text NOT NULL DEFAULT 'neutral',
  ADD COLUMN IF NOT EXISTS background_color text,
  ADD COLUMN IF NOT EXISTS text_color text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'workflow_option_ui_tone_chk'
  ) THEN
    ALTER TABLE workflow_option
      ADD CONSTRAINT workflow_option_ui_tone_chk
      CHECK (ui_tone IN ('neutral', 'info', 'success', 'warning', 'danger'));
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_operating_site_updated_at ON operating_site;
CREATE TRIGGER trg_operating_site_updated_at
BEFORE UPDATE ON operating_site
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE operating_site IS '場站與路線主檔，供車輛、排程、倉庫及工單共用。';
COMMENT ON COLUMN pm_template.lifecycle_status IS 'DRAFT 可編輯；PUBLISHED 供新工單引用；RETIRED 僅保留既有工單歷史。';
COMMENT ON COLUMN pm_template.revision_no IS '同一 pm_code 的遞增修訂序號，用來穩定排序，不取代顯示版號。';
COMMENT ON COLUMN pm_template_material.condition_code IS 'ALWAYS、AIR_FILTER_WASH、AIR_FILTER_REPLACE 等列印前條件。';
COMMENT ON COLUMN pm_template_material.condition_options IS '列印前可選條件及其數量覆寫規則。';
COMMENT ON COLUMN workflow_option.ui_tone IS '前端狀態語意色，不把 CSS 色碼寫死在業務頁面。';

COMMIT;
