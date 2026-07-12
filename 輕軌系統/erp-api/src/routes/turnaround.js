const express = require("express");
const { query, withTransaction } = require("../db");
const { asyncHandler, httpError } = require("../middleware/errorHandler");
const { resolveAuth, requireRoles } = require("../middleware/auth");
const { ROLE_POLICIES, roleAllowed } = require("../config/rolePolicy");

const router = express.Router();

router.use(resolveAuth);

function parseLimit(value, fallback = 50, max = 200) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
}

function parseOffset(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function cleanText(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function buildSearch(req, fields, values) {
  const search = cleanText(req.query.search);
  if (!search) return null;
  values.push(`%${search}%`);
  const placeholder = `$${values.length}`;
  return `(${fields.map((field) => `${field} ILIKE ${placeholder}`).join(" OR ")})`;
}

function mapRepairRow(row) {
  return {
    id: row.work_order_id,
    workOrderNo: row.work_order_no,
    sourceFaultWorkOrderNo: row.source_fault_work_order_no,
    title: row.title,
    status: row.status,
    repairMethod: row.repair_method,
    currentPlace: row.current_place,
    outsourcingStatus: row.outsourcing_status,
    acceptanceResult: row.acceptance_result,
    nextAction: row.next_action,
    riskTags: row.risk_tags || [],
    removedAssetId: row.removed_asset_id,
    removedSerialNo: row.removed_serial_no,
    installedSerialNo: row.installed_serial_no,
    partNo: row.part_no,
    materialName: row.material_name,
    groupName: row.group_name,
    originalPositionCode: row.original_position_code,
    originalLocationText: row.original_location_text,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    closedAt: row.closed_at,
  };
}

const REPAIR_SELECT = `
  SELECT wo.id AS work_order_id,
         wo.work_order_no,
         source_wo.work_order_no AS source_fault_work_order_no,
         wo.title,
         wo.status,
         rwo.repair_method,
         rwo.current_place,
         rwo.outsourcing_status,
         rwo.acceptance_result,
         rwo.next_action,
         rwo.risk_tags,
         rwo.removed_asset_id,
         removed.serial_no AS removed_serial_no,
         installed.serial_no AS installed_serial_no,
         m.part_no,
         m.material_name,
         eg.group_name,
         vp.position_code AS original_position_code,
         rwo.original_location_text,
         wo.created_at,
         wo.updated_at,
         wo.closed_at
    FROM work_order wo
    JOIN repair_work_order rwo ON rwo.work_order_id = wo.id
    LEFT JOIN work_order source_wo ON source_wo.id = rwo.source_fault_work_order_id
    LEFT JOIN asset removed ON removed.id = rwo.removed_asset_id
    LEFT JOIN asset installed ON installed.id = rwo.installed_asset_id
    LEFT JOIN material m ON m.id = removed.material_id
    LEFT JOIN equipment_group eg ON eg.id = removed.equipment_group_id
    LEFT JOIN vehicle_position vp ON vp.id = rwo.original_position_id
   WHERE wo.work_order_type = 'R' AND wo.deleted_at IS NULL
`;

router.get("/r-orders", asyncHandler(async (req, res) => {
  const limit = parseLimit(req.query.limit);
  const offset = parseOffset(req.query.offset);
  const values = [];
  const filters = [];
  const search = buildSearch(req, ["wo.work_order_no", "wo.title", "removed.serial_no", "m.part_no", "m.material_name"], values);
  if (search) filters.push(search);
  if (cleanText(req.query.status)) {
    values.push(cleanText(req.query.status));
    filters.push(`wo.status = $${values.length}`);
  }
  if (cleanText(req.query.currentPlace)) {
    values.push(cleanText(req.query.currentPlace));
    filters.push(`rwo.current_place = $${values.length}`);
  }
  if (req.query.openOnly === "true") filters.push("wo.closed_at IS NULL");
  const filterSql = filters.length ? ` AND ${filters.join(" AND ")}` : "";
  const countValues = [...values];
  values.push(limit, offset);
  const rows = await query(
    `${REPAIR_SELECT}${filterSql} ORDER BY wo.created_at DESC LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values
  );
  const total = await query(
    `SELECT count(*)::int AS count FROM work_order wo
       JOIN repair_work_order rwo ON rwo.work_order_id = wo.id
       LEFT JOIN asset removed ON removed.id = rwo.removed_asset_id
       LEFT JOIN material m ON m.id = removed.material_id
      WHERE wo.work_order_type='R' AND wo.deleted_at IS NULL${filterSql}`,
    countValues
  );
  res.json({ items: rows.rows.map(mapRepairRow), page: { limit, offset, total: total.rows[0].count } });
}));

router.get("/r-orders/:no", asyncHandler(async (req, res) => {
  const rows = await query(`${REPAIR_SELECT} AND wo.work_order_no = $1`, [req.params.no]);
  if (!rows.rowCount) throw httpError(404, "R 工單不存在");
  const events = await query(
    `SELECT e.action_code, e.actor_text, u.display_name AS actor_name, e.note, e.created_at
       FROM work_order_event e
       JOIN work_order wo ON wo.id = e.work_order_id
       LEFT JOIN app_user u ON u.id = e.actor_id
      WHERE wo.work_order_no = $1
      ORDER BY e.created_at DESC`,
    [req.params.no]
  );
  res.json({ item: mapRepairRow(rows.rows[0]), events: events.rows });
}));

router.patch(
  "/r-orders/:no",
  requireRoles(...ROLE_POLICIES.TURNAROUND_WRITE),
  asyncHandler(async (req, res) => {
    const fields = {
      repairMethod: "repair_method",
      currentPlace: "current_place",
      outsourcingStatus: "outsourcing_status",
      acceptanceResult: "acceptance_result",
      nextAction: "next_action",
      riskTags: "risk_tags",
    };
    const body = req.body || {};
    const sets = [];
    const values = [];
    Object.entries(fields).forEach(([key, column]) => {
      if (body[key] !== undefined) {
        values.push(key === "riskTags" ? (Array.isArray(body[key]) ? body[key] : []) : cleanText(body[key]));
        sets.push(`${column} = $${values.length}`);
      }
    });
    if (!sets.length) throw httpError(400, "沒有可更新的欄位");
    values.push(req.params.no);
    const row = await withTransaction(async (client) => {
      const updated = await client.query(
        `UPDATE repair_work_order rwo SET ${sets.join(", ")}
          FROM work_order wo
         WHERE wo.id = rwo.work_order_id AND wo.work_order_no = $${values.length}
         RETURNING rwo.work_order_id`,
        values
      );
      if (!updated.rowCount) throw httpError(404, "R 工單不存在");
      await client.query(
        `INSERT INTO work_order_event (work_order_id, actor_text, action_code, note)
         VALUES ($1, $2, 'R_EDIT', $3)`,
        [updated.rows[0].work_order_id, req.user.displayName, cleanText(body.note) || "更新 R 工單處理資料"]
      );
      return updated.rows[0];
    });
    const fresh = await query(`${REPAIR_SELECT} AND wo.id = $1`, [row.work_order_id]);
    res.json({ item: mapRepairRow(fresh.rows[0]) });
  })
);

const ACTIONS = {
  START_INTERNAL: {
    workStatus: "維修中",
    repairMethod: "內修",
    currentPlace: "內修區",
    assetStatus: "內修中",
    eventType: "內修開始",
  },
  SEND_EXTERNAL: {
    workStatus: "維修中",
    repairMethod: "外修",
    currentPlace: "外修中",
    outsourcingStatus: "已送修",
    assetStatus: "送修中",
    eventType: "外修送出",
  },
  ACCEPT: {
    workStatus: "已驗收",
    currentPlace: "待回庫",
    acceptanceResult: "合格",
    assetStatus: "驗收合格",
    eventType: "維修驗收",
  },
  RETURN_STOCK: {
    workStatus: "已回庫結案",
    currentPlace: "備品倉",
    assetStatus: "可用",
    eventType: "修回入庫",
    close: true,
  },
  SCRAP: {
    workStatus: "報廢結案",
    repairMethod: "報廢",
    currentPlace: "報廢區",
    assetStatus: "報廢",
    eventType: "報廢",
    close: true,
  },
};

router.post(
  "/r-orders/:no/actions",
  requireRoles(...ROLE_POLICIES.TURNAROUND_WRITE),
  asyncHandler(async (req, res) => {
    const actionCode = String(req.body?.action || "").toUpperCase();
    const action = ACTIONS[actionCode];
    if (!action) throw httpError(400, "不支援的 R 工單動作");
    const supervisorOnly = new Set(["SEND_EXTERNAL", "ACCEPT", "SCRAP"]);
    if (supervisorOnly.has(actionCode) && !roleAllowed(req.user.role, ROLE_POLICIES.TURNAROUND_SUPERVISE)) {
      throw httpError(403, "此 R 工單動作需要維修主管權限");
    }
    if (actionCode === "RETURN_STOCK" && !roleAllowed(req.user.role, ROLE_POLICIES.TURNAROUND_RETURN)) {
      throw httpError(403, "修回入庫需要主管或倉管權限");
    }
    const result = await withTransaction(async (client) => {
      const current = await client.query(
        `SELECT wo.id AS work_order_id, wo.status, rwo.*, a.current_status AS asset_status,
                a.current_position_id, a.current_warehouse_id, a.current_vendor_id
           FROM work_order wo
           JOIN repair_work_order rwo ON rwo.work_order_id = wo.id
           LEFT JOIN asset a ON a.id = rwo.removed_asset_id
          WHERE wo.work_order_no = $1 AND wo.work_order_type = 'R'
          FOR UPDATE OF wo, rwo`,
        [req.params.no]
      );
      if (!current.rowCount) throw httpError(404, "R 工單不存在");
      const row = current.rows[0];
      const note = cleanText(req.body.note) || action.eventType;

      let warehouseId = row.current_warehouse_id;
      if (actionCode === "RETURN_STOCK" || actionCode === "SCRAP") {
        const warehouse = await client.query(
          `SELECT id FROM warehouse
            WHERE is_active=true
              AND ($1::text IS NULL OR warehouse_code=$1)
              AND location_type = $2
            ORDER BY warehouse_code LIMIT 1`,
          [cleanText(req.body.warehouseCode), actionCode === "SCRAP" ? "SCRAP" : "CENTER_WAREHOUSE"]
        );
        if (!warehouse.rowCount) throw httpError(409, "找不到適用的回庫位置");
        warehouseId = warehouse.rows[0].id;
      }

      let vendorId = row.current_vendor_id;
      if (actionCode === "SEND_EXTERNAL") {
        const vendorCode = cleanText(req.body.vendorCode);
        if (!vendorCode) throw httpError(400, "外修必須選擇廠商");
        const vendor = await client.query(`SELECT id FROM vendor WHERE vendor_code=$1 AND is_active=true`, [vendorCode]);
        if (!vendor.rowCount) throw httpError(404, "外修廠商不存在");
        vendorId = vendor.rows[0].id;
      }

      await client.query(
        `UPDATE repair_work_order SET
           repair_method = COALESCE($2, repair_method),
           current_place = COALESCE($3, current_place),
           outsourcing_status = COALESCE($4, outsourcing_status),
           acceptance_result = COALESCE($5, acceptance_result),
           next_action = $6
         WHERE work_order_id = $1`,
        [row.work_order_id, action.repairMethod || null, action.currentPlace || null,
          action.outsourcingStatus || null, action.acceptanceResult || null, cleanText(req.body.nextAction)]
      );
      await client.query(
        `UPDATE work_order SET status=$2, updated_at=now(),
           closed_at=CASE WHEN $3 THEN now() ELSE closed_at END,
           closed_by=CASE WHEN $3 AND $4::uuid IS NOT NULL THEN $4::uuid ELSE closed_by END
         WHERE id=$1`,
        [row.work_order_id, action.workStatus, Boolean(action.close), req.user.id === "preview-user" ? null : req.user.id]
      );

      if (row.removed_asset_id) {
        await client.query(
          `UPDATE asset SET current_status=$2,
             current_warehouse_id=$3,
             current_vendor_id=$4,
             current_train_id=NULL,
             current_position_id=NULL,
             last_work_order_id=$5,
             updated_at=now()
           WHERE id=$1`,
          [row.removed_asset_id, action.assetStatus, warehouseId, actionCode === "SEND_EXTERNAL" ? vendorId : null, row.work_order_id]
        );
        await client.query(
          `INSERT INTO asset_event (
             asset_id, event_type, from_status, to_status, from_position_id,
             work_order_id, handled_by, note
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [row.removed_asset_id, action.eventType, row.asset_status, action.assetStatus,
            row.current_position_id, row.work_order_id, req.user.id === "preview-user" ? null : req.user.id, note]
        );
      }

      if (actionCode === "SEND_EXTERNAL" && row.removed_asset_id) {
        await client.query(
          `INSERT INTO repair_record (
             asset_id, work_order_id, vendor_id, rma_no, send_date,
             expected_return_date, repair_status, note
           ) VALUES ($1,$2,$3,$4,CURRENT_DATE,$5,'已送修',$6)`,
          [row.removed_asset_id, row.work_order_id, vendorId, cleanText(req.body.rmaNo),
            cleanText(req.body.expectedReturnDate), note]
        );
      }

      if (actionCode === "SCRAP" && row.removed_asset_id) {
        await client.query(
          `INSERT INTO scrap_record (asset_id, work_order_id, scrap_reason, description, approval_status, approved_at)
           VALUES ($1,$2,$3,$4,'已核准',now())`,
          [row.removed_asset_id, row.work_order_id, cleanText(req.body.reason) || "R 工單判定報廢", note]
        );
      }
      await client.query(
        `INSERT INTO work_order_event (work_order_id, actor_text, action_code, note)
         VALUES ($1,$2,$3,$4)`,
        [row.work_order_id, req.user.displayName, actionCode, note]
      );
      return row.work_order_id;
    });
    const fresh = await query(`${REPAIR_SELECT} AND wo.id=$1`, [result]);
    res.json({ item: mapRepairRow(fresh.rows[0]) });
  })
);

