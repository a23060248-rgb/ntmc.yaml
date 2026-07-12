const express = require("express");
const { query } = require("../db");
const { asyncHandler } = require("../middleware/errorHandler");
const { resolveAuth } = require("../middleware/auth");

const router = express.Router();
router.use(resolveAuth);

router.get("/summary", asyncHandler(async (req, res) => {
  const [workOrders, overdue, repair, assets, materials, today] = await Promise.all([
    query(`SELECT work_order_type, count(*)::int AS count
             FROM work_order
            WHERE deleted_at IS NULL AND closed_at IS NULL
            GROUP BY work_order_type`),
    query(`SELECT count(*)::int AS count
             FROM work_order
            WHERE deleted_at IS NULL
              AND closed_at IS NULL
              AND COALESCE(planned_start_at, work_order_date::timestamptz) < now() - interval '1 day'`),
    query(`SELECT count(*) FILTER (WHERE status='待處理')::int AS pending,
                  count(*) FILTER (WHERE status='維修中')::int AS repairing,
                  count(*)::int AS total
             FROM v_open_repair_work_orders`),
    query(`SELECT count(*) FILTER (WHERE current_status <> '正常上線')::int AS attention,
                  count(*) FILTER (WHERE current_status = '正常上線')::int AS online
             FROM v_asset_current_status`),
    query(`SELECT count(*) FILTER (WHERE stock_advice='需請購')::int AS low_stock,
                  count(*)::int AS total
             FROM v_material_stock_summary`),
    query(`SELECT w.work_order_no, w.work_order_type, w.title, w.status, t.train_no,
                  w.planned_start_at, w.work_order_date
             FROM work_order w
             LEFT JOIN train t ON t.id = w.train_id
            WHERE w.deleted_at IS NULL
              AND COALESCE(w.planned_start_at::date, w.work_order_date) = CURRENT_DATE
            ORDER BY w.work_order_type, w.work_order_no
            LIMIT 20`)
  ]);

  const counts = Object.fromEntries(workOrders.rows.map((row) => [row.work_order_type, row.count]));
  res.json({
    workOrders: {
      P: counts.P || 0,
      C: counts.C || 0,
      R: counts.R || 0,
      J: counts.J || 0,
      overdue: overdue.rows[0].count
    },
    repair: repair.rows[0],
    assets: assets.rows[0],
    materials: materials.rows[0],
    today: today.rows.map((row) => ({
      workOrderNo: row.work_order_no,
      type: row.work_order_type,
      title: row.title,
      status: row.status,
      trainNo: row.train_no,
      plannedStartAt: row.planned_start_at,
      workOrderDate: row.work_order_date
    }))
  });
}));

module.exports = router;
