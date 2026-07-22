const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { Client } = require("pg");

process.env.NODE_ENV = "test";
process.env.ENV_FILE ||= ".env.test";
process.env.DATABASE_SAFETY_MODE ||= "rehearsal";
require("../src/config/loadEnvironment").loadEnvironment();

const { assertSafeDatabaseTarget, parseDatabaseTarget } = require("../src/config/databaseSafety");
const { hashPayload } = require("../src/services/masterDataImport");
const { compareMaterialRow, readMaterialWorkbook } = require("../src/services/materialWorkbookImport");

const systemRoot = path.resolve(__dirname, "..", "..");
const defaultSource = path.join(systemRoot, "db-design", "物料基礎檔_現有1147筆.xlsx");
const reportRoot = path.join(systemRoot, ".local-rehearsal");

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex").toUpperCase()));
  });
}

function canonicalSnapshot(rows) {
  return hashPayload(rows
    .map((row) => Object.fromEntries(Object.entries(row).sort(([left], [right]) => left.localeCompare(right))))
    .sort((left, right) => String(left.part_no).localeCompare(String(right.part_no))));
}

function summarize(rows) {
  const summary = {
    total: rows.length,
    valid: 0,
    warning: 0,
    invalid: 0,
    insert: 0,
    update: 0,
    noChange: 0,
    reject: 0,
  };
  for (const row of rows) {
    if (row.validationStatus === "VALID") summary.valid += 1;
    if (row.validationStatus === "WARNING") summary.warning += 1;
    if (row.validationStatus === "INVALID") summary.invalid += 1;
    if (row.proposedAction === "INSERT") summary.insert += 1;
    if (row.proposedAction === "UPDATE") summary.update += 1;
    if (row.proposedAction === "NO_CHANGE") summary.noChange += 1;
    if (row.proposedAction === "REJECT") summary.reject += 1;
  }
  return summary;
}

function csvCell(value) {
  const serialized = value === null || value === undefined
    ? ""
    : typeof value === "string" ? value : JSON.stringify(value);
  return `"${serialized.replaceAll('"', '""')}"`;
}

function writeReports(reportKey, report) {
  fs.mkdirSync(reportRoot, { recursive: true });
  const jsonPath = path.join(reportRoot, `material-dry-run-${reportKey}.json`);
  const csvPath = path.join(reportRoot, `material-dry-run-${reportKey}.csv`);
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  const header = [
    "source_row_no", "part_no", "material_name", "validation_status", "proposed_action",
    "target_id", "messages", "differences",
  ];
  const lines = [header.map(csvCell).join(",")];
  for (const row of report.rows) {
    lines.push([
      row.sourceRowNo,
      row.naturalKey,
      row.normalized.material_name,
      row.validationStatus,
      row.proposedAction,
      row.targetId,
      row.messages,
      row.differences,
    ].map(csvCell).join(","));
  }
  fs.writeFileSync(csvPath, `${lines.join("\r\n")}\r\n`, "utf8");
  return { jsonPath, csvPath };
}

async function fetchCanonicalMaterials(client) {
  const result = await client.query(
    `SELECT id, part_no, material_name, spec, unit, system_code, system_name,
            category_code, category_name, sequence_no, type_code, material_property,
            repairable, is_serialized, safety_level, lead_time_days, reorder_point,
            estimated_unit_price, market_available, review_note
       FROM material
      ORDER BY part_no`,
  );
  return result.rows;
}

async function upsertDraftBatch(client, metadata) {
  await client.query(
    `INSERT INTO master_data_import_batch (
       batch_no, wave_no, entity_kind, source_type, source_file_name, source_file_hash,
       source_sheet, source_authority, expected_rows, notes
     ) VALUES ($1,1,'MATERIAL','EXCEL',$2,$3,'物料匯入','UNAPPROVED_SOURCE_REVIEW',$4,$5)
     ON CONFLICT (batch_no) DO NOTHING`,
    [metadata.batchNo, metadata.sourceFileName, metadata.sourceHash, metadata.expectedRows, metadata.notes],
  );
  const batchResult = await client.query(
    `SELECT id, import_status FROM master_data_import_batch WHERE batch_no=$1 FOR UPDATE`,
    [metadata.batchNo],
  );
  const batch = batchResult.rows[0];
  if (!batch) throw new Error(`Unable to create or find staging batch ${metadata.batchNo}`);
  if (["APPROVED", "APPLIED", "REJECTED", "CANCELLED"].includes(batch.import_status)) {
    throw new Error(`Staging batch ${metadata.batchNo} is terminal (${batch.import_status})`);
  }
  if (batch.import_status === "VALIDATED") {
    await client.query(`UPDATE master_data_import_batch SET import_status='DRAFT' WHERE id=$1`, [batch.id]);
  }
  await client.query(
    `UPDATE master_data_import_batch
        SET source_file_name=$2, source_file_hash=$3, expected_rows=$4, notes=$5,
            source_authority='UNAPPROVED_SOURCE_REVIEW'
      WHERE id=$1`,
    [batch.id, metadata.sourceFileName, metadata.sourceHash, metadata.expectedRows, metadata.notes],
  );
  await client.query(`DELETE FROM master_data_import_row WHERE batch_id=$1`, [batch.id]);
  return batch.id;
}

