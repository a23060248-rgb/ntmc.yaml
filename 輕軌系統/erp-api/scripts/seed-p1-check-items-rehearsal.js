const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { Client } = require("pg");

const { assertSafeDatabaseTarget } = require("../src/config/databaseSafety");

function sectionCode(name) {
  return `SEC-${crypto.createHash("sha1").update(name).digest("hex").slice(0, 10).toUpperCase()}`;
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  assert.ok(connectionString, "DATABASE_URL is required");
  assertSafeDatabaseTarget({ connectionString, safetyMode: "rehearsal" });

  const profilePath = path.resolve(
    __dirname,
    "..",
    "..",
    "db-design",
    "templates",
    "p1-word-layout-1140826.json",
  );
  const profile = JSON.parse(fs.readFileSync(profilePath, "utf8"));
  assert.equal(profile.pmCode, "P1");
  assert.equal(profile.checkItems.length, 152, "The approved P1 profile must contain 152 items");

  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query("BEGIN");
    const template = await client.query(
      `SELECT id
         FROM pm_template
        WHERE pm_code='P1' AND lifecycle_status='DRAFT' AND is_active=true
        ORDER BY revision_no DESC
        LIMIT 1
        FOR UPDATE`,
    );
    assert.equal(template.rowCount, 1, "A single active P1 draft is required");
    const templateId = template.rows[0].id;

    const sectionIds = new Map();
    const sectionNames = [...new Set(profile.checkItems.map((item) => item.section))];
    for (const [index, name] of sectionNames.entries()) {
      const section = await client.query(
        `INSERT INTO pm_template_section (
           pm_template_id,section_code,section_name,sort_order,is_active
         ) VALUES ($1,$2,$3,$4,true)
         ON CONFLICT (pm_template_id,section_code) DO UPDATE
           SET section_name=EXCLUDED.section_name,
               sort_order=EXCLUDED.sort_order,
               is_active=true,
               updated_at=now()
         RETURNING id`,
        [templateId, sectionCode(name), name, (index + 1) * 10],
      );
      sectionIds.set(name, section.rows[0].id);
    }

    for (const item of profile.checkItems) {
      await client.query(
        `INSERT INTO pm_template_check_item (
           pm_template_id,section_id,section,item_no,item_description,check_type,
           standard_value,unit,default_status,requires_value,sort_order,is_active,
           is_required,min_value,max_value,section_sort_order
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'未填',$9,$10,true,$11,$12,$13,$14)
         ON CONFLICT (pm_template_id,item_no) DO UPDATE
           SET section_id=EXCLUDED.section_id,
               section=EXCLUDED.section,
               item_description=EXCLUDED.item_description,
               check_type=EXCLUDED.check_type,
               standard_value=EXCLUDED.standard_value,
               unit=EXCLUDED.unit,
               requires_value=EXCLUDED.requires_value,
               sort_order=EXCLUDED.sort_order,
               is_active=true,
               is_required=EXCLUDED.is_required,
               min_value=EXCLUDED.min_value,
               max_value=EXCLUDED.max_value,
               section_sort_order=EXCLUDED.section_sort_order,
               updated_at=now()`,
        [
          templateId,
          sectionIds.get(item.section),
          item.section,
          item.itemNo,
          item.itemDescription,
          item.checkType || "checkbox",
          item.standardValue || null,
          item.unit || null,
          item.requiresValue === true,
          item.sortOrder,
          item.isRequired !== false,
          item.minValue ?? null,
          item.maxValue ?? null,
          (sectionNames.indexOf(item.section) + 1) * 10,
        ],
      );
    }

    const counts = await client.query(
      `SELECT
         (SELECT count(*)::int FROM pm_template_section WHERE pm_template_id=$1 AND is_active=true) AS sections,
         (SELECT count(*)::int FROM pm_template_check_item WHERE pm_template_id=$1 AND is_active=true) AS items`,
      [templateId],
    );
    assert.equal(counts.rows[0].sections, sectionNames.length);
    assert.equal(counts.rows[0].items, 152);
    await client.query("COMMIT");
    console.log(JSON.stringify({ ok: true, template: "P1", ...counts.rows[0] }));
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
