const express = require("express");
const { query, withTransaction } = require("../db");
const { asyncHandler, httpError } = require("../middleware/errorHandler");
const { resolveAuth, requireRoles } = require("../middleware/auth");
const { ROLE_POLICIES } = require("../config/rolePolicy");
const { fixedCycleFromLevels, generateSchedule, parseDate } = require("../services/precheckScheduler");

const router = express.Router();
const WRITE_ROLES = ROLE_POLICIES.SCHEDULE_WRITE;
const PM_LEVELS = new Set(["1M", "3M", "6M", "1Y", "5Y/1Y"]);

router.use(resolveAuth);

function parseLimit(value, fallback = 100, max = 500) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
}

function parseOffset(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function cleanText(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function actorId(req) {
  return req.user.id === "preview-user" ? null : req.user.id;
}

function batchNo() {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  return `PMI-${timestamp}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function normalizeImportRows(body) {
  const sourceYear = Number(body.sourceYear);
  const defaultType = body.targetType || "VEHICLE";
  const rows = [];
  const errors = [];
  (Array.isArray(body.rows) ? body.rows : []).forEach((source, sourceIndex) => {
    const targetKey = cleanText(source.targetKey || source.trainNo || source.equipmentCode);
    const targetName = cleanText(source.targetName || source.trainNo || source.equipmentName || targetKey);
    const targetType = source.targetType || defaultType;
    const levels = source.levels && typeof source.levels === "object"
      ? Object.entries(source.levels).map(([month, pmLevel]) => ({ month: Number(month), pmLevel }))
      : [{ month: Number(source.month), pmLevel: source.pmLevel }];
    levels.forEach(({ month, pmLevel }) => {
      const rowNo = Number(source.rowNo || sourceIndex + 2);
      const rowErrors = [];
      if (!Number.isInteger(sourceYear) || sourceYear < 2000 || sourceYear > 2200) rowErrors.push("年度不正確");
      if (!targetKey || !targetName) rowErrors.push("缺少車號/設備代碼或名稱");
      if (!["VEHICLE", "DEPOT_EQUIPMENT"].includes(targetType)) rowErrors.push("對象類型不正確");
      if (!Number.isInteger(month) || month < 1 || month > 12) rowErrors.push("月份不正確");
      if (!PM_LEVELS.has(String(pmLevel))) rowErrors.push("檢修級別不正確");
      const normalized = {
        rowNo,
        scheduleYear: sourceYear,
        scheduleMonth: month,
        siteCode: source.siteCode || body.siteCode || "D",
        targetType,
        targetKey,
        targetName,
        pmLevel: String(pmLevel || ""),
        latestActualFinishDate: source.latestActualFinishDate || null,
        deferToMonthEnd: source.deferToMonthEnd === true || targetName === "拉線車兼高空維修作業車",
      };
      if (rowErrors.length) errors.push({ rowNo, targetKey, month, reasons: rowErrors });
      else rows.push(normalized);
    });
  });
  return { rows, errors };
}

function mapSchedule(row) {
  return {
    id: row.id,
    importBatchId: row.import_batch_id,
    scheduleYear: row.schedule_year,
    scheduleMonth: row.schedule_month,
    siteCode: row.site_code,
    targetType: row.target_type,
    targetKey: row.target_key,
    targetName: row.target_name,
    trainId: row.train_id,
    equipmentGroupId: row.equipment_group_id,
    pmLevel: row.pm_level,
    fixedCycleMonths: row.fixed_cycle_months,
    latestActualFinishDate: row.latest_actual_finish_date,
    plannedStartDate: row.planned_start_date,
    plannedEndDate: row.planned_end_date,
    latheStartDate: row.lathe_start_date,
    latheEndDate: row.lathe_end_date,
    generatedWorkOrderId: row.generated_work_order_id,
    scheduleStatus: row.schedule_status,
    isPublished: row.is_published,
    publishedAt: row.published_at,
    isManual: row.is_manual,
    isForced: row.is_forced,
    needsReview: row.needs_review,
    reviewReasons: row.review_reasons || [],
    version: row.version,
    updatedAt: row.updated_at,
  };
}

router.get("/imports", asyncHandler(async (req, res) => {
  const rows = await query(
    `SELECT b.*, u.display_name AS imported_by_name
       FROM pm_schedule_import_batch b
       LEFT JOIN app_user u ON u.id=b.imported_by
      ORDER BY b.imported_at DESC LIMIT $1`,
    [parseLimit(req.query.limit, 50, 100)]
  );
  res.json({ items: rows.rows });
}));

router.post(
  "/imports/preview",
  requireRoles(...WRITE_ROLES),
  asyncHandler(async (req, res) => {
    const normalized = normalizeImportRows(req.body || {});
    if (!Array.isArray(req.body?.rows) || !req.body.rows.length) throw httpError(400, "匯入內容沒有資料列");
    const metadata = { rows: normalized.rows, errors: normalized.errors, parser: "normalized-json-v1" };
    const result = await query(
      `INSERT INTO pm_schedule_import_batch (
         batch_no, source_file, source_year, site_code, target_type,
         import_status, total_rows, valid_rows, invalid_rows, imported_by,
         raw_metadata, remark
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12)
       RETURNING *`,
      [batchNo(), cleanText(req.body.sourceFile), Number(req.body.sourceYear), req.body.siteCode || "D",
        req.body.targetType || "VEHICLE", normalized.errors.length ? "DRAFT" : "VALIDATED",
        normalized.rows.length + normalized.errors.length, normalized.rows.length, normalized.errors.length,
        actorId(req), JSON.stringify(metadata), cleanText(req.body.remark)]
    );
    res.status(201).json({ batch: result.rows[0], preview: normalized });
  })
);

router.post(
  "/imports/:id/apply",
  requireRoles(...WRITE_ROLES),
  asyncHandler(async (req, res) => {
    const result = await withTransaction(async (client) => {
      const batchResult = await client.query(`SELECT * FROM pm_schedule_import_batch WHERE id=$1 FOR UPDATE`, [req.params.id]);
      if (!batchResult.rowCount) throw httpError(404, "匯入批次不存在");
      const batch = batchResult.rows[0];
      if (batch.invalid_rows > 0) throw httpError(409, "匯入批次仍有錯誤列，不能套用");
      if (batch.import_status === "APPLIED") throw httpError(409, "匯入批次已套用");
      const rows = batch.raw_metadata?.rows || [];
      const levelsByTarget = new Map();
      rows.forEach((row) => levelsByTarget.set(row.targetKey, [...(levelsByTarget.get(row.targetKey) || []), row.pmLevel]));
      let applied = 0;
      for (const row of rows) {
        let trainId = null;
        if (row.targetType === "VEHICLE") {
          const train = await client.query(`SELECT id FROM train WHERE train_no=$1 AND is_active=true`, [row.targetKey]);
          if (!train.rowCount) throw httpError(409, `車號主檔不存在：${row.targetKey}`);
          trainId = train.rows[0].id;
        }
        const fixedCycle = row.targetType === "DEPOT_EQUIPMENT" ? fixedCycleFromLevels(levelsByTarget.get(row.targetKey)) : null;
        const inserted = await client.query(
          `INSERT INTO pm_schedule_item (
             import_batch_id, schedule_year, schedule_month, site_code, target_type,
             target_key, target_name, train_id, pm_level, fixed_cycle_months,
             latest_actual_finish_date, source_row_no, schedule_payload, created_by, updated_by
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$14)
           ON CONFLICT (site_code, target_type, target_key, schedule_year, schedule_month)
           DO UPDATE SET import_batch_id=EXCLUDED.import_batch_id,
             target_name=EXCLUDED.target_name, train_id=EXCLUDED.train_id,
             pm_level=EXCLUDED.pm_level, fixed_cycle_months=EXCLUDED.fixed_cycle_months,
             latest_actual_finish_date=COALESCE(EXCLUDED.latest_actual_finish_date, pm_schedule_item.latest_actual_finish_date),
             source_row_no=EXCLUDED.source_row_no, schedule_payload=EXCLUDED.schedule_payload,
             version=pm_schedule_item.version+1, updated_by=EXCLUDED.updated_by, updated_at=now()
           RETURNING id`,
          [batch.id, row.scheduleYear, row.scheduleMonth, row.siteCode, row.targetType, row.targetKey,
            row.targetName, trainId, row.pmLevel, fixedCycle, row.latestActualFinishDate, row.rowNo,
            JSON.stringify({ deferToMonthEnd: row.deferToMonthEnd }), actorId(req)]
        );
        await client.query(
          `INSERT INTO pm_schedule_change_log (schedule_item_id, change_type, after_data, reason, changed_by)
           VALUES ($1,'IMPORT',$2::jsonb,$3,$4)`,
          [inserted.rows[0].id, JSON.stringify(row), `匯入批次 ${batch.batch_no}`, actorId(req)]
        );
        applied += 1;
      }
      await client.query(
        `UPDATE pm_schedule_import_batch SET import_status='APPLIED', applied_at=now() WHERE id=$1`,
        [batch.id]
      );
      return { batchNo: batch.batch_no, applied };
    });
    res.json(result);
  })
);

router.get("/calendar-exceptions", asyncHandler(async (req, res) => {
  const year = Number(req.query.year || new Date().getFullYear());
  const rows = await query(
    `SELECT * FROM pm_calendar_exception
      WHERE calendar_date >= make_date($1,1,1) AND calendar_date < make_date($1+1,1,1)
      ORDER BY calendar_date`,
    [year]
  );
  res.json({ items: rows.rows });
}));

router.post(
  "/calendar-exceptions",
  requireRoles(...WRITE_ROLES),
  asyncHandler(async (req, res) => {
    const date = cleanText(req.body?.date);
    const dayType = String(req.body?.dayType || "HOLIDAY").toUpperCase();
    if (!parseDate(date)) throw httpError(400, "日期格式不正確");
    if (!["HOLIDAY", "WORKDAY"].includes(dayType)) throw httpError(400, "dayType 不正確");
    const row = await query(
      `INSERT INTO pm_calendar_exception (calendar_date, site_code, day_type, name, source, created_by)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (calendar_date) DO UPDATE SET site_code=EXCLUDED.site_code,
         day_type=EXCLUDED.day_type, name=EXCLUDED.name, source=EXCLUDED.source, updated_at=now()
       RETURNING *`,
      [date, req.body.siteCode || "D", dayType, cleanText(req.body.name) || "人工設定", req.body.source || "MANUAL", actorId(req)]
    );
    res.status(201).json({ item: row.rows[0] });
  })
);

router.get("/schedules", asyncHandler(async (req, res) => {
  const limit = parseLimit(req.query.limit);
  const offset = parseOffset(req.query.offset);
  const values = [];
  const filters = [];
  for (const [queryKey, column, numberValue] of [
    ["year", "schedule_year", true], ["month", "schedule_month", true],
    ["targetType", "target_type", false], ["status", "schedule_status", false],
  ]) {
    if (req.query[queryKey] !== undefined && req.query[queryKey] !== "") {
      values.push(numberValue ? Number(req.query[queryKey]) : String(req.query[queryKey]));
      filters.push(`${column}=$${values.length}`);
    }
  }
  if (cleanText(req.query.search)) {
    values.push(`%${cleanText(req.query.search)}%`);
    filters.push(`(target_key ILIKE $${values.length} OR target_name ILIKE $${values.length})`);
  }
  if (req.query.needsReview === "true") filters.push("needs_review=true");
  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const countValues = [...values];
  values.push(limit, offset);
  const rows = await query(
    `SELECT * FROM pm_schedule_item ${where}
      ORDER BY planned_start_date NULLS LAST, target_type, target_key
      LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values
  );
  const total = await query(`SELECT count(*)::int AS count FROM pm_schedule_item ${where}`, countValues);
  res.json({ items: rows.rows.map(mapSchedule), page: { limit, offset, total: total.rows[0].count } });
}));

