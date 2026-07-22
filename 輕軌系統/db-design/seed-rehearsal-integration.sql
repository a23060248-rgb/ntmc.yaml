-- Disposable integration fixture. This file refuses to run outside ntmc_erp_rehearsal_*.
BEGIN;

DO $$
BEGIN
  IF current_database() !~ '^ntmc_erp_rehearsal_[a-zA-Z0-9_]+$' THEN
    RAISE EXCEPTION 'Rehearsal seed rejected database %', current_database();
  END IF;
END $$;

INSERT INTO app_user (
  employee_no, display_name, department, role_name, is_active,
  account, status, perm_items, perm_systems, note, system_role
)
VALUES
  ('REH-ADMIN', 'Rehearsal Admin', 'REHEARSAL', 'System Admin', true, 'rehearsal.admin@example.invalid', 0, '{}', '{}', 'Disposable integration fixture', 'system_admin'),
  ('REH-SUPERVISOR', 'Rehearsal Supervisor', 'REHEARSAL', 'Supervisor', true, 'rehearsal.supervisor@example.invalid', 0, '{}', '{}', 'Disposable integration fixture', 'maintenance_supervisor'),
  ('REH-SCHEDULER', 'Rehearsal Scheduler', 'REHEARSAL', 'Scheduler', true, 'rehearsal.scheduler@example.invalid', 0, '{}', '{}', 'Disposable integration fixture', 'scheduler'),
  ('REH-TECHNICIAN', 'Rehearsal Technician', 'REHEARSAL', 'Technician', true, 'rehearsal.technician@example.invalid', 0, '{}', '{}', 'Disposable integration fixture', 'technician'),
  ('REH-WAREHOUSE', 'Rehearsal Warehouse', 'REHEARSAL', 'Warehouse', true, 'rehearsal.warehouse@example.invalid', 0, '{}', '{}', 'Disposable integration fixture', 'warehouse_staff'),
  ('REH-VIEWER', 'Rehearsal Viewer', 'REHEARSAL', 'Viewer', true, 'rehearsal.viewer@example.invalid', 0, '{}', '{}', 'Disposable integration fixture', 'viewer')
ON CONFLICT (employee_no) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  department = EXCLUDED.department,
  role_name = EXCLUDED.role_name,
  is_active = true,
  account = EXCLUDED.account,
  status = 0,
  note = EXCLUDED.note,
  system_role = EXCLUDED.system_role,
  updated_at = now();

-- Rehearsal-only shared credential: Rehearsal!2026
UPDATE app_user
   SET password_hash = 'scrypt$16384$8$1$bnRtYy1yZWhlYXJzYWwhIQ$RyMQHb2q3iKV_jhQUBJEMDZhC1s3AlpNKZr-O1J5tVw',
       password_changed_at = now(),
       failed_login_count = 0,
       locked_until = NULL,
       updated_at = now()
 WHERE employee_no IN (
   'REH-ADMIN','REH-SUPERVISOR','REH-SCHEDULER',
   'REH-TECHNICIAN','REH-WAREHOUSE','REH-VIEWER'
 );

INSERT INTO user_session (
  token, token_hash, user_id, created_at, expires_at,
  revoked_at, last_seen_at, user_agent
)
SELECT token_value, NULL, u.id, now(), now() + interval '30 days',
       NULL, now(), 'ntmc-phase8-rehearsal'
  FROM (VALUES
    ('reh-system-admin-token', 'REH-ADMIN'),
    ('reh-supervisor-token', 'REH-SUPERVISOR'),
    ('reh-scheduler-token', 'REH-SCHEDULER'),
    ('reh-technician-token', 'REH-TECHNICIAN'),
    ('reh-warehouse-token', 'REH-WAREHOUSE'),
    ('reh-viewer-token', 'REH-VIEWER')
  ) AS fixture(token_value, employee_no)
  JOIN app_user u ON u.employee_no = fixture.employee_no
ON CONFLICT (token) DO UPDATE SET
  user_id = EXCLUDED.user_id,
  token_hash = NULL,
  created_at = now(),
  expires_at = now() + interval '30 days',
  revoked_at = NULL,
  last_seen_at = now(),
  user_agent = EXCLUDED.user_agent;

INSERT INTO train (train_no, fleet_name, site_code, line_name, display_order, remark, is_active)
VALUES ('101' || chr(36554), 'Rehearsal Fleet', 'D', 'Danhai', 101, 'Disposable integration fixture', true)
ON CONFLICT (train_no) DO UPDATE SET is_active=true, remark=EXCLUDED.remark, updated_at=now();

