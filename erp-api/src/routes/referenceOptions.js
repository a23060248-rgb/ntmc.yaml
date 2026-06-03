const express = require("express");
const { query } = require("../db");
const { asyncHandler, httpError } = require("../middleware/errorHandler");

const router = express.Router();

function mapRow(row) {
  return {
    group: row.option_group,
    code: row.option_code,
    label: row.option_label,
    sortOrder: row.sort_order,
    isTerminal: row.is_terminal,
    isActive: row.is_active,
    description: row.description || ""
  };
}

// GET /api/reference-options            → 所有群組，依群組分組
// GET /api/reference-options?activeOnly=true → 只回啟用項（給前台下拉用）
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const activeOnly = String(req.query.activeOnly || "") === "true";
    const result = await query(
      `
        SELECT option_group, option_code, option_label, sort_order, is_terminal, is_active, description
        FROM workflow_option
        ${activeOnly ? "WHERE is_active = true" : ""}
        ORDER BY option_group, sort_order, option_code
      `
    );

    const groups = {};
    for (const row of result.rows) {
      if (!groups[row.option_group]) groups[row.option_group] = [];
      groups[row.option_group].push(mapRow(row));
    }

    res.json({ groups });
  })
);

// GET /api/reference-options/:group     → 單一群組
router.get(
  "/:group",
  asyncHandler(async (req, res) => {
    const group = String(req.params.group || "").trim().toUpperCase();
    if (!group) throw httpError(400, "group is required");
    const activeOnly = String(req.query.activeOnly || "") === "true";
    const result = await query(
      `
        SELECT option_group, option_code, option_label, sort_order, is_terminal, is_active, description
        FROM workflow_option
        WHERE option_group = $1
        ${activeOnly ? "AND is_active = true" : ""}
        ORDER BY sort_order, option_code
      `,
      [group]
    );
    res.json({ group, items: result.rows.map(mapRow) });
  })
);

// POST /api/reference-options           → 新增一個選項
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const group = String(body.group || "").trim().toUpperCase();
    const code = String(body.code || "").trim();
    const label = String(body.label || "").trim();
    if (!group || !code || !label) {
      throw httpError(400, "group, code, label are required");
    }
    const sortOrder = Number.isFinite(body.sortOrder) ? body.sortOrder : 0;
    const isTerminal = body.isTerminal === true;
    const description = String(body.description || "");

    const result = await query(
      `
        INSERT INTO workflow_option
          (option_group, option_code, option_label, sort_order, is_terminal, is_active, description)
        VALUES ($1, $2, $3, $4, $5, true, $6)
        ON CONFLICT (option_group, option_code) DO NOTHING
        RETURNING option_group, option_code, option_label, sort_order, is_terminal, is_active, description
      `,
      [group, code, label, sortOrder, isTerminal, description]
    );

    if (!result.rowCount) {
      throw httpError(409, "option already exists for this group and code");
    }
    res.status(201).json({ item: mapRow(result.rows[0]) });
  })
);

// PATCH /api/reference-options/:group/:code → 修改顯示文字/排序/啟用停用/說明
router.patch(
  "/:group/:code",
  asyncHandler(async (req, res) => {
    const group = String(req.params.group || "").trim().toUpperCase();
    const code = String(req.params.code || "").trim();
    if (!group || !code) throw httpError(400, "group and code are required");

    const body = req.body || {};
    const label = typeof body.label === "string" ? body.label.trim() : null;
    const sortOrder = Number.isFinite(body.sortOrder) ? body.sortOrder : null;
    const isTerminal = typeof body.isTerminal === "boolean" ? body.isTerminal : null;
    const isActive = typeof body.isActive === "boolean" ? body.isActive : null;
    const description = typeof body.description === "string" ? body.description : null;

    const result = await query(
      `
        UPDATE workflow_option SET
          option_label = COALESCE($3, option_label),
          sort_order   = COALESCE($4, sort_order),
          is_terminal  = COALESCE($5, is_terminal),
          is_active    = COALESCE($6, is_active),
          description  = COALESCE($7, description),
          updated_at   = now()
        WHERE option_group = $1 AND option_code = $2
        RETURNING option_group, option_code, option_label, sort_order, is_terminal, is_active, description
      `,
      [group, code, label, sortOrder, isTerminal, isActive, description]
    );

    if (!result.rowCount) throw httpError(404, "option not found");
    res.json({ item: mapRow(result.rows[0]) });
  })
);

module.exports = router;
