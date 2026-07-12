const assert = require("node:assert/strict");

process.env.NODE_ENV = "test";
process.env.ENV_FILE = process.env.ENV_FILE || ".env.test";
require("../src/config/loadEnvironment").loadEnvironment();
const { pool, query } = require("../src/db");
const { expectedAttachmentKeys } = require("../src/services/precheckBackfillRules");

const apiBase = process.env.REHEARSAL_API_URL || "http://127.0.0.1:3102/api";
const headers = { "content-type": "application/json", "x-user-role": "system_admin", "x-user-name": "Rehearsal Admin" };

async function requestResult(path, options = {}) {
  const response = await fetch(`${apiBase}${path}`, { ...options, headers: { ...headers, ...(options.headers || {}) } });
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

function priorMonthDate(year, month) {
  return new Date(Date.UTC(year, month - 2, 10)).toISOString().slice(0, 10);
}

async function createPrintedPackage() {
  const slot = await query(
    `SELECT y::int AS year,m::int AS month
       FROM generate_series(2180,2200) y CROSS JOIN generate_series(1,12) m
      WHERE NOT EXISTS (
        SELECT 1 FROM pm_schedule_item s
         WHERE s.site_code='D' AND s.target_type='VEHICLE' AND s.target_key=$1
           AND s.schedule_year=y AND s.schedule_month=m
      ) ORDER BY y,m LIMIT 1`,
    ["101車"]
  );
  assert.equal(slot.rowCount, 1, "no free P-C-R rehearsal schedule slot remains");
  const { year, month } = slot.rows[0];
  const preview = await request("/precheck/imports/preview", {
    method: "POST",
    headers: { "x-user-role": "scheduler" },
    body: JSON.stringify({
      sourceFile: `phase6-pcr-${year}-${month}.json`, sourceYear: year, siteCode: "D", targetType: "VEHICLE",
      rows: [{ trainNo: "101車", levels: { [String(month)]: "1M" }, latestActualFinishDate: priorMonthDate(year, month) }],
    }),
  });
  await request(`/precheck/imports/${preview.batch.id}/apply`, { method: "POST", headers: { "x-user-role": "scheduler" }, body: "{}" });
  await request("/precheck/schedules/generate", { method: "POST", headers: { "x-user-role": "scheduler" }, body: JSON.stringify({ startDate: `${year}-01-01` }) });
  const scheduleResult = await query(`SELECT id FROM pm_schedule_item WHERE import_batch_id=$1 ORDER BY created_at DESC LIMIT 1`, [preview.batch.id]);
  assert.equal(scheduleResult.rowCount, 1);
  const scheduleId = scheduleResult.rows[0].id;
  await request("/precheck/schedules/publish", {
    method: "POST", headers: { "x-user-role": "scheduler" },
    body: JSON.stringify({ ids: [scheduleId], reason: "Phase 6 P-C-R acceptance" }),
  });
  const created = await request(`/precheck/schedules/${scheduleId}/work-order`, {
    method: "POST", headers: { "x-user-role": "scheduler" }, body: JSON.stringify({ remark: "Phase 6 P-C-R acceptance" }),
  });
  const packageDetail = await request(`/precheck/packages/${encodeURIComponent(created.workOrderNo)}`);
  assert.ok(packageDetail.item.formTemplates.length);
  await query(
    `INSERT INTO work_order_print_job (
       work_order_id,form_template_id,print_stage,job_status,copies,input_snapshot,output_file_name,output_hash,requested_at,generated_at
     ) VALUES ($1,$2,'PRE_WORK','READY',1,$3::jsonb,'phase6-simulated-ready-record.docx',$4,now(),now())`,
    [packageDetail.item.workOrderId, packageDetail.item.formTemplates[0].id,
      JSON.stringify({ ...packageDetail.item, rehearsalSimulation: true }), "e".repeat(64)]
  );
  await query(`UPDATE pm_work_order SET form_template_id=$2 WHERE work_order_id=$1`, [packageDetail.item.workOrderId, packageDetail.item.formTemplates[0].id]);
  await query(`UPDATE work_order SET status='PRINTED' WHERE id=$1`, [packageDetail.item.workOrderId]);
  await query(`UPDATE pm_schedule_item SET schedule_status='PRINTED' WHERE id=$1`, [scheduleId]);
  return request(`/precheck/backfills/${encodeURIComponent(created.workOrderNo)}`);
}

function validValue(item) {
  if (item.check_type !== "value") return "";
  if (item.min_value !== null && item.max_value !== null) return String((Number(item.min_value) + Number(item.max_value)) / 2);
  if (item.min_value !== null) return String(Number(item.min_value));
  if (item.max_value !== null) return String(Number(item.max_value));
  return "1";
}

function attachmentResults(attachments) {
  return attachments.flatMap((attachment) => expectedAttachmentKeys(attachment).map((itemKey) => ({
    templateAttachmentId: attachment.id,
    itemKey,
    resultStatus: "正常",
    resultValue: attachment.attachment_type === "MEASUREMENT_TABLE"
      ? { airGapMm: "7.2", wearDistanceMm: "8.1", surfaceStatus: "正常" }
      : { seatChecked: true },
    remark: "Phase 6 P-C-R acceptance",
    abnormalAction: "",
    linkedFaultWorkOrderId: "",
    abnormalReason: "",
  })));
}

function abnormalCompletionPayload(detail) {
  const date = detail.item.planStartDate;
  const checks = detail.checks.map((item) => ({
    checkItemId: item.id,
    resultStatus: "正常",
    resultValue: validValue(item),
    remark: "Phase 6 P-C-R acceptance",
    abnormalAction: "",
    linkedFaultWorkOrderId: "",
    abnormalReason: "",
  }));
  const abnormal = checks.find((item) => !item.resultValue) || checks[0];
  abnormal.resultStatus = "異常";
  abnormal.abnormalAction = "CREATE_C";
  abnormal.abnormalReason = "Rehearsal serialized component fault";
  return {
    actualWorkDate: date,
    actualStartAt: `${date}T09:00:00+08:00`,
    actualFinishAt: `${date}T16:00:00+08:00`,
    workforceCount: 2,
    workforceHours: 14,
    externalServiceNa: true,
    maintenanceResult: "Found serialized component fault and opened C order",
    actualMaterialNote: "No consumable used",
    dangerPeriods: [],
    snapshot: { accumulatedMileage: "123500", materialWarehouseCode: "REH-REPAIR", materialStockStatus: "ISSUED" },
    materialWarehouseCode: "REH-REPAIR",
    materialStockStatus: "ISSUED",
    materials: detail.item.materials.map((material) => ({ materialId: material.material_id, actualQty: 0, note: "No consumption" })),
    checkResults: checks,
    attachmentResults: attachmentResults(detail.attachments),
  };
}

async function main() {
  const detail = await createPrintedPackage();
  const completed = await request(`/precheck/backfills/${encodeURIComponent(detail.item.workOrderNo)}/complete`, {
    method: "POST", body: JSON.stringify(abnormalCompletionPayload(detail)),
  });
  assert.equal(completed.linkedFaultOrders.length, 1, "abnormal P result should create one C order");
  const cOrderNo = completed.linkedFaultOrders[0].workOrderNo;

  const sourceLink = await query(
    `SELECT c.id,c.work_order_no,c.source_work_order_id,f.source_pm_work_order_id,
            f.source_check_section,f.source_check_item,cr.linked_fault_work_order_id
       FROM work_order c JOIN fault_work_order f ON f.work_order_id=c.id
       JOIN work_order p ON p.id=f.source_pm_work_order_id
       JOIN pm_work_order_check_result cr ON cr.work_order_id=p.id AND cr.linked_fault_work_order_id=c.id
      WHERE c.work_order_no=$1`,
    [cOrderNo]
  );
  assert.equal(sourceLink.rowCount, 1, "P check -> C source link is incomplete");
  assert.ok(sourceLink.rows[0].source_check_section);
  assert.ok(sourceLink.rows[0].source_check_item);

  const finished = await request(`/work-orders/${encodeURIComponent(cOrderNo)}/finish`, {
    method: "POST",
    body: JSON.stringify({
      report: "Removed failed rehearsal unit and installed spare",
      removed_serial: "REH-ASSET-ONLINE-001",
      installed_serial: "REH-ASSET-SPARE-001",
      mileage: 123500,
      actor: "Rehearsal Admin",
    }),
  });
  assert.ok(finished.repairWorkOrder?.workOrderNo, "C completion did not create R order");
  const rOrderNo = finished.repairWorkOrder.workOrderNo;

  const duplicate = await requestResult(`/work-orders/${encodeURIComponent(cOrderNo)}/finish`, {
    method: "POST",
    body: JSON.stringify({ report: "Duplicate submit", removed_serial: "REH-ASSET-ONLINE-001", installed_serial: "REH-ASSET-SPARE-001" }),
  });
  assert.equal(duplicate.status, 409, "duplicate C completion should be rejected");
  const repairCount = await query(
    `SELECT count(*)::int AS count FROM repair_work_order rwo
      JOIN work_order c ON c.id=rwo.source_fault_work_order_id
      JOIN asset a ON a.id=rwo.removed_asset_id
     WHERE c.work_order_no=$1 AND a.serial_no='REH-ASSET-ONLINE-001'`,
    [cOrderNo]
  );
  assert.equal(repairCount.rows[0].count, 1, "source C + removed serial created duplicate R orders");

  await request(`/turnaround/r-orders/${encodeURIComponent(rOrderNo)}/actions`, {
    method: "POST",
    body: JSON.stringify({ action: "SEND_EXTERNAL", vendorCode: "REH-VENDOR", rmaNo: `RMA-${Date.now()}`, expectedReturnDate: "2026-08-31", note: "Phase 6 external repair" }),
  });
  await request(`/turnaround/r-orders/${encodeURIComponent(rOrderNo)}/actions`, {
    method: "POST", body: JSON.stringify({ action: "ACCEPT", note: "Phase 6 acceptance passed" }),
  });
  const returned = await request(`/turnaround/r-orders/${encodeURIComponent(rOrderNo)}/actions`, {
    method: "POST", body: JSON.stringify({ action: "RETURN_STOCK", warehouseCode: "REH-CENTER", note: "Phase 6 returned to stock" }),
  });
  assert.equal(returned.item.status, "已回庫結案");

  const chain = await query(
    `SELECT
       (SELECT count(*)::int FROM repair_work_order rwo JOIN work_order r ON r.id=rwo.work_order_id
         WHERE r.work_order_no=$1 AND rwo.source_fault_work_order_id=$2) AS r_link,
       (SELECT count(*)::int FROM asset_event e JOIN asset a ON a.id=e.asset_id
         WHERE a.serial_no='REH-ASSET-ONLINE-001'
           AND e.work_order_id=(SELECT id FROM work_order WHERE work_order_no=$1)
           AND e.event_type IN ('拆下送修','外修送出','維修驗收','修回入庫')) AS removed_events,
       (SELECT count(*)::int FROM asset_event e JOIN asset a ON a.id=e.asset_id
         WHERE a.serial_no='REH-ASSET-SPARE-001' AND e.work_order_id=$2 AND e.event_type='更換上線') AS installed_events`,
    [rOrderNo, sourceLink.rows[0].id]
  );
  assert.equal(chain.rows[0].r_link, 1);
  assert.equal(chain.rows[0].removed_events, 4);
  assert.equal(chain.rows[0].installed_events, 1);

  const position = await query(
    `SELECT vp.position_code,vp.position_status,a.serial_no
       FROM vehicle_position vp LEFT JOIN asset a ON a.id=vp.current_asset_id
      WHERE vp.position_code='REH-D-TS101-M1-AC'`
  );
  assert.equal(position.rows[0].serial_no, "REH-ASSET-SPARE-001");
  assert.equal(position.rows[0].position_status, "正常上線");
  const removed = await query(
    `SELECT a.current_status,w.warehouse_code FROM asset a LEFT JOIN warehouse w ON w.id=a.current_warehouse_id
      WHERE a.serial_no='REH-ASSET-ONLINE-001'`
  );
  assert.equal(removed.rows[0].current_status, "可用");
  assert.equal(removed.rows[0].warehouse_code, "REH-CENTER");

  console.log(JSON.stringify({
    ok: true,
    pOrderNo: detail.item.workOrderNo,
    cOrderNo,
    rOrderNo,
    duplicateStatus: duplicate.status,
    sourceCheck: `${sourceLink.rows[0].source_check_section} / ${sourceLink.rows[0].source_check_item}`,
    removedEvents: chain.rows[0].removed_events,
    installedEvents: chain.rows[0].installed_events,
    currentPositionAsset: position.rows[0].serial_no,
    removedAssetLocation: removed.rows[0].warehouse_code,
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
