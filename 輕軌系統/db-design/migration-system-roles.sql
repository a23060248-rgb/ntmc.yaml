-- 輕軌維修系統：新前端角色欄位
-- 僅建立 migration，不由前端搬移任務直接套用正式資料庫。
BEGIN;

ALTER TABLE app_user
  ADD COLUMN IF NOT EXISTS system_role text NOT NULL DEFAULT 'viewer';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'app_user_system_role_chk'
  ) THEN
    ALTER TABLE app_user
      ADD CONSTRAINT app_user_system_role_chk CHECK (
        system_role IN (
          'system_admin',
          'maintenance_supervisor',
          'scheduler',
          'technician',
          'warehouse_staff',
          'viewer'
        )
      );
  END IF;
END $$;

COMMENT ON COLUMN app_user.system_role IS
  '新 React 前端路由與 API 角色：system_admin、maintenance_supervisor、scheduler、technician、warehouse_staff、viewer。';

COMMIT;