router.get("/schedules/:id", asyncHandler(async (req, res) => {
  const rows = await query(`SELECT * FROM pm_schedule_item WHERE id=$1`, [req.params.id]);
  if (!rows.rowCount) throw httpError(404, "排程不存在");
  const logs = await query(
    `SELECT l.*, u.display_name AS changed_by_name
       FROM pm_schedule_change_log l LEFT JOIN app_user u ON u.id=l.changed_by
      WHERE l.schedule_item_id=$1 ORDER BY l.changed_at DESC`,
    [req.params.id]
  );
  res.json({ item: mapSchedule(rows.rows[0]), changes: logs.rows });
}));

router.patch(
  "/schedules/:id",
  requireRoles(...WRITE_ROLES),
  asyncHandler(async (req, res) => {
    const start = cleanText(req.body?.plannedStartDate);
    const end = cleanText(req.body?.plannedEndDate) || start;
    const reason = cleanText(req.body?.reason);
    if (!parseDate(start) || !parseDate(end)) throw httpError(400, "改期日期不正確");
    if (!reason) throw httpError(400, "人工改期必須填寫原因");
    const row = await withTransaction(async (client) => {
      const before = await client.query(`SELECT * FROM pm_schedule_item WHERE id=$1 FOR UPDATE`, [req.params.id]);
      if (!before.rowCount) throw httpError(404, "排程不存在");
      const updated = await client.query(
        `UPDATE pm_schedule_item SET planned_start_date=$2, planned_end_date=$3,
           is_manual=true, is_forced=COALESCE($4,is_forced), needs_review=COALESCE($5,needs_review),
           review_reasons=CASE WHEN $6::text IS NULL THEN review_reasons ELSE array_append(review_reasons,$6) END,
           version=version+1, updated_by=$7, updated_at=now()
         WHERE id=$1 RETURNING *`,
        [req.params.id, start, end, req.body.isForced, req.body.needsReview,
          cleanText(req.body.reviewReason), actorId(req)]
      );
      await client.query(
        `INSERT INTO pm_schedule_change_log (schedule_item_id, change_type, before_data, after_data, reason, changed_by)
         VALUES ($1,'MANUAL_RESCHEDULE',$2::jsonb,$3::jsonb,$4,$5)`,
        [req.params.id, JSON.stringify(before.rows[0]), JSON.stringify(updated.rows[0]), reason, actorId(req)]
      );
      return updated.rows[0];
    });
    res.json({ item: mapSchedule(row) });
  })
);