INSERT INTO warehouse (
  warehouse_code, warehouse_name, location_type, default_stock_status,
  is_issue_destination, location_note, is_active
)
VALUES
  ('REH-CENTER', 'Rehearsal Center Warehouse', 'CENTER_WAREHOUSE', 'AVAILABLE', false, 'Disposable integration fixture', true),
  ('REH-REPAIR', 'Rehearsal Repair Area', 'FIELD', 'REPAIR', true, 'Disposable integration fixture', true)
ON CONFLICT (warehouse_code) DO UPDATE SET
  warehouse_name=EXCLUDED.warehouse_name,
  location_type=EXCLUDED.location_type,
  default_stock_status=EXCLUDED.default_stock_status,
  is_issue_destination=EXCLUDED.is_issue_destination,
  is_active=true,
  updated_at=now();

INSERT INTO warehouse_bin (warehouse_id, bin_code, description, is_active)
SELECT id, 'REH-A01', 'Disposable integration fixture', true
  FROM warehouse WHERE warehouse_code='REH-CENTER'
ON CONFLICT (warehouse_id, bin_code) DO UPDATE SET is_active=true, updated_at=now();

INSERT INTO vendor (vendor_code, vendor_name, contact_name, contact_phone, is_active)
VALUES ('REH-VENDOR', 'Rehearsal Repair Vendor', 'Rehearsal Contact', '0000-000-000', true)
ON CONFLICT (vendor_code) DO UPDATE SET vendor_name=EXCLUDED.vendor_name, is_active=true, updated_at=now();

INSERT INTO warehouse_bin (warehouse_id, bin_code, description, is_active)
SELECT id, 'REH-C01', 'Disposable issued-stock fixture', true
  FROM warehouse WHERE warehouse_code='REH-REPAIR'
ON CONFLICT (warehouse_id, bin_code) DO UPDATE SET is_active=true, updated_at=now();

INSERT INTO material (
  part_no, material_name, spec, unit, system_code, system_name,
  material_type, material_property, repairable, is_serialized,
  reorder_point, is_active, review_note
)
VALUES
  ('REH-CONS-001', 'Rehearsal Cleaning Cloth', 'Integration fixture', 'EA', 'REH', 'Rehearsal', 'CONSUMABLE', 'CONSUMABLE', false, false, 10, true, 'Disposable integration fixture'),
  ('REH-IDEM-001', 'Rehearsal Idempotency Material', 'Inventory posting fixture', 'EA', 'REH', 'Rehearsal', 'CONSUMABLE', 'CONSUMABLE', false, false, 10, true, 'Disposable integration fixture'),
  ('REH-SERIAL-001', 'Rehearsal Serialized Unit', 'Integration fixture', 'EA', 'REH', 'Rehearsal', 'TURNAROUND', 'REPAIRABLE', true, true, 1, true, 'Disposable integration fixture')
ON CONFLICT (part_no) DO UPDATE SET
  material_name=EXCLUDED.material_name,
  spec=EXCLUDED.spec,
  unit=EXCLUDED.unit,
  repairable=EXCLUDED.repairable,
  is_serialized=EXCLUDED.is_serialized,
  is_active=true,
  updated_at=now();

INSERT INTO instrument (
  instrument_no, instrument_name, instrument_type, location,
  calibration_due_date, status, remark
)
VALUES ('REH-INST-001', 'Rehearsal Meter', 'METER', 'REH-CENTER', DATE '2099-12-31', 'AVAILABLE', 'Disposable integration fixture')
ON CONFLICT (instrument_no) DO UPDATE SET
  instrument_name=EXCLUDED.instrument_name,
  calibration_due_date=EXCLUDED.calibration_due_date,
  status=EXCLUDED.status,
  remark=EXCLUDED.remark,
  updated_at=now();

INSERT INTO wi_document (wi_no, wi_name, wi_type, version_no, status, remark)
VALUES ('REH-WI-P1', 'Rehearsal P1 Work Instruction', 'PM', '1', 'ACTIVE', 'Disposable integration fixture')
ON CONFLICT (wi_no) DO UPDATE SET
  wi_name=EXCLUDED.wi_name,
  version_no=EXCLUDED.version_no,
  status=EXCLUDED.status,
  remark=EXCLUDED.remark,
  updated_at=now();

