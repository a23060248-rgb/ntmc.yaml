BEGIN;

CREATE TABLE IF NOT EXISTS operation_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES app_user(id),
  actor_text text,
  actor_role text,
  action_code text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  entity_no text,
  request_method text,
  request_path text,
  request_id text,
  response_status integer,
  request_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  before_summary jsonb,
  after_summary jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE operation_audit_log
  ADD COLUMN IF NOT EXISTS request_id text,
  ADD COLUMN IF NOT EXISTS before_summary jsonb,
  ADD COLUMN IF NOT EXISTS after_summary jsonb;

CREATE INDEX IF NOT EXISTS idx_operation_audit_created
  ON operation_audit_log(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_operation_audit_entity
  ON operation_audit_log(entity_type, entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_operation_audit_actor
  ON operation_audit_log(actor_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_operation_audit_request
  ON operation_audit_log(request_id, created_at DESC);

COMMENT ON TABLE operation_audit_log IS
  '跨模組操作稽核。新增、編輯、狀態轉移、列印、完工與庫存過帳皆保留，不提供一般 API 刪除。';

COMMIT;
