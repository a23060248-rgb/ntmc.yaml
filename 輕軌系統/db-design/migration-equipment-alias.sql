-- 設備別名對應表
-- 目的：把外部系統（故障 C 單等）的「設備名稱（自由文字）」對到本系統的標準設備。
--   - 對到「設備群組」equipment_group（總成/群組層級，例如 DCU、空調機組）
--   - 或對到「料號」material（單一料號層級）
-- 顯示時一律用主檔名稱（群組名或物料名），解決跨系統名稱不一致。
-- 可重複執行。

CREATE TABLE IF NOT EXISTS equipment_alias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_system text NOT NULL DEFAULT 'FAULT_C',
  alias_name text NOT NULL,
  target_kind text NOT NULL CHECK (target_kind IN ('GROUP', 'MATERIAL')),
  equipment_group_id uuid REFERENCES equipment_group(id),
  material_id uuid REFERENCES material(id),
  note text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT equipment_alias_unique UNIQUE (source_system, alias_name),
  CONSTRAINT equipment_alias_target_chk CHECK (
    (target_kind = 'GROUP' AND equipment_group_id IS NOT NULL)
    OR (target_kind = 'MATERIAL' AND material_id IS NOT NULL)
  )
);

COMMENT ON TABLE equipment_alias IS '設備別名對應：把外部系統（故障C單等）的設備名稱對到標準設備群組或料號；顯示時一律用主檔名稱，解決跨系統名稱不一致。';
COMMENT ON COLUMN equipment_alias.source_system IS '來源系統，例如 FAULT_C（故障C系統）。';
COMMENT ON COLUMN equipment_alias.alias_name IS '外部系統使用的設備名稱（自由文字），本表的對應鍵。';
COMMENT ON COLUMN equipment_alias.target_kind IS 'GROUP=對到設備群組；MATERIAL=對到料號。';

CREATE INDEX IF NOT EXISTS idx_equipment_alias_name ON equipment_alias(source_system, alias_name);

-- 解析後的對應：別名 → 標準代碼 + 標準名稱（顯示就用 canonical_name）
CREATE OR REPLACE VIEW v_equipment_alias AS
SELECT
  a.id,
  a.source_system,
  a.alias_name,
  a.target_kind,
  COALESCE(eg.group_code, m.part_no) AS target_code,
  COALESCE(eg.group_name, m.material_name) AS canonical_name,
  a.is_active
FROM equipment_alias a
LEFT JOIN equipment_group eg ON eg.id = a.equipment_group_id
LEFT JOIN material m ON m.id = a.material_id;

COMMENT ON VIEW v_equipment_alias IS '設備別名解析：alias_name → target_code / canonical_name。查 C 單設備名稱時用這個取回標準名稱。';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_equipment_alias_updated_at') THEN
    EXECUTE 'CREATE TRIGGER trg_equipment_alias_updated_at BEFORE UPDATE ON equipment_alias FOR EACH ROW EXECUTE FUNCTION set_updated_at()';
  END IF;
END $$;
