const assert = require("node:assert/strict");

process.env.NODE_ENV = "test";
process.env.ENV_FILE = process.env.ENV_FILE || ".env.test";
require("../src/config/loadEnvironment").loadEnvironment();
const { pool, query } = require("../src/db");
const { expectedAttachmentKeys } = require("../src/services/precheckBackfillRules");

const apiBase = process.env.REHEARSAL_API_URL || "http://127.0.0.1:3102/api";
const adminHeaders = {
  "content-type": "application/json",
  "x-user-role": "system_admin",
  "x-user-name": "Rehearsal Admin",
};

async function requestResult(path, options = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: { ...adminHeaders, ...(options.headers || {}) },
  });
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { text }; }
  return { status: response.status, body };
}

async function request(path, options = {}) {
  const result = await requestResult(path, options);
  if (result.status < 200 || result.status >= 300) {
    throw new Error(`${options.method || "GET"} ${path} returned ${result.status}: ${result.body?.error?.message || JSON.stringify(result.body)}`);
  }
  return result.body;
}

async function expectBlocked(path, payload, expectedText) {
  const result = await requestResult(path, { method: "POST", body: JSON.stringify(payload) });
  assert.equal(result.status, 409, `${path} should be blocked`);
  const message = result.body?.error?.message || "";
  assert.match(message, expectedText, `unexpected blocking reason: ${message}`);
  return message;
}

function priorMonthDate(year, month) {
  return new Date(Date.UTC(year, month - 2, 10)).toISOString().slice(0, 10);
}

async function createPackage() {
  const slot = await query(
    `SELECT y::int AS year,m::int AS month
       FROM generate_series(2180,2200) y
       CROSS JOIN generate_series(1,12) m
      WHERE NOT EXISTS (
        SELECT 1 FROM pm_schedule_item s
         WHERE s.site_code='D' AND s.target_type='VEHICLE' AND s.target_key=$1
           AND s.schedule_year=y AND s.schedule_month=m
      )
      ORDER BY y,m LIMIT 1`,
    ["101車"]
  );
  assert.equal(slot.rowCount, 1, "no free rehearsal schedule slot remains");
  const { year, month } = slot.rows[0];
  const preview = await request("/precheck/imports/preview", {
    method: "POST",
    headers: { "x-user-role": "scheduler" },
    body: JSON.stringify({
      sourceFile: `phase5-backfill-${year}-${month}.json`,
      sourceYear: year,
      siteCode: "D",
      targetType: "VEHICLE",
      rows: [{ trainNo: "101車", levels: { [String(month)]: "1M" }, latestActualFinishDate: priorMonthDate(year, month) }],
    }),
  });
  await request(`/precheck/imports/${preview.batch.id}/apply`, {
    method: "POST",
    headers: { "x-user-role": "scheduler" },
    body: "{}",
  });
  await request("/precheck/schedules/generate", {
    method: "POST",
    headers: { "x-user-role": "scheduler" },
    body: JSON.stringify({ startDate: `${year}-01-01` }),
  });
  const scheduleResult = await query(
    `SELECT id,planned_start_date FROM pm_schedule_item WHERE import_batch_id=$1 ORDER BY created_at DESC LIMIT 1`,
    [preview.batch.id]
  );
  assert.equal(scheduleResult.rowCount, 1, "phase5 schedule was not persisted");
  const schedule = scheduleResult.rows[0];
  assert.ok(schedule.planned_start_date, "phase5 schedule date is missing");
  await request("/precheck/schedules/publish", {
    method: "POST",
    headers: { "x-user-role": "scheduler" },
    body: JSON.stringify({ ids: [schedule.id], reason: "Phase 5 backfill acceptance" }),
  });
  const created = await request(`/precheck/schedules/${schedule.id}/work-order`, {
    method: "POST",
    headers: { "x-user-role": "scheduler" },
    body: JSON.stringify({ remark: "Phase 5 backfill acceptance" }),
  });
  const detail = await request(`/precheck/packages/${encodeURIComponent(created.workOrderNo)}`);
  assert.ok(detail.item.formTemplates.length, "published rehearsal form metadata is missing");

  const simulatedHash = "f".repeat(64);
  await query(
    `INSERT INTO work_order_print_job (
       work_order_id,form_template_id,print_stage,job_status,copies,input_snapshot,
       output_file_name,output_hash,requested_at,generated_at
     ) VALUES ($1,$2,'PRE_WORK','READY',1,$3::jsonb,$4,$5,now(),now())`,
    [detail.item.workOrderId, detail.item.formTemplates[0].id, JSON.stringify({ ...detail.item, rehearsalSimulation: true }),
      "phase5-simulated-ready-record.docx", simulatedHash]
  );
  await query(`UPDATE pm_work_order SET form_template_id=$2 WHERE work_order_id=$1`, [detail.item.workOrderId, detail.item.formTemplates[0].id]);
  await query(`UPDATE work_order SET status='PRINTED' WHERE id=$1`, [detail.item.workOrderId]);
  await query(`UPDATE pm_schedule_item SET schedule_status='PRINTED' WHERE id=$1`, [schedule.id]);
  return request(`/precheck/backfills/${encodeURIComponent(created.workOrderNo)}`);
}

