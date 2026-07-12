const express = require("express");
const fs = require("fs");
const { query, withTransaction } = require("../db");
const { asyncHandler, httpError } = require("../middleware/errorHandler");
const { resolveAuth, requireRoles } = require("../middleware/auth");
const { ROLE_POLICIES } = require("../config/rolePolicy");
const { generateSchedule } = require("../services/precheckScheduler");
const {
  buildPrintSnapshot,
  isInstrumentReadyForDate,
  renderWordTemplate,
  validateRequiredMappings,
} = require("../services/wordTemplateService");
const { consumeMaterialWithClient } = require("./inventory");
const {
  evaluateAttachmentStatus,
  evaluateCheckStatus,
  missingAttachmentResults,
  missingCheckResults,
} = require("../services/precheckBackfillRules");
const { buildPmTemplateSnapshot, hashTemplateSnapshot } = require("../services/pmTemplateSnapshot");

const router = express.Router();
const PACKAGE_ROLES = ROLE_POLICIES.PACKAGE_WRITE;
const BACKFILL_ROLES = ROLE_POLICIES.BACKFILL_WRITE;
const PM_CODE_BY_LEVEL = { "1M": "P1", "3M": "P2", "6M": "P3", "1Y": "P4", "5Y/1Y": "P4" };
const WORD_BLOCK_TYPES = new Set(["CHECK_TABLE", "MATERIAL_TABLE", "SEAT_MAP", "MEASUREMENT_TABLE", "OTHER"]);
const WORD_BLOCK_TARGET_TYPES = new Set(["BOOKMARK_RANGE", "TABLE", "SHAPE_COORDINATES", "IMAGE_OVERLAY"]);

router.use(resolveAuth);

function cleanText(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function actorId(req) {
  return req.user.id === "preview-user" ? null : req.user.id;
}

function parseLimit(value, fallback = 100, max = 500) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
}

function numberOrNull(value) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number)) throw httpError(400, "數值格式不正確");
  return number;
}

function normalizedWordBlock(mapping, index) {
  const blockCode = cleanText(mapping?.blockCode)?.toUpperCase();
  const sourcePath = cleanText(mapping?.sourcePath);
  const blockType = String(mapping?.blockType || "OTHER").toUpperCase();
  const wordTargetType = String(mapping?.wordTargetType || "BOOKMARK_RANGE").toUpperCase();
  const wordTarget = cleanText(mapping?.wordTarget);
  if (!blockCode || !/^[A-Z0-9][A-Z0-9_-]{1,79}$/.test(blockCode)) throw httpError(400, `第 ${index + 1} 筆動態區塊代碼不正確`);
  if (!sourcePath || !wordTarget) throw httpError(400, `第 ${index + 1} 筆動態區塊缺少資料來源或 Word 目標`);
  if (!WORD_BLOCK_TYPES.has(blockType)) throw httpError(400, `第 ${index + 1} 筆動態區塊類型不支援`);
  if (!WORD_BLOCK_TARGET_TYPES.has(wordTargetType)) throw httpError(400, `第 ${index + 1} 筆 Word 目標類型不支援`);
  const configJson = mapping?.configJson && typeof mapping.configJson === "object" && !Array.isArray(mapping.configJson)
    ? mapping.configJson
    : {};
  return {
    blockCode,
    sourcePath,
    blockType,
    wordTargetType,
    wordTarget,
    transformCode: cleanText(mapping?.transformCode),
    configJson,
    isRequired: Boolean(mapping?.isRequired),
    sortOrder: Number(mapping?.sortOrder || index + 1),
  };
}

async function getPmWorkOrder(client, workOrderNo, forUpdate = false) {
  const result = await client.query(
    `SELECT wo.*, p.*, pt.pm_label,pt.version_no AS pm_template_version,
            pt.revision_no AS pm_template_revision,pt.id AS resolved_pm_template_id,
            t.train_no, s.id AS schedule_item_id, s.target_key, s.target_name,
            s.target_type, s.pm_level, s.planned_start_date, s.planned_end_date,
            s.latest_actual_finish_date, s.schedule_status, s.needs_review, s.review_reasons
       FROM work_order wo
       JOIN pm_work_order p ON p.work_order_id=wo.id
       LEFT JOIN pm_template pt ON pt.id=p.pm_template_id
       LEFT JOIN train t ON t.id=wo.train_id
       LEFT JOIN pm_schedule_item s ON s.generated_work_order_id=wo.id
      WHERE wo.work_order_no=$1 AND wo.work_order_type='P' AND wo.deleted_at IS NULL
      ${forUpdate ? "FOR UPDATE OF wo, p" : ""}`,
    [workOrderNo]
  );
  if (!result.rowCount) throw httpError(404, "P 工單不存在");
  return result.rows[0];
}

async function packageRelations(client, row) {
  const [materials, instruments, wiDocuments, templates, printJobs] = await Promise.all([
    client.query(
      `SELECT wom.material_id, m.part_no, m.material_name, m.spec, wom.planned_qty,
              wom.actual_qty, COALESCE(wom.unit,m.unit) AS unit, wom.note,
              ptm.default_qty AS template_default_qty,ptm.condition_code,ptm.condition_options
         FROM work_order_material wom JOIN material m ON m.id=wom.material_id
         LEFT JOIN pm_template_material ptm ON ptm.pm_template_id=$2 AND ptm.material_id=wom.material_id
        WHERE wom.work_order_id=$1 ORDER BY m.part_no`, [row.work_order_id, row.pm_template_id]
    ),
    client.query(
      `SELECT i.id, i.instrument_no, i.instrument_name, i.calibration_due_date, i.status, woi.note
         FROM work_order_instrument woi JOIN instrument i ON i.id=woi.instrument_id
        WHERE woi.work_order_id=$1 ORDER BY i.instrument_no`, [row.work_order_id]
    ),
    client.query(
      `SELECT wi.id, wi.wi_no, wi.wi_name, wi.version_no, wi.status, wow.note
         FROM work_order_wi wow JOIN wi_document wi ON wi.id=wow.wi_document_id
        WHERE wow.work_order_id=$1 ORDER BY wi.wi_no`, [row.work_order_id]
    ),
    client.query(
      `SELECT ft.* FROM form_template ft
        WHERE ft.pm_template_id=$1
          AND (
            (ft.is_active=true AND ft.lifecycle_status='PUBLISHED'
              AND (ft.effective_from IS NULL OR ft.effective_from<=CURRENT_DATE)
              AND (ft.effective_to IS NULL OR ft.effective_to>=CURRENT_DATE))
            OR ft.id=$2
          )
        ORDER BY CASE WHEN ft.id=$2 THEN 0 ELSE 1 END,
                 ft.effective_from DESC NULLS LAST, ft.version_no DESC`, [row.pm_template_id, row.form_template_id]
    ),
    client.query(
      `SELECT pj.id, pj.print_stage, pj.job_status, pj.copies, pj.output_file_name,
              pj.output_hash, pj.requested_at, pj.generated_at, pj.error_message,
              ft.template_name, ft.version_no
         FROM work_order_print_job pj JOIN form_template ft ON ft.id=pj.form_template_id
        WHERE pj.work_order_id=$1 ORDER BY pj.requested_at DESC`, [row.work_order_id]
    ),
  ]);
  return { materials: materials.rows, instruments: instruments.rows, wiDocuments: wiDocuments.rows, formTemplates: templates.rows, printJobs: printJobs.rows };
}

