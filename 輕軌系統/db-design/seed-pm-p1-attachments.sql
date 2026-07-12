-- P1 attachment definitions confirmed from the supplied official form images.
-- Review before applying. This seed is intentionally not executed by Codex.
BEGIN;

WITH p1 AS (
  SELECT id FROM pm_template
   WHERE pm_code='P1' AND lifecycle_status='PUBLISHED' AND is_active=true
   ORDER BY revision_no DESC LIMIT 1
)
INSERT INTO pm_template_attachment (pm_template_id, attachment_code, attachment_name, attachment_type, schema_json, sort_order)
SELECT p1.id, 'P1-SEAT', '附件一：座椅確認圖', 'SEAT_MAP',
  jsonb_build_object(
    'modules', jsonb_build_array(
      jsonb_build_object('code','M5','rows',jsonb_build_array(
        jsonb_build_array('P','S',null,'S','S'), jsonb_build_array('P','S',null,'S','S'),
        jsonb_build_array('P','S',null,'S','S'), jsonb_build_array('P','S',null,'S','S'))),
      jsonb_build_object('code','M4','rows',jsonb_build_array(
        jsonb_build_array('S','S',null,null), jsonb_build_array(null,null,null,null),
        jsonb_build_array('S','S','P','P'))),
      jsonb_build_object('code','M3','rows',jsonb_build_array(
        jsonb_build_array('S','S',null,'S','S'), jsonb_build_array('S','S',null,'S','S'),
        jsonb_build_array('S','S',null,'S','S'), jsonb_build_array('S','S',null,'S','S'))),
      jsonb_build_object('code','M2','rows',jsonb_build_array(
        jsonb_build_array('P','P','S','S','S'), jsonb_build_array(null,null,null,'S','S'))),
      jsonb_build_object('code','M1','rows',jsonb_build_array(
        jsonb_build_array('S','S',null,'S','P'), jsonb_build_array('S','S',null,'S','P'),
        jsonb_build_array('S','S',null,'S','P'), jsonb_build_array('S','S',null,'S','P')))
    ),
    'legend', jsonb_build_object('S','一般座椅','P','優先座椅'),
    'abnormalMark','X'
  ), 1 FROM p1
ON CONFLICT (pm_template_id, attachment_code) DO UPDATE
SET attachment_name=EXCLUDED.attachment_name, schema_json=EXCLUDED.schema_json, is_active=true;

WITH p1 AS (
  SELECT id FROM pm_template
   WHERE pm_code='P1' AND lifecycle_status='PUBLISHED' AND is_active=true
   ORDER BY revision_no DESC LIMIT 1
)
INSERT INTO pm_template_attachment (pm_template_id, attachment_code, attachment_name, attachment_type, schema_json, sort_order)
SELECT p1.id, 'P1-MAG-BRAKE', '附件二：電磁式軌道煞車量測紀錄', 'MEASUREMENT_TABLE',
  jsonb_build_object(
    'points', jsonb_build_array(
      jsonb_build_object('key','M1-1','label','模組 1 / 6-9mm'),
      jsonb_build_object('key','M2-2','label','模組 2 / 6-9mm'),
      jsonb_build_object('key','M3-3','label','模組 3 / 6-9mm'),
      jsonb_build_object('key','M4-4','label','模組 4 / 6-9mm'),
      jsonb_build_object('key','M5-5','label','模組 5 / 6-9mm'),
      jsonb_build_object('key','M5-6','label','模組 5 / 6-9mm')
    ),
    'fields', jsonb_build_array(
      jsonb_build_object('key','airGapMm','label','空氣隙','unit','mm','min',6,'max',9,'required',true),
      jsonb_build_object('key','wearDistanceMm','label','厚度至動面距離','unit','mm','required',true),
      jsonb_build_object('key','surfaceStatus','label','磁鐵表面','type','status','required',true)
    )
  ), 2 FROM p1
ON CONFLICT (pm_template_id, attachment_code) DO UPDATE
SET attachment_name=EXCLUDED.attachment_name, schema_json=EXCLUDED.schema_json, is_active=true;

COMMIT;
