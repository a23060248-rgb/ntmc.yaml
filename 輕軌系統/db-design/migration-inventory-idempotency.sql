-- Idempotent inventory posting requests.
-- Review before applying. This migration is intentionally not executed on the formal database by Codex.
BEGIN;

CREATE TABLE IF NOT EXISTS inventory_posting_request (
  idempotency_key text PRIMARY KEY,
  operation_code text NOT NULL,
  request_hash text NOT NULL,
  request_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  response_payload jsonb,
  request_status text NOT NULL DEFAULT 'PROCESSING'
    CHECK (request_status IN ('PROCESSING', 'COMPLETED')),
  created_by uuid REFERENCES app_user(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_inventory_posting_request_created
  ON inventory_posting_request(created_at DESC);

COMMENT ON TABLE inventory_posting_request IS
  '庫存異動冪等請求；相同 key 與 payload 只允許過帳一次並回放原結果。';

COMMIT;
