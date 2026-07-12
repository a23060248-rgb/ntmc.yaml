const express = require("express");
const { query } = require("../db");
const { asyncHandler, httpError } = require("../middleware/errorHandler");
const { resolveAuth, requireRoles } = require("../middleware/auth");
const { ROLE_POLICIES } = require("../config/rolePolicy");

const router = express.Router();
router.use(resolveAuth);
const WAREHOUSE_EDIT_ROLES = ROLE_POLICIES.INVENTORY_POST;

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const includeInactive = String(req.query.includeInactive || "") === "true";
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
        ${includeInactive ? "" : "WHERE w.is_active = true"}
        GROUP BY w.id
        ORDER BY w.location_type, w.warehouse_name
      `
    );

    res.json({ items: result.rows });
  })
);

const WAREHOUSE_LOCATION_TYPES = new Set([
  "CENTER_WAREHOUSE", "SUB_STATION", "FIELD", "VEHICLE", "PERSON", "VENDOR", "SCRAP", "OTHER"
]);

function warehouseRow(row) {
  return {
    id: row.id,
    warehouse_code: row.warehouse_code,
    warehouse_name: row.warehouse_name,
    location_type: row.location_type,
    default_stock_status: row.default_stock_status,
    is_issue_destination: row.is_issue_destination,
    location_note: row.location_note,
    is_active: row.is_active
  };
}

// 新增倉庫
router.post(
  "/",
  requireRoles(...WAREHOUSE_EDIT_ROLES),
  asyncHandler(async (req, res) => {
    const code = String(req.body.warehouseCode || "").trim().toUpperCase();
    const name = String(req.body.warehouseName || "").trim();
    if (!code || !name) throw httpError(400, "warehouseCode and warehouseName are required");
    let locationType = String(req.body.locationType || "OTHER").trim().toUpperCase();
    if (!WAREHOUSE_LOCATION_TYPES.has(locationType)) locationType = "OTHER";
    const result = await query(
      `
        INSERT INTO warehouse (warehouse_code, warehouse_name, location_type, location_note)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (warehouse_code) DO NOTHING
        RETURNING id, warehouse_code, warehouse_name, location_type, default_stock_status, is_issue_destination, location_note, is_active
      `,
      [code, name, locationType, req.body.locationNote || null]
    );
    if (!result.rowCount) throw httpError(409, "warehouse_code already exists");
    res.status(201).json({ item: warehouseRow(result.rows[0]) });
  })
);

// 修改倉庫（名稱／備註／啟用停用；不動 location_type 以免影響領料規則）
router.patch(
  "/:code",
  requireRoles(...WAREHOUSE_EDIT_ROLES),
  asyncHandler(async (req, res) => {
    const code = String(req.params.code || "").trim().toUpperCase();
    const name = typeof req.body.warehouseName === "string" ? req.body.warehouseName.trim() : null;
    const note = typeof req.body.locationNote === "string" ? req.body.locationNote : null;
    const isActive = typeof req.body.isActive === "boolean" ? req.body.isActive : null;
    const result = await query(
      `
        UPDATE warehouse SET
          warehouse_name = COALESCE($2, warehouse_name),
          location_note  = COALESCE($3, location_note),
          is_active      = COALESCE($4, is_active),
          updated_at     = now()
        WHERE warehouse_code = $1
        RETURNING id, warehouse_code, warehouse_name, location_type, default_stock_status, is_issue_destination, location_note, is_active
      `,
      [code, name, note, isActive]
    );
    if (!result.rowCount) throw httpError(404, "warehouse not found");
    res.json({ item: warehouseRow(result.rows[0]) });
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