function normalCheckResults(checks) {
  return checks.map((item) => {
    let resultValue = "";
    if (item.check_type === "value") {
      if (item.min_value !== null && item.max_value !== null) resultValue = String((Number(item.min_value) + Number(item.max_value)) / 2);
      else if (item.min_value !== null) resultValue = String(Number(item.min_value));
      else if (item.max_value !== null) resultValue = String(Number(item.max_value));
      else resultValue = "1";
    } else if (item.requires_value) {
      resultValue = "Phase 5 required text";
    }
    return {
      checkItemId: item.id,
      resultStatus: "正常",
      resultValue,
      remark: "Phase 5 acceptance",
      abnormalAction: "",
      linkedFaultWorkOrderId: "",
      abnormalReason: "",
    };
  });
}

function normalAttachmentResults(attachments) {
  const rows = [];
  for (const attachment of attachments) {
    for (const itemKey of expectedAttachmentKeys(attachment)) {
      rows.push({
        templateAttachmentId: attachment.id,
        itemKey,
        resultStatus: "正常",
        resultValue: attachment.attachment_type === "MEASUREMENT_TABLE"
          ? { airGapMm: "7.2", wearDistanceMm: "8.1", surfaceStatus: "正常" }
          : { seatChecked: true },
        remark: "Phase 5 acceptance",
        abnormalAction: "",
        linkedFaultWorkOrderId: "",
        abnormalReason: "",
      });
    }
  }
  return rows;
}

function basePayload(detail) {
  const date = detail.item.planStartDate;
  return {
    actualWorkDate: date,
    actualStartAt: `${date}T09:00:00+08:00`,
    actualFinishAt: `${date}T16:00:00+08:00`,
    workforceCount: 2,
    workforceHours: 14,
    externalServiceNa: true,
    externalServiceDetail: "",
    maintenanceResult: "Phase 5 rehearsal inspection completed",
    actualMaterialNote: "Phase 5 rehearsal consumption",
    dangerPeriods: [{ startAt: `${date}T10:00:00+08:00`, endAt: `${date}T10:30:00+08:00`, note: "Rehearsal danger period" }],
    snapshot: { accumulatedMileage: "123456", materialWarehouseCode: "REH-REPAIR", materialStockStatus: "ISSUED" },
    materialWarehouseCode: "REH-REPAIR",
    materialStockStatus: "ISSUED",
    materials: detail.item.materials.map((material) => ({ materialId: material.material_id, actualQty: 0, note: "Phase 5 acceptance" })),
    checkResults: normalCheckResults(detail.checks),
    attachmentResults: normalAttachmentResults(detail.attachments),
  };
}

async function ensureIssuedStock(materialId) {
  const location = await query(
    `SELECT w.id AS warehouse_id,wb.id AS bin_id
       FROM warehouse w
       JOIN warehouse_bin wb ON wb.warehouse_id=w.id AND wb.bin_code='REH-C01'
      WHERE w.warehouse_code='REH-REPAIR'`
  );
  assert.equal(location.rowCount, 1, "rehearsal repair bin is missing");
  const { warehouse_id: warehouseId, bin_id: binId } = location.rows[0];
  await query(
    `INSERT INTO inventory_balance (material_id,warehouse_id,stock_status,qty)
     VALUES ($1,$2,'ISSUED',20)
     ON CONFLICT (material_id,warehouse_id,stock_status)
     DO UPDATE SET qty=20,updated_at=now()`,
    [materialId, warehouseId]
  );
  await query(
    `INSERT INTO inventory_bin_balance (material_id,warehouse_id,warehouse_bin_id,stock_status,qty)
     VALUES ($1,$2,$3,'ISSUED',20)
     ON CONFLICT (material_id,warehouse_id,warehouse_bin_id,stock_status)
     DO UPDATE SET qty=20,updated_at=now()`,
    [materialId, warehouseId, binId]
  );
}

