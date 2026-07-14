const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

process.env.NODE_ENV = "test";
process.env.ENV_FILE = process.env.ENV_FILE || ".env.test";
require("../src/config/loadEnvironment").loadEnvironment();

const { pool, query, withTransaction } = require("../src/db");

const systemRoot = path.resolve(__dirname, "..", "..");
const profilePath = path.join(systemRoot, "db-design", "templates", "p1-word-layout-1140826.json");

function sectionCode(name) {
  return `SEC-${crypto.createHash("sha1").update(name).digest("hex").slice(0, 10).toUpperCase()}`;
}

async function main() {
  const database = await query("SELECT current_database() AS name");
  assert.match(database.rows[0].name, /rehearsal/i, "staging must use a rehearsal database");

  const raw = fs.readFileSync(profilePath, "utf8");
  const profile = JSON.parse(raw);
  assert.equal(profile.pmCode, "P1");
  assert.ok(Array.isArray(profile.checkItems) && profile.checkItems.length > 0, "P1 profile has no check items");

  const sourceHash = crypto.createHash("sha256").update(raw).digest("hex");
  const existing = await query(
    `SELECT id,import_status,total_rows
       FROM pm_template_check_item_import_batch
      WHERE pm_template_id IS NULL
        AND import_kind='CHECK_ITEMS'
        AND source_file_hash=$1
        AND import_status IN ('VALIDATED','APPROVED')
      ORDER BY created_at DESC
      LIMIT 1`,
    [sourceHash],
  );
  if (existing.rowCount) {
    // Older rehearsal batches were created before the source profile was normalized to the PM code.
    // The batch is still the same Word extraction; normalize its filter key so the P1 review UI can find it.
    await query(
      `UPDATE pm_template_check_item_import_batch
          SET source_profile_code=$2
        WHERE id=$1 AND source_profile_code IS DISTINCT FROM $2`,
      [existing.rows[0].id, profile.pmCode],
    );
    const existingRows = await query(
      `SELECT count(*)::int AS total
         FROM pm_template_check_item_import_row
        WHERE batch_id=$1`,
      [existing.rows[0].id],
    );
    assert.equal(existingRows.rows[0].total, profile.checkItems.length, "existing staged batch is incomplete");
    console.log(JSON.stringify({
      ok: true,
      reused: true,
      database: database.rows[0].name,
      batchId: existing.rows[0].id,
      status: existing.rows[0].import_status,
      targetTemplateId: null,
      rows: existingRows.rows[0].total,
      sourceHash,
      nextStep: "Review and approve rows before applying them to a new P1 draft revision.",
    }, null, 2));
    return;
  }

  const batch = await withTransaction(async (client) => {
    const created = await client.query(
      `INSERT INTO pm_template_check_item_import_batch (
         import_kind,source_file_name,source_file_hash,source_profile_code,import_status,
         total_rows,valid_rows,invalid_rows,notes
       ) VALUES ('CHECK_ITEMS',$1,$2,$3,'VALIDATED',$4,$4,0,$5)
       RETURNING *`,
      [path.basename(profilePath), sourceHash, profile.pmCode, profile.checkItems.length,
        "Word 擷取暫存。需由業務逐項核准後，才可套用至草稿模板。"],
    );

    const sectionOrder = new Map();
    profile.checkItems.forEach((item) => {
      if (!sectionOrder.has(item.section)) sectionOrder.set(item.section, sectionOrder.size + 1);
    });
    for (const [index, item] of profile.checkItems.entries()) {
      await client.query(
        `INSERT INTO pm_template_check_item_import_row (
           batch_id,source_row_no,source_page_no,section_code,section_name,item_no,item_description,
           check_type,standard_value,unit,requires_value,is_required,min_value,max_value,sort_order,
           source_payload,validation_status,validation_messages
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,'VALID','[]'::jsonb
         )`,
        [created.rows[0].id, index + 1, item.sourcePage || null, sectionCode(item.section), item.section,
          item.itemNo, item.itemDescription, item.checkType || "checkbox", item.standardValue || null,
          item.unit || null, item.requiresValue === true, item.isRequired !== false, item.minValue ?? null,
          item.maxValue ?? null, item.sortOrder || (index + 1) * 10,
          JSON.stringify({ ...item, sectionSortOrder: sectionOrder.get(item.section) })],
      );
    }
    return created.rows[0];
  });

  const stagedRows = await query(
    `SELECT count(*)::int AS total
       FROM pm_template_check_item_import_row
      WHERE batch_id=$1`,
    [batch.id],
  );
  assert.equal(stagedRows.rows[0].total, profile.checkItems.length, "staged row count does not match the source layout");

  console.log(JSON.stringify({
    ok: true,
    database: database.rows[0].name,
    batchId: batch.id,
    status: batch.import_status,
    targetTemplateId: null,
    rows: stagedRows.rows[0].total,
    sourceHash,
    nextStep: "Review and approve rows before applying them to a new P1 draft revision.",
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error.stack || error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