function packageDto(row, relations) {
  return {
    workOrderId: row.work_order_id,
    workOrderNo: row.work_order_no,
    status: row.status,
    title: row.title,
    trainNo: row.train_no,
    targetKey: row.target_key,
    targetName: row.target_name,
    targetType: row.target_type,
    pmCode: row.pm_code,
    pmLabel: row.pm_label,
    pmTemplateVersion: row.pm_template_version,
    pmTemplateRevision: row.pm_template_revision,
    pmLevel: row.pm_level,
    planStartDate: row.plan_start_date || row.planned_start_date,
    plannedEndDate: row.planned_end_date,
    latestFinishDate: row.latest_finish_date,
    latestActualFinishDate: row.latest_actual_finish_date,
    maintenanceType: row.maintenance_type,
    executionType: row.execution_type,
    formTemplateId: row.form_template_id,
    formSnapshot: row.form_snapshot || {},
    templateSnapshotHash: row.template_snapshot_hash,
    templateSnapshotCreatedAt: row.template_snapshot_created_at,
    backfillStatus: row.backfill_status,
    actualWorkDate: row.actual_work_date,
    actualStartAt: row.actual_start_at,
    actualFinishAt: row.actual_finish_at,
    materials: relations.materials,
    instruments: relations.instruments,
    wiDocuments: relations.wiDocuments,
    formTemplates: relations.formTemplates,
    printJobs: relations.printJobs,
  };
}

router.post(
  "/schedules/:id/work-order",
  requireRoles(...PACKAGE_ROLES),
  asyncHandler(async (req, res) => {
    const result = await withTransaction(async (client) => {
      const scheduleResult = await client.query(`SELECT * FROM pm_schedule_item WHERE id=$1 FOR UPDATE`, [req.params.id]);
      if (!scheduleResult.rowCount) throw httpError(404, "排程不存在");
      const schedule = scheduleResult.rows[0];
      if (!schedule.planned_start_date) throw httpError(409, "排程尚未產生日期");
      if (schedule.generated_work_order_id) {
        const existing = await client.query(`SELECT work_order_no FROM work_order WHERE id=$1`, [schedule.generated_work_order_id]);
        return { workOrderNo: existing.rows[0].work_order_no, existing: true };
      }
      const pmCode = PM_CODE_BY_LEVEL[schedule.pm_level];
      const template = await client.query(
        `SELECT * FROM pm_template
          WHERE pm_code=$1 AND lifecycle_status='PUBLISHED' AND is_active=true
            AND (effective_from IS NULL OR effective_from<=$2)
            AND (effective_to IS NULL OR effective_to>=$2)
          ORDER BY revision_no DESC LIMIT 1`,
        [pmCode, schedule.planned_start_date]
      );
      if (!template.rowCount) throw httpError(409, `找不到 ${pmCode} 預檢模板`);
      const targetCode = schedule.target_type === "VEHICLE" ? "TS" : "DE";
      const numberResult = await client.query(`SELECT next_document_no('P',$1,$2,$3) AS work_order_no`, [schedule.planned_start_date, schedule.site_code, targetCode]);
      const workOrderNo = numberResult.rows[0].work_order_no;
      const sequence = Number(workOrderNo.split("-").at(-1));
      const workOrder = await client.query(
        `INSERT INTO work_order (
           work_order_no, work_order_type, work_order_date, site_code, target_code,
           daily_sequence, title, status, train_id, created_by, planned_start_at, remark
         ) VALUES ($1,'P',$2,$3,$4,$5,$6,'DRAFT',$7,$8,$2::date,$9)
         RETURNING id`,
        [workOrderNo, schedule.planned_start_date, schedule.site_code, targetCode, sequence,
          `${schedule.target_name} ${schedule.pm_level} 預防檢修`, schedule.train_id, actorId(req), cleanText(req.body?.remark)]
      );
      const formSnapshot = {
        scheduleItemId: schedule.id,
        targetType: schedule.target_type,
        targetKey: schedule.target_key,
        targetName: schedule.target_name,
        pmLevel: schedule.pm_level,
        plannedStartDate: schedule.planned_start_date,
        plannedEndDate: schedule.planned_end_date,
        pmTemplateId: template.rows[0].id,
        pmTemplateVersion: template.rows[0].version_no,
        pmTemplateRevision: template.rows[0].revision_no,
        conditions: { airFilterMode: "N/A" },
      };
      const templateSnapshot = await buildPmTemplateSnapshot(client, template.rows[0].id);
      if (!templateSnapshot.formTemplate) throw httpError(409, `${pmCode} 尚未設定已發布的 Word 範本版本`);
      const templateSnapshotHash = hashTemplateSnapshot(templateSnapshot);
      await client.query(
        `INSERT INTO pm_work_order (
           work_order_id, pm_template_id, pm_code, plan_start_date, latest_finish_date,
           system_name, equipment_group_name, maintenance_type, execution_type,
           form_template_id,form_snapshot,backfill_status,template_snapshot,
           template_snapshot_hash,template_snapshot_created_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,'預防性維修','正常預排',$8,$9::jsonb,
                   'NOT_STARTED',$10::jsonb,$11,now())`,
        [workOrder.rows[0].id, template.rows[0].id, pmCode, schedule.planned_start_date,
          schedule.planned_end_date, schedule.target_type === "VEHICLE" ? "輕軌列車" : "機廠設備",
          schedule.target_name, templateSnapshot.formTemplate.id, JSON.stringify(formSnapshot),
          JSON.stringify(templateSnapshot), templateSnapshotHash]
      );
      await client.query(
        `INSERT INTO work_order_material (work_order_id, material_id, planned_qty, unit, note)
         SELECT $1, ptm.material_id,
                CASE WHEN ptm.condition_code='ALWAYS' THEN ptm.default_qty ELSE 0 END,
                ptm.default_unit, ptm.display_note
           FROM pm_template_material ptm
          WHERE ptm.pm_template_id=$2 AND ptm.is_active=true`, [workOrder.rows[0].id, template.rows[0].id]
      );
      await client.query(
        `INSERT INTO work_order_instrument (work_order_id, instrument_id)
         SELECT $1, instrument_id FROM pm_template_instrument
          WHERE pm_template_id=$2 AND is_active=true`, [workOrder.rows[0].id, template.rows[0].id]
      );
      await client.query(
        `INSERT INTO work_order_wi (work_order_id, wi_document_id)
         SELECT $1, wi_document_id FROM pm_template_wi
          WHERE pm_template_id=$2 AND is_active=true`, [workOrder.rows[0].id, template.rows[0].id]
      );
      await client.query(
        `INSERT INTO pm_work_order_check_result (work_order_id, check_item_id, result_status)
         SELECT $1, id, default_status FROM pm_template_check_item
          WHERE pm_template_id=$2 AND is_active=true ON CONFLICT DO NOTHING`, [workOrder.rows[0].id, template.rows[0].id]
      );
      await client.query(
        `UPDATE pm_schedule_item SET generated_work_order_id=$2, schedule_status='WORK_ORDER_DRAFT',
           version=version+1, updated_by=$3, updated_at=now() WHERE id=$1`,
        [schedule.id, workOrder.rows[0].id, actorId(req)]
      );
      await client.query(
        `INSERT INTO pm_schedule_change_log (schedule_item_id, change_type, reason, changed_by, after_data)
         VALUES ($1,'CREATE_P_WORK_ORDER',$2,$3,$4::jsonb)`,
        [schedule.id, `建立 ${workOrderNo}`, actorId(req), JSON.stringify({ workOrderNo })]
      );
      await client.query(
        `INSERT INTO work_order_event (work_order_id, actor_text, action_code, note)
         VALUES ($1,$2,'P_DRAFT','由已確認排程建立 P 工單草稿')`, [workOrder.rows[0].id, req.user.displayName]
      );
      return { workOrderNo, existing: false };
    });
    res.status(result.existing ? 200 : 201).json(result);
  })
);