async function loadGenerationRows(client, body) {
  const start = cleanText(body.startDate) || new Date().toISOString().slice(0, 10);
  const startDate = parseDate(start);
  const endDate = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth() + 24, 0));
  const rows = await client.query(
    `SELECT * FROM pm_schedule_item
      WHERE make_date(schedule_year,schedule_month,1) >= date_trunc('month',$1::date)
        AND make_date(schedule_year,schedule_month,1) <= date_trunc('month',$2::date)
        AND schedule_status NOT IN ('COMPLETED','CANCELLED')
      ORDER BY schedule_year, schedule_month, target_type, target_key`,
    [start, endDate.toISOString().slice(0, 10)]
  );
  const exceptions = await client.query(
    `SELECT calendar_date AS date, day_type AS "dayType" FROM pm_calendar_exception
      WHERE calendar_date BETWEEN $1::date - interval '3 months' AND $2::date + interval '3 months'`,
    [start, endDate.toISOString().slice(0, 10)]
  );
  return { rows: rows.rows, exceptions: exceptions.rows, start, end: endDate.toISOString().slice(0, 10) };
}

async function generateAndSave(client, body, req, changeType) {
  const loaded = await loadGenerationRows(client, body);
  const serviceItems = loaded.rows.map((row) => ({
    id: row.id,
    targetType: row.target_type,
    targetKey: row.target_key,
    targetName: row.target_name,
    pmLevel: row.pm_level,
    scheduleYear: row.schedule_year,
    scheduleMonth: row.schedule_month,
    fixedCycleMonths: row.fixed_cycle_months,
    latestActualFinishDate: row.latest_actual_finish_date,
    deferToMonthEnd: row.schedule_payload?.deferToMonthEnd === true,
  }));
  const generated = generateSchedule({ items: serviceItems, calendarExceptions: loaded.exceptions });
  for (const item of generated.items) {
    const before = loaded.rows.find((row) => row.id === item.id);
    const updated = await client.query(
      `UPDATE pm_schedule_item SET
         latest_actual_finish_date=$2, planned_start_date=$3, planned_end_date=$4,
         lathe_start_date=$5, lathe_end_date=$6, fixed_cycle_months=$7,
         schedule_status=CASE WHEN schedule_status='DRAFT' THEN 'PLANNED' ELSE schedule_status END,
         is_forced=$8, needs_review=$9, review_reasons=$10,
         version=version+1, updated_by=$11, updated_at=now()
       WHERE id=$1 RETURNING *`,
      [item.id, item.latestActualFinishDate, item.plannedStartDate, item.plannedEndDate,
        item.latheStartDate || null, item.latheEndDate || null, item.fixedCycleMonths || null,
        item.isForced, item.needsReview, item.reviewReasons, actorId(req)]
    );
    await client.query(
      `INSERT INTO pm_schedule_change_log (schedule_item_id, change_type, before_data, after_data, reason, changed_by)
       VALUES ($1,$2,$3::jsonb,$4::jsonb,$5,$6)`,
      [item.id, changeType, JSON.stringify(before), JSON.stringify(updated.rows[0]),
        cleanText(body.reason) || "排班規則重新計算", actorId(req)]
    );
  }
  return { generated: generated.items.length, startDate: loaded.start, endDate: loaded.end, reviewCount: generated.items.filter((item) => item.needsReview).length };
}

