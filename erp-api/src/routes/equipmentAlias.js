const express = require("express");
const { query } = require("../db");
const { asyncHandler, httpError } = require("../middleware/errorHandler");

const router = express.Router();

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
    const r = await query(
      `SELECT id, source_system, alias_name, target_kind, target_code, canonical_name, is_active
       FROM v_equipment_alias ORDER BY alias_name`
    );
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
      })
    });
  })
);

// 新增/更新一筆別名對應
router.post(
  "/",
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

// 刪除一筆
router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = String(req.params.id || "").trim();
    if (!/^[0-9a-fA-F-]{36}$/.test(id)) throw httpError(400, "id 格式不正確");
    const r = await query("DELETE FROM equipment_alias WHERE id = $1 RETURNING id", [id]);
    if (!r.rowCount) throw httpError(404, "找不到此對應");
    res.status(204).send();
  })
);

// 批次匯入：body.items = [{ aliasName, targetCode(料號) }, ...]，全部對到料號
router.post(
  "/bulk",
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
