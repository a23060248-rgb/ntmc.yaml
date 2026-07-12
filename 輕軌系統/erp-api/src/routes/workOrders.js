const express = require("express");
const { query, withTransaction } = require("../db");
const { asyncHandler, httpError } = require("../middleware/errorHandler");
const { resolveAuth, requireRoles } = require("../middleware/auth");
const { setAuditContext } = require("../services/auditService");
const { ROLE_POLICIES } = require("../config/rolePolicy");

const router = express.Router();
router.use(resolveAuth);

const WORK_ORDER_EDIT_ROLES = ROLE_POLICIES.WORK_ORDER_WRITE;

function actorId(req) {
  return req.user.id === "preview-user" ? null : req.user.id;
}

// C_STATUS 代碼 → 中文
let statusLabels = null;
async function loadStatusLabels() {
  if (statusLabels) return statusLabels;
  const r = await query(`SELECT option_code, option_label FROM workflow_option WHERE option_group='C_STATUS'`);
  statusLabels = Object.fromEntries(r.rows.map((x) => [x.option_code, x.option_label]));
  return statusLabels;
}

function isoLocal(v) {
  if (!v) return null;
  const d = new Date(v);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function mapRow(r) {
  const fullPath = [r.main_system || "電聯車系統", r.fault_category, r.fault_component, r.fault_sub_component].filter(Boolean);
  const done = ["3", "4", "5"].includes(r.status);
  let wpath;
  if (r.d_subsystem) {
    wpath = ["電聯車系統", r.d_subsystem, r.d_symptom, r.d_component];
  } else {
    wpath = fullPath.slice(0, 3);
  }
  return {
    orderno: r.work_order_no,
    createdate: isoLocal(r.created_at),
    deadline: isoLocal(r.deadline_at) || isoLocal(new Date(new Date(r.created_at).getTime() + 30 * 86400000)),
    level: r.severity_level || 4,
    status: parseInt(r.status, 10),
    tsname: r.train_no,
    uname: r.reporter_text,
    assignee: r.assignee_name || null,
    fdesc: r.fault_description || r.title,
    full_path: fullPath,
    loc: r.location_path || [r.train_no].filter(Boolean),
    wpath,
    note: r.remark || "NA",
    observeUntil: isoLocal(r.observe_until),
    shortageItem: r.shortage_item || null,
    merge_msid: null,
    imgs: [],
    repair: r.fr_id ? {
      who: r.finished_by_text, whoNo: "",
      time: isoLocal(r.fr_created_at) ? isoLocal(r.fr_created_at).replace("T", " ").slice(0, 16) : "",
      report: r.finish_report,
      action: r.action_label || r.action_code || "檢測正常",
      cause: r.d_cause || null,
      pax: r.is_passenger_ui ? "是" : "否",
      mileage: Number(r.mileage || 0),
      accept: isoLocal(r.accepted_at) ? isoLocal(r.accepted_at).replace("T", " ").slice(0, 16) : "",
      warranty: r.warranty_code || null,
      wpath, loc: r.location_path || []
    } : null,
    logs: null // 詳情時另抓 /events
  };
}

const LIST_SQL = `
  SELECT w.work_order_no, w.title, w.status, w.created_at, w.remark,
         t.train_no, au.display_name AS assignee_name,
         f.main_system, f.fault_category, f.fault_component, f.fault_sub_component,
         f.fault_description, f.severity_level, f.deadline_at, f.observe_until,
         f.shortage_item, f.reporter_text, f.location_path,
         fr.id AS fr_id, fr.finished_by_text, fr.finish_report, fr.action_code,
         fr.is_passenger_ui, fr.mileage, fr.accepted_at, fr.warranty_code,
         fr.created_at AS fr_created_at,
         wo_act.option_label AS action_label,
         dc.subsystem AS d_subsystem, dc.symptom AS d_symptom,
         dc.component AS d_component, dc.cause AS d_cause
  FROM work_order w
  JOIN fault_work_order f ON f.work_order_id = w.id
  LEFT JOIN train t ON t.id = w.train_id
  LEFT JOIN app_user au ON au.id = w.assigned_to
  LEFT JOIN LATERAL (
    SELECT * FROM fault_finish_record x
    WHERE x.work_order_id = w.id ORDER BY x.created_at DESC LIMIT 1
  ) fr ON true
  LEFT JOIN workflow_option wo_act
    ON wo_act.option_group = 'WO_ACTION' AND wo_act.option_code = fr.action_code
  LEFT JOIN fault_dispatch_catalog dc ON dc.cause_id = fr.dispatch_node_id
  WHERE w.work_order_type = 'C' AND w.deleted_at IS NULL
`;

function buildFaultFilters(req, startIndex = 1) {
  const conditions = [];
  const values = [];
  const add = (sql, value) => {
    values.push(value);
    conditions.push(sql.replace("?", `$${startIndex + values.length - 1}`));
  };
  const search = String(req.query.search || "").trim();
  if (search) {
    values.push(`%${search}%`);
    const placeholder = `$${startIndex + values.length - 1}`;
    conditions.push(`(w.work_order_no ILIKE ${placeholder} OR w.title ILIKE ${placeholder} OR f.fault_description ILIKE ${placeholder} OR t.train_no ILIKE ${placeholder})`);
  }
  if (req.query.status !== undefined && req.query.status !== "") add("w.status = ?", String(req.query.status));
  if (req.query.level !== undefined && req.query.level !== "") add("f.severity_level = ?", Number(req.query.level));
  if (req.query.trainNo) add("t.train_no = ?", String(req.query.trainNo));
  return { sql: conditions.length ? ` AND ${conditions.join(" AND ")}` : "", values };
}

function mapUnifiedRow(row) {
  return {
    id: row.id,
    workOrderNo: row.work_order_no,
    type: row.work_order_type,
    workOrderDate: row.work_order_date,
    title: row.title,
    status: row.status,
    siteCode: row.site_code,
    targetCode: row.target_code,
    trainNo: row.train_no,
    assignedTo: row.assignee_name,
    plannedStartAt: row.planned_start_at,
    actualStartAt: row.actual_start_at,
    actualFinishAt: row.actual_finish_at,
    closedAt: row.closed_at,
    remark: row.remark,
    createdAt: row.created_at,
    detail: row.work_order_type === "R"
      ? {
          sourceFaultWorkOrderNo: row.source_fault_no,
          removedSerialNo: row.removed_serial_no,
          installedSerialNo: row.installed_serial_no,
          repairMethod: row.repair_method,
          currentPlace: row.current_place,
          outsourcingStatus: row.outsourcing_status,
          acceptanceResult: row.acceptance_result,
          nextAction: row.next_action,
          riskTags: row.risk_tags || []
        }
      : row.work_order_type === "J"
        ? {
            projectCode: row.project_code,
            projectName: row.project_name,
            projectPhase: row.project_phase,
            targetFinishDate: row.target_finish_date,
            scopeSummary: row.scope_summary
          }
        : {
            faultDescription: row.fault_description,
            faultCategory: row.fault_category,
            faultComponent: row.fault_component,
            mainSystem: row.main_system
          }
  };
}

const UNIFIED_SQL = `
  SELECT w.*,
         t.train_no,
         au.display_name AS assignee_name,
         f.fault_description,
         f.fault_category,
         f.fault_component,
         f.main_system,
         r.repair_method,
         r.current_place,
         r.outsourcing_status,
         r.acceptance_result,
         r.next_action,
         r.risk_tags,
         source_w.work_order_no AS source_fault_no,
         removed.serial_no AS removed_serial_no,
         installed.serial_no AS installed_serial_no,
         j.project_code,
         j.project_name,
         j.project_phase,
         j.target_finish_date,
         j.scope_summary
    FROM work_order w
    LEFT JOIN train t ON t.id = w.train_id
    LEFT JOIN app_user au ON au.id = w.assigned_to
    LEFT JOIN fault_work_order f ON f.work_order_id = w.id
    LEFT JOIN repair_work_order r ON r.work_order_id = w.id
    LEFT JOIN work_order source_w ON source_w.id = r.source_fault_work_order_id
    LEFT JOIN asset removed ON removed.id = r.removed_asset_id
    LEFT JOIN asset installed ON installed.id = r.installed_asset_id
    LEFT JOIN project_work_order j ON j.work_order_id = w.id
   WHERE w.deleted_at IS NULL
`;

// 工單列表
router.get("/", asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 3000, 5000);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const filters = buildFaultFilters(req);
  const rows = await query(
    `${LIST_SQL}${filters.sql} ORDER BY w.created_at DESC LIMIT $${filters.values.length + 1} OFFSET $${filters.values.length + 2}`,
    [...filters.values, limit, offset]
  );
  const total = await query(
    `SELECT count(*)::int n
       FROM work_order w
       JOIN fault_work_order f ON f.work_order_id = w.id
       LEFT JOIN train t ON t.id = w.train_id
      WHERE w.work_order_type='C' AND w.deleted_at IS NULL${filters.sql}`,
    filters.values
  );
  res.json({ total: total.rows[0].n, limit, offset, items: rows.rows.map(mapRow) });
}));