INSERT INTO vehicle_position (
  position_code, site_code, target_code, train_id, train_set_no,
  module_no, position_name, position_type, is_installable,
  position_status, source_file, remark
)
SELECT
  'REH-D-TS101-M1-AC', 'D', 'TS', t.id, '101',
  'M1', 'Rehearsal M1 AC Unit', 'INDEPENDENT', true,
  'ONLINE', 'seed-rehearsal-integration.sql', 'Disposable integration fixture'
FROM train t WHERE t.train_no='101' || chr(36554)
ON CONFLICT (position_code) DO UPDATE SET
  train_id=EXCLUDED.train_id,
  position_status=EXCLUDED.position_status,
  remark=EXCLUDED.remark,
  updated_at=now();

INSERT INTO asset (
  material_id, serial_no, current_status, current_train_id,
  current_position_id, remark
)
SELECT m.id, 'REH-ASSET-ONLINE-001', 'ONLINE', t.id, vp.id, 'Disposable integration fixture'
  FROM material m
  JOIN train t ON t.train_no='101' || chr(36554)
  JOIN vehicle_position vp ON vp.position_code='REH-D-TS101-M1-AC'
 WHERE m.part_no='REH-SERIAL-001'
ON CONFLICT (material_id, serial_no) DO UPDATE SET
  current_status='ONLINE',
  current_warehouse_id=NULL,
  current_train_id=EXCLUDED.current_train_id,
  current_position_id=EXCLUDED.current_position_id,
  remark=EXCLUDED.remark,
  updated_at=now();

INSERT INTO asset (
  material_id, serial_no, current_status, current_warehouse_id, remark
)
SELECT m.id, 'REH-ASSET-SPARE-001', 'AVAILABLE', w.id, 'Disposable integration fixture'
  FROM material m
  JOIN warehouse w ON w.warehouse_code='REH-CENTER'
 WHERE m.part_no='REH-SERIAL-001'
ON CONFLICT (material_id, serial_no) DO UPDATE SET
  current_status='AVAILABLE',
  current_warehouse_id=EXCLUDED.current_warehouse_id,
  current_train_id=NULL,
  current_position_id=NULL,
  remark=EXCLUDED.remark,
  updated_at=now();

UPDATE vehicle_position vp
   SET current_asset_id=a.id, position_status='ONLINE', updated_at=now()
  FROM asset a
  JOIN material m ON m.id=a.material_id
 WHERE vp.position_code='REH-D-TS101-M1-AC'
   AND m.part_no='REH-SERIAL-001'
   AND a.serial_no='REH-ASSET-ONLINE-001';

INSERT INTO inventory_balance (material_id, warehouse_id, stock_status, qty)
SELECT m.id, w.id, 'AVAILABLE', 100
  FROM material m CROSS JOIN warehouse w
 WHERE m.part_no='REH-CONS-001' AND w.warehouse_code='REH-CENTER'
ON CONFLICT (material_id, warehouse_id, stock_status)
DO UPDATE SET qty=100, updated_at=now();

INSERT INTO inventory_balance (material_id, warehouse_id, stock_status, qty)
SELECT m.id, w.id, 'AVAILABLE', 1
  FROM material m CROSS JOIN warehouse w
 WHERE m.part_no='REH-SERIAL-001' AND w.warehouse_code='REH-CENTER'
ON CONFLICT (material_id, warehouse_id, stock_status)
DO UPDATE SET qty=1, updated_at=now();

INSERT INTO inventory_balance (material_id, warehouse_id, stock_status, qty)
SELECT m.id, w.id, 'ISSUED', 20
  FROM material m CROSS JOIN warehouse w
 WHERE m.part_no='REH-CONS-001' AND w.warehouse_code='REH-REPAIR'
ON CONFLICT (material_id, warehouse_id, stock_status)
DO UPDATE SET qty=20, updated_at=now();

INSERT INTO inventory_balance (material_id, warehouse_id, stock_status, qty)
SELECT m.id, w.id, 'AVAILABLE', 100
  FROM material m CROSS JOIN warehouse w
 WHERE m.part_no='REH-IDEM-001' AND w.warehouse_code='REH-CENTER'
ON CONFLICT (material_id, warehouse_id, stock_status)
DO UPDATE SET qty=100, updated_at=now();

INSERT INTO inventory_balance (material_id, warehouse_id, stock_status, qty)
SELECT m.id, w.id, 'ISSUED', 20
  FROM material m CROSS JOIN warehouse w
 WHERE m.part_no='REH-IDEM-001' AND w.warehouse_code='REH-REPAIR'
