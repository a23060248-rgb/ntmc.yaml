const express = require("express");
const { query } = require("../db");
const { asyncHandler, httpError } = require("../middleware/errorHandler");
const { resolveAuth, requireRoles } = require("../middleware/auth");
const { ROLE_POLICIES } = require("../config/rolePolicy");

const router = express.Router();

const RESOURCES = {
  users: {
    table: "app_user",
    id: "id",
    columns: ["id", "employee_no", "display_name", "department", "role_name", "system_role", "is_active", "created_at", "updated_at"],
    writable: ["employee_no", "display_name", "department", "role_name", "system_role", "is_active"],
    required: ["display_name"],
    search: ["employee_no", "display_name", "department", "role_name"],
    order: "display_name, employee_no"
  },
  trains: {
    table: "train",
    id: "id",
    columns: ["id", "train_no", "former_train_no", "fleet_name", "site_code", "line_name", "display_order", "remark", "is_active"],
    writable: ["train_no", "former_train_no", "fleet_name", "site_code", "line_name", "display_order", "remark", "is_active"],
    required: ["train_no", "site_code"],
    search: ["train_no", "former_train_no", "fleet_name", "line_name"],
    order: "site_code, display_order NULLS LAST, train_no"
  },
  sites: {
    table: "operating_site",
    id: "site_code",
    columns: ["site_code", "site_name", "line_name", "display_order", "is_active", "remark", "created_at", "updated_at"],
    writable: ["site_code", "site_name", "line_name", "display_order", "is_active", "remark"],
    required: ["site_code", "site_name"],
    search: ["site_code", "site_name", "line_name", "remark"],
    order: "display_order, site_code"
  },
  warehouses: {
    table: "warehouse",
    id: "id",
    columns: ["id", "warehouse_code", "warehouse_name", "location_type", "default_stock_status", "is_issue_destination", "location_note", "is_active"],
    writable: ["warehouse_code", "warehouse_name", "location_type", "default_stock_status", "is_issue_destination", "location_note", "is_active"],
    required: ["warehouse_code", "warehouse_name", "location_type"],
    search: ["warehouse_code", "warehouse_name", "location_type", "location_note"],
    order: "warehouse_code"
  },
  "equipment-groups": {
    table: "equipment_group",
    id: "id",
    columns: ["id", "group_code", "group_name", "system_name", "safety_level", "fleet_count", "online_required_qty", "min_safety_spare_qty", "warning_spare_qty", "is_active"],
    writable: ["group_code", "group_name", "system_name", "safety_level", "fleet_count", "online_required_qty", "min_safety_spare_qty", "warning_spare_qty", "is_active"],
    required: ["group_code", "group_name", "system_name"],
    search: ["group_code", "group_name", "system_name"],
    order: "system_name, group_code"
  },
  "vehicle-positions": {
    table: "vehicle_position",
    id: "id",
    columns: ["id", "position_code", "parent_position_code", "site_code", "target_code", "train_set_no", "module_no", "position_name", "position_type", "is_installable", "position_status", "remark"],
    writable: ["position_code", "parent_position_code", "site_code", "target_code", "train_set_no", "module_no", "position_name", "position_type", "is_installable", "position_status", "remark"],
    required: ["position_code", "site_code", "position_name"],
    search: ["position_code", "parent_position_code", "train_set_no", "module_no", "position_name", "position_type", "position_status"],
    order: "site_code, position_code"
  },
  instruments: {
    table: "instrument",
    id: "id",
    columns: ["id", "instrument_no", "instrument_name", "instrument_type", "location", "calibration_due_date", "status", "remark"],
    writable: ["instrument_no", "instrument_name", "instrument_type", "location", "calibration_due_date", "status", "remark"],
    required: ["instrument_no", "instrument_name"],
    search: ["instrument_no", "instrument_name", "instrument_type", "location", "status"],
    order: "instrument_no"
  },
  "wi-documents": {
    table: "wi_document",
    id: "id",
    columns: ["id", "wi_no", "wi_name", "wi_type", "version_no", "status", "remark"],
    writable: ["wi_no", "wi_name", "wi_type", "version_no", "status", "remark"],
    required: ["wi_no", "wi_name"],
    search: ["wi_no", "wi_name", "wi_type", "version_no", "status"],
    order: "wi_no"
  },
  "pm-templates": {
    table: "pm_template",
    id: "id",
    columns: ["id", "pm_code", "pm_label", "version_no", "revision_no", "lifecycle_status", "job_description", "maintenance_period", "latest_offset_days", "default_corrective_action", "effective_from", "effective_to", "is_active"],
    writable: [],
    required: [],
    search: ["pm_code", "pm_label", "job_description", "maintenance_period"],
    order: "pm_code, revision_no DESC"
  },
  "document-sequences": {
    table: "document_sequence",
    id: "id",
    columns: ["id", "document_type", "sequence_date", "site_code", "target_code", "last_sequence", "remark", "updated_at"],
    writable: [],
    required: [],
    search: ["document_type", "site_code", "target_code", "remark"],
    order: "sequence_date DESC, document_type, site_code, target_code"
  }
};