async function stageRows(client, batchId, rows) {
  for (const row of rows) {
    const messages = [
      ...row.messages,
      ...row.differences.map((difference) => ({
        severity: "INFO",
        code: "FIELD_DIFFERENCE",
        field: difference.field,
        message: `${difference.field} 將由 ${JSON.stringify(difference.targetValue)} 改為 ${JSON.stringify(difference.sourceValue)}`,
      })),
    ];
    await client.query(
      `INSERT INTO master_data_import_row (
         batch_id, source_row_no, natural_key, raw_payload, normalized_payload,
         payload_hash, validation_status, validation_messages, proposed_action, target_id
       ) VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8::jsonb,$9,$10)`,
      [
        batchId,
        row.sourceRowNo,
        row.naturalKey,
        JSON.stringify(row.rawPayload),
        JSON.stringify(row.normalized),
        hashPayload(row.normalized),
        row.validationStatus,
        JSON.stringify(messages),
        row.proposedAction,
        row.targetId,
      ],
    );
  }
  await client.query(
    `UPDATE master_data_import_batch SET import_status='VALIDATED', validated_at=now() WHERE id=$1`,
    [batchId],
  );
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  assertSafeDatabaseTarget({
    connectionString: process.env.DATABASE_URL,
    safetyMode: process.env.DATABASE_SAFETY_MODE,
    allowedNamePattern: process.env.DATABASE_ALLOWED_NAME_PATTERN,
  });
  const sourcePath = path.resolve(process.argv[2] || defaultSource);
  if (!fs.existsSync(sourcePath)) throw new Error(`Material workbook not found: ${sourcePath}`);
  const sourceHash = await sha256File(sourcePath);
  const { rows } = await readMaterialWorkbook(sourcePath);
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const before = await fetchCanonicalMaterials(client);
    const existingByPartNo = new Map(before.map((row) => [String(row.part_no).toUpperCase(), row]));
    for (const row of rows) Object.assign(row, compareMaterialRow(row, existingByPartNo));
    const summary = summarize(rows);
    const batchNo = `WAVE1-MATERIAL-${sourceHash.slice(0, 16)}`;
    await client.query("BEGIN");
    const batchId = await upsertDraftBatch(client, {
      batchNo,
      sourceFileName: path.basename(sourcePath),
      sourceHash,
      expectedRows: rows.length,
      notes: "Dry-run staging only. Canonical material rows are intentionally unchanged pending source authority approval.",
    });
    await stageRows(client, batchId, rows);
    await client.query("COMMIT");
    const stagedSummaryResult = await client.query(
      `SELECT * FROM v_master_data_import_batch_summary WHERE id=$1`,
      [batchId],
    );
    const after = await fetchCanonicalMaterials(client);
    const canonicalBeforeHash = canonicalSnapshot(before);
    const canonicalAfterHash = canonicalSnapshot(after);
    if (before.length !== after.length || canonicalBeforeHash !== canonicalAfterHash) {
      throw new Error("Canonical material table changed during dry-run staging");
    }
    const database = parseDatabaseTarget(process.env.DATABASE_URL).database;
    const report = {
      generatedAt: new Date().toISOString(),
      database,
      sourcePath,
      sourceHash,
      batchId,
      batchNo,
      summary,
      stagingSummary: stagedSummaryResult.rows[0],
      canonicalMaterial: {
        beforeCount: before.length,
        afterCount: after.length,
        beforeHash: canonicalBeforeHash,
        afterHash: canonicalAfterHash,
        unchanged: true,
      },
      rows: rows.map((row) => ({
        sourceRowNo: row.sourceRowNo,
        naturalKey: row.naturalKey,
        normalized: row.normalized,
        validationStatus: row.validationStatus,
        proposedAction: row.proposedAction,
        targetId: row.targetId,
        messages: row.messages,
        differences: row.differences,
      })),
    };
    const reportPaths = writeReports(sourceHash.slice(0, 16), report);
    console.log(JSON.stringify({
      ok: true,
      database,
      batchId,
      batchNo,
      sourceHash,
      summary,
      canonicalMaterial: report.canonicalMaterial,
      reports: reportPaths,
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
