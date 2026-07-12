const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { spawn } = require("node:child_process");

process.env.NODE_ENV = "rehearsal";
process.env.ENV_FILE = process.env.ENV_FILE || ".env.test";
require("../src/config/loadEnvironment").loadEnvironment();

const { pool, query } = require("../src/db");
const { expectedAttachmentKeys } = require("../src/services/precheckBackfillRules");

const apiBase = process.env.REHEARSAL_API_URL || "http://127.0.0.1:3001/api";
const password = process.env.REHEARSAL_ADMIN_PASSWORD || "Rehearsal!2026";
const systemRoot = path.resolve(__dirname, "../..");
const qaRoot = path.join(systemRoot, ".local-rehearsal", "word-qa");
const templateRoot = path.join(systemRoot, ".local-rehearsal", "word-templates");
const templateFileName = "p1-prepared-1140826.docx";
const templatePath = path.join(templateRoot, templateFileName);
let cookie = "";

function sha256Buffer(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

async function sha256(filePath) {
  return sha256Buffer(await fsp.readFile(filePath));
}

async function requestResult(apiPath, { method = "GET", body } = {}) {
  const response = await fetch(`${apiBase}${apiPath}`, {
    method,
    headers: {
      accept: "application/json",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(cookie ? { cookie } : {}),
      "user-agent": "word-output-rehearsal-verifier",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const buffer = Buffer.from(await response.arrayBuffer());
  const text = buffer.toString("utf8");
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = { text }; }
  return { response, status: response.status, body: parsed, buffer };
}

async function request(apiPath, options) {
  const result = await requestResult(apiPath, options);
  if (result.status < 200 || result.status >= 300) {
    throw new Error(`${options?.method || "GET"} ${apiPath} returned ${result.status}: ${result.body?.error?.message || JSON.stringify(result.body)}`);
  }
  return result;
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

async function inspectWord(filePath, reportName) {
  const reportPath = path.join(qaRoot, reportName);
  await runPowerShell(path.join(__dirname, "inspect-word-template.ps1"), [
    "-TemplatePath", filePath,
    "-OutputJson", reportPath,
  ]);
  const reportText = (await fsp.readFile(reportPath, "utf8")).replace(/^\uFEFF/, "");
  const report = JSON.parse(reportText);
  assert.equal(report.pages, 8, `${reportName} page count changed`);
  assert.equal(report.tables, 3, `${reportName} table count changed`);
  assert.ok(report.inlineShapes >= 13, `${reportName} lost inline images`);
  assert.ok(report.shapes >= 4, `${reportName} lost floating images`);
  return {
    reportPath,
    pages: report.pages,
    tables: report.tables,
    inlineShapes: report.inlineShapes,
    shapes: report.shapes,
  };
}

async function login() {
  const result = await requestResult("/session/login", {
    method: "POST",
    body: { account: "rehearsal.admin@example.invalid", password },
  });
  assert.equal(result.status, 200, "rehearsal administrator login failed");
  assert.equal(result.body.user.role, "system_admin");
  const setCookie = result.response.headers.get("set-cookie") || "";
  assert.match(setCookie, /HttpOnly/i);
  cookie = setCookie.split(";", 1)[0];
}

async function logout() {
  if (!cookie) return;
  await requestResult("/session/logout", { method: "POST" });
  cookie = "";
}

async function assertRehearsalDatabase() {
  const result = await query("SELECT current_database() AS database_name");
  const databaseName = result.rows[0].database_name;
  assert.match(databaseName, /rehearsal/i, "refusing to run Word acceptance outside a rehearsal database");
  return databaseName;
}

async function findPackage(fileHash) {
  const resumable = await query(
    `SELECT wo.work_order_no
       FROM work_order wo
       JOIN pm_work_order p ON p.work_order_id=wo.id
       JOIN work_order_print_job pj ON pj.work_order_id=wo.id
       JOIN form_template ft ON ft.id=pj.form_template_id
      WHERE wo.work_order_type='P' AND wo.status='PRINTED'
        AND p.backfill_status='NOT_STARTED'
        AND pj.print_stage='PRE_WORK' AND pj.job_status='READY'
        AND pj.output_path IS NOT NULL AND ft.file_hash=$1
      ORDER BY pj.generated_at DESC LIMIT 1`,
    [fileHash]
  );
  if (resumable.rowCount) {
    return (await request(`/precheck/packages/${encodeURIComponent(resumable.rows[0].work_order_no)}`)).body.item;
  }
  const list = (await request("/precheck/packages?limit=100")).body;
  const drafts = list.items.filter((item) => item.pm_code === "P1" && item.status === "DRAFT" && !item.has_print);
  for (const row of drafts) {
    const item = (await request(`/precheck/packages/${encodeURIComponent(row.work_order_no)}`)).body.item;
    const effectiveDate = String(item.planStartDate || "").slice(0, 10);
    const instrumentsReady = item.instruments.length > 0 && item.instruments.every((instrument) =>
      instrument.status === "AVAILABLE" && String(instrument.calibration_due_date || "").slice(0, 10) >= effectiveDate
    );
    if (instrumentsReady) return item;
  }
  return createValidPackage();
}

function priorMonthDate(year, month) {
  return new Date(Date.UTC(year, month - 2, 10)).toISOString().slice(0, 10);
}

async function createValidPackage() {
  const slot = await query(
    `SELECT y::int AS year,m::int AS month
       FROM generate_series(2098,2099) y
       CROSS JOIN generate_series(1,12) m
      WHERE make_date(y,m,1) <= DATE '2099-11-01'
        AND NOT EXISTS (
          SELECT 1 FROM pm_schedule_item s
           WHERE s.site_code='D' AND s.target_type='VEHICLE' AND s.target_key='101車'
             AND s.schedule_year=y AND s.schedule_month=m
        )
      ORDER BY y,m LIMIT 1`
  );
  assert.equal(slot.rowCount, 1, "no free P1 slot remains before the rehearsal instrument expires");
  const { year, month } = slot.rows[0];
  const preview = (await request("/precheck/imports/preview", {
    method: "POST",
    body: {
      sourceFile: `word-output-rehearsal-${year}-${month}-${Date.now()}.json`,
      sourceYear: year,
      siteCode: "D",
      targetType: "VEHICLE",
      rows: [{
        trainNo: "101車",
        levels: { [String(month)]: "1M" },
        latestActualFinishDate: priorMonthDate(year, month),
      }],
    },
  })).body;
  await request(`/precheck/imports/${preview.batch.id}/apply`, { method: "POST", body: {} });
  await request("/precheck/schedules/generate", { method: "POST", body: { startDate: `${year}-01-01` } });
  const schedule = await query(
    `SELECT id,planned_start_date FROM pm_schedule_item
      WHERE import_batch_id=$1 ORDER BY created_at DESC LIMIT 1`,
    [preview.batch.id]
  );
  assert.equal(schedule.rowCount, 1, "Word rehearsal schedule was not persisted");
  assert.ok(schedule.rows[0].planned_start_date, "Word rehearsal schedule date is missing");
  await request("/precheck/schedules/publish", {
    method: "POST",
    body: { ids: [schedule.rows[0].id], reason: "P1 official Word output acceptance" },
  });
  const created = (await request(`/precheck/schedules/${schedule.rows[0].id}/work-order`, {
    method: "POST",
    body: { remark: "P1 official Word output acceptance" },
  })).body;
  return (await request(`/precheck/packages/${encodeURIComponent(created.workOrderNo)}`)).body.item;
}

async function findOrCreatePreWork(packageItem, template) {
  const existing = await query(
    `SELECT pj.id,pj.output_path,pj.output_file_name,pj.output_hash
       FROM work_order_print_job pj
      WHERE pj.work_order_id=$1 AND pj.form_template_id=$2
        AND pj.print_stage='PRE_WORK' AND pj.job_status='READY'
        AND pj.output_path IS NOT NULL
      ORDER BY pj.generated_at DESC LIMIT 1`,
    [packageItem.workOrderId, template.id]
  );
  if (existing.rowCount) {
    return {
      id: existing.rows[0].id,
      status: "READY",
      outputPath: existing.rows[0].output_path,
      outputFileName: existing.rows[0].output_file_name,
      outputHash: existing.rows[0].output_hash,
    };
  }
  return (await request(`/precheck/packages/${encodeURIComponent(packageItem.workOrderNo)}/print-jobs`, {
    method: "POST",
    body: { formTemplateId: template.id, copies: 1 },
  })).body;
}

async function ensureOfficialTemplate(packageItem, fileHash) {
  const list = (await request("/precheck/form-templates?pmCode=P1&limit=200")).body;
  const candidates = list.items.filter((item) =>
    item.pm_template_id === packageItem.formSnapshot.pmTemplateId &&
    String(item.file_hash || "").toLowerCase() === fileHash.toLowerCase()
  );
  for (const candidate of candidates.filter((item) => item.lifecycle_status === "PUBLISHED")) {
    const mappings = (await request(`/precheck/form-templates/${candidate.id}/mappings`)).body.items;
    const workOrderMapping = mappings.find((item) => item.field_key === "workOrderNo");
    if (workOrderMapping?.transform_code === "COMPACT_WORK_ORDER_NO") return candidate;
  }

  const templateCode = `P1-OFFICIAL-${packageItem.formSnapshot.pmTemplateId.slice(0, 8)}`;
  const versionNo = `1140826-${fileHash.slice(0, 8)}-r2`;
  const draft = candidates.find((item) => item.template_code === templateCode && item.version_no === versionNo && item.lifecycle_status === "DRAFT");
  const created = draft || (await request("/precheck/form-templates", {
      method: "POST",
      body: {
        pmTemplateId: packageItem.formSnapshot.pmTemplateId,
        templateCode,
        templateName: "P1 第一級正式 Word 範本 rehearsal",
        versionNo,
        sourceFileName: templateFileName,
        storagePath: templateFileName,
        fileHash,
        fileFormat: "DOCX",
      },
    })).body.item;

  await request(`/precheck/form-templates/${created.id}/mappings`, {
    method: "PUT",
    body: {
      mappings: [
        { fieldKey: "trainNo", sourcePath: "trainNo", wordTargetType: "BOOKMARK", wordTarget: "TRAIN_NO", isRequired: true, sortOrder: 1 },
        { fieldKey: "workOrderNo", sourcePath: "workOrderNo", wordTargetType: "BOOKMARK", wordTarget: "WORK_ORDER_NO", transformCode: "COMPACT_WORK_ORDER_NO", isRequired: true, sortOrder: 2 },
        { fieldKey: "actualStartDate", sourcePath: "print.startDate", wordTargetType: "BOOKMARK", wordTarget: "ACTUAL_START_DATE", transformCode: "ROC_DATE_TEXT", isRequired: true, sortOrder: 3 },
        { fieldKey: "actualFinishDate", sourcePath: "print.finishDate", wordTargetType: "BOOKMARK", wordTarget: "ACTUAL_FINISH_DATE", transformCode: "ROC_DATE_TEXT", isRequired: true, sortOrder: 4 },
      ],
    },
  });
  return (await request(`/precheck/form-templates/${created.id}/publish`, {
    method: "POST",
    body: {},
  })).body.item;
}

function normalCheckResults(checks) {
  return checks.map((item) => {
    let resultValue = "";
    if (item.check_type === "value") {
      if (item.min_value !== null && item.max_value !== null) resultValue = String((Number(item.min_value) + Number(item.max_value)) / 2);
      else if (item.min_value !== null) resultValue = String(item.min_value);
      else if (item.max_value !== null) resultValue = String(item.max_value);
      else resultValue = "1";
    }
    return {
      checkItemId: item.id,
      resultStatus: "正常",
      resultValue,
      remark: "Word rehearsal acceptance",
      abnormalAction: "",
      linkedFaultWorkOrderId: "",
      abnormalReason: "",
    };
  });
}

function normalFieldValue(field, date) {
  if (field.type === "status") return "正常";
  if (field.type === "date") return date;
  if (field.type === "boolean") return true;
  if (field.min !== undefined && field.max !== undefined) return String((Number(field.min) + Number(field.max)) / 2);
  if (field.min !== undefined) return String(field.min);
  if (field.max !== undefined) return String(field.max);
  return "正常";
}

function normalAttachmentResults(attachments, date) {
  const rows = [];
  for (const attachment of attachments) {
    for (const itemKey of expectedAttachmentKeys(attachment)) {
      const resultValue = attachment.attachment_type === "MEASUREMENT_TABLE"
        ? Object.fromEntries((attachment.schema_json?.fields || []).map((field) => [field.key, normalFieldValue(field, date)]))
        : { seatChecked: true, markedX: false };
      rows.push({
        templateAttachmentId: attachment.id,
        itemKey,
        resultStatus: "正常",
        resultValue,
        remark: "Word rehearsal acceptance",
        abnormalAction: "",
        linkedFaultWorkOrderId: "",
        abnormalReason: "",
      });
    }
  }
  return rows;
}

function completionPayload(detail) {
  const date = String(detail.item.planStartDate).slice(0, 10);
  return {
    actualWorkDate: date,
    actualStartAt: `${date}T09:00:00+08:00`,
    actualFinishAt: `${date}T16:00:00+08:00`,
    workforceCount: 2,
    workforceHours: 14,
    externalServiceNa: true,
    externalServiceDetail: "",
    maintenanceResult: "P1 Word rehearsal acceptance completed",
    actualMaterialNote: "P1 Word rehearsal material consumption",
    dangerPeriods: [{ startAt: `${date}T10:00:00+08:00`, endAt: `${date}T10:30:00+08:00`, note: "Rehearsal danger period" }],
    snapshot: { accumulatedMileage: "123456", materialWarehouseCode: "REH-REPAIR", materialStockStatus: "ISSUED" },
    materialWarehouseCode: "REH-REPAIR",
    materialStockStatus: "ISSUED",
    materials: detail.item.materials.map((material, index) => ({
      materialId: material.material_id,
      actualQty: index === 0 ? 1 : 0,
      note: "P1 Word rehearsal acceptance",
    })),
    checkResults: normalCheckResults(detail.checks),
    attachmentResults: normalAttachmentResults(detail.attachments, date),
  };
}

async function verifyPrintFile(printResult, reportName) {
  assert.equal(printResult.status, "READY");
  assert.ok(fs.existsSync(printResult.outputPath), `generated Word file missing: ${printResult.outputPath}`);
  assert.equal((await sha256(printResult.outputPath)).toLowerCase(), printResult.outputHash.toLowerCase());
  const download = await request(`/precheck/print-jobs/${printResult.id}/download`);
  assert.equal(sha256Buffer(download.buffer).toLowerCase(), printResult.outputHash.toLowerCase());
  return {
    id: printResult.id,
    outputPath: printResult.outputPath,
    outputHash: printResult.outputHash,
    inspection: await inspectWord(printResult.outputPath, reportName),
  };
}

async function main() {
  await fsp.mkdir(qaRoot, { recursive: true });
  assert.ok(fs.existsSync(templatePath), `prepared template missing: ${templatePath}`);
  const databaseName = await assertRehearsalDatabase();
  const templateHash = await sha256(templatePath);
  await login();

  const packageItem = await findPackage(templateHash);
  const template = await ensureOfficialTemplate(packageItem, templateHash);
  const preResponse = await findOrCreatePreWork(packageItem, template);
  const preWork = await verifyPrintFile(preResponse, `p1-${packageItem.workOrderNo}-pre-inspection.json`);

  const backfill = (await request(`/precheck/backfills/${encodeURIComponent(packageItem.workOrderNo)}`)).body;
  assert.ok(backfill.checks.length, "P1 check snapshot is missing");
  assert.equal(backfill.attachments.length, 2, "P1 seat/brake attachments are missing");
  assert.ok(backfill.item.materials.length, "P1 default materials are missing");
  const completed = (await request(`/precheck/backfills/${encodeURIComponent(packageItem.workOrderNo)}/complete`, {
    method: "POST",
    body: completionPayload(backfill),
  })).body;
  assert.equal(completed.workOrderNo, packageItem.workOrderNo);
  assert.equal(completed.consumptionCount, 1);

  const postResponse = (await request(`/precheck/backfills/${encodeURIComponent(packageItem.workOrderNo)}/print-jobs`, {
    method: "POST",
    body: { formTemplateId: template.id, copies: 1 },
  })).body;
  const postWork = await verifyPrintFile(postResponse, `p1-${packageItem.workOrderNo}-post-inspection.json`);

  const persisted = await query(
    `SELECT wo.status,p.backfill_status,wo.closed_at,
            count(pj.id)::int AS print_count,
            count(pj.id) FILTER (WHERE pj.print_stage='PRE_WORK' AND pj.job_status='READY')::int AS pre_ready,
            count(pj.id) FILTER (WHERE pj.print_stage='POST_COMPLETION' AND pj.job_status='READY')::int AS post_ready
       FROM work_order wo
       JOIN pm_work_order p ON p.work_order_id=wo.id
       LEFT JOIN work_order_print_job pj ON pj.work_order_id=wo.id
      WHERE wo.work_order_no=$1
      GROUP BY wo.id,p.work_order_id`,
    [packageItem.workOrderNo]
  );
  assert.equal(persisted.rows[0].status, "COMPLETED");
  assert.equal(persisted.rows[0].backfill_status, "COMPLETED");
  assert.ok(persisted.rows[0].pre_ready >= 1);
  assert.ok(persisted.rows[0].post_ready >= 1);

  const summary = {
    ok: true,
    databaseName,
    workOrderNo: packageItem.workOrderNo,
    template: { id: template.id, file: templateFileName, hash: templateHash },
    preWork,
    postWork,
    completion: {
      consumptionCount: completed.consumptionCount,
      abnormalCount: completed.abnormalCount,
      linkedFaultOrders: completed.linkedFaultOrders,
    },
    persisted: persisted.rows[0],
  };
  const summaryPath = path.join(qaRoot, "word-output-rehearsal-summary.json");
  await fsp.writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    ok: true,
    databaseName,
    workOrderNo: packageItem.workOrderNo,
    preWork: { jobId: preWork.id, pages: preWork.inspection.pages, hash: preWork.outputHash },
    postWork: { jobId: postWork.id, pages: postWork.inspection.pages, hash: postWork.outputHash },
    consumptionCount: completed.consumptionCount,
    summaryPath,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error.stack || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await logout().catch(() => {});
    await pool.end();
  });
