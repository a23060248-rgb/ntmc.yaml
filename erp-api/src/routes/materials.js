const express = require("express");
const { query } = require("../db");
const { asyncHandler, httpError } = require("../middleware/errorHandler");

const router = express.Router();

const MATERIAL_FIELDS = {
  materialName: "material_name",
  spec: "spec",
  unit: "unit",
  systemName: "system_name",
  materialType: "material_type",
  materialProperty: "material_property",
  repairable: "repairable",
  isSerialized: "is_serialized",
  safetyLevel: "safety_level",
  leadTimeDays: "lead_time_days",
  reorderPoint: "reorder_point",
  estimatedUnitPrice: "estimated_unit_price",
  marketAvailable: "market_available",
  reviewNote: "review_note",
  isActive: "is_active"
};

function parseLimit(value, fallback = 50, max = 200) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function parseOffset(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
}

function normalizePartNo(value) {
  return String(value || "").trim().toUpperCase();
}

function requireText(value, fieldName) {
  const text = String(value || "").trim();
  if (!text) {
    throw httpError(400, `${fieldName} is required`);
  }
  return text;
}

function toBoolean(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "boolean") return value;
  if (value === "true" || value === "1" || value === 1) return true;
  if (value === "false" || value === "0" || value === 0) return false;
  return Boolean(value);
}

function toNumberOrNull(value) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw httpError(400, "numeric field is invalid");
  }
  return number;
}

function materialFromRow(row) {
  return {
    id: row.id,
    partNo: row.part_no,
    materialName: row.material_name,
    spec: row.spec,
    unit: row.unit,
    systemName: row.system_name,
    materialType: row.material_type,
    materialProperty: row.material_property,
    repairable: row.repairable,
    isSerialized: row.is_serialized,
    safetyLevel: row.safety_level,
    leadTimeDays: row.lead_time_days,
    reorderPoint: row.reorder_point,
    estimatedUnitPrice: row.estimated_unit_price,
    marketAvailable: row.market_available,
    reviewNote: row.review_note,
    isActive: row.is_active,
    stock: {
      availableQty: row.available_qty || "0",
      issuedQty: row.issued_qty || "0",
      inUseQty: row.in_use_qty || "0",
      unavailableQty: row.unavailable_qty || "0",
      totalTrackedQty: row.total_tracked_qty || "0",
      stockAdvice: row.stock_advice || null
    }
  };
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const limit = parseLimit(req.query.limit);
    const offset = parseOffset(req.query.offset);
    const values = [];
    const filters = ["m.is_active = true"];

    if (req.query.includeInactive === "true") {
      filters.length = 0;
    }

    if (req.query.search) {
      values.push(`%${String(req.query.search).trim()}%`);
      filters.push(`(m.part_no ILIKE $${values.length} OR m.material_name ILIKE $${values.length} OR COALESCE(m.spec, '') ILIKE $${values.length})`);
    }

    if (req.query.systemCode) {
      values.push(String(req.query.systemCode).trim());
      filters.push(`split_part(m.part_no, '.', 1) = $${values.length}`);
    }

    if (req.query.materialType) {
      values.push(String(req.query.materialType).trim());
      filters.push(`m.material_type = $${values.length}`);
    }

    const whereSql = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    const countSql = `SELECT count(*)::int AS count FROM material m ${whereSql}`;

    values.push(limit);
    const limitIndex = values.length;
    values.push(offset);
    const offsetIndex = values.length;

    const listSql = `
      SELECT
        m.*,
        s.available_qty,
        s.issued_qty,
        s.in_use_qty,
        s.unavailable_qty,
        s.total_tracked_qty,
        s.stock_advice
      FROM material m
      LEFT JOIN v_material_stock_summary s ON s.material_id = m.id
      ${whereSql}
      ORDER BY m.part_no
      LIMIT $${limitIndex} OFFSET $${offsetIndex}
    `;

    const [itemsResult, countResult] = await Promise.all([
      query(listSql, values),
      query(countSql, values.slice(0, values.length - 2))
    ]);

    res.json({
      items: itemsResult.rows.map(materialFromRow),
      page: {
        limit,
        offset,
        total: countResult.rows[0].count
      }
    });
  })
);

