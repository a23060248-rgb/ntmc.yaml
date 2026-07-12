-- Maintainable PM form definitions, immutable work-order snapshots, and dynamic Word block mappings.
-- Review and rehearse before applying to any formal database.
BEGIN;

ALTER TABLE pm_template_attachment
  ADD COLUMN IF NOT EXISTS is_required boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS condition_code text NOT NULL DEFAULT 'ALWAYS',
  ADD COLUMN IF NOT EXISTS schema_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS render_strategy text NOT NULL DEFAULT 'WORD_BLOCK';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pm_template_attachment_schema_version_chk'
  ) THEN
    ALTER TABLE pm_template_attachment
      ADD CONSTRAINT pm_template_attachment_schema_version_chk CHECK (schema_version > 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pm_template_attachment_render_strategy_chk'
  ) THEN
    ALTER TABLE pm_template_attachment
      ADD CONSTRAINT pm_template_attachment_render_strategy_chk
      CHECK (render_strategy IN ('WORD_BLOCK', 'WORD_TABLE', 'WORD_OVERLAY', 'DATA_ONLY'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS form_template_block_mapping (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_template_id uuid NOT NULL REFERENCES form_template(id) ON DELETE CASCADE,
  block_code text NOT NULL,
  source_path text NOT NULL,
  block_type text NOT NULL
    CHECK (block_type IN ('CHECK_TABLE', 'MATERIAL_TABLE', 'SEAT_MAP', 'MEASUREMENT_TABLE', 'OTHER')),
  word_target_type text NOT NULL
    CHECK (word_target_type IN ('BOOKMARK_RANGE', 'TABLE', 'SHAPE_COORDINATES', 'IMAGE_OVERLAY')),
  word_target text NOT NULL,
  transform_code text,
  config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_required boolean NOT NULL DEFAULT false,
  is_verified boolean NOT NULL DEFAULT false,
  verified_at timestamptz,
  verified_by uuid REFERENCES app_user(id),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (form_template_id, block_code)
);

ALTER TABLE pm_work_order
  ADD COLUMN IF NOT EXISTS template_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS template_snapshot_hash text,
  ADD COLUMN IF NOT EXISTS template_snapshot_created_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_form_template_block_mapping_template
  ON form_template_block_mapping(form_template_id, sort_order, block_code);

DROP TRIGGER IF EXISTS trg_form_template_block_mapping_updated_at ON form_template_block_mapping;
CREATE TRIGGER trg_form_template_block_mapping_updated_at
BEFORE UPDATE ON form_template_block_mapping
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON COLUMN pm_template_attachment.condition_code IS 'ALWAYS or a print/backfill condition code evaluated by the work package.';
COMMENT ON COLUMN pm_template_attachment.render_strategy IS 'How this digital attachment is represented in the formal Word output.';
COMMENT ON TABLE form_template_block_mapping IS 'Maps repeatable or graphical digital form blocks to an immutable Word template version.';
COMMENT ON COLUMN pm_work_order.template_snapshot IS 'Immutable PM template, item, attachment, material, instrument, WI, Word, and mapping snapshot captured for this P work order.';
COMMENT ON COLUMN pm_work_order.template_snapshot_hash IS 'SHA256 of the canonical template_snapshot JSON.';

COMMIT;
