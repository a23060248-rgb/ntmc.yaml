const fs = require("node:fs");
const path = require("node:path");
const { Client } = require("pg");

process.env.NODE_ENV = "test";
process.env.ENV_FILE ||= ".env.test";
process.env.DATABASE_SAFETY_MODE ||= "rehearsal";
require("../src/config/loadEnvironment").loadEnvironment();

const { assertSafeDatabaseTarget, parseDatabaseTarget } = require("../src/config/databaseSafety");
const { hashPayload } = require("../src/services/masterDataImport");
const { buildMaterialIssueGroups } = require("../src/services/materialImportReview");

const systemRoot = path.resolve(__dirname, "..", "..");
const reportRoot = path.join(systemRoot, ".local-rehearsal");
const defaultBatchNo = "WAVE1-MATERIAL-387B23494318575E";

function canonicalSnapshot(rows) {
  return hashPayload(rows
    .map((row) => ({
      id: row.id,
      part_no: row.part_no,
      material_name: row.material_name,
      category_name: row.category_name,
      unit: row.unit,
    }))
    .sort((left, right) => String(left.part_no).localeCompare(String(right.part_no))));
}

function csvCell(value) {
  const serialized = value === null || value === undefined
    ? ""
    : typeof value === "string" ? value : JSON.stringify(value);
  return `"${serialized.replaceAll('"', '""')}"`;
}

function writeReports(batchNo, report) {
  fs.mkdirSync(reportRoot, { recursive: true });
  const reportKey = batchNo.replace(/[^A-Za-z0-9-]/g, "-").toLowerCase();
  const jsonPath = path.join(reportRoot, `${reportKey}-review.json`);
  const csvPath = path.join(reportRoot, `${reportKey}-review.csv`);
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  const lines = [[
    "issue_code", "issue_key", "affected_rows", "resolution_status", "proposed_action",
    "proposed_value", "evidence_level", "source_values", "canonical_values", "examples", "review_notes",
  ].map(csvCell).join(",")];
  for (const group of report.groups) {
    lines.push([
      group.issue_code,
      group.issue_key,
      group.affected_rows,
      group.resolution_status,
      group.proposed_resolution.action,
      group.proposed_resolution.proposed_value ?? group.proposed_resolution.proposed_name,
      group.proposed_resolution.evidence_level,
      group.issue_evidence.source_values,
      group.issue_evidence.canonical_values,
      group.issue_evidence.examples,
      group.review_notes,
    ].map(csvCell).join(","));
  }
  fs.writeFileSync(csvPath, `${lines.join("\r\n")}\r\n`, "utf8");
  return { jsonPath, csvPath };
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  assertSafeDatabaseTarget({
    connectionString: process.env.DATABASE_URL,
    safetyMode: process.env.DATABASE_SAFETY_MODE,
    allowedNamePattern: process.env.DATABASE_ALLOWED_NAME_PATTERN,
  });
  const batchNo = process.argv[2] || defaultBatchNo;
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const batchResult = await client.query(
      `SELECT id, batch_no, import_status FROM master_data_import_batch WHERE batch_no=$1`,
      [batchNo],
    );
    const batch = batchResult.rows[0];
    if (!batch) throw new Error(`Staging batch not found: ${batchNo}`);
    if (!["DRAFT", "VALIDATED"].includes(batch.import_status)) {
      throw new Error(`Staging batch ${batchNo} cannot prepare review in status ${batch.import_status}`);
    }
    const stagedResult = await client.query(
      `SELECT source_row_no, natural_key, normalized_payload, validation_messages
         FROM master_data_import_row
        WHERE batch_id=$1
        ORDER BY source_row_no`,
      [batch.id],
    );
    const canonicalBeforeResult = await client.query(
      `SELECT id, part_no, material_name, category_name, unit FROM material ORDER BY part_no`,
    );
    const groups = buildMaterialIssueGroups(stagedResult.rows, canonicalBeforeResult.rows);
    await client.query("BEGIN");
    await client.query(
      `DELETE FROM master_data_import_issue_resolution
        WHERE batch_id=$1 AND resolution_status='PENDING'`,
      [batch.id],
    );
    for (const group of groups) {
      await client.query(
        `INSERT INTO master_data_import_issue_resolution (
           batch_id, issue_code, issue_key, affected_rows, issue_evidence,
           proposed_resolution, resolution_status
         ) VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,'PENDING')
         ON CONFLICT (batch_id, issue_code, issue_key) DO NOTHING`,
        [
          batch.id,
          group.issueCode,
          group.issueKey,
          group.affectedRows,
          JSON.stringify(group.evidence),
          JSON.stringify(group.proposedResolution),
        ],
      );
    }
    await client.query("COMMIT");

    const resolutionResult = await client.query(
      `SELECT issue_code, issue_key, affected_rows, issue_evidence, proposed_resolution,
              resolution_status, review_notes, reviewed_at
         FROM master_data_import_issue_resolution
        WHERE batch_id=$1
        ORDER BY issue_code, issue_key`,
      [batch.id],
    );
    const summaryResult = await client.query(
      `SELECT * FROM v_master_data_import_issue_resolution_summary WHERE batch_id=$1`,
      [batch.id],
    );
    const canonicalAfterResult = await client.query(
      `SELECT id, part_no, material_name, category_name, unit FROM material ORDER BY part_no`,
    );
    const beforeHash = canonicalSnapshot(canonicalBeforeResult.rows);
    const afterHash = canonicalSnapshot(canonicalAfterResult.rows);
    if (beforeHash !== afterHash || canonicalBeforeResult.rowCount !== canonicalAfterResult.rowCount) {
      throw new Error("Canonical material changed while preparing review resolutions");
    }
    const report = {
      generatedAt: new Date().toISOString(),
      database: parseDatabaseTarget(process.env.DATABASE_URL).database,
      batchNo,
      batchId: batch.id,
      summary: summaryResult.rows[0],
      canonicalMaterial: {
        beforeCount: canonicalBeforeResult.rowCount,
        afterCount: canonicalAfterResult.rowCount,
        beforeHash,
        afterHash,
        unchanged: true,
      },
      groups: resolutionResult.rows,
    };
    const reports = writeReports(batchNo, report);
    console.log(JSON.stringify({
      ok: true,
      database: report.database,
      batchNo,
      summary: report.summary,
      canonicalMaterial: report.canonicalMaterial,
      reports,
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
