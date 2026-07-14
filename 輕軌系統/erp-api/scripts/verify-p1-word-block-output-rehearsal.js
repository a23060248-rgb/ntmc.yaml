const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { spawn } = require("node:child_process");

process.env.NODE_ENV = "rehearsal";
process.env.ENV_FILE = process.env.ENV_FILE || ".env.test";
process.env.DATABASE_SAFETY_MODE = process.env.DATABASE_SAFETY_MODE || "rehearsal";
require("../src/config/loadEnvironment").loadEnvironment();

const { pool, query, withTransaction } = require("../src/db");
const { renderWordTemplate } = require("../src/services/wordTemplateService");
const { recordPassedVerification } = require("../src/services/wordBlockVerificationService");

const systemRoot = path.resolve(__dirname, "../..");
const profilePath = path.join(systemRoot, "db-design", "templates", "p1-word-layout-1140826.json");
const templatePath = path.join(systemRoot, ".local-rehearsal", "word-templates", "p1-prepared-1140826.docx");
const qaRoot = path.join(systemRoot, ".local-rehearsal", "word-qa");

async function sha256(filePath) {
  return crypto.createHash("sha256").update(await fsp.readFile(filePath)).digest("hex");
}

function runPowerShell(scriptPath, args) {
  return new Promise((resolve, reject) => {
    const child = spawn("powershell.exe", [
      "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
      "-File", scriptPath,
      ...args,
    ], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(stderr.trim() || stdout.trim() || `PowerShell exited with ${code}`));
    });
  });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function clean(value) {
  return String(value ?? "").replace(/[\r\a]/g, "").trim();
}

function tableCell(report, tableIndex, row, column) {
  const table = report.tables.find((item) => Number(item.index) === Number(tableIndex));
  assert.ok(table, `Word table ${tableIndex} is missing`);
  const cell = table.cells.find((item) => Number(item.row) === Number(row) && Number(item.column) === Number(column));
  assert.ok(cell, `Word table ${tableIndex} cell ${row},${column} is missing`);
  return cell;
}

function checkValue(itemNo) {
  const values = {
    "P1-R020-DATE": "115年12月31日",
    "P1-R075-M1": "7.2",
    "P1-R075-M5": "7.0",
    "P1-R076-DIFF": "1.5",
    "P1-R081-INSULATION": "2.4",
    "P1-R097-FILTER-PASSENGER": "N/A",
    "P1-R100-FILTER-CAB": "水洗",
  };
  const fan = itemNo.match(/^P1-R098-FAN-([AB])(\d)$/);
  if (fan) return String(60 + (fan[1] === "A" ? 0 : 4) + Number(fan[2]));
  return values[itemNo] || "";
}

function syntheticSnapshot(profile) {
  const checks = profile.checkItems.map((item) => ({
    itemKey: item.itemNo,
    itemNo: item.itemNo,
    section: item.section,
    description: item.itemDescription,
    checkType: item.checkType,
    required: item.isRequired,
    status: item.itemNo === "P1-R004" ? "異常" : "正常",
    value: checkValue(item.itemNo),
    remark: item.itemNo === "P1-R004" ? "Word 落點驗證" : "",
  }));

  const seatCoordinates = profile.blocks.find((block) => block.blockCode === "P1-SEAT").configJson.coordinates;
  const seatRecords = Object.keys(seatCoordinates).map((itemKey) => ({
    itemKey,
    status: itemKey === "M4-R3-C3" ? "異常" : "正常",
    value: { markedX: itemKey === "M4-R3-C3", seatChecked: true },
    remark: itemKey === "M4-R3-C3" ? "座椅 X 驗證" : "",
  }));
  const brakeKeys = ["M1-1", "M2-2", "M3-3", "M4-4", "M5-5", "M5-6"];
  const brakeRecords = brakeKeys.map((itemKey, index) => ({
    itemKey,
    status: "正常",
    value: {
      airGapMm: String((7.1 + index / 10).toFixed(1)),
      wearDistanceMm: String((1.1 + index / 10).toFixed(1)),
    },
  }));

  return {
    workOrderNo: "P-1150713-D-TS-901",
    trainNo: "101車",
    accumulatedMileage: "123456",
    backfill: {
      checks,
      attachments: {
        "P1-SEAT": { attachmentCode: "P1-SEAT", records: seatRecords },
        "P1-MAG-BRAKE": { attachmentCode: "P1-MAG-BRAKE", records: brakeRecords },
      },
    },
  };
}

