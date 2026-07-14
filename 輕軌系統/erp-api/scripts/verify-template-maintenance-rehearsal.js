const assert = require("node:assert/strict");

process.env.NODE_ENV = "test";
process.env.ENV_FILE = process.env.ENV_FILE || ".env.test";
require("../src/config/loadEnvironment").loadEnvironment();

const { pool, query } = require("../src/db");
const { buildPmTemplateSnapshot, hashTemplateSnapshot } = require("../src/services/pmTemplateSnapshot");

async function main() {
  const database = await query("SELECT current_database() AS name");
  assert.match(database.rows[0].name, /rehearsal/i, "verification must use a rehearsal database");

  const ledger = await query(
    `SELECT migration_status
       FROM schema_migration
      WHERE sequence_no=250 AND migration_id='pm-template-maintenance'`,
  );
  assert.equal(ledger.rowCount, 1, "template maintenance migration is missing from the ledger");

  const structureLedger = await query(
    `SELECT migration_status
       FROM schema_migration
      WHERE sequence_no=270 AND migration_id='pm-template-structure'`,
  );
  assert.equal(structureLedger.rowCount, 1, "template structure migration is missing from the ledger");

  const template = await query(
    `SELECT id,pm_code,version_no,revision_no
       FROM pm_template
      WHERE pm_code='P1' AND lifecycle_status='PUBLISHED'
      ORDER BY revision_no DESC
      LIMIT 1`,
  );
  assert.equal(template.rowCount, 1, "published P1 template is missing");

  const first = await buildPmTemplateSnapshot(pool, template.rows[0].id);
  const second = await buildPmTemplateSnapshot(pool, template.rows[0].id);
  const firstHash = hashTemplateSnapshot(first);
  const secondHash = hashTemplateSnapshot(second);
  assert.equal(firstHash, secondHash, "template snapshot hash is not deterministic");
  assert.equal(first.template.id, template.rows[0].id);
  const sectionCodes = new Set(first.checks.map((item) => item.section_code));
  assert.ok(sectionCodes.size > 0, "P1 template sections are missing");
  assert.ok(first.checks.length > 0, "P1 template check items are missing");
  assert.ok(
    first.checks.every((item) => item.section_id && item.section_code),
    "P1 template check items must be assigned to a section",
  );
  assert.ok(first.attachments.length >= 2, "P1 attachment definitions are missing");
  assert.ok(first.attachments.every((item) => item.schema_version >= 1));
  assert.ok(first.attachments.every((item) => item.render_strategy));
  assert.ok(first.formTemplate, "published P1 Word form is missing");
  assert.ok(Array.isArray(first.fieldMappings));
  assert.ok(Array.isArray(first.blockMappings));

  const existingOrders = await query(
    `SELECT count(*)::int AS total,
            count(template_snapshot_hash)::int AS snapshotted
       FROM pm_work_order`,
  );

  console.log(JSON.stringify({
    ok: true,
    database: database.rows[0].name,
    ledger: {
      maintenance: { sequence: 250, status: ledger.rows[0].migration_status },
      structure: { sequence: 270, status: structureLedger.rows[0].migration_status },
    },
    template: template.rows[0],
    snapshotHash: firstHash,
    sections: sectionCodes.size,
    checkItems: first.checks.length,
    attachments: first.attachments.length,
    fieldMappings: first.fieldMappings.length,
    blockMappings: first.blockMappings.length,
    existingOrders: existingOrders.rows[0],
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error.stack || error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
