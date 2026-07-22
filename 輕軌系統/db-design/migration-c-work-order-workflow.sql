-- C fault work-order workflow hardening.
-- Review before applying. Codex applies this migration to rehearsal databases only.
BEGIN;

ALTER TABLE work_order
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS status_changed_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS status_changed_by uuid REFERENCES app_user(id);

ALTER TABLE work_order
  DROP CONSTRAINT IF EXISTS work_order_version_positive;
ALTER TABLE work_order
  ADD CONSTRAINT work_order_version_positive CHECK (version > 0);

ALTER TABLE work_order_event
  ADD COLUMN IF NOT EXISTS event_type text,
  ADD COLUMN IF NOT EXISTS from_status text,
  ADD COLUMN IF NOT EXISTS to_status text,
  ADD COLUMN IF NOT EXISTS reason text,
  ADD COLUMN IF NOT EXISTS request_id text,
  ADD COLUMN IF NOT EXISTS payload jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE work_order_event
   SET event_type = COALESCE(event_type, action_code)
 WHERE event_type IS NULL;

ALTER TABLE work_order_event
  ALTER COLUMN event_type SET DEFAULT 'LEGACY',
  ALTER COLUMN event_type SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_work_order_event_request
  ON work_order_event(request_id)
  WHERE request_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS fault_work_order_assignment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id uuid NOT NULL REFERENCES work_order(id) ON DELETE CASCADE,
  assignment_type text NOT NULL CHECK (assignment_type IN ('DISPATCH', 'TRANSFER')),
  from_system text,
  to_system text,
  from_unit text,
  to_unit text,
  from_user_id uuid REFERENCES app_user(id),
  to_user_id uuid REFERENCES app_user(id),
  from_shift text,
  to_shift text,
  reason text NOT NULL,
  assigned_by uuid REFERENCES app_user(id),
  request_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fault_assignment_order_time
  ON fault_work_order_assignment(work_order_id, created_at DESC);

CREATE TABLE IF NOT EXISTS fault_work_order_shortage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id uuid NOT NULL REFERENCES work_order(id) ON DELETE CASCADE,
  previous_status text NOT NULL,
  material_id uuid REFERENCES material(id),
  item_code text,
  item_name text NOT NULL,
  required_qty numeric(14, 3) NOT NULL CHECK (required_qty > 0),
  unit text,
  expected_arrival_date date,
  supply_status text NOT NULL DEFAULT '待處理',
  responsible_user_id uuid REFERENCES app_user(id),
  is_blocking boolean NOT NULL DEFAULT true,
  reason text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES app_user(id),
  resolution_note text,
  request_id text
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_fault_shortage_active
  ON fault_work_order_shortage(work_order_id)
  WHERE resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_fault_shortage_expected
  ON fault_work_order_shortage(expected_arrival_date)
  WHERE resolved_at IS NULL;

CREATE TABLE IF NOT EXISTS fault_work_order_observation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id uuid NOT NULL REFERENCES work_order(id) ON DELETE CASCADE,
  previous_status text NOT NULL,
  reason text NOT NULL,
  observation_condition text NOT NULL,
  responsible_user_id uuid REFERENCES app_user(id),
  started_at timestamptz NOT NULL DEFAULT now(),
  due_at timestamptz NOT NULL,
  result_code text CHECK (result_code IN ('NORMAL', 'STILL_ABNORMAL', 'EXTENDED', 'REDISPATCH')),
  result_note text,
  completed_at timestamptz,
  completed_by uuid REFERENCES app_user(id),
  request_id text
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_fault_observation_active
  ON fault_work_order_observation(work_order_id)
  WHERE completed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_fault_observation_due
  ON fault_work_order_observation(due_at)
  WHERE completed_at IS NULL;

ALTER TABLE repair_work_order
  ADD COLUMN IF NOT EXISTS source_disassembly_event_id uuid REFERENCES asset_event(id);

ALTER TABLE asset_event
  ADD COLUMN IF NOT EXISTS request_id text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_asset_event_work_request_asset_type
  ON asset_event(work_order_id, request_id, asset_id, event_type)
  WHERE work_order_id IS NOT NULL AND request_id IS NOT NULL;

DROP INDEX IF EXISTS uq_repair_work_order_source_removed;

CREATE UNIQUE INDEX IF NOT EXISTS uq_repair_work_order_source_event_asset
  ON repair_work_order(source_fault_work_order_id, source_disassembly_event_id, removed_asset_id)
  WHERE source_fault_work_order_id IS NOT NULL
    AND source_disassembly_event_id IS NOT NULL
    AND removed_asset_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_repair_work_order_disassembly_event
  ON repair_work_order(source_disassembly_event_id)
  WHERE source_disassembly_event_id IS NOT NULL;

INSERT INTO workflow_option (
  option_group, option_code, option_label, sort_order, is_active, is_terminal
) VALUES
  ('C_STATUS', '0',  '報修', 0,  true, false),
  ('C_STATUS', '1',  '接單', 1,  true, false),
  ('C_STATUS', '2',  '派工', 2,  true, false),
  ('C_STATUS', '3',  '完工', 3,  true, false),
  ('C_STATUS', '4',  '覆核', 4,  true, false),
  ('C_STATUS', '5',  '結案', 5,  true, true),
  ('C_STATUS', '6',  '併單', 6,  true, true),
  ('C_STATUS', '7',  '轉單', 7,  true, false),
  ('C_STATUS', '8',  '作廢', 8,  true, true),
  ('C_STATUS', '9',  '缺料', 9,  true, false),
  ('C_STATUS', '10', '觀察', 10, true, false)
ON CONFLICT (option_group, option_code) DO UPDATE
  SET option_label = EXCLUDED.option_label,
      sort_order = EXCLUDED.sort_order,
      is_active = EXCLUDED.is_active,
      is_terminal = EXCLUDED.is_terminal;

COMMENT ON COLUMN work_order.version IS 'Optimistic-lock version. Every formal C-work-order action increments this value.';
COMMENT ON TABLE fault_work_order_assignment IS 'Immutable C-work-order dispatch and transfer history; original report data is never overwritten.';
COMMENT ON TABLE fault_work_order_shortage IS 'Repeatable shortage episodes with the status that must be restored after supply resolution.';
COMMENT ON TABLE fault_work_order_observation IS 'Repeatable observation episodes with due date, condition, owner, and result.';
COMMENT ON COLUMN repair_work_order.source_disassembly_event_id IS 'The exact asset_event that triggered this R work order.';

COMMIT;