ON CONFLICT (material_id, warehouse_id, stock_status)
DO UPDATE SET qty=20, updated_at=now();

INSERT INTO inventory_bin_balance (material_id, warehouse_id, warehouse_bin_id, stock_status, qty)
SELECT m.id, w.id, wb.id, 'AVAILABLE', 100
  FROM material m
  JOIN warehouse w ON w.warehouse_code='REH-CENTER'
  JOIN warehouse_bin wb ON wb.warehouse_id=w.id AND wb.bin_code='REH-A01'
 WHERE m.part_no='REH-CONS-001'
ON CONFLICT (material_id, warehouse_id, warehouse_bin_id, stock_status)
DO UPDATE SET qty=100, updated_at=now();

INSERT INTO inventory_bin_balance (material_id, warehouse_id, warehouse_bin_id, stock_status, qty)
SELECT m.id, w.id, wb.id, 'AVAILABLE', 1
  FROM material m
  JOIN warehouse w ON w.warehouse_code='REH-CENTER'
  JOIN warehouse_bin wb ON wb.warehouse_id=w.id AND wb.bin_code='REH-A01'
 WHERE m.part_no='REH-SERIAL-001'
ON CONFLICT (material_id, warehouse_id, warehouse_bin_id, stock_status)
DO UPDATE SET qty=1, updated_at=now();

INSERT INTO inventory_bin_balance (material_id, warehouse_id, warehouse_bin_id, stock_status, qty)
SELECT m.id, w.id, wb.id, 'ISSUED', 20
  FROM material m
  JOIN warehouse w ON w.warehouse_code='REH-REPAIR'
  JOIN warehouse_bin wb ON wb.warehouse_id=w.id AND wb.bin_code='REH-C01'
 WHERE m.part_no='REH-CONS-001'
ON CONFLICT (material_id, warehouse_id, warehouse_bin_id, stock_status)
DO UPDATE SET qty=20, updated_at=now();

INSERT INTO inventory_bin_balance (material_id, warehouse_id, warehouse_bin_id, stock_status, qty)
SELECT m.id, w.id, wb.id, 'AVAILABLE', 100
  FROM material m
  JOIN warehouse w ON w.warehouse_code='REH-CENTER'
  JOIN warehouse_bin wb ON wb.warehouse_id=w.id AND wb.bin_code='REH-A01'
 WHERE m.part_no='REH-IDEM-001'
ON CONFLICT (material_id, warehouse_id, warehouse_bin_id, stock_status)
DO UPDATE SET qty=100, updated_at=now();

INSERT INTO inventory_bin_balance (material_id, warehouse_id, warehouse_bin_id, stock_status, qty)
SELECT m.id, w.id, wb.id, 'ISSUED', 20
  FROM material m
  JOIN warehouse w ON w.warehouse_code='REH-REPAIR'
  JOIN warehouse_bin wb ON wb.warehouse_id=w.id AND wb.bin_code='REH-C01'
 WHERE m.part_no='REH-IDEM-001'
ON CONFLICT (material_id, warehouse_id, warehouse_bin_id, stock_status)
DO UPDATE SET qty=20, updated_at=now();

INSERT INTO inventory_transaction (
  material_id, warehouse_id, stock_status, qty_change,
  transaction_type, created_by, note
)
SELECT m.id, w.id, 'AVAILABLE', 100, 'OPENING_BALANCE', u.id, 'REHEARSAL_SEED_REH-CONS-001'
  FROM material m
  JOIN warehouse w ON w.warehouse_code='REH-CENTER'
  JOIN app_user u ON u.employee_no='REH-WAREHOUSE'
 WHERE m.part_no='REH-CONS-001'
   AND NOT EXISTS (SELECT 1 FROM inventory_transaction WHERE note='REHEARSAL_SEED_REH-CONS-001');

INSERT INTO inventory_transaction (
  material_id, warehouse_id, warehouse_bin_id, stock_status, qty_change,
  transaction_type, created_by, note
)
SELECT m.id, w.id, wb.id, 'ISSUED', 20, 'OPENING_BALANCE', u.id, 'REHEARSAL_SEED_REH-CONS-ISSUED'
  FROM material m
  JOIN warehouse w ON w.warehouse_code='REH-REPAIR'
  JOIN warehouse_bin wb ON wb.warehouse_id=w.id AND wb.bin_code='REH-C01'
  JOIN app_user u ON u.employee_no='REH-WAREHOUSE'
 WHERE m.part_no='REH-CONS-001'
   AND NOT EXISTS (SELECT 1 FROM inventory_transaction WHERE note='REHEARSAL_SEED_REH-CONS-ISSUED');

