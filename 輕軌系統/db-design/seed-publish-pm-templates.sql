-- Publish fully seeded rehearsal PM template revisions.
-- Structural resources are immutable after this step.
BEGIN;

DO $$
DECLARE
  missing_template text;
BEGIN
  SELECT template.pm_code
    INTO missing_template
    FROM pm_template template
   WHERE template.pm_code = 'P1'
     AND template.lifecycle_status = 'DRAFT'
     AND template.is_active = true
     AND (
       NOT EXISTS (
         SELECT 1 FROM pm_template_section section
          WHERE section.pm_template_id = template.id AND section.is_active = true
       )
       OR NOT EXISTS (
         SELECT 1 FROM pm_template_check_item item
          WHERE item.pm_template_id = template.id AND item.is_active = true
       )
     )
   ORDER BY template.pm_code
   LIMIT 1;

  IF missing_template IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot publish PM template % without active sections and check items.', missing_template;
  END IF;
END $$;

UPDATE pm_template
   SET lifecycle_status = 'PUBLISHED',
       effective_from = COALESCE(effective_from, CURRENT_DATE),
       published_at = COALESCE(published_at, now()),
       updated_at = now()
 WHERE lifecycle_status = 'DRAFT'
   AND is_active = true
   AND EXISTS (
     SELECT 1
       FROM pm_template_check_item item
      WHERE item.pm_template_id = pm_template.id
        AND item.is_active = true
   );

COMMIT;
