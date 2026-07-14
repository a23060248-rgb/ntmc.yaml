const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");

process.env.NODE_ENV = "rehearsal";
process.env.ENV_FILE = process.env.ENV_FILE || ".env.test";
process.env.DATABASE_SAFETY_MODE = process.env.DATABASE_SAFETY_MODE || "rehearsal";
require("../src/config/loadEnvironment").loadEnvironment();

const { pool, query, withTransaction } = require("../src/db");
const { recordPassedVerification } = require("../src/services/wordBlockVerificationService");

async function sha256(filePath) {
  const content = await fsp.readFile(filePath);
  return crypto.createHash("sha256").update(content).digest("hex");
}

function resolveEvidencePath(inputPath, value) {
  if (!value) throw new Error("templateFilePath and outputFilePath are required");
  return path.resolve(path.dirname(inputPath), String(value));
}

async function main() {
  const inputArgument = process.argv[2];
  if (!inputArgument) {
    throw new Error("usage: node scripts/record-word-block-verification-rehearsal.js <evidence.json>");
  }

  const inputPath = path.resolve(process.cwd(), inputArgument);
  assert.ok(fs.existsSync(inputPath), `evidence file not found: ${inputPath}`);
  const rawEvidence = await fsp.readFile(inputPath, "utf8");
  const evidence = JSON.parse(rawEvidence.replace(/^\uFEFF/, ""));

  const database = await query("SELECT current_database() AS name");
  assert.match(database.rows[0].name, /rehearsal/i, "refusing to record Word evidence outside a rehearsal database");

  const templateFilePath = resolveEvidencePath(inputPath, evidence.templateFilePath);
  const outputFilePath = resolveEvidencePath(inputPath, evidence.outputFilePath);
  assert.ok(fs.existsSync(templateFilePath), `template file not found: ${templateFilePath}`);
  assert.ok(fs.existsSync(outputFilePath), `output file not found: ${outputFilePath}`);

  const [templateFileHash, outputFileHash, evidenceHash] = await Promise.all([
    sha256(templateFilePath),
    sha256(outputFilePath),
    sha256(inputPath),
  ]);
  if (evidence.expectedTemplateFileHash) assert.equal(templateFileHash, String(evidence.expectedTemplateFileHash).toLowerCase());
  if (evidence.expectedOutputFileHash) assert.equal(outputFileHash, String(evidence.expectedOutputFileHash).toLowerCase());

  let actorId = evidence.actorId || null;
  if (!actorId) {
    const actor = await query(
      `SELECT id FROM app_user
        WHERE employee_no='REH-ADMIN' AND is_active=true
        ORDER BY created_at LIMIT 1`
    );
    actorId = actor.rows[0]?.id || null;
  }

  const run = await withTransaction((client) => recordPassedVerification(client, {
    ...evidence,
    actorId,
    runStatus: "PASSED",
    templateFileHash,
    outputFileHash,
    outputFilePath,
    evidenceFileName: path.basename(inputPath),
    evidencePath: inputPath,
    evidenceHash,
    verifierName: evidence.verifierName || "word-block-rehearsal-verifier",
    verifierVersion: evidence.verifierVersion || "1",
  }));

  console.log(JSON.stringify({
    ok: true,
    database: database.rows[0].name,
    verificationRunId: run.id,
    formTemplateId: run.form_template_id,
    printStage: run.print_stage,
    pageCount: run.page_count,
    outputFileHash: run.output_file_hash,
    evidenceHash: run.evidence_hash,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error.stack || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