router.get("/packages", asyncHandler(async (req, res) => {
  const values = [];
  const filters = ["wo.work_order_type='P'", "wo.deleted_at IS NULL"];
  if (cleanText(req.query.status)) { values.push(cleanText(req.query.status)); filters.push(`wo.status=$${values.length}`); }
  if (cleanText(req.query.search)) { values.push(`%${cleanText(req.query.search)}%`); filters.push(`(wo.work_order_no ILIKE $${values.length} OR wo.title ILIKE $${values.length} OR t.train_no ILIKE $${values.length})`); }
  values.push(parseLimit(req.query.limit));
  const rows = await query(
    `SELECT wo.work_order_no, wo.title, wo.status, wo.work_order_date, wo.planned_start_at,
            p.pm_code, p.backfill_status, t.train_no,
            s.target_name, s.target_type, s.pm_level, s.planned_start_date,
            EXISTS(SELECT 1 FROM work_order_print_job pj WHERE pj.work_order_id=wo.id AND pj.job_status='READY') AS has_print
       FROM work_order wo JOIN pm_work_order p ON p.work_order_id=wo.id
       LEFT JOIN train t ON t.id=wo.train_id
       LEFT JOIN pm_schedule_item s ON s.generated_work_order_id=wo.id
      WHERE ${filters.join(" AND ")}
      ORDER BY s.planned_start_date NULLS LAST, wo.created_at DESC LIMIT $${values.length}`,
    values
  );
  res.json({ items: rows.rows });
}));

router.get("/packages/:no", asyncHandler(async (req, res) => {
  const client = { query };
  const row = await getPmWorkOrder(client, req.params.no);
  const relations = await packageRelations(client, row);
  res.json({ item: packageDto(row, relations) });
}));

router.patch(
  "/packages/:no",
  requireRoles(...PACKAGE_ROLES),
  asyncHandler(async (req, res) => {
    await withTransaction(async (client) => {
      const row = await getPmWorkOrder(client, req.params.no, true);
      const body = req.body || {};
      const snapshot = { ...(row.form_snapshot || {}), conditions: body.conditions || row.form_snapshot?.conditions || {}, preparationNote: cleanText(body.preparationNote) };
      const requestedFormTemplateId = cleanText(body.formTemplateId);
      if (requestedFormTemplateId && requestedFormTemplateId !== row.form_template_id) {
        const printed = await client.query(
          `SELECT 1 FROM work_order_print_job WHERE work_order_id=$1 AND job_status='READY' LIMIT 1`,
          [row.work_order_id]
        );
        if (printed.rowCount) throw httpError(409, "首次列印完成後不可更換 Word 範本版本");
      }
      const refreshTemplateSnapshot = Boolean(requestedFormTemplateId) || !row.template_snapshot_hash;
      const templateSnapshot = refreshTemplateSnapshot
        ? await buildPmTemplateSnapshot(client, row.pm_template_id, requestedFormTemplateId || row.form_template_id)
        : null;
      const templateSnapshotHash = templateSnapshot ? hashTemplateSnapshot(templateSnapshot) : null;
      await client.query(
        `UPDATE pm_work_order SET maintenance_type=COALESCE($2,maintenance_type),
           execution_type=COALESCE($3,execution_type), form_template_id=COALESCE($4,form_template_id),
           form_snapshot=$5::jsonb,
           template_snapshot=COALESCE($6::jsonb,template_snapshot),
           template_snapshot_hash=COALESCE($7,template_snapshot_hash),
           template_snapshot_created_at=CASE WHEN $6::jsonb IS NULL THEN template_snapshot_created_at ELSE now() END
         WHERE work_order_id=$1`,
        [row.work_order_id, cleanText(body.maintenanceType), cleanText(body.executionType), requestedFormTemplateId,
          JSON.stringify(snapshot), templateSnapshot ? JSON.stringify(templateSnapshot) : null, templateSnapshotHash]
      );
      if (Array.isArray(body.instrumentIds)) {
        await client.query(`DELETE FROM work_order_instrument WHERE work_order_id=$1`, [row.work_order_id]);
        for (const id of body.instrumentIds) await client.query(`INSERT INTO work_order_instrument (work_order_id,instrument_id) VALUES ($1,$2)`, [row.work_order_id, id]);
      }
      if (Array.isArray(body.wiDocumentIds)) {
        await client.query(`DELETE FROM work_order_wi WHERE work_order_id=$1`, [row.work_order_id]);
        for (const id of body.wiDocumentIds) await client.query(`INSERT INTO work_order_wi (work_order_id,wi_document_id) VALUES ($1,$2)`, [row.work_order_id, id]);
      }
      if (Array.isArray(body.materials)) {
        for (const material of body.materials) {
          await client.query(
            `UPDATE work_order_material SET planned_qty=$3, note=$4 WHERE work_order_id=$1 AND material_id=$2`,
            [row.work_order_id, material.materialId, numberOrNull(material.plannedQty), cleanText(material.note)]
          );
        }
      }
      await client.query(`INSERT INTO work_order_event (work_order_id,actor_text,action_code,note) VALUES ($1,$2,'P_PREPARE','更新列印前確認資料')`, [row.work_order_id, req.user.displayName]);
    });
    const client = { query };
    const row = await getPmWorkOrder(client, req.params.no);
    res.json({ item: packageDto(row, await packageRelations(client, row)) });
  })
);

