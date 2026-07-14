const assert = require("node:assert/strict");

process.env.NODE_ENV = "test";
process.env.ENV_FILE = process.env.ENV_FILE || ".env.test";
require("../src/config/loadEnvironment").loadEnvironment();

const { pool, query } = require("../src/db");

async function main() {
  const database = await query("SELECT current_database() AS name");
  assert.match(database.rows[0].name, /rehearsal/i, "verification must use a rehearsal database");

  const ledger = await query(
    `SELECT migration_status
       FROM schema_migration
      WHERE sequence_no=270 AND migration_id='pm-template-structure'`,
  );
  assert.equal(ledger.rowCount, 1, "template import structure migration is missing from the ledger");

  const batch = await query(
    `SELECT *
       FROM pm_template_check_item_import_batch
      WHERE source_profile_code='P1'
      ORDER BY created_at DESC
      LIMIT 1`,
  );
  assert.equal(batch.rowCount, 1, "P1 import review batch is missing");

  const statuses = await query(
    `SELECT validation_status,count(*)::int AS total
       FROM pm_template_check_item_import_row
      WHERE batch_id=$1
      GROUP BY validation_status
      ORDER BY validation_status`,
    [batch.rows[0].id],
  );
  const total = statuses.rows.reduce((sum, row) => sum + row.total, 0);
  assert.equal(total, batch.rows[0].total_rows, "import batch row count does not match staged rows");

  if (batch.rows[0].import_status === "APPLIED") {
    assert.ok(batch.rows[0].pm_template_id, "applied import batch must reference its generated draft");
    const draft = await query(
      `SELECT lifecycle_status
         FROM pm_template
        WHERE id=$1`,
      [batch.rows[0].pm_template_id],
    );
    assert.equal(draft.rowCount, 1, "generated draft template is missing");
    assert.equal(draft.rows[0].lifecycle_status, "DRAFT", "import application must never publish a template");
  } else {
    assert.equal(batch.rows[0].pm_template_id, null, "unapplied import batch must not point to a template");
  }

  console.log(JSON.stringify({
    ok: true,
    database: database.rows[0].name,
    batch: {
      id: batch.rows[0].id,
      status: batch.rows[0].import_status,
      totalRows: batch.rows[0].total_rows,
      sourceFile: batch.rows[0].source_file_name,
      generatedDraftId: batch.rows[0].pm_template_id,
    },
    reviewStatuses: statuses.rows,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error.stack || error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
