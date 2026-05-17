const express = require("express");
const { query } = require("../db");
const { asyncHandler } = require("../middleware/errorHandler");

const router = express.Router();

function parseLimit(value, fallback = 50, max = 500) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function parseOffset(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
}

router.get(
  "/summary",
  asyncHandler(async (req, res) => {
    const limit = parseLimit(req.query.limit);
    const offset = parseOffset(req.query.offset);
    const values = [];
    const filters = [];

    if (req.query.search) {
      values.push(`%${String(req.query.search).trim()}%`);
      filters.push(`(part_no ILIKE $${values.length} OR material_name ILIKE $${values.length})`);
    }

    if (req.query.needPurchase === "true") {
      filters.push("stock_advice = '需請購'");
    }

    const whereSql = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

    values.push(limit);
    const limitIndex = values.length;
    values.push(offset);
    const offsetIndex = values.length;

    const result = await query(
      `
        SELECT *
        FROM v_material_stock_summary
        ${whereSql}
        ORDER BY part_no
        LIMIT $${limitIndex} OFFSET $${offsetIndex}
      `,
      values
    );

    res.json({ items: result.rows, page: { limit, offset } });
  })
);

router.get(
  "/locations",
  asyncHandler(async (req, res) => {
    const limit = parseLimit(req.query.limit);
    const offset = parseOffset(req.query.offset);
    const values = [];
    const filters = [];

    if (req.query.partNo) {
      values.push(String(req.query.partNo).trim().toUpperCase());
      filters.push(`part_no = $${values.length}`);
    }

    if (req.query.stockStatus) {
      values.push(String(req.query.stockStatus).trim().toUpperCase());
      filters.push(`stock_status = $${values.length}`);
    }

    if (req.query.locationType) {
      values.push(String(req.query.locationType).trim().toUpperCase());
      filters.push(`location_type = $${values.length}`);
    }

    const whereSql = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

    values.push(limit);
    const limitIndex = values.length;
    values.push(offset);
    const offsetIndex = values.length;

    const result = await query(
      `
        SELECT *
        FROM v_material_location_balance
        ${whereSql}
        ORDER BY part_no, warehouse_name, bin_code, stock_status
        LIMIT $${limitIndex} OFFSET $${offsetIndex}
      `,
      values
    );

    res.json({ items: result.rows, page: { limit, offset } });
  })
);

router.get(
  "/statuses",
  asyncHandler(async (req, res) => {
    const result = await query(
      `
        SELECT
          stock_status,
          count(*)::int AS line_count,
          COALESCE(sum(qty), 0) AS total_qty
        FROM inventory_balance
        GROUP BY stock_status
        ORDER BY stock_status
      `
    );

    res.json({ items: result.rows });
  })
);

module.exports = router;
