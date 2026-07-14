-- Append-only evidence for Word dynamic-block verification.
-- Review and rehearse before applying to any formal database.
BEGIN;

CREATE TABLE IF NOT EXISTS form_template_verification_run (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_template_id uuid NOT NULL REFERENCES form_template(id) ON DELETE CASCADE,
  print_job_id uuid REFERENCES work_order_print_job(id) ON DELETE SET NULL,
  verification_kind text NOT NULL DEFAULT 'WORD_BLOCK_OUTPUT'
    CHECK (verification_kind IN ('WORD_BLOCK_OUTPUT', 'PAGE_LAYOUT_COMPARISON')),
  print_stage text NOT NULL DEFAULT 'POST_COMPLETION'
    CHECK (print_stage IN ('PRE_WORK', 'POST_COMPLETION')),
  run_status text NOT NULL DEFAULT 'RUNNING'
    CHECK (run_status IN ('RUNNING', 'PASSED', 'FAILED')),
  template_file_hash text NOT NULL,
  output_file_hash text,
  output_file_path text,
  baseline_pdf_hash text,
  output_pdf_hash text,
  page_count integer CHECK (page_count IS NULL OR page_count > 0),
  evidence_file_name text,
  evidence_path text,
  evidence_hash text,
  verifier_name text NOT NULL,
  verifier_version text NOT NULL,
  summary_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  requested_by uuid REFERENCES app_user(id),
  requested_at timestamptz NOT NULL DEFAULT now(),
  completed_by uuid REFERENCES app_user(id),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS form_template_block_verification (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  verification_run_id uuid NOT NULL REFERENCES form_template_verification_run(id) ON DELETE CASCADE,
  block_mapping_id uuid NOT NULL REFERENCES form_template_block_mapping(id) ON DELETE CASCADE,
  block_code text NOT NULL,
  result_status text NOT NULL CHECK (result_status IN ('PASSED', 'FAILED')),
  output_file_hash text NOT NULL,
  page_numbers integer[] NOT NULL DEFAULT ARRAY[]::integer[],
  evidence_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (verification_run_id, block_mapping_id)
);

ALTER TABLE form_template_block_mapping
  ADD COLUMN IF NOT EXISTS verified_run_id uuid
    REFERENCES form_template_verification_run(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_form_template_verification_run_template
  ON form_template_verification_run(form_template_id, requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_form_template_verification_run_print_job
  ON form_template_verification_run(print_job_id)
  WHERE print_job_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_form_template_block_verification_run
  ON form_template_block_verification(verification_run_id, result_status);

CREATE OR REPLACE FUNCTION guard_form_template_verification_run()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.run_status IN ('PASSED', 'FAILED') THEN
    RAISE EXCEPTION 'completed Word verification runs are immutable';
  END IF;

  IF NEW.run_status = 'PASSED' THEN
    IF NEW.output_file_hash IS NULL OR NEW.output_file_path IS NULL
       OR NEW.evidence_hash IS NULL
       OR NEW.evidence_path IS NULL OR NEW.page_count IS NULL
       OR NEW.completed_at IS NULL THEN
      RAISE EXCEPTION 'passed Word verification requires output hash, evidence, page count, and completion time';
    END IF;
  ELSIF NEW.run_status = 'FAILED' AND NEW.completed_at IS NULL THEN
    RAISE EXCEPTION 'failed Word verification requires a completion time';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_guard_form_template_verification_run
  ON form_template_verification_run;
CREATE TRIGGER trg_guard_form_template_verification_run
BEFORE INSERT OR UPDATE ON form_template_verification_run
FOR EACH ROW EXECUTE FUNCTION guard_form_template_verification_run();

CREATE OR REPLACE FUNCTION guard_form_template_block_mapping_verification()
RETURNS trigger AS $$
DECLARE
  verified_run form_template_verification_run%ROWTYPE;
  block_passed boolean;
BEGIN
  IF TG_OP = 'UPDATE' AND (
    OLD.block_code IS DISTINCT FROM NEW.block_code OR
    OLD.source_path IS DISTINCT FROM NEW.source_path OR
    OLD.block_type IS DISTINCT FROM NEW.block_type OR
    OLD.word_target_type IS DISTINCT FROM NEW.word_target_type OR
    OLD.word_target IS DISTINCT FROM NEW.word_target OR
    OLD.transform_code IS DISTINCT FROM NEW.transform_code OR
    OLD.config_json IS DISTINCT FROM NEW.config_json
  ) THEN
    NEW.is_verified := false;
    NEW.verified_run_id := NULL;
    NEW.verified_at := NULL;
    NEW.verified_by := NULL;
  END IF;

  IF NEW.is_verified THEN
    IF NEW.verified_run_id IS NULL THEN
      RAISE EXCEPTION 'verified Word block mapping requires a verification run';
    END IF;

    SELECT * INTO verified_run
      FROM form_template_verification_run
     WHERE id = NEW.verified_run_id
       AND form_template_id = NEW.form_template_id
       AND run_status = 'PASSED';

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Word verification run is missing, failed, or belongs to another template';
    END IF;

    SELECT EXISTS (
      SELECT 1
        FROM form_template_block_verification block_result
       WHERE block_result.verification_run_id = verified_run.id
         AND block_result.block_mapping_id = NEW.id
         AND block_result.block_code = NEW.block_code
         AND block_result.result_status = 'PASSED'
         AND block_result.output_file_hash = verified_run.output_file_hash
    ) INTO block_passed;

    IF NOT block_passed THEN
      RAISE EXCEPTION 'Word block mapping has no matching passed evidence';
    END IF;

    NEW.verified_at := verified_run.completed_at;
    NEW.verified_by := verified_run.completed_by;
  ELSE
    NEW.verified_run_id := NULL;
    NEW.verified_at := NULL;
    NEW.verified_by := NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_guard_form_template_block_mapping_verification
  ON form_template_block_mapping;
CREATE TRIGGER trg_guard_form_template_block_mapping_verification
BEFORE INSERT OR UPDATE ON form_template_block_mapping
FOR EACH ROW EXECUTE FUNCTION guard_form_template_block_mapping_verification();

COMMENT ON TABLE form_template_verification_run IS
  'Immutable Word COM and page-comparison evidence for one form template version.';
COMMENT ON TABLE form_template_block_verification IS
  'Per-block pass/fail evidence belonging to a completed Word verification run.';
COMMENT ON COLUMN form_template_block_mapping.verified_run_id IS
  'Passed verification run that proved this exact block mapping in an output file.';

COMMIT;