router.get("/all", asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const values = [];
  const conditions = [];
  if (req.query.type) {
    values.push(String(req.query.type).toUpperCase());
    conditions.push(`w.work_order_type = $${values.length}`);
  }
  if (req.query.status !== undefined && req.query.status !== "") {
    values.push(String(req.query.status));
    conditions.push(`w.status = $${values.length}`);
  }
  const search = String(req.query.search || "").trim();
  if (search) {
    values.push(`%${search}%`);
    conditions.push(`(w.work_order_no ILIKE $${values.length} OR w.title ILIKE $${values.length} OR t.train_no ILIKE $${values.length})`);
  }
  const filterSql = conditions.length ? ` AND ${conditions.join(" AND ")}` : "";
  const rows = await query(
    `${UNIFIED_SQL}${filterSql} ORDER BY w.created_at DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, limit, offset]
  );
  const total = await query(
    `SELECT count(*)::int AS n
       FROM work_order w
       LEFT JOIN train t ON t.id = w.train_id
      WHERE w.deleted_at IS NULL${filterSql}`,
    values
  );
  res.json({ items: rows.rows.map(mapUnifiedRow), total: total.rows[0].n, limit, offset });
}));

router.get("/repairs", asyncHandler(async (req, res) => {
  req.query.type = "R";
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const rows = await query(`${UNIFIED_SQL} AND w.work_order_type='R' ORDER BY w.created_at DESC LIMIT $1 OFFSET $2`, [limit, offset]);
  const total = await query(`SELECT count(*)::int AS n FROM work_order WHERE work_order_type='R' AND deleted_at IS NULL`);
  res.json({ items: rows.rows.map(mapUnifiedRow), total: total.rows[0].n, limit, offset });
}));

router.get("/projects", asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const rows = await query(`${UNIFIED_SQL} AND w.work_order_type='J' ORDER BY w.created_at DESC LIMIT $1 OFFSET $2`, [limit, offset]);
  const total = await query(`SELECT count(*)::int AS n FROM work_order WHERE work_order_type='J' AND deleted_at IS NULL`);
  res.json({ items: rows.rows.map(mapUnifiedRow), total: total.rows[0].n, limit, offset });
}));

router.get("/unified/:no", asyncHandler(async (req, res) => {
  const result = await query(`${UNIFIED_SQL} AND w.work_order_no = $1`, [req.params.no]);
  if (!result.rows.length) throw httpError(404, "工單不存在");
  res.json(mapUnifiedRow(result.rows[0]));
}));

// 單筆
router.get("/:no", asyncHandler(async (req, res) => {
  const rows = await query(`${LIST_SQL} AND w.work_order_no = $1`, [req.params.no]);
  if (!rows.rows.length) throw httpError(404, "工單不存在");
  res.json(mapRow(rows.rows[0]));
}));

// 操作歷程
router.get("/:no/events", asyncHandler(async (req, res) => {
  const labels = await loadStatusLabels();
  const rows = await query(`
    SELECT e.action_code, e.actor_text, e.note, e.created_at,
           au.display_name AS actor_name, au.employee_no
    FROM work_order_event e
    JOIN work_order w ON w.id = e.work_order_id
    LEFT JOIN app_user au ON au.id = e.actor_id
    WHERE w.work_order_no = $1
    ORDER BY e.created_at DESC`, [req.params.no]);
  res.json({
    items: rows.rows.map((e) => ({
      date: isoLocal(e.created_at).replace("T", " ").slice(0, 16),
      actor: e.actor_name ? `${e.employee_no || ""} ${e.actor_name}`.trim() : (e.actor_text || "系統"),
      act: e.action_code === "LOG" ? "一般操作log" : `設定為${labels[e.action_code] || e.action_code}`,
      note: e.note || ""
    }))
  });
}));

async function getWo(client, no, forUpdate = false) {
  const r = await client.query(
    `SELECT w.*, f.main_system, f.fault_component, f.fault_sub_component,
            f.fault_description, f.severity_level,
            f.vehicle_position_id, f.removed_asset_id, f.installed_asset_id
       FROM work_order w
       JOIN fault_work_order f ON f.work_order_id=w.id
      WHERE w.work_order_no=$1 AND w.work_order_type='C'
      ${forUpdate ? "FOR UPDATE OF w, f" : ""}`,
    [no]
  );
  if (!r.rows.length) throw httpError(404, "工單不存在");
  return r.rows[0];
}

async function createRepairOrderFromRemoval(client, wo, body, req) {
  const removedSerial = String(body.removed_serial || "").trim();
  if (!removedSerial) return null;

  const removedResult = await client.query(
    `SELECT a.*, vp.position_code, vp.train_id AS position_train_id
       FROM asset a
       LEFT JOIN vehicle_position vp ON vp.id=a.current_position_id
      WHERE upper(a.serial_no)=upper($1)
      FOR UPDATE OF a`,
    [removedSerial]
  );
  if (!removedResult.rowCount) throw httpError(404, `找不到拆下件序號 ${removedSerial}`);
  const removed = removedResult.rows[0];

  const existing = await client.query(
    `SELECT rwo.work_order_id, r.work_order_no
       FROM repair_work_order rwo
       JOIN work_order r ON r.id=rwo.work_order_id
      WHERE rwo.source_fault_work_order_id=$1 AND rwo.removed_asset_id=$2
      LIMIT 1`,
    [wo.id, removed.id]
  );
  if (existing.rowCount) return { workOrderNo: existing.rows[0].work_order_no, existing: true };

  let installed = null;
  const installedSerial = String(body.installed_serial || "").trim();
  if (installedSerial) {
    const installedResult = await client.query(
      `SELECT * FROM asset WHERE upper(serial_no)=upper($1) FOR UPDATE`,
      [installedSerial]
    );
    if (!installedResult.rowCount) throw httpError(404, `找不到裝上件序號 ${installedSerial}`);
    installed = installedResult.rows[0];
    if (installed.id === removed.id) throw httpError(409, "拆下件與裝上件不可為同一設備序號");
    if (installed.current_train_id || installed.current_position_id) throw httpError(409, "裝上件目前仍在其他車輛或坑位上");
  }

  const positionId = removed.current_position_id || wo.vehicle_position_id || null;
  const workDate = new Date().toISOString().slice(0, 10);
  const numberResult = await client.query(
    `SELECT next_document_no('R',$1,$2,$3) AS work_order_no`,
    [workDate, wo.site_code, wo.target_code]
  );
  const workOrderNo = numberResult.rows[0].work_order_no;
  const sequence = Number(workOrderNo.split("-").at(-1));
  const repairWorkOrder = await client.query(
    `INSERT INTO work_order (
       work_order_no,work_order_type,work_order_date,site_code,target_code,daily_sequence,
       title,status,train_id,source_work_order_id,created_by
     ) VALUES ($1,'R',$2,$3,$4,$5,$6,'待處理',$7,$8,$9)
     RETURNING id`,
    [workOrderNo, workDate, wo.site_code, wo.target_code, sequence,
      `${removed.serial_no} 周轉件維修`, wo.train_id, wo.id, actorId(req)]
  );
  const repairId = repairWorkOrder.rows[0].id;
  const repairWarehouse = await client.query(
    `SELECT id FROM warehouse WHERE warehouse_code='SHOP-REPAIR' AND is_active=true LIMIT 1`
  );
  const repairWarehouseId = repairWarehouse.rows[0]?.id || null;
  await client.query(
    `INSERT INTO repair_work_order (
       work_order_id,source_fault_work_order_id,removed_asset_id,installed_asset_id,
       original_position_id,original_location_text,main_system,fault_component,fault_sub_component
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [repairId, wo.id, removed.id, installed?.id || null, positionId,
      removed.position_code || null, wo.main_system, wo.fault_component, wo.fault_sub_component]
  );
  await client.query(
    `UPDATE fault_work_order SET removed_asset_id=$2,installed_asset_id=$3,
       vehicle_position_id=COALESCE($4,vehicle_position_id) WHERE work_order_id=$1`,
    [wo.id, removed.id, installed?.id || null, positionId]
  );

  await client.query(
    `UPDATE asset SET current_status='待修',current_train_id=NULL,current_position_id=NULL,
       current_warehouse_id=$3,current_vendor_id=NULL,last_work_order_id=$2,updated_at=now()
     WHERE id=$1`,
    [removed.id, repairId, repairWarehouseId]
  );
  await client.query(
    `INSERT INTO asset_event (
       asset_id,event_type,from_status,to_status,from_position_id,to_position_id,
       work_order_id,related_asset_id,handled_by,note
     ) VALUES ($1,'拆下送修',$2,'待修',$3,NULL,$4,$5,$6,$7)`,
    [removed.id, removed.current_status, positionId, repairId, installed?.id || null,
      actorId(req), `由 ${wo.work_order_no} 拆下並建立 ${workOrderNo}`]
  );

  if (installed) {
    await client.query(
      `UPDATE asset SET current_status='正常上線',current_train_id=$2,current_position_id=$3,
         current_warehouse_id=NULL,current_vendor_id=NULL,last_work_order_id=$4,updated_at=now()
       WHERE id=$1`,
      [installed.id, wo.train_id || removed.position_train_id, positionId, wo.id]
    );
    await client.query(
      `INSERT INTO asset_event (
         asset_id,event_type,from_status,to_status,from_position_id,to_position_id,
         work_order_id,related_asset_id,handled_by,note
       ) VALUES ($1,'更換上線',$2,'正常上線',$3,$4,$5,$6,$7,$8)`,
      [installed.id, installed.current_status, installed.current_position_id, positionId,
        wo.id, removed.id, actorId(req), `取代 ${removed.serial_no} 上線`]
    );
  }

  if (positionId) {
    await client.query(
      `UPDATE vehicle_position SET current_asset_id=$2,position_status=$3,
         last_replace_at=now(),updated_at=now() WHERE id=$1`,
      [positionId, installed?.id || null, installed ? "正常上線" : "空坑待補"]
    );
  }
  await client.query(
    `INSERT INTO work_order_event (work_order_id,actor_id,actor_text,action_code,note)
     VALUES ($1,$2,$3,'R_CREATED_FROM_C',$4)`,
    [repairId, actorId(req), req.user.displayName, `來源 C 工單 ${wo.work_order_no}；拆下件 ${removed.serial_no}`]
  );
  await client.query(
    `INSERT INTO work_order_event (work_order_id,actor_id,actor_text,action_code,note)
     VALUES ($1,$2,$3,'ASSET_REPLACED',$4)`,
    [wo.id, actorId(req), req.user.displayName, `拆下 ${removed.serial_no}${installed ? `，裝上 ${installed.serial_no}` : ""}；建立 ${workOrderNo}`]
  );
  return { workOrderNo, existing: false };
}

// 編輯 / 狀態轉移
router.patch("/:no", requireRoles(...WORK_ORDER_EDIT_ROLES), asyncHandler(async (req, res) => {
  const labels = await loadStatusLabels();
  const { status, level, tsname, fdesc, note, actor } = req.body || {};
  const actorText = actor || req.user.displayName;
  const result = await withTransaction(async (client) => {
    const wo = await getWo(client, req.params.no, true);
    setAuditContext(req, {
      actionCode: "WORK_ORDER_UPDATE",
      entityType: "work-orders",
      entityId: wo.id,
      entityNo: wo.work_order_no,
      beforeSummary: {
        workOrderNo: wo.work_order_no,
        status: Number(wo.status),
        level: Number(wo.severity_level || 0),
        description: wo.fault_description || wo.title,
        note: wo.remark || "NA",
      },
    });
    if (fdesc !== undefined) {
      await client.query(`UPDATE fault_work_order SET fault_description=$1 WHERE work_order_id=$2`, [fdesc, wo.id]);
      await client.query(`UPDATE work_order SET title=$1 WHERE id=$2`, [String(fdesc).slice(0, 60), wo.id]);
    }
    if (note !== undefined) await client.query(`UPDATE work_order SET remark=$1 WHERE id=$2`, [note === "NA" ? null : note, wo.id]);
    if (level !== undefined) await client.query(`UPDATE fault_work_order SET severity_level=$1 WHERE work_order_id=$2`, [level, wo.id]);
    if (tsname !== undefined) {
      const t = await client.query(`SELECT id FROM train WHERE train_no=$1`, [tsname]);
      if (t.rows.length) await client.query(`UPDATE work_order SET train_id=$1 WHERE id=$2`, [t.rows[0].id, wo.id]);
    }
    let assignee = null;
    if (status !== undefined && String(status) !== wo.status) {
      const st = String(status);
      if (!(st in labels)) throw httpError(400, "不合法的狀態碼");
      if (st === "3") throw httpError(409, "已完工狀態必須由完工作業產生");
      await client.query(`UPDATE work_order SET status=$1 WHERE id=$2`, [st, wo.id]);
      if (st === "2" && !wo.assigned_to) {
        const f = await client.query(`SELECT id, display_name FROM app_user WHERE department IN ('輕軌維修處','車輛課') AND display_name<>'系統管理員' ORDER BY random() LIMIT 1`);
        if (f.rows.length) {
          await client.query(`UPDATE work_order SET assigned_to=$1 WHERE id=$2`, [f.rows[0].id, wo.id]);
          assignee = f.rows[0].display_name;
        }
      }
      if (st === "10") {
        await client.query(`UPDATE fault_work_order SET observe_until = now() + interval '2 days' WHERE work_order_id=$1`, [wo.id]);
      }
      if (st === "5") await client.query(`UPDATE work_order SET closed_at=now() WHERE id=$1`, [wo.id]);
      await client.query(`INSERT INTO work_order_event (work_order_id, actor_text, action_code, note)
        VALUES ($1,$2,$3,$4)`, [wo.id, actorText, st, st === "2" ? `${assignee || "維修員"} 於管理平台派工` : "於管理平台操作"]);
    } else if (fdesc !== undefined || note !== undefined || level !== undefined || tsname !== undefined) {
      await client.query(`INSERT INTO work_order_event (work_order_id, actor_text, action_code, note)
        VALUES ($1,$2,'LOG','編輯工單內容')`, [wo.id, actorText]);
    }
    return { assignee };
  });
  const fresh = await query(`${LIST_SQL} AND w.work_order_no = $1`, [req.params.no]);
  const mapped = mapRow(fresh.rows[0]);
  setAuditContext(req, {
    afterSummary: {
      workOrderNo: mapped.orderno,
      status: mapped.status,
      level: mapped.level,
      description: mapped.fdesc,
      note: mapped.note,
    },
  });
  res.json({ ok: true, row: mapped, assignee: result.assignee });
}));

// 完工作業資料
router.post("/:no/finish", requireRoles(...WORK_ORDER_EDIT_ROLES), asyncHandler(async (req, res) => {
  const b = req.body || {};
  if (!b.report || !String(b.report).trim()) throw httpError(400, "完工報告不可為空");
  const actorText = b.actor || req.user.displayName;
  const result = await withTransaction(async (client) => {
    const wo = await getWo(client, req.params.no, true);
    setAuditContext(req, {
      actionCode: "WORK_ORDER_FINISH",
      entityType: "work-orders",
      entityId: wo.id,
      entityNo: wo.work_order_no,
      beforeSummary: {
        workOrderNo: wo.work_order_no,
        status: Number(wo.status),
        actualFinishAt: wo.actual_finish_at,
      },
    });
    if (wo.actual_finish_at || ["3", "4", "5"].includes(String(wo.status))) throw httpError(409, "此 C 工單已完成，不可重複送出完工資料");
    let causeId = null, component = b.component || null;
    if (b.subsystem && b.symptom && b.component && b.cause) {
      const c = await client.query(`SELECT cause_id FROM fault_dispatch_catalog
        WHERE subsystem=$1 AND symptom=$2 AND component=$3 AND cause=$4 LIMIT 1`,
        [b.subsystem, b.symptom, b.component, b.cause]);
      if (c.rows.length) causeId = c.rows[0].cause_id;
    }
    let actionCode = null;
    if (b.action) {
      const a = await client.query(`SELECT option_code FROM workflow_option WHERE option_group='WO_ACTION' AND option_label=$1`, [b.action]);
      actionCode = a.rows.length ? a.rows[0].option_code : null;
    }
    await client.query(`
      INSERT INTO fault_finish_record (work_order_id, finished_by_text, finish_report, action_code,
        warranty_code, danger_work_code, is_passenger_ui, mileage, removed_serial, installed_serial,
        dispatch_node_id, dispatch_component, accepted_at, is_final)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now(),true)`,
      [wo.id, actorText, b.report, actionCode, b.warranty || null, b.danger || null,
        !!b.pax, Number(b.mileage || 0), b.removed_serial || null, b.installed_serial || null,
        causeId, component]);
    await client.query(`UPDATE work_order SET status='3', actual_finish_at=now() WHERE id=$1`, [wo.id]);
    await client.query(`INSERT INTO work_order_event (work_order_id, actor_text, action_code, note)
      VALUES ($1,$2,'3','0')`, [wo.id, actorText]);
    return createRepairOrderFromRemoval(client, wo, b, req);
  });
  const fresh = await query(`${LIST_SQL} AND w.work_order_no = $1`, [req.params.no]);
  const mapped = mapRow(fresh.rows[0]);
  setAuditContext(req, {
    afterSummary: {
      workOrderNo: mapped.orderno,
      status: mapped.status,
      repairWorkOrder: result?.workOrderNo || null,
    },
  });
  res.json({ ok: true, row: mapped, repairWorkOrder: result });
}));

// 建單(報修前台用)
router.post("/", requireRoles(...WORK_ORDER_EDIT_ROLES), asyncHandler(async (req, res) => {
  const b = req.body || {};
  if (!b.fdesc || !b.subsystem || !b.category || !b.phenomenon) throw httpError(400, "缺少必要欄位");
  let orderNo = null;
  await withTransaction(async (client) => {
    const seqR = await client.query(`
      INSERT INTO document_sequence (document_type, sequence_date, site_code, target_code, last_sequence)
      VALUES ('C', CURRENT_DATE, 'D', 'TS', 1)
      ON CONFLICT (document_type, sequence_date, site_code, target_code)
      DO UPDATE SET last_sequence = document_sequence.last_sequence + 1
      RETURNING last_sequence, sequence_date`);
    const seq = seqR.rows[0].last_sequence;
    const d = seqR.rows[0].sequence_date;
    const ds = isoLocal(d).slice(0, 10);
    orderNo = `C-${+ds.slice(0, 4) - 1911}${ds.slice(5, 7)}${ds.slice(8, 10)}-D-TS-${String(seq).padStart(3, "0")}`;
    // 等級:查官方矩陣
    let level = 3;
    const lv = await client.query(`
      SELECT p.severity_level FROM fault_phenomenon p
      JOIN fault_system_node n ON n.id = p.subsystem_node_id
      WHERE n.name=$1 AND p.name=$2 LIMIT 1`, [b.subsystem, b.phenomenon]);
    if (lv.rows.length) level = lv.rows[0].severity_level;
    const days = { 1: 3, 2: 7, 3: 30 }[level] || 30;
    const t = await client.query(`SELECT id FROM train WHERE train_no=$1`, [b.tsname || ""]);
    const wo = await client.query(`
      INSERT INTO work_order (work_order_no, work_order_type, work_order_date, site_code, target_code,
        daily_sequence, title, status, train_id)
      VALUES ($1,'C',CURRENT_DATE,'D','TS',$2,$3,'0',$4) RETURNING id`,
      [orderNo, seq, String(b.fdesc).slice(0, 60), t.rows.length ? t.rows[0].id : null]);
    await client.query(`
      INSERT INTO fault_work_order (work_order_id, main_system, fault_category, fault_component,
        fault_sub_component, fault_description, severity_level, deadline_at, reporter_text, location_path, fault_found_at)
      VALUES ($1,'電聯車系統',$2,$3,$4,$5,$6, now() + ($7 || ' days')::interval, $8, $9, now())`,
      [wo.rows[0].id, b.subsystem, b.category, b.phenomenon, b.fdesc, level, String(days), b.reporter || "前台報修", b.loc || [b.tsname].filter(Boolean)]);
    await client.query(`INSERT INTO work_order_event (work_order_id, actor_text, action_code, note)
      VALUES ($1,$2,'0','前台故障報修建立')`, [wo.rows[0].id, b.reporter || "前台報修"]);
  });
  const fresh = await query(`${LIST_SQL} AND w.work_order_no = $1`, [orderNo]);
  res.json({ ok: true, orderno: orderNo, row: mapRow(fresh.rows[0]) });
}));

module.exports = router;
