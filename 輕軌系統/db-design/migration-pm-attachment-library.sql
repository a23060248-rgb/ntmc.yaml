-- Versioned attachment library and stable template-version bindings.
-- Apply through the migration ledger only. Do not run against a formal database without approval.
BEGIN;

CREATE TABLE IF NOT EXISTS pm_attachment_definition (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attachment_code text NOT NULL UNIQUE,
  attachment_name text NOT NULL,
  attachment_type text NOT NULL CHECK (attachment_type IN ('SEAT_MAP', 'MEASUREMENT_TABLE', 'OTHER')),
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pm_attachment_definition_version (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attachment_definition_id uuid NOT NULL REFERENCES pm_attachment_definition(id) ON DELETE RESTRICT,
  version_no text NOT NULL,
  schema_version integer NOT NULL DEFAULT 1 CHECK (schema_version > 0),
  lifecycle_status text NOT NULL DEFAULT 'DRAFT'
    CHECK (lifecycle_status IN ('DRAFT', 'PUBLISHED', 'RETIRED')),
  schema_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  render_strategy text NOT NULL DEFAULT 'WORD_BLOCK'
    CHECK (render_strategy IN ('WORD_BLOCK', 'WORD_TABLE', 'WORD_OVERLAY', 'DATA_ONLY')),
  source_asset_path text,
  source_asset_hash text,
  effective_from date,
  effective_to date,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES app_user(id),
  published_by uuid REFERENCES app_user(id),
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (attachment_definition_id, version_no)
);

ALTER TABLE pm_template_attachment
  ADD COLUMN IF NOT EXISTS attachment_definition_version_id uuid
    REFERENCES pm_attachment_definition_version(id) ON DELETE RESTRICT;

-- Promote existing inline attachment definitions into the reusable library.
-- Every existing template binding keeps its inline snapshot; only an exact
-- code/schema-version/schema match is linked to the new library version.
INSERT INTO pm_attachment_definition (
  attachment_code, attachment_name, attachment_type, description, is_active
)
SELECT DISTINCT ON (attachment_code)
       attachment_code, attachment_name, attachment_type,
       '由既有預檢模板附件安全轉入；正式修改請建立新修訂。', true
  FROM pm_template_attachment
 WHERE is_active = true
 ORDER BY attachment_code, updated_at DESC, created_at DESC
ON CONFLICT (attachment_code) DO NOTHING;

WITH version_source AS (
  SELECT DISTINCT ON (attachment_code, schema_version)
         attachment_code, schema_version, schema_json, render_strategy,
         row_number() OVER (
           PARTITION BY attachment_code
           ORDER BY schema_version DESC, updated_at DESC, created_at DESC
         ) AS version_rank
    FROM pm_template_attachment
   WHERE is_active = true
   ORDER BY attachment_code, schema_version, updated_at DESC, created_at DESC
)
INSERT INTO pm_attachment_definition_version (
  attachment_definition_id, version_no, schema_version, lifecycle_status,
  schema_json, render_strategy, effective_from, published_at, is_active
)
SELECT definition.id,
       source.schema_version::text,
       source.schema_version,
       CASE WHEN source.version_rank = 1 THEN 'PUBLISHED' ELSE 'RETIRED' END,
       source.schema_json,
       source.render_strategy,
       CASE WHEN source.version_rank = 1 THEN CURRENT_DATE ELSE NULL END,
       CASE WHEN source.version_rank = 1 THEN now() ELSE NULL END,
       true
  FROM version_source source
  JOIN pm_attachment_definition definition
    ON definition.attachment_code = source.attachment_code
ON CONFLICT (attachment_definition_id, version_no) DO NOTHING;

UPDATE pm_template_attachment binding
   SET attachment_definition_version_id = version.id
  FROM pm_attachment_definition definition
  JOIN pm_attachment_definition_version version
    ON version.attachment_definition_id = definition.id,
       pm_template template
 WHERE binding.attachment_definition_version_id IS NULL
   AND template.id = binding.pm_template_id
   AND template.lifecycle_status = 'DRAFT'
   AND definition.attachment_code = binding.attachment_code
   AND version.schema_version = binding.schema_version
   AND version.schema_json = binding.schema_json;

CREATE INDEX IF NOT EXISTS idx_pm_attachment_definition_active
  ON pm_attachment_definition(is_active, attachment_type, attachment_code);

CREATE INDEX IF NOT EXISTS idx_pm_attachment_definition_version_lookup
  ON pm_attachment_definition_version(attachment_definition_id, lifecycle_status, is_active, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_pm_attachment_definition_published
  ON pm_attachment_definition_version(attachment_definition_id)
  WHERE lifecycle_status = 'PUBLISHED' AND is_active = true;

CREATE INDEX IF NOT EXISTS idx_pm_template_attachment_definition_version
  ON pm_template_attachment(attachment_definition_version_id)
  WHERE attachment_definition_version_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_pm_attachment_definition_updated_at ON pm_attachment_definition;
CREATE TRIGGER trg_pm_attachment_definition_updated_at
BEFORE UPDATE ON pm_attachment_definition
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_pm_attachment_definition_version_updated_at ON pm_attachment_definition_version;
CREATE TRIGGER trg_pm_attachment_definition_version_updated_at
BEFORE UPDATE ON pm_attachment_definition_version
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE pm_attachment_definition IS 'Reusable attachment identity such as seat map or brake measurement record.';
COMMENT ON TABLE pm_attachment_definition_version IS 'Immutable published attachment schema versions available to P1/P2/P3/P4 templates.';
COMMENT ON COLUMN pm_template_attachment.attachment_definition_version_id IS 'Published attachment-library version selected by this PM template revision; inline columns remain a stable snapshot.';

COMMIT;
