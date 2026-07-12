const express = require("express");
const { query } = require("../db");
const { asyncHandler, httpError } = require("../middleware/errorHandler");
const { resolveAuth } = require("../middleware/auth");

const router = express.Router();
router.use(resolveAuth);

function parseLimit(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 200) : 50;
}

function parseOffset(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function addDateFilters(req, values, filters, column) {
  for (const [key, operator] of [["dateFrom", ">="], ["dateTo", "<="]]) {
    const value = String(req.query[key] || "").trim();
    if (!value) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw httpError(400, `${key} 日期格式錯誤`);
    values.push(value);
    filters.push(`${column} ${operator} $${values.length}::date`);
  }
}

function page(req) {
  return { limit: parseLimit(req.query.limit), offset: parseOffset(req.query.offset) };
}

router.get("/maintenance", asyncHandler(async (req, res) => {
  const { limit, offset } = page(req);
  const values = [];
  const filters = ["w.deleted_at IS NULL"];
  addDateFilters(req, values, filters, "w.work_order_date");
  if (req.query.type) { values.push(String(req.query.type).toUpperCase()); filters.push(`w.work_order_type=$${values.length}`); }
  const where = `WHERE ${filters.join(" AND ")}`;
  const countValues = [...values];
  const count = await query(`SELECT count(*)::int AS total FROM work_order w ${where}`, countValues);
  values.push(limit, offset);
  const rows = await query(
    `SELECT w.work_order_no,w.work_order_type,w.title,w.status,w.work_order_date,w.actual_finish_at,w.closed_at,
            t.train_no,f.deadline_at,
            (w.closed_at IS NULL AND f.deadline_at IS NOT NULL AND f.deadline_at<now()) AS is_overdue
       FROM work_order w
       LEFT JOIN train t ON t.id=w.train_id
       LEFT JOIN fault_work_order f ON f.work_order_id=w.id
       ${where}
      ORDER BY w.work_order_date DESC,w.work_order_no DESC
      LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values
  );
  const summary = await query(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE closed_at IS NOT NULL)::int AS completed,
            count(*) FILTER (WHERE closed_at IS NULL)::int AS open
       FROM work_order w ${where}`,
    countValues
  );
  res.json({ items: rows.rows, page: { limit, offset, total: count.rows[0].total }, summary: summary.rows[0] });
}));

router.get("/precheck", asyncHandler(async (req, res) => {
  const { limit, offset } = page(req);
  const values = [];
  const filters = ["w.deleted_at IS NULL"];
  addDateFilters(req, values, filters, "s.planned_start_date");
  const where = `WHERE ${filters.join(" AND ")}`;
  const countValues = [...values];
  const count = await query(
    `SELECT count(*)::int AS total FROM pm_schedule_item s JOIN work_order w ON w.id=s.generated_work_order_id ${where}`,
    countValues
  );
  values.push(limit, offset);
  const rows = await query(
    `SELECT w.work_order_no,t.train_no,s.target_name,s.pm_level,s.planned_start_date,s.planned_end_date,
            w.actual_finish_at::date AS actual_finish_date,s.latest_actual_finish_date,
            CASE WHEN w.actual_finish_at IS NOT NULL AND s.latest_actual_finish_date IS NOT NULL
                 THEN w.actual_finish_at::date-s.latest_actual_finish_date END AS interval_days,
            s.needs_review,s.review_reasons,
            CASE WHEN w.actual_finish_at IS NULL THEN NULL
                 WHEN w.actual_finish_at::date-s.latest_actual_finish_date BETWEEN 24 AND 36 THEN true ELSE false END AS on_time
       FROM pm_schedule_item s
       JOIN work_order w ON w.id=s.generated_work_order_id
       LEFT JOIN train t ON t.id=w.train_id
       ${where}
      ORDER BY s.planned_start_date DESC,s.target_name
      LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values
  );
  const summary = await query(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE s.needs_review)::int AS review_count,
            count(*) FILTER (WHERE w.actual_finish_at IS NOT NULL AND w.actual_finish_at::date-s.latest_actual_finish_date NOT BETWEEN 24 AND 36)::int AS interval_violations
       FROM pm_schedule_item s JOIN work_order w ON w.id=s.generated_work_order_id ${where}`,
    countValues
  );
  res.json({ items: rows.rows, page: { limit, offset, total: count.rows[0].total }, summary: summary.rows[0] });
}));

router.get("/repeat-faults", asyncHandler(async (req, res) => {
  const { limit, offset } = page(req);
  const values = [];
  const filters = ["w.work_order_type='C'", "w.deleted_at IS NULL"];
  addDateFilters(req, values, filters, "w.work_order_date");
  const where = `WHERE ${filters.join(" AND ")}`;
  const grouping = `COALESCE(t.train_no,'未指定'),COALESCE(f.main_system,'未分類'),COALESCE(f.fault_component,f.fault_category,'未分類')`;
  const countValues = [...values];
  const count = await query(
    `SELECT count(*)::int AS total FROM (
       SELECT 1 FROM work_order w JOIN fault_work_order f ON f.work_order_id=w.id LEFT JOIN train t ON t.id=w.train_id
       ${where} GROUP BY ${grouping} HAVING count(*)>1
     ) grouped`,
    countValues
  );
  values.push(limit, offset);
  const rows = await query(
    `SELECT COALESCE(t.train_no,'未指定') AS train_no,COALESCE(f.main_system,'未分類') AS main_system,
            COALESCE(f.fault_component,f.fault_category,'未分類') AS component,
            count(*)::int AS fault_count,count(*) FILTER (WHERE w.closed_at IS NULL)::int AS open_count,
            max(w.work_order_date) AS latest_date
       FROM work_order w JOIN fault_work_order f ON f.work_order_id=w.id LEFT JOIN train t ON t.id=w.train_id
       ${where} GROUP BY ${grouping} HAVING count(*)>1
      ORDER BY fault_count DESC,latest_date DESC
      LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values
  );
  res.json({ items: rows.rows, page: { limit, offset, total: count.rows[0].total } });
}));

router.get("/materials", asyncHandler(async (req, res) => {
  const { limit, offset } = page(req);
  const values = [];
  const filters = ["it.transaction_type IN ('ISSUE','CONSUME')"];
  addDateFilters(req, values, filters, "it.transaction_at::date");
  const where = `WHERE ${filters.join(" AND ")}`;
  const countValues = [...values];
  const count = await query(`SELECT count(DISTINCT it.material_id)::int AS total FROM inventory_transaction it ${where}`, countValues);
  values.push(limit, offset);
  const rows = await query(
    `SELECT m.part_no,m.material_name,m.unit,
            abs(sum(it.qty_change)) AS used_qty,count(DISTINCT it.work_order_id)::int AS work_order_count,
            max(it.transaction_at) AS latest_transaction_at
       FROM inventory_transaction it JOIN material m ON m.id=it.material_id
       ${where} GROUP BY m.id,m.part_no,m.material_name,m.unit
      ORDER BY used_qty DESC,m.part_no
      LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values
  );
  res.json({ items: rows.rows, page: { limit, offset, total: count.rows[0].total } });
}));

router.get("/turnaround", asyncHandler(async (req, res) => {
  const { limit, offset } = page(req);
  const values = [];
  const filters = ["w.work_order_type='R'", "w.deleted_at IS NULL"];
  addDateFilters(req, values, filters, "w.work_order_date");
  const where = `WHERE ${filters.join(" AND ")}`;
  const countValues = [...values];
  const count = await query(`SELECT count(*)::int AS total FROM work_order w ${where}`, countValues);
  values.push(limit, offset);
  const rows = await query(
    `SELECT w.work_order_no,w.status,w.work_order_date,w.closed_at,r.repair_method,r.current_place,
            r.outsourcing_status,r.acceptance_result,a.serial_no,
            floor(EXTRACT(epoch FROM (COALESCE(w.closed_at,now())-w.created_at))/86400)::int AS elapsed_days,
            source.work_order_no AS source_c_work_order_no
       FROM work_order w JOIN repair_work_order r ON r.work_order_id=w.id
       LEFT JOIN asset a ON a.id=r.removed_asset_id LEFT JOIN work_order source ON source.id=r.source_fault_work_order_id
       ${where} ORDER BY w.work_order_date DESC,w.work_order_no DESC
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values
  );
  res.json({ items: rows.rows, page: { limit, offset, total: count.rows[0].total } });
}));

router.get("/inventory", asyncHandler(async (req, res) => {
  const { limit, offset } = page(req);
  const rows = await query(
    `SELECT * FROM v_material_stock_summary
      ORDER BY CASE WHEN stock_advice='需請購' THEN 0 ELSE 1 END,part_no
      LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  const count = await query(`SELECT count(*)::int AS total FROM v_material_stock_summary`);
  const summary = await query(
    `SELECT count(*) FILTER (WHERE stock_advice='需請購')::int AS replenish_count,
            count(*)::int AS material_count FROM v_material_stock_summary`
  );
  res.json({ items: rows.rows, page: { limit, offset, total: count.rows[0].total }, summary: summary.rows[0] });
}));

module.exports = router;