INSERT INTO inventory_transaction (
  material_id, warehouse_id, warehouse_bin_id, stock_status, qty_change,
  transaction_type, created_by, note
)
SELECT m.id, w.id, wb.id, 'AVAILABLE', 100, 'OPENING_BALANCE', u.id, 'REHEARSAL_SEED_REH-IDEM-CENTER'
  FROM material m
  JOIN warehouse w ON w.warehouse_code='REH-CENTER'
  JOIN warehouse_bin wb ON wb.warehouse_id=w.id AND wb.bin_code='REH-A01'
  JOIN app_user u ON u.employee_no='REH-WAREHOUSE'
 WHERE m.part_no='REH-IDEM-001'
   AND NOT EXISTS (SELECT 1 FROM inventory_transaction WHERE note='REHEARSAL_SEED_REH-IDEM-CENTER');

INSERT INTO inventory_transaction (
  material_id, warehouse_id, warehouse_bin_id, stock_status, qty_change,
  transaction_type, created_by, note
)
SELECT m.id, w.id, wb.id, 'ISSUED', 20, 'OPENING_BALANCE', u.id, 'REHEARSAL_SEED_REH-IDEM-REPAIR'
  FROM material m
  JOIN warehouse w ON w.warehouse_code='REH-REPAIR'
  JOIN warehouse_bin wb ON wb.warehouse_id=w.id AND wb.bin_code='REH-C01'
  JOIN app_user u ON u.employee_no='REH-WAREHOUSE'
 WHERE m.part_no='REH-IDEM-001'
   AND NOT EXISTS (SELECT 1 FROM inventory_transaction WHERE note='REHEARSAL_SEED_REH-IDEM-REPAIR');

INSERT INTO inventory_transaction (
  material_id, warehouse_id, stock_status, asset_id, qty_change,
  transaction_type, created_by, note
)
SELECT m.id, w.id, 'AVAILABLE', a.id, 1, 'OPENING_BALANCE', u.id, 'REHEARSAL_SEED_REH-SERIAL-001'
  FROM material m
  JOIN warehouse w ON w.warehouse_code='REH-CENTER'
  JOIN asset a ON a.material_id=m.id AND a.serial_no='REH-ASSET-SPARE-001'
  JOIN app_user u ON u.employee_no='REH-WAREHOUSE'
 WHERE m.part_no='REH-SERIAL-001'
   AND NOT EXISTS (SELECT 1 FROM inventory_transaction WHERE note='REHEARSAL_SEED_REH-SERIAL-001');

COMMIT;

-- Non-Word integration scenarios still require a published form-template
-- reference before a P work order can be created. This placeholder never
-- points at an official document and must not be used by Word output tests.
BEGIN;

INSERT INTO form_template (
  template_code,
  template_name,
  pm_template_id,
  version_no,
  source_file_name,
  storage_path,
  file_hash,
  file_format,
  effective_from,
  lifecycle_status,
  is_active,
  metadata,
  created_by,
  published_by,
  published_at
)
SELECT
  'REH-P1-NONWORD',
  'Rehearsal P1 non-Word placeholder',
  template.id,
  '1',
  'REHEARSAL-NONWORD-ONLY.doc',
  '.local-rehearsal/nonword/REHEARSAL-NONWORD-ONLY.doc',
  'REHEARSAL-NONWORD-ONLY',
  'DOC',
  CURRENT_DATE,
  'PUBLISHED',
  true,
  jsonb_build_object('rehearsalOnly', true, 'wordOutputAllowed', false),
  admin.id,
  admin.id,
  now()
FROM pm_template template
JOIN app_user admin ON admin.employee_no='REH-ADMIN'
WHERE template.pm_code='P1'
  AND template.lifecycle_status='PUBLISHED'
  AND template.is_active=true
ORDER BY template.revision_no DESC
LIMIT 1
ON CONFLICT (template_code, version_no) DO UPDATE SET
  pm_template_id=EXCLUDED.pm_template_id,
  lifecycle_status='PUBLISHED',
  is_active=true,
  metadata=EXCLUDED.metadata,
  updated_at=now();

COMMIT;
