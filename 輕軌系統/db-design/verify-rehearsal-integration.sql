DO $$
DECLARE
  role_count integer;
  fixture_count integer;
BEGIN
  IF current_database() !~ '^ntmc_erp_rehearsal_[a-zA-Z0-9_]+$' THEN
    RAISE EXCEPTION 'Rehearsal verification rejected database %', current_database();
  END IF;

  SELECT count(DISTINCT system_role) INTO role_count
    FROM app_user WHERE employee_no LIKE 'REH-%';
  IF role_count <> 6 THEN RAISE EXCEPTION 'Expected 6 rehearsal roles, found %', role_count; END IF;

  SELECT count(*) INTO fixture_count
    FROM user_session s JOIN app_user u ON u.id=s.user_id
   WHERE s.token LIKE 'reh-%-token' AND s.expires_at>now() AND u.employee_no LIKE 'REH-%';
  IF fixture_count <> 6 THEN RAISE EXCEPTION 'Expected 6 rehearsal API sessions, found %', fixture_count; END IF;

  SELECT count(*) INTO fixture_count
    FROM information_schema.columns
   WHERE table_schema='public' AND table_name='operation_audit_log'
     AND column_name IN ('request_id','before_summary','after_summary');
  IF fixture_count <> 3 THEN RAISE EXCEPTION 'Phase 8 audit columns are incomplete'; END IF;

  SELECT count(*) INTO fixture_count FROM train WHERE train_no='101' || chr(36554);
  IF fixture_count <> 1 THEN RAISE EXCEPTION 'Rehearsal train 101 is missing'; END IF;

  SELECT count(*) INTO fixture_count FROM warehouse WHERE warehouse_code IN ('REH-CENTER','REH-REPAIR');
  IF fixture_count <> 2 THEN RAISE EXCEPTION 'Rehearsal warehouses are incomplete'; END IF;

  SELECT count(*) INTO fixture_count FROM material WHERE part_no IN ('REH-CONS-001','REH-IDEM-001','REH-SERIAL-001');
  IF fixture_count <> 3 THEN RAISE EXCEPTION 'Rehearsal materials are incomplete'; END IF;

  SELECT count(*) INTO fixture_count FROM vendor WHERE vendor_code='REH-VENDOR' AND is_active=true;
  IF fixture_count <> 1 THEN RAISE EXCEPTION 'Rehearsal repair vendor is missing'; END IF;

  SELECT count(*) INTO fixture_count FROM instrument WHERE instrument_no='REH-INST-001';
  IF fixture_count <> 1 THEN RAISE EXCEPTION 'Rehearsal instrument is missing'; END IF;

  SELECT count(*) INTO fixture_count FROM wi_document WHERE wi_no='REH-WI-P1';
  IF fixture_count <> 1 THEN RAISE EXCEPTION 'Rehearsal WI is missing'; END IF;

  SELECT count(*) INTO fixture_count FROM vehicle_position WHERE position_code='REH-D-TS101-M1-AC' AND current_asset_id IS NOT NULL;
  IF fixture_count <> 1 THEN RAISE EXCEPTION 'Rehearsal position is not populated'; END IF;

  SELECT count(*) INTO fixture_count FROM asset a JOIN material m ON m.id=a.material_id
   WHERE m.part_no='REH-SERIAL-001' AND a.serial_no IN ('REH-ASSET-ONLINE-001','REH-ASSET-SPARE-001');
  IF fixture_count <> 2 THEN RAISE EXCEPTION 'Rehearsal serialized assets are incomplete'; END IF;

  SELECT count(*) INTO fixture_count FROM inventory_transaction
   WHERE note IN (
     'REHEARSAL_SEED_REH-CONS-001','REHEARSAL_SEED_REH-CONS-ISSUED',
     'REHEARSAL_SEED_REH-IDEM-CENTER','REHEARSAL_SEED_REH-IDEM-REPAIR',
     'REHEARSAL_SEED_REH-SERIAL-001'
   );
  IF fixture_count <> 5 THEN RAISE EXCEPTION 'Rehearsal opening transactions are not idempotent'; END IF;

  SELECT count(*) INTO fixture_count
    FROM inventory_bin_balance ibb
    JOIN material m ON m.id=ibb.material_id
    JOIN warehouse w ON w.id=ibb.warehouse_id
   WHERE m.part_no IN ('REH-CONS-001','REH-IDEM-001','REH-SERIAL-001')
     AND w.warehouse_code='REH-CENTER'
     AND ibb.qty > 0;
  IF fixture_count <> 3 THEN RAISE EXCEPTION 'Rehearsal bin balances are incomplete'; END IF;

  SELECT count(*) INTO fixture_count
    FROM inventory_bin_balance ibb
    JOIN material m ON m.id=ibb.material_id
    JOIN warehouse w ON w.id=ibb.warehouse_id
    JOIN warehouse_bin wb ON wb.id=ibb.warehouse_bin_id
   WHERE m.part_no='REH-CONS-001'
     AND w.warehouse_code='REH-REPAIR'
     AND wb.bin_code='REH-C01'
     AND ibb.stock_status='ISSUED'
     AND ibb.qty > 0;
  IF fixture_count <> 1 THEN RAISE EXCEPTION 'Rehearsal issued-stock fixture is missing'; END IF;

  SELECT count(*) INTO fixture_count
    FROM inventory_bin_balance ibb
    JOIN material m ON m.id=ibb.material_id
    JOIN warehouse w ON w.id=ibb.warehouse_id
    JOIN warehouse_bin wb ON wb.id=ibb.warehouse_bin_id
   WHERE m.part_no='REH-IDEM-001'
     AND w.warehouse_code IN ('REH-CENTER','REH-REPAIR')
     AND wb.bin_code IN ('REH-A01','REH-C01')
     AND ibb.qty > 0;
  IF fixture_count <> 2 THEN RAISE EXCEPTION 'Rehearsal idempotency stock fixture is missing'; END IF;
END $$;

SELECT 'rehearsal_fixture_ok' AS result;