async function ensureDraftTemplate(profile, templateHash) {
  const pmTemplate = await query(
    `SELECT id FROM pm_template WHERE pm_code='P1'
      ORDER BY (lifecycle_status='PUBLISHED') DESC,revision_no DESC,created_at DESC LIMIT 1`
  );
  assert.equal(pmTemplate.rowCount, 1, "P1 rehearsal template is missing");
  const actor = await query(
    `SELECT id FROM app_user WHERE employee_no='REH-ADMIN' AND is_active=true ORDER BY created_at LIMIT 1`
  );
  const templateCode = "P1-WORD-BLOCK-QA";
  const versionNo = "1140826-block-r1";
  let template = await query(
    `SELECT * FROM form_template WHERE template_code=$1 AND version_no=$2`,
    [templateCode, versionNo]
  );
  if (!template.rowCount) {
    template = await query(
      `INSERT INTO form_template (
         template_code,template_name,pm_template_id,version_no,source_file_name,storage_path,
         file_hash,file_format,is_active,lifecycle_status,metadata,created_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,'DOCX',false,'DRAFT',$8::jsonb,$9)
       RETURNING *`,
      [templateCode, "P1 Word 動態落點 rehearsal 驗證", pmTemplate.rows[0].id, versionNo,
        profile.preparedTemplate, profile.preparedTemplate, templateHash,
        JSON.stringify({ profileCode: profile.profileCode, reviewStatus: profile.reviewStatus }), actor.rows[0]?.id || null]
    );
  } else {
    assert.equal(template.rows[0].lifecycle_status, "DRAFT", "Word block QA template must remain a draft");
    template = await query(
      `UPDATE form_template SET pm_template_id=$2,source_file_name=$3,storage_path=$3,
              file_hash=$4,metadata=$5::jsonb,updated_at=now()
        WHERE id=$1 RETURNING *`,
      [template.rows[0].id, pmTemplate.rows[0].id, profile.preparedTemplate, templateHash,
        JSON.stringify({ profileCode: profile.profileCode, reviewStatus: profile.reviewStatus })]
    );
  }

  for (const [index, block] of profile.blocks.entries()) {
    await query(
      `INSERT INTO form_template_block_mapping (
         form_template_id,block_code,source_path,block_type,word_target_type,word_target,
         config_json,is_required,sort_order
       ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)
       ON CONFLICT (form_template_id,block_code) DO UPDATE SET
         source_path=EXCLUDED.source_path,block_type=EXCLUDED.block_type,
         word_target_type=EXCLUDED.word_target_type,word_target=EXCLUDED.word_target,
         config_json=EXCLUDED.config_json,is_required=EXCLUDED.is_required,
         sort_order=EXCLUDED.sort_order,updated_at=now()`,
      [template.rows[0].id, block.blockCode, block.sourcePath, block.blockType,
        block.wordTargetType, block.wordTarget, JSON.stringify(block.configJson),
        block.isRequired, index + 1]
    );
  }
  const mappings = await query(
    `SELECT * FROM form_template_block_mapping WHERE form_template_id=$1 ORDER BY sort_order,block_code`,
    [template.rows[0].id]
  );
  assert.equal(mappings.rowCount, profile.blocks.length, "registered Word blocks do not match the P1 profile");
  return { template: template.rows[0], mappings: mappings.rows, actorId: actor.rows[0]?.id || null };
}

function assertWordValues(report) {
  assert.equal(report.pages, 8, "P1 output must remain 8 pages");
  assert.equal(report.tables.length, 3, "P1 output must retain all 3 tables");
  assert.equal(clean(tableCell(report, 1, 3, 2).text), "V");
  assert.equal(clean(tableCell(report, 1, 3, 3).text), "");
  assert.equal(clean(tableCell(report, 1, 4, 2).text), "");
  assert.equal(clean(tableCell(report, 1, 4, 3).text), "V");
  assert.match(clean(tableCell(report, 1, 75, 4).text), /7\.2.*7\.0/);
  assert.match(clean(tableCell(report, 1, 98, 4).text), /A1：61.*B4：68/);
  assert.match(clean(tableCell(report, 1, 159, 1).text), /123456/);
  assert.equal(clean(tableCell(report, 2, 2, 2).text), "");
  assert.equal(clean(tableCell(report, 2, 2, 3).text), "V");

  const expectedAirGap = ["7.1", "7.2", "7.3", "7.4", "7.5", "7.6"];
  const expectedWear = ["1.1", "1.2", "1.3", "1.4", "1.5", "1.6"];
  for (let index = 0; index < 6; index += 1) {
    assert.equal(clean(tableCell(report, 3, 2, index + 2).text), expectedAirGap[index]);
    assert.equal(clean(tableCell(report, 3, 3, index + 2).text), expectedWear[index]);
  }
  const seatMarks = report.shapes.filter((shape) => shape.alternativeText === "PM-SEAT-X:M4-R3-C3");
  assert.equal(seatMarks.length, 1, "the selected M4 seat must produce exactly one X overlay");
  assert.equal(Number(seatMarks[0].page), 7, "the seat X must remain on attachment page 7");
  return {
    mainTablePages: [...new Set([3, 4, 75, 98, 159].map((row) => Number(tableCell(report, 1, row, 1).page)))].sort(),
    seatPage: Number(seatMarks[0].page),
    brakePage: Number(tableCell(report, 3, 2, 2).page),
  };
}