router.get("/matrix", asyncHandler(async (req, res) => {
  const values = [];
  const filters = ["vp.is_installable=true"];
  if (cleanText(req.query.trainNo)) {
    values.push(cleanText(req.query.trainNo));
    filters.push(`t.train_no=$${values.length}`);
  }
  if (cleanText(req.query.moduleNo)) {
    values.push(cleanText(req.query.moduleNo));
    filters.push(`vp.module_no=$${values.length}`);
  }
  if (cleanText(req.query.groupCode)) {
    values.push(cleanText(req.query.groupCode));
    filters.push(`eg.group_code=$${values.length}`);
  }
  const rows = await query(
    `SELECT vp.id AS position_id, vp.position_code, vp.position_name, vp.module_no,
            vp.position_status, vp.last_replace_at,
            t.train_no, t.display_order,
            eg.group_code, eg.group_name, eg.system_name,
            a.id AS asset_id, a.serial_no, a.current_status,
            m.part_no, m.material_name,
            w.warehouse_name, v.vendor_name,
            last_wo.work_order_no AS source_work_order_no,
            open_r.work_order_no AS open_r_work_order_no,
            open_c.work_order_no AS open_c_work_order_no
       FROM vehicle_position vp
       LEFT JOIN train t ON t.id=vp.train_id
       LEFT JOIN equipment_group eg ON eg.id=vp.equipment_group_id
       LEFT JOIN asset a ON a.id=vp.current_asset_id
       LEFT JOIN material m ON m.id=a.material_id
       LEFT JOIN warehouse w ON w.id=a.current_warehouse_id
       LEFT JOIN vendor v ON v.id=a.current_vendor_id
       LEFT JOIN work_order last_wo ON last_wo.id=a.last_work_order_id
       LEFT JOIN LATERAL (
         SELECT wo.work_order_no FROM work_order wo
         JOIN repair_work_order rwo ON rwo.work_order_id=wo.id
         WHERE rwo.removed_asset_id=a.id AND wo.closed_at IS NULL
         ORDER BY wo.created_at DESC LIMIT 1
       ) open_r ON true
       LEFT JOIN LATERAL (
         SELECT wo.work_order_no FROM work_order wo
         JOIN fault_work_order fwo ON fwo.work_order_id=wo.id
         WHERE fwo.vehicle_position_id=vp.id AND wo.closed_at IS NULL
         ORDER BY wo.created_at DESC LIMIT 1
       ) open_c ON true
      WHERE ${filters.join(" AND ")}
      ORDER BY t.display_order NULLS LAST, t.train_no, vp.module_no, eg.group_code, vp.position_code`,
    values
  );
  res.json({ items: rows.rows });
}));