async function main() {
  const detail = await createPackage();
  assert.ok(detail.checks.length > 0, "P1 checks are missing");
  assert.equal(detail.attachments.length, 2, "P1 seat and brake attachments are required");
  const encoded = encodeURIComponent(detail.item.workOrderNo);
  const completePath = `/precheck/backfills/${encoded}/complete`;
  const payload = basePayload(detail);
  assert.ok(payload.materials.length > 0, "P1 default material is missing");
  await ensureIssuedStock(payload.materials[0].materialId);

  const missingMessage = await expectBlocked(completePath, { ...payload, checkResults: [], attachmentResults: [] }, /必填檢查|附件回填/);

  const abnormalCheck = structuredClone(payload);
  const check = abnormalCheck.checkResults.find((item) => !item.resultValue) || abnormalCheck.checkResults[0];
  check.resultStatus = "異常";
  check.abnormalReason = "Rehearsal abnormal check";
  const checkMessage = await expectBlocked(completePath, abnormalCheck, /尚未選擇報修處理/);

  const abnormalSeat = structuredClone(payload);
  const seatTemplate = detail.attachments.find((item) => item.attachment_type === "SEAT_MAP");
  const seat = abnormalSeat.attachmentResults.find((item) => item.templateAttachmentId === seatTemplate.id);
  seat.resultStatus = "異常";
  seat.abnormalReason = "Rehearsal seat X";
  const seatMessage = await expectBlocked(completePath, abnormalSeat, /尚未選擇報修處理/);

  const abnormalBrake = structuredClone(payload);
  const brakeTemplate = detail.attachments.find((item) => item.attachment_type === "MEASUREMENT_TABLE");
  const brake = abnormalBrake.attachmentResults.find((item) => item.templateAttachmentId === brakeTemplate.id);
  brake.resultStatus = "正常";
  brake.resultValue.airGapMm = "5.9";
  brake.abnormalReason = "API must detect out-of-range air gap";
  const brakeMessage = await expectBlocked(completePath, abnormalBrake, /尚未選擇報修處理/);

  const shortage = structuredClone(payload);
  shortage.materials[0].actualQty = 999;
  const shortageMessage = await expectBlocked(completePath, shortage, /insufficient|庫存/);

  const beforeStock = await query(
    `SELECT ib.qty FROM inventory_balance ib
      JOIN material m ON m.id=ib.material_id JOIN warehouse w ON w.id=ib.warehouse_id
     WHERE m.part_no=$1 AND w.warehouse_code='REH-REPAIR' AND ib.stock_status='ISSUED'`,
    [detail.item.materials[0].part_no]
  );
  assert.equal(beforeStock.rowCount, 1, "issued rehearsal stock is missing");
  const success = structuredClone(payload);
  success.materials[0].actualQty = 1;
  const completed = await request(completePath, { method: "POST", body: JSON.stringify(success) });
  assert.equal(completed.consumptionCount, 1);
  assert.equal(completed.linkedFaultOrders.length, 0);

  const persisted = await query(
    `SELECT wo.status,wo.closed_at,p.backfill_status,p.actual_work_date,
            (SELECT count(*)::int FROM inventory_transaction it WHERE it.work_order_id=wo.id AND it.transaction_type='CONSUME') AS consumptions
       FROM work_order wo JOIN pm_work_order p ON p.work_order_id=wo.id
      WHERE wo.work_order_no=$1`,
    [detail.item.workOrderNo]
  );
  assert.equal(persisted.rows[0].status, "COMPLETED");
  assert.equal(persisted.rows[0].backfill_status, "COMPLETED");
  assert.equal(persisted.rows[0].consumptions, 1);
  const afterStock = await query(
    `SELECT ib.qty FROM inventory_balance ib
      JOIN material m ON m.id=ib.material_id JOIN warehouse w ON w.id=ib.warehouse_id
     WHERE m.part_no=$1 AND w.warehouse_code='REH-REPAIR' AND ib.stock_status='ISSUED'`,
    [detail.item.materials[0].part_no]
  );
  assert.equal(Number(afterStock.rows[0].qty), Number(beforeStock.rows[0].qty) - 1);

  console.log(JSON.stringify({
    ok: true,
    workOrderNo: detail.item.workOrderNo,
    blockers: { missingMessage, checkMessage, seatMessage, brakeMessage, shortageMessage },
    checks: detail.checks.length,
    attachments: detail.attachments.map((item) => item.attachment_code),
    consumptionCount: completed.consumptionCount,
    stockBefore: Number(beforeStock.rows[0].qty),
    stockAfter: Number(afterStock.rows[0].qty),
    simulatedPreWorkPrint: true,
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
