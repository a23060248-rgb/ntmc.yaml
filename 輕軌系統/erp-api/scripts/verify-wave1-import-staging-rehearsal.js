const assert = require("node:assert/strict");
const { Client } = require("pg");

process.env.NODE_ENV = "test";
process.env.ENV_FILE ||= ".env.test";
process.env.DATABASE_SAFETY_MODE ||= "rehearsal";
require("../src/config/loadEnvironment").loadEnvironment();

const { assertSafeDatabaseTarget, parseDatabaseTarget } = require("../src/config/databaseSafety");
const { validateMasterDataRow } = require("../src/services/masterDataImport");

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  assertSafeDatabaseTarget({
    connectionString: process.env.DATABASE_URL,
    safetyMode: process.env.DATABASE_SAFETY_MODE,
    allowedNamePattern: process.env.DATABASE_ALLOWED_NAME_PATTERN,
  });

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const relations = await client.query(
      `SELECT to_regclass('public.master_data_import_batch')::text AS batch_table,
              to_regclass('public.master_data_import_row')::text AS row_table,
              to_regclass('public.v_master_data_import_batch_summary')::text AS summary_view`,
    );
    assert.equal(relations.rows[0].batch_table, "master_data_import_batch");
    assert.equal(relations.rows[0].row_table, "master_data_import_row");
    assert.equal(relations.rows[0].summary_view, "v_master_data_import_batch_summary");

    await client.query("BEGIN");
    const batch = await client.query(
      `INSERT INTO master_data_import_batch (
         batch_no, entity_kind, source_type, source_file_name, source_authority, expected_rows
       ) VALUES ($1, 'MATERIAL', 'JSON', 'verification.json', 'AUTOMATED_TEST', 2) RETURNING id`,
      [`VERIFY-WAVE1-${Date.now()}`],
    );

    const rows = [
      validateMasterDataRow("MATERIAL", { part_no: "VERIFY.0001", material_name: "驗證物料一" }),
      validateMasterDataRow("MATERIAL", { part_no: "VERIFY.0002", material_name: "驗證物料二" }),
    ];
    for (const [index, row] of rows.entries()) {
      await client.query(
        `INSERT INTO master_data_import_row (
           batch_id, source_row_no, natural_key, raw_payload, normalized_payload,
           payload_hash, validation_status, validation_messages, proposed_action
         ) VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,'[]'::jsonb,$8)`,
        [batch.rows[0].id, index + 1, row.naturalKey, JSON.stringify(row.normalized),
          JSON.stringify(row.normalized), row.payloadHash, row.validationStatus,
          index === 0 ? "INSERT" : "NO_CHANGE"],
      );
    }
    await client.query(`UPDATE master_data_import_batch SET import_status='VALIDATED' WHERE id=$1`, [batch.rows[0].id]);
    const summary = await client.query(
      `SELECT staged_rows, valid_rows, warning_rows, invalid_rows, insert_rows, unchanged_rows
         FROM v_master_data_import_batch_summary WHERE id=$1`,
      [batch.rows[0].id],
    );
    assert.deepEqual(summary.rows[0], {
      staged_rows: 2, valid_rows: 2, warning_rows: 0, invalid_rows: 0, insert_rows: 1, unchanged_rows: 1,
    });
    await client.query("ROLLBACK");
    console.log(JSON.stringify({
      ok: true,
      database: parseDatabaseTarget(process.env.DATABASE_URL).database,
      stagedRows: 2,
      persistedRows: 0,
      transaction: "ROLLED_BACK",
    }, null, 2));
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