router.get(
  "/:partNo",
  asyncHandler(async (req, res) => {
    const partNo = normalizePartNo(req.params.partNo);
    const materialResult = await query(
      `
        SELECT
          m.*,
          s.available_qty,
          s.issued_qty,
          s.in_use_qty,
          s.unavailable_qty,
          s.total_tracked_qty,
          s.stock_advice
        FROM material m
        LEFT JOIN v_material_stock_summary s ON s.material_id = m.id
        WHERE m.part_no = $1
      `,
      [partNo]
    );

    if (!materialResult.rowCount) {
      throw httpError(404, "material not found");
    }

    const locationsResult = await query(
      `
        SELECT warehouse_code, warehouse_name, location_type, bin_code, stock_status, qty
        FROM v_material_location_balance
        WHERE part_no = $1
        ORDER BY warehouse_name, bin_code, stock_status
      `,
      [partNo]
    );

    res.json({
      item: materialFromRow(materialResult.rows[0]),
      locations: locationsResult.rows
    });
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const partNo = normalizePartNo(requireText(req.body.partNo, "partNo"));
    const materialName = requireText(req.body.materialName, "materialName");

    try {
      const result = await query(
        `
          INSERT INTO material (
            part_no,
            material_name,
            spec,
            unit,
            system_name,
            material_type,
            material_property,
            repairable,
            is_serialized,
            safety_level,
            lead_time_days,
            reorder_point,
            estimated_unit_price,
            market_available,
            review_note,
            is_active
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, COALESCE($12, 0), $13, $14, $15, true)
          RETURNING *
        `,
        [
          partNo,
          materialName,
          req.body.spec || null,
          req.body.unit || null,
          req.body.systemName || null,
          req.body.materialType || null,
          req.body.materialProperty || null,
          toBoolean(req.body.repairable) || false,
          toBoolean(req.body.isSerialized) || false,
          req.body.safetyLevel || null,
          toNumberOrNull(req.body.leadTimeDays),
          toNumberOrNull(req.body.reorderPoint),
          toNumberOrNull(req.body.estimatedUnitPrice),
          toBoolean(req.body.marketAvailable),
          req.body.reviewNote || null
        ]
      );

      res.status(201).json({ item: materialFromRow(result.rows[0]) });
    } catch (error) {
      if (error.code === "23505") {
        throw httpError(409, "partNo already exists");
      }
      throw error;
    }
  })
);

router.patch(
  "/:partNo",
  asyncHandler(async (req, res) => {
    const partNo = normalizePartNo(req.params.partNo);
    const sets = [];
    const values = [];

    for (const [apiField, columnName] of Object.entries(MATERIAL_FIELDS)) {
      if (!Object.prototype.hasOwnProperty.call(req.body, apiField)) continue;
      let value = req.body[apiField];

      if (["repairable", "isSerialized", "marketAvailable", "isActive"].includes(apiField)) {
        value = toBoolean(value);
      } else if (["leadTimeDays", "reorderPoint", "estimatedUnitPrice"].includes(apiField)) {
        value = toNumberOrNull(value);
      } else if (typeof value === "string") {
        value = value.trim() || null;
      }

      values.push(value);
      sets.push(`${columnName} = $${values.length}`);
    }

    if (!sets.length) {
      throw httpError(400, "no supported fields to update");
    }

    values.push(partNo);
    const result = await query(
      `
        UPDATE material
        SET ${sets.join(", ")}, updated_at = now()
        WHERE part_no = $${values.length}
        RETURNING *
      `,
      values
    );

    if (!result.rowCount) {
      throw httpError(404, "material not found");
    }

    res.json({ item: materialFromRow(result.rows[0]) });
  })
);

router.delete(
  "/:partNo",
  asyncHandler(async (req, res) => {
    const partNo = normalizePartNo(req.params.partNo);
    const result = await query(
      `
        UPDATE material
        SET is_active = false, updated_at = now()
        WHERE part_no = $1
        RETURNING part_no
      `,
      [partNo]
    );

    if (!result.rowCount) {
      throw httpError(404, "material not found");
    }

    res.status(204).send();
  })
);

module.exports = router;