function quoteIdentifier(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function getResource(name) {
  const resource = RESOURCES[name];
  if (!resource) throw httpError(404, "主檔資源不存在");
  return resource;
}

function pickWritable(resource, input) {
  return Object.fromEntries(
    resource.writable
      .filter((field) => Object.prototype.hasOwnProperty.call(input || {}, field))
      .map((field) => [field, input[field] === "" ? null : input[field]])
  );
}

router.use(resolveAuth);

router.get("/resources", (req, res) => {
  res.json({ items: Object.keys(RESOURCES) });
});

router.get(
  "/:resource",
  asyncHandler(async (req, res) => {
    const resource = getResource(req.params.resource);
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const search = String(req.query.search || "").trim();
    const activeOnly = String(req.query.activeOnly || "false") === "true";
    const params = [];
    const where = [];
    if (search) {
      params.push(`%${search}%`);
      where.push(`concat_ws(' ', ${resource.search.map((field) => `${quoteIdentifier(field)}::text`).join(", ")}) ILIKE $${params.length}`);
    }
    if (activeOnly && resource.columns.includes("is_active")) {
      where.push("is_active = true");
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const selectColumns = resource.columns.map(quoteIdentifier).join(", ");
    const rows = await query(
      `SELECT ${selectColumns}
         FROM ${quoteIdentifier(resource.table)}
         ${whereSql}
        ORDER BY ${resource.order}
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );
    const count = await query(
      `SELECT count(*)::int AS total FROM ${quoteIdentifier(resource.table)} ${whereSql}`,
      params
    );
    res.json({ items: rows.rows, total: count.rows[0].total, limit, offset });
  })
);

router.post(
  "/:resource",
  requireRoles(...ROLE_POLICIES.MASTER_WRITE),
  asyncHandler(async (req, res) => {
    const resource = getResource(req.params.resource);
    if (!resource.writable.length) throw httpError(405, "此主檔僅供查詢");
    const values = pickWritable(resource, req.body || {});
    for (const field of resource.required) {
      if (values[field] === undefined || values[field] === null || values[field] === "") {
        throw httpError(400, `缺少必要欄位：${field}`);
      }
    }
    const fields = Object.keys(values);
    if (!fields.length) throw httpError(400, "沒有可新增的欄位");
    const result = await query(
      `INSERT INTO ${quoteIdentifier(resource.table)} (${fields.map(quoteIdentifier).join(", ")})
       VALUES (${fields.map((_, index) => `$${index + 1}`).join(", ")})
       RETURNING ${resource.columns.map(quoteIdentifier).join(", ")}`,
      fields.map((field) => values[field])
    );
    res.status(201).json(result.rows[0]);
  })
);

router.patch(
  "/:resource/:id",
  requireRoles(...ROLE_POLICIES.MASTER_WRITE),
  asyncHandler(async (req, res) => {
    const resource = getResource(req.params.resource);
    if (!resource.writable.length) throw httpError(405, "此主檔僅供查詢");
    const values = pickWritable(resource, req.body || {});
    const fields = Object.keys(values);
    if (!fields.length) throw httpError(400, "沒有可修改的欄位");
    const result = await query(
      `UPDATE ${quoteIdentifier(resource.table)}
          SET ${fields.map((field, index) => `${quoteIdentifier(field)} = $${index + 1}`).join(", ")},
              updated_at = now()
        WHERE ${quoteIdentifier(resource.id)} = $${fields.length + 1}
        RETURNING ${resource.columns.map(quoteIdentifier).join(", ")}`,
      [...fields.map((field) => values[field]), req.params.id]
    );
    if (!result.rows.length) throw httpError(404, "找不到主檔資料");
    res.json(result.rows[0]);
  })
);

module.exports = router;