async function createPrintJob(req, res, printStage) {
  const client = { query };
  const row = await getPmWorkOrder(client, req.params.no);
  const isCompleted = Boolean(row.closed_at) || row.backfill_status === "COMPLETED";
  if (printStage === "PRE_WORK" && isCompleted) throw httpError(409, "已完工的 P 工單不可再次建立作業前列印");
  if (printStage === "POST_COMPLETION" && !isCompleted) throw httpError(409, "P 工單尚未確認完工，不可輸出完工版 Word");
  const relations = await packageRelations(client, row);
  const templateId = cleanText(req.body?.formTemplateId) || row.form_template_id;
  const template = relations.formTemplates.find((item) => item.id === templateId);
  if (!template) throw httpError(409, "請先選擇有效的 Word 範本版本");
  const copies = Number(req.body?.copies || 1);
  if (!Number.isInteger(copies) || copies < 1 || copies > 20) throw httpError(400, "列印份數必須為 1 至 20");
  const effectiveDate = String(row.plan_start_date || row.work_order_date || new Date().toISOString().slice(0, 10)).slice(0, 10);
  if (!relations.instruments.length) throw httpError(409, "列印前至少需要一項儀器");
  const invalidInstruments = relations.instruments.filter((instrument) => !isInstrumentReadyForDate(instrument, effectiveDate));
  if (invalidInstruments.length) throw httpError(409, "儀器狀態或校驗效期不符合列印日期", {
    instruments: invalidInstruments.map((item) => item.instrument_no),
  });
  if (!relations.wiDocuments.length) throw httpError(409, "列印前至少需要一份 W.I.No");
  const invalidMaterials = relations.materials.filter((material) => Number(material.planned_qty) < 0);
  if (invalidMaterials.length) throw httpError(409, "預設用料數量不可小於零");
  const mappingsResult = await query(`SELECT * FROM form_template_field_mapping WHERE form_template_id=$1 ORDER BY sort_order,field_key`, [template.id]);
  const snapshot = buildPrintSnapshot(packageDto(row, relations), printStage);
  const requiredMissing = validateRequiredMappings(snapshot, mappingsResult.rows);
  if (requiredMissing.length) throw httpError(409, "Word 範本必填資料尚未完整", { fields: requiredMissing });
  const jobResult = await query(
    `INSERT INTO work_order_print_job (work_order_id,form_template_id,print_stage,job_status,copies,input_snapshot,requested_by)
     VALUES ($1,$2,$3,'GENERATING',$4,$5::jsonb,$6) RETURNING id`,
    [row.work_order_id, template.id, printStage, copies, JSON.stringify(snapshot), actorId(req)]
  );
  const jobId = jobResult.rows[0].id;
  try {
    const output = await renderWordTemplate({ template, mappings: mappingsResult.rows, snapshot, workOrderNo: row.work_order_no, printStage, jobId });
    await query(
      `UPDATE work_order_print_job SET job_status='READY',output_file_name=$2,output_path=$3,
         output_hash=$4,generated_at=now() WHERE id=$1`, [jobId, output.outputFileName, output.outputPath, output.outputHash]
    );
    await query(`UPDATE pm_work_order SET form_template_id=$2 WHERE work_order_id=$1`, [row.work_order_id, template.id]);
    await query(`UPDATE work_order SET status=CASE WHEN $2='PRE_WORK' THEN 'PRINTED' ELSE status END,updated_at=now() WHERE id=$1`, [row.work_order_id, printStage]);
    if (row.schedule_item_id && printStage === "PRE_WORK") await query(`UPDATE pm_schedule_item SET schedule_status='PRINTED' WHERE id=$1`, [row.schedule_item_id]);
    await query(
      `INSERT INTO work_order_event (work_order_id,actor_text,action_code,note)
       VALUES ($1,$2,$3,$4)`,
      [row.work_order_id, req.user.displayName, printStage === "PRE_WORK" ? "P_PRINT_PRE" : "P_PRINT_POST", `${template.template_name} v${template.version_no}，${copies} 份`]
    );
    res.status(201).json({ id: jobId, status: "READY", ...output });
  } catch (error) {
    await query(`UPDATE work_order_print_job SET job_status='FAILED',error_message=$2 WHERE id=$1`, [jobId, String(error.message || error)]);
    throw httpError(502, "Word 範本產生失敗", { jobId, reason: String(error.message || error) });
  }
}

router.post("/packages/:no/print-jobs", requireRoles(...PACKAGE_ROLES), asyncHandler((req, res) => createPrintJob(req, res, "PRE_WORK")));
router.post("/backfills/:no/print-jobs", requireRoles(...BACKFILL_ROLES), asyncHandler((req, res) => createPrintJob(req, res, "POST_COMPLETION")));

router.get("/print-jobs/:id/download", asyncHandler(async (req, res) => {
  const result = await query(`SELECT output_path,output_file_name,job_status FROM work_order_print_job WHERE id=$1`, [req.params.id]);
  if (!result.rowCount) throw httpError(404, "列印紀錄不存在");
  const job = result.rows[0];
  if (job.job_status !== "READY" || !job.output_path || !fs.existsSync(job.output_path)) throw httpError(409, "輸出檔尚未完成或已移除");
  res.download(job.output_path, job.output_file_name);
}));

router.get("/backfills", asyncHandler(async (req, res) => {
  const rows = await query(
    `SELECT wo.work_order_no,wo.title,wo.status,t.train_no,p.pm_code,p.backfill_status,
            s.pm_level,s.planned_start_date,
            floor(EXTRACT(epoch FROM (now()-MIN(pj.generated_at)))/86400)::int AS printed_days_ago,
            count(DISTINCT CASE WHEN cr.result_status='異常' THEN cr.id END)::int +
            count(DISTINCT CASE WHEN ar.result_status='異常' THEN ar.id END)::int AS abnormal_count
       FROM work_order wo JOIN pm_work_order p ON p.work_order_id=wo.id
       JOIN work_order_print_job pj ON pj.work_order_id=wo.id AND pj.print_stage='PRE_WORK' AND pj.job_status='READY'
       LEFT JOIN train t ON t.id=wo.train_id
       LEFT JOIN pm_schedule_item s ON s.generated_work_order_id=wo.id
       LEFT JOIN pm_work_order_check_result cr ON cr.work_order_id=wo.id
       LEFT JOIN pm_work_order_attachment_result ar ON ar.work_order_id=wo.id
      WHERE wo.work_order_type='P' AND wo.closed_at IS NULL
      GROUP BY wo.id,t.train_no,p.pm_code,p.backfill_status,s.pm_level,s.planned_start_date
      ORDER BY s.planned_start_date,wo.created_at LIMIT $1`, [parseLimit(req.query.limit)]
  );
  res.json({ items: rows.rows });
}));

async function getBackfillData(client, workOrderNo) {
  const row = await getPmWorkOrder(client, workOrderNo);
  const relations = await packageRelations(client, row);
  const [checks, attachments, attachmentResults, dangerPeriods] = await Promise.all([
    client.query(
      `SELECT ci.*, cr.id AS result_id,cr.result_status,cr.result_value,cr.remark AS result_remark,
              cr.abnormal_action,cr.linked_fault_work_order_id,cr.abnormal_reason,
              linked.work_order_no AS linked_fault_work_order_no,
              open_fault.id AS open_fault_work_order_id,
              open_fault.work_order_no AS open_fault_work_order_no,
              open_fault.status AS open_fault_status
         FROM pm_template_check_item ci
         LEFT JOIN pm_work_order_check_result cr ON cr.check_item_id=ci.id AND cr.work_order_id=$1
         LEFT JOIN work_order linked ON linked.id=cr.linked_fault_work_order_id
         LEFT JOIN LATERAL (
           SELECT cwo.id,cwo.work_order_no,cwo.status
             FROM work_order cwo JOIN fault_work_order fwo ON fwo.work_order_id=cwo.id
            WHERE cwo.work_order_type='C' AND cwo.closed_at IS NULL
              AND cwo.train_id=$3
              AND fwo.source_check_section=ci.section
              AND fwo.source_check_item=ci.item_no
            ORDER BY cwo.created_at DESC LIMIT 1
         ) open_fault ON true
        WHERE ci.pm_template_id=$2 AND ci.is_active=true
        ORDER BY ci.section_sort_order,ci.section,ci.sort_order,ci.item_no`, [row.work_order_id, row.pm_template_id, row.train_id]
    ),
    client.query(`SELECT * FROM pm_template_attachment WHERE pm_template_id=$1 AND is_active=true ORDER BY sort_order`, [row.pm_template_id]),
    client.query(`SELECT ar.*,wo.work_order_no AS linked_fault_work_order_no FROM pm_work_order_attachment_result ar LEFT JOIN work_order wo ON wo.id=ar.linked_fault_work_order_id WHERE ar.work_order_id=$1`, [row.work_order_id]),
    client.query(`SELECT * FROM pm_work_order_danger_period WHERE work_order_id=$1 ORDER BY start_at`, [row.work_order_id]),
  ]);
  return { item: packageDto(row, relations), workOrder: row, checks: checks.rows, attachments: attachments.rows, attachmentResults: attachmentResults.rows, dangerPeriods: dangerPeriods.rows };
}

