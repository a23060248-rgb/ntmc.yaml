const assert = require("node:assert/strict");

process.env.NODE_ENV = "rehearsal";
process.env.ENV_FILE = process.env.ENV_FILE || ".env.test";
process.env.DATABASE_SAFETY_MODE = process.env.DATABASE_SAFETY_MODE || "rehearsal";
require("../src/config/loadEnvironment").loadEnvironment();

const { pool, query } = require("../src/db");

async function main() {
  const database = await query("SELECT current_database() AS name");
  assert.match(database.rows[0].name, /rehearsal/i, "verification must use a rehearsal database");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const parent = await client.query("SELECT id FROM pm_template ORDER BY created_at LIMIT 1");
    assert.equal(parent.rowCount, 1, "a rehearsal PM template is required");

    const template = await client.query(
      `INSERT INTO form_template (
         template_code,template_name,pm_template_id,version_no,source_file_name,
         storage_path,file_hash,file_format,is_active,lifecycle_status
       ) VALUES ($1,$2,$3,'trigger-test','trigger-test.docx','trigger-test.docx',$4,'DOCX',true,'DRAFT')
       RETURNING id`,
      [`VERIFY-${Date.now()}`, "Word block trigger rehearsal", parent.rows[0].id, "a".repeat(64)]
    );
    const mapping = await client.query(
      `INSERT INTO form_template_block_mapping (
         form_template_id,block_code,source_path,block_type,word_target_type,word_target,is_required
       ) VALUES ($1,'CHECKS','backfill.checks','CHECK_TABLE','TABLE','1',true)
       RETURNING id`,
      [template.rows[0].id]
    );

    await client.query("SAVEPOINT missing_evidence");
    await assert.rejects(
      client.query(`UPDATE form_template_block_mapping SET is_verified=true WHERE id=$1`, [mapping.rows[0].id]),
      /requires a verification run/
    );
    await client.query("ROLLBACK TO SAVEPOINT missing_evidence");

    const run = await client.query(
      `INSERT INTO form_template_verification_run (
         form_template_id,verification_kind,print_stage,run_status,template_file_hash,
         output_file_hash,output_file_path,page_count,evidence_file_name,evidence_path,
         evidence_hash,verifier_name,verifier_version,completed_at
       ) VALUES ($1,'WORD_BLOCK_OUTPUT','POST_COMPLETION','PASSED',$2,$3,$4,8,$5,$6,$7,$8,'1',now())
       RETURNING id`,
      [template.rows[0].id, "a".repeat(64), "b".repeat(64), "C:/qa/output.docx",
        "evidence.json", "C:/qa/evidence.json", "c".repeat(64), "db-trigger-rehearsal"]
    );
    await client.query(
      `INSERT INTO form_template_block_verification (
         verification_run_id,block_mapping_id,block_code,result_status,output_file_hash,page_numbers,evidence_json
       ) VALUES ($1,$2,'CHECKS','PASSED',$3,ARRAY[2,3],'{"rows": 4}'::jsonb)`,
      [run.rows[0].id, mapping.rows[0].id, "b".repeat(64)]
    );
    await client.query(
      `UPDATE form_template_block_mapping
          SET is_verified=true,verified_run_id=$2
        WHERE id=$1`,
      [mapping.rows[0].id, run.rows[0].id]
    );
    const verified = await client.query(
      `SELECT is_verified,verified_run_id,verified_at
         FROM form_template_block_mapping WHERE id=$1`,
      [mapping.rows[0].id]
    );
    assert.equal(verified.rows[0].is_verified, true);
    assert.equal(verified.rows[0].verified_run_id, run.rows[0].id);
    assert.ok(verified.rows[0].verified_at);

    await client.query(
      `UPDATE form_template_block_mapping
          SET config_json='{"tableIndex": 2}'::jsonb
        WHERE id=$1`,
      [mapping.rows[0].id]
    );
    const reset = await client.query(
      `SELECT is_verified,verified_run_id,verified_at
         FROM form_template_block_mapping WHERE id=$1`,
      [mapping.rows[0].id]
    );
    assert.equal(reset.rows[0].is_verified, false);
    assert.equal(reset.rows[0].verified_run_id, null);
    assert.equal(reset.rows[0].verified_at, null);

    console.log(JSON.stringify({
      ok: true,
      database: database.rows[0].name,
      rules: {
        evidenceRequired: true,
        passedEvidenceAccepted: true,
        mappingEditResetsVerification: true,
      },
      persistedRows: 0,
    }, null, 2));
  } finally {
    await client.query("ROLLBACK").catch(() => {});
    client.release();
  }
}

main()
  .catch((error) => {
    console.error(error.stack || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