router.get("/positions/:id/history", asyncHandler(async (req, res) => {
  const rows = await query(
    `SELECT e.id, e.event_type, e.from_status, e.to_status, e.event_at,
            e.note, a.serial_no, m.part_no, wo.work_order_no,
            u.display_name AS handled_by_name
       FROM asset_event e
       JOIN asset a ON a.id=e.asset_id
       JOIN material m ON m.id=a.material_id
       LEFT JOIN work_order wo ON wo.id=e.work_order_id
       LEFT JOIN app_user u ON u.id=e.handled_by
      WHERE e.from_position_id=$1 OR e.to_position_id=$1
      ORDER BY e.event_at DESC`,
    [req.params.id]
  );
  res.json({ items: rows.rows });
}));

router.get("/assets", asyncHandler(async (req, res) => {
  const limit = parseLimit(req.query.limit);
  const offset = parseOffset(req.query.offset);
  const values = [];
  const filters = [];
  const search = buildSearch(req, ["a.serial_no", "m.part_no", "m.material_name", "eg.group_name"], values);
  if (search) filters.push(search);
  if (cleanText(req.query.status)) {
    values.push(cleanText(req.query.status));
    filters.push(`a.current_status=$${values.length}`);
  }
  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const countValues = [...values];
  values.push(limit, offset);
  const rows = await query(
    `SELECT a.id AS asset_id, a.serial_no, a.current_status, a.updated_at,
            m.part_no, m.material_name, eg.group_code, eg.group_name, eg.system_name,
            t.train_no, vp.position_code, w.warehouse_name, v.vendor_name
       FROM asset a
       JOIN material m ON m.id=a.material_id
       LEFT JOIN equipment_group eg ON eg.id=a.equipment_group_id
       LEFT JOIN train t ON t.id=a.current_train_id
       LEFT JOIN vehicle_position vp ON vp.id=a.current_position_id
       LEFT JOIN warehouse w ON w.id=a.current_warehouse_id
       LEFT JOIN vendor v ON v.id=a.current_vendor_id
       ${where}
      ORDER BY eg.group_name NULLS LAST, a.serial_no
      LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values
  );
  const total = await query(
    `SELECT count(*)::int AS count FROM asset a
       JOIN material m ON m.id=a.material_id
       LEFT JOIN equipment_group eg ON eg.id=a.equipment_group_id ${where}`,
    countValues
  );
  res.json({ items: rows.rows, page: { limit, offset, total: total.rows[0].count } });
}));

router.get("/assets/:id", asyncHandler(async (req, res) => {
  const rows = await query(
    `SELECT a.*, m.part_no, m.material_name, m.spec, eg.group_code, eg.group_name, eg.system_name,
            t.train_no, vp.position_code, vp.position_name, w.warehouse_code, w.warehouse_name,
            v.vendor_code, v.vendor_name, wo.work_order_no AS last_work_order_no
       FROM asset a
       JOIN material m ON m.id=a.material_id
       LEFT JOIN equipment_group eg ON eg.id=a.equipment_group_id
       LEFT JOIN train t ON t.id=a.current_train_id
       LEFT JOIN vehicle_position vp ON vp.id=a.current_position_id
       LEFT JOIN warehouse w ON w.id=a.current_warehouse_id
       LEFT JOIN vendor v ON v.id=a.current_vendor_id
       LEFT JOIN work_order wo ON wo.id=a.last_work_order_id
      WHERE a.id=$1`,
    [req.params.id]
  );
  if (!rows.rowCount) throw httpError(404, "設備序號不存在");
  const row = rows.rows[0];
  const spares = await query(
    `SELECT a.id AS asset_id, a.serial_no, a.current_status, w.warehouse_name
       FROM asset a LEFT JOIN warehouse w ON w.id=a.current_warehouse_id
      WHERE a.equipment_group_id=$1 AND a.id<>$2 AND a.current_warehouse_id IS NOT NULL
      ORDER BY a.current_status, a.serial_no LIMIT 20`,
    [row.equipment_group_id, req.params.id]
  );
  const orders = await query(
    `SELECT wo.work_order_no, wo.work_order_type, wo.status, wo.title, wo.created_at
       FROM work_order wo
       LEFT JOIN fault_work_order fwo ON fwo.work_order_id=wo.id
       LEFT JOIN repair_work_order rwo ON rwo.work_order_id=wo.id
      WHERE wo.closed_at IS NULL AND (fwo.removed_asset_id=$1 OR fwo.installed_asset_id=$1 OR rwo.removed_asset_id=$1 OR rwo.installed_asset_id=$1)
      ORDER BY wo.created_at DESC`,
    [req.params.id]
  );
  res.json({ item: row, sameGroupSpares: spares.rows, openOrders: orders.rows });
}));

module.exports = router;