router.get("/backfills/:no", asyncHandler(async (req, res) => {
  res.json(await getBackfillData({ query }, req.params.no));
}));

function evaluatedStatus(item, result) {
  try {
    return evaluateCheckStatus(item, result);
  } catch {
    throw httpError(400, "檢查結果狀態不正確");
  }
}

function evaluatedAttachmentStatus(attachment, result) {
  try {
    return evaluateAttachmentStatus(attachment, result);
  } catch {
    throw httpError(400, "附件量測值或結果狀態不正確");
  }
}

async function saveBackfill(client, row, body, req) {
  await client.query(
    `UPDATE work_order SET actual_start_at=COALESCE($2,actual_start_at),actual_finish_at=COALESCE($3,actual_finish_at),
       status=CASE WHEN status='DRAFT' OR status='PRINTED' THEN 'IN_PROGRESS' ELSE status END,updated_at=now()
     WHERE id=$1`, [row.work_order_id, cleanText(body.actualStartAt), cleanText(body.actualFinishAt)]
  );
  await client.query(
    `UPDATE pm_work_order SET backfill_status='DRAFT',actual_work_date=COALESCE($2,actual_work_date),
       workforce_count=$3,workforce_hours=$4,external_service_na=COALESCE($5,external_service_na),
       external_service_detail=$6,maintenance_result=$7,actual_material_note=$8,
       backfill_snapshot=$9::jsonb WHERE work_order_id=$1`,
    [row.work_order_id, cleanText(body.actualWorkDate), numberOrNull(body.workforceCount), numberOrNull(body.workforceHours),
      body.externalServiceNa, cleanText(body.externalServiceDetail), cleanText(body.maintenanceResult), cleanText(body.actualMaterialNote), JSON.stringify(body.snapshot || {})]
  );
  if (Array.isArray(body.dangerPeriods)) {
    await client.query(`DELETE FROM pm_work_order_danger_period WHERE work_order_id=$1`, [row.work_order_id]);
    for (const period of body.dangerPeriods) {
      if (period.startAt && period.endAt) await client.query(
        `INSERT INTO pm_work_order_danger_period (work_order_id,start_at,end_at,note) VALUES ($1,$2,$3,$4)`,
        [row.work_order_id, period.startAt, period.endAt, cleanText(period.note)]
      );
    }
  }
  if (Array.isArray(body.materials)) {
    for (const material of body.materials) {
      const actualQty = numberOrNull(material.actualQty);
      if (actualQty !== null && actualQty < 0) throw httpError(400, "實際用料數量不可小於零");
      await client.query(
        `UPDATE work_order_material SET actual_qty=$3,note=COALESCE($4,note) WHERE work_order_id=$1 AND material_id=$2`,
        [row.work_order_id, material.materialId, actualQty, cleanText(material.note)]
      );
    }
  }
  if (Array.isArray(body.checkResults)) {
    const items = await client.query(`SELECT * FROM pm_template_check_item WHERE pm_template_id=$1 AND is_active=true`, [row.pm_template_id]);
    const byId = new Map(items.rows.map((item) => [item.id, item]));
    for (const result of body.checkResults) {
      const item = byId.get(result.checkItemId);
      if (!item) continue;
      await client.query(
        `INSERT INTO pm_work_order_check_result (
           work_order_id,check_item_id,result_status,result_value,remark,abnormal_action,
           linked_fault_work_order_id,abnormal_reason,filled_by,filled_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())
         ON CONFLICT (work_order_id,check_item_id) DO UPDATE SET
           result_status=EXCLUDED.result_status,result_value=EXCLUDED.result_value,remark=EXCLUDED.remark,
           abnormal_action=EXCLUDED.abnormal_action,linked_fault_work_order_id=EXCLUDED.linked_fault_work_order_id,
           abnormal_reason=EXCLUDED.abnormal_reason,filled_by=EXCLUDED.filled_by,filled_at=now(),updated_at=now()`,
        [row.work_order_id, item.id, evaluatedStatus(item, result), cleanText(result.resultValue), cleanText(result.remark),
          cleanText(result.abnormalAction), cleanText(result.linkedFaultWorkOrderId), cleanText(result.abnormalReason), actorId(req)]
      );
    }
  }
  if (Array.isArray(body.attachmentResults)) {
    const attachmentTemplates = await client.query(
      `SELECT * FROM pm_template_attachment WHERE pm_template_id=$1 AND is_active=true`,
      [row.pm_template_id]
    );
    const byId = new Map(attachmentTemplates.rows.map((attachment) => [attachment.id, attachment]));
    for (const result of body.attachmentResults) {
      const attachment = byId.get(result.templateAttachmentId);
      if (!attachment) continue;
      await client.query(
        `INSERT INTO pm_work_order_attachment_result (
           work_order_id,template_attachment_id,item_key,result_status,result_value,remark,
           abnormal_action,linked_fault_work_order_id,abnormal_reason,filled_by,filled_at
         ) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,now())
         ON CONFLICT (work_order_id,template_attachment_id,item_key) DO UPDATE SET
           result_status=EXCLUDED.result_status,result_value=EXCLUDED.result_value,remark=EXCLUDED.remark,
           abnormal_action=EXCLUDED.abnormal_action,linked_fault_work_order_id=EXCLUDED.linked_fault_work_order_id,
           abnormal_reason=EXCLUDED.abnormal_reason,filled_by=EXCLUDED.filled_by,filled_at=now(),updated_at=now()`,
        [row.work_order_id, result.templateAttachmentId, result.itemKey, evaluatedAttachmentStatus(attachment, result),
          JSON.stringify(result.resultValue || {}), cleanText(result.remark), cleanText(result.abnormalAction),
          cleanText(result.linkedFaultWorkOrderId), cleanText(result.abnormalReason), actorId(req)]
      );
    }
  }
  await client.query(`INSERT INTO work_order_event (work_order_id,actor_text,action_code,note) VALUES ($1,$2,'P_BACKFILL_DRAFT','儲存預檢回填草稿')`, [row.work_order_id, req.user.displayName]);
}

