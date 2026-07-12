const express = require("express");
const { query } = require("../db");
const { asyncHandler, httpError } = require("../middleware/errorHandler");
const { resolveAuth, requireRoles } = require("../middleware/auth");
const { ROLE_POLICIES } = require("../config/rolePolicy");

const router = express.Router();

router.use(resolveAuth);

// 設備群組下拉用
router.get(
  "/groups",
  asyncHandler(async (req, res) => {
    const r = await query(
      "SELECT group_code, group_name FROM equipment_group WHERE is_active = true ORDER BY group_name"
    );
    res.json({ items: r.rows });
  })
);

// 別名清單（含解析後的標準名稱）
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const search = String(req.query.search || "").trim();
    const values = [];
    const where = [];
    if (search) {
      values.push(`%${search}%`);
      where.push(`concat_ws(' ',alias_name,target_code,canonical_name,source_system) ILIKE $${values.length}`);
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const r = await query(
      `SELECT id, source_system, alias_name, target_kind, target_code, canonical_name, is_active
       FROM v_equipment_alias ${whereSql} ORDER BY alias_name
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, offset]
    );
    const count = await query(`SELECT count(*)::int AS total FROM v_equipment_alias ${whereSql}`, values);
    res.json({
      items: r.rows.map(function (x) {
        return {
          id: x.id,
          sourceSystem: x.source_system,
          aliasName: x.alias_name,
          targetKind: x.target_kind,
          targetCode: x.target_code,
          canonicalName: x.canonical_name,
          isActive: x.is_active
        };
      }),
      total: count.rows[0].total,
      limit,
      offset
    });
  })
);

// 新增/更新一筆別名對應
router.post(
  "/",
  requireRoles(...ROLE_POLICIES.MASTER_WRITE),
  asyncHandler(async (req, res) => {
    const aliasName = String(req.body.aliasName || "").trim();
    const targetKind = String(req.body.targetKind || "").trim().toUpperCase();
    const targetCode = String(req.body.targetCode || "").trim().toUpperCase();
    const sourceSystem = String(req.body.sourceSystem || "FAULT_C").trim() || "FAULT_C";
    if (!aliasName) throw httpError(400, "請填設備名稱");
    if (targetKind !== "GROUP" && targetKind !== "MATERIAL") throw httpError(400, "對應類型需為 GROUP 或 MATERIAL");
    if (!targetCode) throw httpError(400, "請選設備群組或填料號");

    let groupId = null;
    let matId = null;
    if (targetKind === "GROUP") {
      const g = await query("SELECT id FROM equipment_group WHERE group_code = $1", [targetCode]);
      if (!g.rowCount) throw httpError(404, "找不到設備群組代碼：" + targetCode);
      groupId = g.rows[0].id;
    } else {
      const m = await query("SELECT id FROM material WHERE part_no = $1", [targetCode]);
      if (!m.rowCount) throw httpError(404, "找不到料號：" + targetCode);
      matId = m.rows[0].id;
    }

    await query(
      `INSERT INTO equipment_alias (source_system, alias_name, target_kind, equipment_group_id, material_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (source_system, alias_name) DO UPDATE SET
         target_kind = EXCLUDED.target_kind,
         equipment_group_id = EXCLUDED.equipment_group_id,
         material_id = EXCLUDED.material_id,
         updated_at = now()`,
      [sourceSystem, aliasName, targetKind, groupId, matId]
    );
    res.status(201).json({ ok: true });
  })
);

// 已被引用的別名保留歷史，只能停用或重新啟用。
router.patch(
  "/:id",
  requireRoles(...ROLE_POLICIES.MASTER_WRITE),
  asyncHandler(async (req, res) => {
    const id = String(req.params.id || "").trim();
    if (!/^[0-9a-fA-F-]{36}$/.test(id)) throw httpError(400, "id 格式不正確");
    if (typeof req.body?.isActive !== "boolean") throw httpError(400, "isActive 為必填布林值");
    const r = await query(
      "UPDATE equipment_alias SET is_active=$2,updated_at=now() WHERE id=$1 RETURNING id,is_active",
      [id, req.body.isActive]
    );
    if (!r.rowCount) throw httpError(404, "找不到此對應");
    res.json({ item: { id: r.rows[0].id, isActive: r.rows[0].is_active } });
  })
);

// 批次匯入：body.items = [{ aliasName, targetCode(料號) }, ...]，全部對到料號
router.post(
  "/bulk",
  requireRoles(...ROLE_POLICIES.MASTER_WRITE),
  asyncHandler(async (req, res) => {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    const sourceSystem = String(req.body.sourceSystem || "FAULT_C").trim() || "FAULT_C";
    if (!items.length) throw httpError(400, "items 不可為空");

    let ok = 0;
    const failed = [];
    for (const it of items) {
      const aliasName = String((it && it.aliasName) || "").trim();
      const targetCode = String((it && it.targetCode) || "").trim().toUpperCase();
      if (!aliasName || !targetCode) { failed.push({ aliasName: aliasName || "(空白)", reason: "缺設備名稱或料號" }); continue; }
      const m = await query("SELECT id FROM material WHERE part_no = $1", [targetCode]);
      if (!m.rowCount) { failed.push({ aliasName: aliasName, reason: "找不到料號 " + targetCode }); continue; }
      await query(
        `INSERT INTO equipment_alias (source_system, alias_name, target_kind, material_id, equipment_group_id)
         VALUES ($1, $2, 'MATERIAL', $3, NULL)
         ON CONFLICT (source_system, alias_name) DO UPDATE SET
           target_kind = 'MATERIAL',
           material_id = EXCLUDED.material_id,
           equipment_group_id = NULL,
           updated_at = now()`,
        [sourceSystem, aliasName, m.rows[0].id]
      );
      ok += 1;
    }
    res.json({ ok: ok, failedCount: failed.length, failed: failed.slice(0, 100) });
  })
);

module.exports = router;
