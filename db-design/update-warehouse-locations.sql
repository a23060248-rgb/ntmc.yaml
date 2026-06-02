-- Update inventory location names to the current warehouse distribution design.
-- Center warehouses are not issued stock; sub stations and temporary locations are issued/held stock.

INSERT INTO warehouse (warehouse_code, warehouse_name, location_type, default_stock_status, is_issue_destination, location_note)
VALUES
  ('TH-CENTER', '淡海機廠主庫房', 'CENTER_WAREHOUSE', 'AVAILABLE', false, '未領料、可發料庫存'),
  ('TH-SUB', '淡海分存站(機械工廠)', 'SUB_STATION', 'ISSUED', true, '已領料後保管位置'),
  ('TH-SUB-14', '淡海14號分存站', 'SUB_STATION', 'ISSUED', true, '已領料後保管位置'),
  ('TH-SUB-19', '淡海19號分存站', 'SUB_STATION', 'ISSUED', true, '已領料後保管位置'),
  ('AK-CENTER', '安坑機廠主庫房 B2', 'CENTER_WAREHOUSE', 'AVAILABLE', false, '未領料、可發料庫存'),
  ('AK-TEMP-C215', '安坑暫存區 C215', 'FIELD', 'QUARANTINE', true, '待修、待判定或暫存'),
  ('AK-BRIDGE-01', '安坑橋下倉庫 01', 'SUB_STATION', 'ISSUED', true, '已領料後保管位置'),
  ('AK-BRIDGE-02', '安坑橋下倉庫 02', 'SUB_STATION', 'ISSUED', true, '已領料後保管位置')
ON CONFLICT (warehouse_code) DO UPDATE SET
  warehouse_name = EXCLUDED.warehouse_name,
  location_type = EXCLUDED.location_type,
  default_stock_status = EXCLUDED.default_stock_status,
  is_issue_destination = EXCLUDED.is_issue_destination,
  location_note = EXCLUDED.location_note,
  updated_at = now();