router.patch(
  "/backfills/:no",
  requireRoles(...BACKFILL_ROLES),
  asyncHandler(async (req, res) => {
    await withTransaction(async (client) => {
      const row = await getPmWorkOrder(client, req.params.no, true);
      if (row.closed_at || row.backfill_status === "COMPLETED") throw httpError(409, "此 P 工單已完工，不可再修改回填資料");
      await saveBackfill(client, row, req.body || {}, req);
    });
    res.json(await getBackfillData({ query }, req.params.no));
  })
);

async function createFaultFromAbnormal(client, pmRow, abnormal, req) {
  const date = pmRow.actual_finish_at ? new Date(pmRow.actual_finish_at).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
  const targetCode = pmRow.target_type === "DEPOT_EQUIPMENT" ? "DE" : "TS";
  const numberResult = await client.query(`SELECT next_document_no('C',$1,$2,$3) AS work_order_no`, [date, pmRow.site_code, targetCode]);
  const workOrderNo = numberResult.rows[0].work_order_no;
  const sequence = Number(workOrderNo.split("-").at(-1));
  const workOrder = await client.query(
    `INSERT INTO work_order (work_order_no,work_order_type,work_order_date,site_code,target_code,daily_sequence,title,status,train_id,source_work_order_id,created_by)
     VALUES ($1,'C',$2,$3,$4,$5,$6,'0',$7,$8,$9) RETURNING id`,
    [workOrderNo, date, pmRow.site_code, targetCode, sequence, String(abnormal.description).slice(0, 100), pmRow.train_id, pmRow.work_order_id, actorId(req)]
  );
  await client.query(
    `INSERT INTO fault_work_order (work_order_id,fault_description,main_system,fault_category,fault_found_at,source_pm_work_order_id,source_check_section,source_check_item)
     VALUES ($1,$2,'預檢發現異常',$3,now(),$4,$5,$6)`,
    [workOrder.rows[0].id, `${abnormal.description}：${abnormal.reason}`, abnormal.section || "附件", pmRow.work_order_id, abnormal.section, abnormal.item]
  );
  await client.query(`INSERT INTO work_order_event (work_order_id,actor_text,action_code,note) VALUES ($1,$2,'C_CREATED_FROM_PM',$3)`, [workOrder.rows[0].id, req.user.displayName, `由 ${pmRow.work_order_no} 回填異常建立：${abnormal.reason}`]);
  return { id: workOrder.rows[0].id, workOrderNo };
}

async function handleAbnormal(client, pmRow, abnormal, req) {
  if (!abnormal.action) throw httpError(409, `${abnormal.description} 尚未選擇報修處理`);
  if (!cleanText(abnormal.reason)) throw httpError(409, `${abnormal.description} 必須填寫異常說明`);
  if (abnormal.action === "RECORD_ONLY" && !["system_admin", "maintenance_supervisor"].includes(req.user.role)) throw httpError(403, "僅主管可將異常設為僅記錄");
  if (abnormal.action === "RECORD_ONLY" && !cleanText(abnormal.reason)) throw httpError(409, "僅記錄異常必須填寫原因");
  if (abnormal.action === "CREATE_C") return createFaultFromAbnormal(client, pmRow, abnormal, req);
  if (abnormal.action === "UPDATE_C") {
    if (!abnormal.linkedId) throw httpError(409, `${abnormal.description} 未選擇既有 C 工單`);
    const existing = await client.query(`SELECT id,work_order_no FROM work_order WHERE id=$1 AND work_order_type='C' AND closed_at IS NULL`, [abnormal.linkedId]);
    if (!existing.rowCount) throw httpError(409, "關聯的 C 工單不存在或已結案");
    await client.query(`INSERT INTO work_order_event (work_order_id,actor_text,action_code,note) VALUES ($1,$2,'P_RECHECK',$3)`, [existing.rows[0].id, req.user.displayName, `由 ${pmRow.work_order_no} 預檢再次確認：${abnormal.description}；${abnormal.reason}`]);
    return { id: existing.rows[0].id, workOrderNo: existing.rows[0].work_order_no };
  }
  return null;
}

async function cascadeFutureSchedule(client, pmRow, finishDate, req) {
  if (!pmRow.target_key) return;
  const rows = await client.query(
    `SELECT * FROM pm_schedule_item
      WHERE schedule_status NOT IN ('COMPLETED','CANCELLED')
        AND make_date(schedule_year,schedule_month,1)>=date_trunc('month',$1::date)
      ORDER BY schedule_year,schedule_month,target_type,target_key`, [finishDate]
  );
  const exceptions = await client.query(`SELECT calendar_date AS date,day_type AS "dayType" FROM pm_calendar_exception WHERE calendar_date>=$1::date-interval '3 months'`, [finishDate]);
  const items = rows.rows.map((row) => ({
    id: row.id, targetType: row.target_type, targetKey: row.target_key, targetName: row.target_name,
    pmLevel: row.pm_level, scheduleYear: row.schedule_year, scheduleMonth: row.schedule_month,
    fixedCycleMonths: row.fixed_cycle_months,
    latestActualFinishDate: row.target_key === pmRow.target_key ? finishDate : row.latest_actual_finish_date,
    deferToMonthEnd: row.schedule_payload?.deferToMonthEnd === true,
  }));
  const generated = generateSchedule({ items, calendarExceptions: exceptions.rows });
  for (const item of generated.items) {
    await client.query(
      `UPDATE pm_schedule_item SET latest_actual_finish_date=$2,planned_start_date=$3,planned_end_date=$4,
       lathe_start_date=$5,lathe_end_date=$6,is_forced=$7,needs_review=$8,review_reasons=$9,
       version=version+1,updated_by=$10,updated_at=now() WHERE id=$1`,
      [item.id,item.latestActualFinishDate,item.plannedStartDate,item.plannedEndDate,item.latheStartDate||null,item.latheEndDate||null,item.isForced,item.needsReview,item.reviewReasons,actorId(req)]
    );
  }
}

