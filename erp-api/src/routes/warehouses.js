const express = require("express");
const { query } = require("../db");
const { asyncHandler, httpError } = require("../middleware/errorHandler");

const router = express.Router();

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const result = await query(
      `
        SELECT
          w.id,
          w.warehouse_code,
          w.warehouse_name,
          w.location_type,
          w.default_stock_status,
          w.is_issue_destination,
          w.location_note,
          w.is_active,
          count(wb.id)::int AS bin_count
        FROM warehouse w
        LEFT JOIN warehouse_bin wb ON wb.warehouse_id = w.id
        WHERE w.is_active = true
        GROUP BY w.id
        ORDER BY w.location_type, w.warehouse_name
      `
    );

    res.json({ items: result.rows });
  })
);

router.get(
  "/:warehouseCode/bins",
  asyncHandler(async (req, res) => {
    const warehouseCode = String(req.params.warehouseCode || "").trim().toUpperCase();
    const warehouseResult = await query(
      `
        SELECT id, warehouse_code, warehouse_name, location_type, default_stock_status
        FROM warehouse
        WHERE warehouse_code = $1
      `,
      [warehouseCode]
    );

    if (!warehouseResult.rowCount) {
      throw httpError(404, "warehouse not found");
    }

    const binsResult = await query(
      `
        SELECT id, bin_code, description, is_active
        FROM warehouse_bin
        WHERE warehouse_id = $1
        ORDER BY bin_code
      `,
      [warehouseResult.rows[0].id]
    );

    res.json({
      warehouse: warehouseResult.rows[0],
      bins: binsResult.rows
    });
  })
);

module.exports = router;
