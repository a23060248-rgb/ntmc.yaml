const express = require("express");
const { query } = require("../db");
const { asyncHandler, httpError } = require("../middleware/errorHandler");
const { resolveAuth, requireRoles } = require("../middleware/auth");
const { ROLE_POLICIES } = require("../config/rolePolicy");

const router = express.Router();

function mapRow(row) {
  return {
    group: row.option_group,
    code: row.option_code,
    label: row.option_label,
    sortOrder: row.sort_order,
    isTerminal: row.is_terminal,
    isActive: row.is_active,
    description: row.description || "",
    uiTone: row.ui_tone || "neutral",
    backgroundColor: row.background_color || "",
    textColor: row.text_color || ""
  };
}

router.use(resolveAuth);

// GET /api/reference-options            → 所有群組，依群組分組
// GET /api/reference-options?activeOnly=true → 只回啟用項（給前台下拉用）
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const activeOnly = String(req.query.activeOnly || "") === "true";
    const result = await query(
      `
        SELECT option_group, option_code, option_label, sort_order, is_terminal, is_active,
               description, ui_tone, background_color, text_color
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
        SELECT option_group, option_code, option_label, sort_order, is_terminal, is_active,
               description, ui_tone, background_color, text_color
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
  requireRoles(...ROLE_POLICIES.MASTER_WRITE),
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
    const uiTone = String(body.uiTone || "neutral");
    const backgroundColor = String(body.backgroundColor || "").trim() || null;
    const textColor = String(body.textColor || "").trim() || null;

    const result = await query(
      `
        INSERT INTO workflow_option
          (option_group, option_code, option_label, sort_order, is_terminal, is_active,
           description, ui_tone, background_color, text_color)
        VALUES ($1, $2, $3, $4, $5, true, $6, $7, $8, $9)
        ON CONFLICT (option_group, option_code) DO NOTHING
        RETURNING option_group, option_code, option_label, sort_order, is_terminal, is_active,
                  description, ui_tone, background_color, text_color
      `,
      [group, code, label, sortOrder, isTerminal, description, uiTone, backgroundColor, textColor]
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
  requireRoles(...ROLE_POLICIES.MASTER_WRITE),
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
    const uiTone = typeof body.uiTone === "string" ? body.uiTone : null;
    const backgroundColor = typeof body.backgroundColor === "string" ? body.backgroundColor || null : null;
    const textColor = typeof body.textColor === "string" ? body.textColor || null : null;

    const result = await query(
      `
        UPDATE workflow_option SET
          option_label = COALESCE($3, option_label),
          sort_order   = COALESCE($4, sort_order),
          is_terminal  = COALESCE($5, is_terminal),
          is_active    = COALESCE($6, is_active),
          description  = COALESCE($7, description),
          ui_tone      = COALESCE($8, ui_tone),
          background_color = CASE WHEN $9::text IS NULL THEN background_color ELSE NULLIF($9, '') END,
          text_color   = CASE WHEN $10::text IS NULL THEN text_color ELSE NULLIF($10, '') END,
          updated_at   = now()
        WHERE option_group = $1 AND option_code = $2
        RETURNING option_group, option_code, option_label, sort_order, is_terminal, is_active,
                  description, ui_tone, background_color, text_color
      `,
      [group, code, label, sortOrder, isTerminal, isActive, description, uiTone, backgroundColor, textColor]
    );

    if (!result.rowCount) throw httpError(404, "option not found");
    res.json({ item: mapRow(result.rows[0]) });
  })
);

module.exports = router;