router.post(
  "/schedules/generate",
  requireRoles(...WRITE_ROLES),
  asyncHandler(async (req, res) => {
    const result = await withTransaction((client) => generateAndSave(client, req.body || {}, req, "AUTO_GENERATE"));
    res.json(result);
  })
);

router.post(
  "/schedules/replan",
  requireRoles(...WRITE_ROLES),
  asyncHandler(async (req, res) => {
    if (!cleanText(req.body?.reason)) throw httpError(400, "重排必須填寫原因");
    const result = await withTransaction((client) => generateAndSave(client, req.body || {}, req, "CASCADE_REPLAN"));
    res.json(result);
  })
);

router.post(
  "/schedules/publish",
  requireRoles(...WRITE_ROLES),
  asyncHandler(async (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    if (!ids.length) throw httpError(400, "請選擇要發布的排程");
    const result = await withTransaction(async (client) => {
      const rows = await client.query(
        `UPDATE pm_schedule_item SET is_published=true, published_at=now(), schedule_status='PUBLISHED',
           version=version+1, updated_by=$2, updated_at=now()
         WHERE id=ANY($1::uuid[]) AND planned_start_date IS NOT NULL
         RETURNING id`,
        [ids, actorId(req)]
      );
      for (const row of rows.rows) {
        await client.query(
          `INSERT INTO pm_schedule_change_log (schedule_item_id, change_type, reason, changed_by)
           VALUES ($1,'PUBLISH',$2,$3)`,
          [row.id, cleanText(req.body.reason) || "發布排程", actorId(req)]
        );
      }
      return rows.rowCount;
    });
    res.json({ published: result });
  })
);

module.exports = router;
