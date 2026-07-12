-- Cross-work-order integrity constraints used by the P -> C -> R workflow.
-- Review before applying. This migration is intentionally not executed on the formal database by Codex.
BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS uq_repair_work_order_source_removed
  ON repair_work_order(source_fault_work_order_id, removed_asset_id)
  WHERE source_fault_work_order_id IS NOT NULL AND removed_asset_id IS NOT NULL;

COMMENT ON INDEX uq_repair_work_order_source_removed IS
  '同一來源 C 工單與拆下件序號只能建立一張 R 工單，防止重複送出。';

COMMIT;