async function main() {
  assert.ok(fs.existsSync(profilePath), `P1 profile is missing: ${profilePath}`);
  assert.ok(fs.existsSync(templatePath), `prepared P1 Word template is missing: ${templatePath}`);
  await fsp.mkdir(qaRoot, { recursive: true });
  const database = await query("SELECT current_database() AS name");
  assert.match(database.rows[0].name, /rehearsal/i, "refusing to verify Word output outside a rehearsal database");

  const profile = readJson(profilePath);
  assert.equal(profile.reviewStatus, "REHEARSAL_REVIEW_REQUIRED");
  assert.equal(profile.checkItems.length, 152);
  const templateHash = await sha256(templatePath);
  const registration = await ensureDraftTemplate(profile, templateHash);
  const output = await renderWordTemplate({
    template: registration.template,
    mappings: [],
    blockMappings: registration.mappings,
    snapshot: syntheticSnapshot(profile),
    workOrderNo: "P1-WORD-BLOCK-QA",
    printStage: "POST_COMPLETION",
    jobId: `qa-${Date.now()}`,
  });

  const reportPath = path.join(qaRoot, "p1-word-block-output-inspection.json");
  await runPowerShell(path.join(__dirname, "inspect-word-layout.ps1"), [
    "-TemplatePath", output.outputPath,
    "-OutputJson", reportPath,
  ]);
  const report = readJson(reportPath);
  const pages = assertWordValues(report);
  const outputHash = await sha256(output.outputPath);
  assert.equal(outputHash, output.outputHash);

  const pageByBlock = {
    "P1-CHECKS": pages.mainTablePages,
    "P1-SEAT": [pages.seatPage],
    "P1-MAG-BRAKE": [pages.brakePage],
    "P1-MILEAGE": [Number(tableCell(report, 1, 159, 1).page)],
  };
  const evidence = {
    profileCode: profile.profileCode,
    formTemplateId: registration.template.id,
    templateFilePath: templatePath,
    outputFilePath: output.outputPath,
    expectedTemplateFileHash: templateHash,
    expectedOutputFileHash: outputHash,
    pageCount: report.pages,
    verifierName: "p1-word-block-rehearsal-verifier",
    verifierVersion: "1",
    summary: {
      checkItemCount: profile.checkItems.length,
      seatCoordinateCount: Object.keys(profile.blocks.find((block) => block.blockCode === "P1-SEAT").configJson.coordinates).length,
      testedSeat: "M4-R3-C3",
      brakePointCount: 6,
      actualMaterialsMapped: false,
      actualMaterialsReason: "Current official P1 Word has no approved actual-material target field.",
    },
    blocks: registration.mappings.map((mapping) => ({
      blockMappingId: mapping.id,
      blockCode: mapping.block_code,
      resultStatus: "PASSED",
      pageNumbers: pageByBlock[mapping.block_code],
      evidence: { inspectedReport: reportPath, assertionsPassed: true },
    })),
  };
  const evidencePath = path.join(qaRoot, "p1-word-block-output-evidence.json");
  await fsp.writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  const evidenceHash = await sha256(evidencePath);
  const run = await withTransaction((client) => recordPassedVerification(client, {
    ...evidence,
    actorId: registration.actorId,
    runStatus: "PASSED",
    printStage: "POST_COMPLETION",
    templateFileHash: templateHash,
    outputFileHash: outputHash,
    outputFilePath: output.outputPath,
    evidenceFileName: path.basename(evidencePath),
    evidencePath,
    evidenceHash,
  }));

  console.log(JSON.stringify({
    ok: true,
    database: database.rows[0].name,
    profileCode: profile.profileCode,
    formTemplateId: registration.template.id,
    lifecycleStatus: registration.template.lifecycle_status,
    verificationRunId: run.id,
    outputPath: output.outputPath,
    outputHash,
    pages: report.pages,
    checks: profile.checkItems.length,
    seats: evidence.summary.seatCoordinateCount,
    brakePoints: evidence.summary.brakePointCount,
    evidencePath,
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