router.post(
  "/backfills/:no/complete",
  requireRoles(...BACKFILL_ROLES),
  asyncHandler(async (req, res) => {
    const result = await withTransaction(async (client) => {
      const row = await getPmWorkOrder(client, req.params.no, true);
      if (row.closed_at || row.backfill_status === "COMPLETED") throw httpError(409, "此 P 工單已完工，不可重複送出");
      await saveBackfill(client, row, req.body || {}, req);
      const refreshed = await getPmWorkOrder(client, req.params.no, true);
      if (!refreshed.actual_start_at || !refreshed.actual_finish_at) throw httpError(409, "實際施工與完工時間為必填");
      if (new Date(refreshed.actual_finish_at) < new Date(refreshed.actual_start_at)) throw httpError(409, "實際完工時間不可早於施工時間");
      if (!refreshed.maintenance_result) throw httpError(409, "維修處理情形為必填");
      if (!refreshed.external_service_na && !refreshed.external_service_detail) throw httpError(409, "外包協力未勾選 N/A 時必須填寫說明");
      if (refreshed.target_type === "VEHICLE" && !cleanText(refreshed.backfill_snapshot?.accumulatedMileage)) throw httpError(409, "車輛累積里程為必填");
      const checks = await client.query(
        `SELECT ci.*,cr.id AS result_id,cr.result_status,cr.result_value,cr.abnormal_action,cr.linked_fault_work_order_id,cr.abnormal_reason
         FROM pm_template_check_item ci LEFT JOIN pm_work_order_check_result cr ON cr.check_item_id=ci.id AND cr.work_order_id=$1
         WHERE ci.pm_template_id=$2 AND ci.is_active=true`, [row.work_order_id, row.pm_template_id]
      );
      const missing = missingCheckResults(checks.rows);
      if (missing.length) throw httpError(409, "仍有必填檢查或量測值未完成", { items: missing.map((item) => item.item_no) });
      const attachmentTemplates = await client.query(
        `SELECT * FROM pm_template_attachment WHERE pm_template_id=$1 AND is_active=true ORDER BY sort_order`,
        [row.pm_template_id]
      );
      const attachments = await client.query(
        `SELECT ar.*,ta.attachment_name FROM pm_work_order_attachment_result ar JOIN pm_template_attachment ta ON ta.id=ar.template_attachment_id WHERE ar.work_order_id=$1`, [row.work_order_id]
      );
      const attachmentMissing = missingAttachmentResults(attachmentTemplates.rows, attachments.rows);
      if (attachmentMissing.length) throw httpError(409, "附件回填尚未完成", { items: attachmentMissing });
      const abnormalities = [
        ...checks.rows.filter((item) => item.result_status === "異常").map((item) => ({ kind: "check", id: item.result_id, description: `${item.item_no} ${item.item_description}`, section: item.section, item: item.item_no, action: item.abnormal_action, linkedId: item.linked_fault_work_order_id, reason: item.abnormal_reason })),
        ...attachments.rows.filter((item) => item.result_status === "異常").map((item) => ({ kind: "attachment", id: item.id, description: `${item.attachment_name} ${item.item_key}`, section: item.attachment_name, item: item.item_key, action: item.abnormal_action, linkedId: item.linked_fault_work_order_id, reason: item.abnormal_reason })),
      ];
      const links = [];
      for (const abnormal of abnormalities) {
        const link = await handleAbnormal(client, refreshed, abnormal, req);
        if (link) {
          links.push(link);
          const table = abnormal.kind === "check" ? "pm_work_order_check_result" : "pm_work_order_attachment_result";
          await client.query(`UPDATE ${table} SET linked_fault_work_order_id=$2 WHERE id=$1`, [abnormal.id, link.id]);
        }
      }
      const actualMaterials = await client.query(
        `SELECT wom.material_id,wom.actual_qty,wom.note,m.part_no,m.material_name
           FROM work_order_material wom JOIN material m ON m.id=wom.material_id
          WHERE wom.work_order_id=$1 AND COALESCE(wom.actual_qty,0)>0`,
        [row.work_order_id]
      );
      const materialWarehouseCode = cleanText(req.body?.materialWarehouseCode || req.body?.snapshot?.materialWarehouseCode);
      if (actualMaterials.rowCount && !materialWarehouseCode) throw httpError(409, "有實際用料時必須選擇耗用來源位置");
      const consumption = [];
      for (const material of actualMaterials.rows) {
        consumption.push(await consumeMaterialWithClient(client, {
          partNo: material.part_no,
          qty: Number(material.actual_qty),
          warehouseCode: materialWarehouseCode,
          stockStatus: cleanText(req.body?.materialStockStatus || req.body?.snapshot?.materialStockStatus) || "ISSUED",
          workOrderNo: row.work_order_no,
          custodianName: req.user.displayName,
          note: material.note || refreshed.actual_material_note || "預檢完工實際耗用",
        }, {
          idempotencyKey: `P-COMPLETE:${row.work_order_no}:${material.part_no}`,
          actorId: actorId(req),
        }));
      }
      const finishDate = new Date(refreshed.actual_finish_at).toISOString().slice(0, 10);
      await client.query(`UPDATE pm_work_order SET backfill_status='COMPLETED' WHERE work_order_id=$1`, [row.work_order_id]);
      await client.query(`UPDATE work_order SET status='COMPLETED',closed_at=actual_finish_at,closed_by=$2,updated_at=now() WHERE id=$1`, [row.work_order_id, actorId(req)]);
      if (row.schedule_item_id) await client.query(`UPDATE pm_schedule_item SET schedule_status='COMPLETED' WHERE id=$1`, [row.schedule_item_id]);
      await client.query(`INSERT INTO work_order_event (work_order_id,actor_text,action_code,note) VALUES ($1,$2,'P_COMPLETE',$3)`, [row.work_order_id, req.user.displayName, `預檢完工；異常 ${abnormalities.length} 筆`]);
      await cascadeFutureSchedule(client, refreshed, finishDate, req);
      return { workOrderNo: row.work_order_no, abnormalCount: abnormalities.length, linkedFaultOrders: links, consumptionCount: consumption.length };
    });
    res.json(result);
  })
);

router.get("/form-templates", asyncHandler(async (req, res) => {
  const values = [];
  const filters = [];
  if (cleanText(req.query.pmCode)) { values.push(cleanText(req.query.pmCode)); filters.push(`pt.pm_code=$${values.length}`); }
  const limit = parseLimit(req.query.limit, 100, 200);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const rows = await query(
    `SELECT ft.*,pt.pm_code,pt.pm_label,
            (SELECT count(*)::int FROM form_template_field_mapping fm WHERE fm.form_template_id=ft.id) AS mapping_count,
            (SELECT count(*)::int FROM form_template_block_mapping bm WHERE bm.form_template_id=ft.id) AS block_mapping_count
       FROM form_template ft LEFT JOIN pm_template pt ON pt.id=ft.pm_template_id
       ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""}
       ORDER BY pt.pm_code,ft.version_no DESC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`, [...values, limit, offset]
  );
  const count = await query(
    `SELECT count(*)::int AS total FROM form_template ft
     LEFT JOIN pm_template pt ON pt.id=ft.pm_template_id
     ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""}`,
    values
  );
  res.json({ items: rows.rows, total: count.rows[0].total, limit, offset });
}));

router.get("/form-templates/:id/mappings", asyncHandler(async (req, res) => {
  const template = await query(`SELECT id,lifecycle_status FROM form_template WHERE id=$1`, [req.params.id]);
  if (!template.rowCount) throw httpError(404, "Word 範本不存在");
  const rows = await query(
    `SELECT * FROM form_template_field_mapping
      WHERE form_template_id=$1 ORDER BY sort_order,field_key`,
    [req.params.id]
  );
  res.json({ items: rows.rows, lifecycleStatus: template.rows[0].lifecycle_status });
}));

router.get("/form-templates/:id/block-mappings", asyncHandler(async (req, res) => {
  const template = await query(`SELECT id,lifecycle_status FROM form_template WHERE id=$1`, [req.params.id]);
  if (!template.rowCount) throw httpError(404, "Word 範本不存在");
  const rows = await query(
    `SELECT * FROM form_template_block_mapping
      WHERE form_template_id=$1 ORDER BY sort_order,block_code`,
    [req.params.id]
  );
  res.json({ items: rows.rows, lifecycleStatus: template.rows[0].lifecycle_status });
}));

router.post("/form-templates", requireRoles(...ROLE_POLICIES.MASTER_WRITE), asyncHandler(async (req, res) => {
  const body = req.body || {};
  const pm = body.pmTemplateId
    ? await query(`SELECT id FROM pm_template WHERE id=$1`, [body.pmTemplateId])
    : await query(
      `SELECT id FROM pm_template WHERE pm_code=$1 ORDER BY revision_no DESC LIMIT 1`,
      [cleanText(body.pmCode)]
    );
  if (!pm.rowCount) throw httpError(404, "P 模板不存在");
  const row = await query(
    `INSERT INTO form_template (template_code,template_name,pm_template_id,version_no,source_file_name,storage_path,file_hash,file_format,effective_from,is_active,lifecycle_status,created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true,'DRAFT',$10) RETURNING *`,
    [cleanText(body.templateCode),cleanText(body.templateName),pm.rows[0].id,cleanText(body.versionNo),cleanText(body.sourceFileName),cleanText(body.storagePath),cleanText(body.fileHash),body.fileFormat||"DOC",cleanText(body.effectiveFrom),actorId(req)]
  );
  res.status(201).json({ item: row.rows[0] });
}));

router.put("/form-templates/:id/mappings", requireRoles(...ROLE_POLICIES.MASTER_WRITE), asyncHandler(async (req, res) => {
  const mappings = Array.isArray(req.body?.mappings) ? req.body.mappings : [];
  await withTransaction(async (client) => {
    const template = await client.query(`SELECT id,lifecycle_status FROM form_template WHERE id=$1 FOR UPDATE`, [req.params.id]);
    if (!template.rowCount) throw httpError(404, "Word 範本不存在");
    if (template.rows[0].lifecycle_status !== "DRAFT") throw httpError(409, "已發布的 Word 範本不可修改，請新增版本");
    await client.query(`DELETE FROM form_template_field_mapping WHERE form_template_id=$1`, [req.params.id]);
    for (const mapping of mappings) await client.query(
      `INSERT INTO form_template_field_mapping (form_template_id,field_key,source_path,word_target_type,word_target,transform_code,default_value,is_required,sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [req.params.id,cleanText(mapping.fieldKey),cleanText(mapping.sourcePath),mapping.wordTargetType||"PLACEHOLDER",cleanText(mapping.wordTarget),cleanText(mapping.transformCode),cleanText(mapping.defaultValue),Boolean(mapping.isRequired),Number(mapping.sortOrder||0)]
    );
  });
  const rows = await query(`SELECT * FROM form_template_field_mapping WHERE form_template_id=$1 ORDER BY sort_order,field_key`, [req.params.id]);
  res.json({ items: rows.rows, updated: rows.rowCount });
}));

router.put("/form-templates/:id/block-mappings", requireRoles(...ROLE_POLICIES.MASTER_WRITE), asyncHandler(async (req, res) => {
  const mappings = Array.isArray(req.body?.mappings) ? req.body.mappings.map(normalizedWordBlock) : [];
  const codes = new Set();
  for (const mapping of mappings) {
    if (codes.has(mapping.blockCode)) throw httpError(400, `動態區塊代碼重複：${mapping.blockCode}`);
    codes.add(mapping.blockCode);
  }
  await withTransaction(async (client) => {
    const template = await client.query(`SELECT id,lifecycle_status FROM form_template WHERE id=$1 FOR UPDATE`, [req.params.id]);
    if (!template.rowCount) throw httpError(404, "Word 範本不存在");
    if (template.rows[0].lifecycle_status !== "DRAFT") throw httpError(409, "已發布的 Word 範本不可修改，請新增版本");
    await client.query(`DELETE FROM form_template_block_mapping WHERE form_template_id=$1`, [req.params.id]);
    for (const mapping of mappings) await client.query(
      `INSERT INTO form_template_block_mapping (
         form_template_id,block_code,source_path,block_type,word_target_type,word_target,
         transform_code,config_json,is_required,is_verified,sort_order
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,false,$10)`,
      [req.params.id,mapping.blockCode,mapping.sourcePath,mapping.blockType,mapping.wordTargetType,
        mapping.wordTarget,mapping.transformCode,JSON.stringify(mapping.configJson),mapping.isRequired,mapping.sortOrder]
    );
  });
  const rows = await query(`SELECT * FROM form_template_block_mapping WHERE form_template_id=$1 ORDER BY sort_order,block_code`, [req.params.id]);
  res.json({ items: rows.rows, updated: rows.rowCount });
}));

router.post("/form-templates/:id/publish", requireRoles(...ROLE_POLICIES.MASTER_WRITE), asyncHandler(async (req, res) => {
  const published = await withTransaction(async (client) => {
    const template = await client.query(`SELECT * FROM form_template WHERE id=$1 FOR UPDATE`, [req.params.id]);
    if (!template.rowCount) throw httpError(404, "Word 範本不存在");
    if (template.rows[0].lifecycle_status !== "DRAFT") throw httpError(409, "只有草稿範本可以發布");
    const required = await client.query(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE is_required=true)::int AS required_count
         FROM form_template_field_mapping WHERE form_template_id=$1`,
      [req.params.id]
    );
    if (!required.rows[0].total) throw httpError(409, "發布前至少需要一筆 Word 欄位對應");
    const missingAttachmentBlocks = await client.query(
      `SELECT pta.attachment_code
         FROM pm_template_attachment pta
         LEFT JOIN form_template_block_mapping bm
           ON bm.form_template_id=$1 AND bm.block_code=pta.attachment_code
        WHERE pta.pm_template_id=$2 AND pta.is_active=true AND pta.is_required=true
          AND pta.render_strategy<>'DATA_ONLY' AND bm.id IS NULL
        ORDER BY pta.sort_order,pta.attachment_code`,
      [req.params.id, template.rows[0].pm_template_id]
    );
    if (missingAttachmentBlocks.rowCount) throw httpError(409, "必要附件尚未完成 Word 動態區塊對應", {
      attachments: missingAttachmentBlocks.rows.map((row) => row.attachment_code),
    });
    const unverifiedBlocks = await client.query(
      `SELECT block_code FROM form_template_block_mapping
        WHERE form_template_id=$1 AND is_required=true AND is_verified=false
        ORDER BY sort_order,block_code`,
      [req.params.id]
    );
    if (unverifiedBlocks.rowCount) throw httpError(409, "必要 Word 動態區塊尚未完成實際輸出驗證", {
      blocks: unverifiedBlocks.rows.map((row) => row.block_code),
    });
    await client.query(
      `UPDATE form_template SET lifecycle_status='RETIRED',is_active=false,
              effective_to=COALESCE(effective_to,CURRENT_DATE-1),updated_at=now()
        WHERE pm_template_id=$1 AND template_code=$2
          AND lifecycle_status='PUBLISHED' AND is_active=true`,
      [template.rows[0].pm_template_id, template.rows[0].template_code]
    );
    const row = await client.query(
      `UPDATE form_template SET lifecycle_status='PUBLISHED',is_active=true,
              effective_from=COALESCE($2::date,effective_from,CURRENT_DATE),effective_to=NULL,
              published_by=$3,published_at=now(),updated_at=now()
        WHERE id=$1 RETURNING *`,
      [req.params.id, cleanText(req.body?.effectiveFrom), actorId(req)]
    );
    return row.rows[0];
  });
  res.json({ item: published });
}));

module.exports = router;
