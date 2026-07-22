const express = require("express");
const { query, withTransaction } = require("../db");
const { asyncHandler, httpError } = require("../middleware/errorHandler");
const { resolveAuth, requireRoles } = require("../middleware/auth");
const { setAuditContext } = require("../services/auditService");
const { ROLE_POLICIES } = require("../config/rolePolicy");
const {
  ACTIONS,
  C_STATUS,
  C_STATUS_LABELS,
  assertActionAllowed,
  assertExpectedVersion,
  availableActions,
  requireReason,
  resolveTargetStatus,
} = require("../services/cWorkOrderWorkflow");

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
    statusLabel: C_STATUS_LABELS[String(r.status)] || String(r.status),
    version: Number(r.version || 1),
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
  SELECT w.work_order_no, w.title, w.status, w.version, w.created_at, w.remark,
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
    statusLabel: row.work_order_type === "C" ? (C_STATUS_LABELS[String(row.status)] || row.status) : row.status,
    version: Number(row.version || 1),
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
            faultSubComponent: row.fault_sub_component,
            mainSystem: row.main_system,
            severityLevel: row.severity_level,
            deadlineAt: row.deadline_at,
            reporter: row.reporter_text,
            locationPath: row.location_path || [],
            mergedIntoId: row.merged_into_id,
            observeUntil: row.observe_until,
            shortageItem: row.shortage_item
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
         f.fault_sub_component,
         f.main_system,
         f.severity_level,
         f.deadline_at,
         f.reporter_text,
         f.location_path,
         f.merged_into_id,
         f.observe_until,
         f.shortage_item,
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

router.get("/action-options", asyncHandler(async (req, res) => {
  const [users, systems, mergeCandidates] = await Promise.all([
    query(
      `SELECT id,employee_no,display_name,department,system_role
         FROM app_user
        WHERE is_active=true
        ORDER BY department NULLS LAST,display_name`
    ),
    query(
      `SELECT DISTINCT main_system
         FROM fault_work_order
        WHERE main_system IS NOT NULL AND btrim(main_system)<>''
        ORDER BY main_system`
    ),
    query(
      `SELECT w.work_order_no,w.status,t.train_no,w.title
         FROM work_order w
         JOIN fault_work_order f ON f.work_order_id=w.id
         LEFT JOIN train t ON t.id=w.train_id
        WHERE w.work_order_type='C'
          AND w.deleted_at IS NULL
          AND w.status NOT IN ('5','6','8')
          AND f.merged_into_id IS NULL
        ORDER BY w.created_at DESC
        LIMIT 200`
    ),
  ]);
  res.json({
    users: users.rows.map((row) => ({
      id: row.id,
      employeeNo: row.employee_no,
      displayName: row.display_name,
      department: row.department,
      role: row.system_role,
    })),
    systems: systems.rows.map((row) => row.main_system),
    mergeCandidates: mergeCandidates.rows.map((row) => ({
      workOrderNo: row.work_order_no,
      status: String(row.status),
      statusLabel: C_STATUS_LABELS[String(row.status)] || String(row.status),
      trainNo: row.train_no,
      title: row.title,
    })),
  });
}));

router.get("/unified/:no", asyncHandler(async (req, res) => {
  const result = await query(`${UNIFIED_SQL} AND w.work_order_no = $1`, [req.params.no]);
  if (!result.rows.length) throw httpError(404, "工單不存在");
  const item = mapUnifiedRow(result.rows[0]);
  if (item.type === "C") {
    const [assignments, shortage, observation, repairs] = await Promise.all([
      query(`SELECT a.*, from_user.display_name AS from_user_name, to_user.display_name AS to_user_name,
                    actor.display_name AS assigned_by_name
               FROM fault_work_order_assignment a
               LEFT JOIN app_user from_user ON from_user.id=a.from_user_id
               LEFT JOIN app_user to_user ON to_user.id=a.to_user_id
               LEFT JOIN app_user actor ON actor.id=a.assigned_by
              WHERE a.work_order_id=$1 ORDER BY a.created_at DESC`, [item.id]),
      query(`SELECT s.*, m.part_no, u.display_name AS responsible_name
               FROM fault_work_order_shortage s
               LEFT JOIN material m ON m.id=s.material_id
               LEFT JOIN app_user u ON u.id=s.responsible_user_id
              WHERE s.work_order_id=$1 AND s.resolved_at IS NULL LIMIT 1`, [item.id]),
      query(`SELECT o.*, u.display_name AS responsible_name
               FROM fault_work_order_observation o
               LEFT JOIN app_user u ON u.id=o.responsible_user_id
              WHERE o.work_order_id=$1 AND o.completed_at IS NULL LIMIT 1`, [item.id]),
      query(`SELECT r.work_order_no, r.status, a.serial_no AS removed_serial_no,
                    ae.event_at AS disassembled_at
               FROM repair_work_order rwo
               JOIN work_order r ON r.id=rwo.work_order_id
               LEFT JOIN asset a ON a.id=rwo.removed_asset_id
               LEFT JOIN asset_event ae ON ae.id=rwo.source_disassembly_event_id
              WHERE rwo.source_fault_work_order_id=$1
              ORDER BY r.created_at DESC`, [item.id]),
    ]);
    item.availableActions = availableActions(item.status, req.user.role);
    item.workflow = {
      assignments: assignments.rows,
      activeShortage: shortage.rows[0] || null,
      activeObservation: observation.rows[0] || null,
      repairOrders: repairs.rows,
    };
  }
  res.json(item);
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
            f.vehicle_position_id, f.removed_asset_id, f.installed_asset_id,
            f.merged_into_id, f.observe_until, f.shortage_item
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
  const removedSerial = String(body.removedSerial || body.removed_serial || "").trim();
  if (!removedSerial) return null;
  const disassemblyRequestId = String(body.disassemblyRequestId || req.requestId || "").trim();

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
       LEFT JOIN asset_event ae ON ae.id=rwo.source_disassembly_event_id
      WHERE rwo.source_fault_work_order_id=$1 AND rwo.removed_asset_id=$2
        AND ae.request_id=$3
      LIMIT 1`,
    [wo.id, removed.id, disassemblyRequestId]
  );
  if (existing.rowCount) return { workOrderNo: existing.rows[0].work_order_no, existing: true };

  let installed = null;
  const installedSerial = String(body.installedSerial || body.installed_serial || "").trim();
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
  if (positionId) {
    const position = await client.query(
      `SELECT current_asset_id FROM vehicle_position WHERE id=$1 FOR UPDATE`,
      [positionId]
    );
    if (!position.rowCount) throw httpError(409, "拆件坑位不存在");
    if (position.rows[0].current_asset_id && position.rows[0].current_asset_id !== removed.id) {
      throw httpError(409, "坑位設備已由其他作業變更，請重新載入");
    }
  }
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
    `UPDATE asset SET current_status='待修',current_train_id=NULL,current_position_id=NULL,
       current_warehouse_id=$3,current_vendor_id=NULL,last_work_order_id=$2,updated_at=now()
     WHERE id=$1`,
    [removed.id, repairId, repairWarehouseId]
  );
  const disassemblyEvent = await client.query(
    `INSERT INTO asset_event (
       asset_id,event_type,from_status,to_status,from_position_id,to_position_id,
       work_order_id,related_asset_id,handled_by,note,request_id
     ) VALUES ($1,'拆下送修',$2,'待修',$3,NULL,$4,$5,$6,$7,$8)
     RETURNING id`,
    [removed.id, removed.current_status, positionId, repairId, installed?.id || null,
      actorId(req), `由 ${wo.work_order_no} 拆下並建立 ${workOrderNo}`, disassemblyRequestId]
  );
  await client.query(
    `INSERT INTO repair_work_order (
       work_order_id,source_fault_work_order_id,source_disassembly_event_id,
       removed_asset_id,installed_asset_id,original_position_id,original_location_text,
       main_system,fault_component,fault_sub_component
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [repairId, wo.id, disassemblyEvent.rows[0].id, removed.id, installed?.id || null,
      positionId, removed.position_code || null, wo.main_system, wo.fault_component, wo.fault_sub_component]
  );
  await client.query(
    `UPDATE fault_work_order SET removed_asset_id=$2,installed_asset_id=$3,
       vehicle_position_id=COALESCE($4,vehicle_position_id) WHERE work_order_id=$1`,
    [wo.id, removed.id, installed?.id || null, positionId]
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
         work_order_id,related_asset_id,handled_by,note,request_id
       ) VALUES ($1,'更換上線',$2,'正常上線',$3,$4,$5,$6,$7,$8,$9)`,
      [installed.id, installed.current_status, installed.current_position_id, positionId,
        wo.id, removed.id, actorId(req), `取代 ${removed.serial_no} 上線`, `${disassemblyRequestId}:install`]
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

const C_ACTION_ROLES = [
  "system_admin",
  "maintenance_supervisor",
  "technician",
  "warehouse_staff",
];

async function appendWorkflowEvent(client, { wo, req, action, fromStatus, toStatus, reason, payload = {} }) {
  await client.query(
    `INSERT INTO work_order_event (
       work_order_id,actor_id,actor_text,action_code,event_type,from_status,to_status,
       reason,note,request_id,payload
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8,$9,$10::jsonb)`,
    [wo.id, actorId(req), req.user.displayName, action.toUpperCase(), "C_WORKFLOW_ACTION", fromStatus,
      toStatus, reason || null, req.requestId, JSON.stringify(payload)]
  );
}

async function assertMergeTarget(client, wo, targetNo) {
  const target = await client.query(
    `SELECT w.id,w.work_order_no,w.status,f.merged_into_id
       FROM work_order w
       JOIN fault_work_order f ON f.work_order_id=w.id
      WHERE w.work_order_no=$1 AND w.work_order_type='C' AND w.deleted_at IS NULL
      FOR UPDATE OF w,f`,
    [targetNo]
  );
  if (!target.rowCount) throw httpError(404, "找不到要併入的主 C 工單");
  const master = target.rows[0];
  if (master.id === wo.id) throw httpError(409, "C 工單不可自己併入自己");
  if ([C_STATUS.CLOSED, C_STATUS.MERGED, C_STATUS.VOIDED].includes(String(master.status)) || master.merged_into_id) {
    throw httpError(409, "結案、作廢或已被併入的工單不可作為主工單");
  }
  const cycle = await client.query(
    `WITH RECURSIVE merge_chain AS (
       SELECT w.id,f.merged_into_id
         FROM work_order w JOIN fault_work_order f ON f.work_order_id=w.id
        WHERE w.id=$1
       UNION ALL
       SELECT w.id,f.merged_into_id
         FROM merge_chain c
         JOIN work_order w ON w.id=c.merged_into_id
         JOIN fault_work_order f ON f.work_order_id=w.id
     ) SELECT 1 FROM merge_chain WHERE id=$2 LIMIT 1`,
    [master.id, wo.id]
  );
  if (cycle.rowCount) throw httpError(409, "併單會形成循環關係");
  return master;
}

router.post("/:no/actions/:action", requireRoles(...C_ACTION_ROLES), asyncHandler(async (req, res) => {
  const action = String(req.params.action || "").toLowerCase();
  const body = req.body || {};
  const outcome = await withTransaction(async (client) => {
    const wo = await getWo(client, req.params.no, true);
    assertExpectedVersion(wo.version, body.expectedVersion);
    assertActionAllowed({ action, status: wo.status, role: req.user.role });
    const fromStatus = String(wo.status);
    let targetStatus = [ACTIONS.RESUME, ACTIONS.OBSERVATION_RESULT].includes(action)
      ? null
      : resolveTargetStatus({ action });
    let reason = String(body.reason || "").trim();
    let payload = {};
    let repairOrders = [];

    setAuditContext(req, {
      actionCode: `C_WORK_ORDER_${action.replaceAll("-", "_").toUpperCase()}`,
      entityType: "work-orders",
      entityId: wo.id,
      entityNo: wo.work_order_no,
      beforeSummary: {
        workOrderNo: wo.work_order_no,
        status: fromStatus,
        statusLabel: C_STATUS_LABELS[fromStatus],
        version: Number(wo.version),
      },
    });

    if (action === ACTIONS.ACCEPT) {
      await client.query(
        `UPDATE work_order SET assigned_to=COALESCE(assigned_to,$2),actual_start_at=COALESCE(actual_start_at,now()) WHERE id=$1`,
        [wo.id, actorId(req)]
      );
      reason ||= "維修人員接單";
    } else if (action === ACTIONS.DISPATCH) {
      const toUserId = String(body.toUserId || "").trim();
      if (!toUserId) throw httpError(400, "派工必須指定維修人員");
      const assignee = await client.query(
        `SELECT id,display_name,department FROM app_user WHERE id=$1 AND is_active=true`,
        [toUserId]
      );
      if (!assignee.rowCount) throw httpError(400, "指定的維修人員不存在或已停用");
      reason ||= "主管派工";
      await client.query(
        `INSERT INTO fault_work_order_assignment (
           work_order_id,assignment_type,from_system,to_system,from_unit,to_unit,
           from_user_id,to_user_id,from_shift,to_shift,reason,assigned_by,request_id
         ) VALUES ($1,'DISPATCH',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [wo.id, body.fromSystem || wo.main_system || null, body.toSystem || wo.main_system || null,
          body.fromUnit || null, body.toUnit || assignee.rows[0].department || null,
          wo.assigned_to || null, toUserId, body.fromShift || null, body.toShift || null,
          reason, actorId(req), req.requestId]
      );
      await client.query(`UPDATE work_order SET assigned_to=$2 WHERE id=$1`, [wo.id, toUserId]);
      payload = { toUserId, toUserName: assignee.rows[0].display_name };
    } else if (action === ACTIONS.FINISH) {
      const report = String(body.report || "").trim();
      if (!report) throw httpError(400, "完工報告不可為空");
      reason ||= "維修人員回報完工";
      await client.query(`UPDATE fault_finish_record SET is_final=false WHERE work_order_id=$1 AND is_final=true`, [wo.id]);
      await client.query(
        `INSERT INTO fault_finish_record (
           work_order_id,finished_by,finished_by_text,finish_report,action_code,warranty_code,
           danger_work_code,is_passenger_ui,mileage,dispatch_component,accepted_at,is_final
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now(),true)`,
        [wo.id, actorId(req), req.user.displayName, report, body.actionCode || null,
          body.warrantyCode || null, body.dangerWorkCode || null, Boolean(body.isPassengerUi),
          Number(body.mileage || 0), body.dispatchComponent || null]
      );
      const removals = Array.isArray(body.removals)
        ? body.removals
        : (body.removedSerial || body.removed_serial)
          ? [{ removedSerial: body.removedSerial || body.removed_serial, installedSerial: body.installedSerial || body.installed_serial }]
          : [];
      const normalizedSerials = removals.map((item) => String(item.removedSerial || item.removed_serial || "").trim().toUpperCase());
      if (normalizedSerials.some((serial) => !serial)) throw httpError(400, "拆件序號不可為空");
      if (new Set(normalizedSerials).size !== normalizedSerials.length) throw httpError(409, "同一次完工作業不可重複拆下同一序號件");
      for (let index = 0; index < removals.length; index += 1) {
        const repair = await createRepairOrderFromRemoval(client, wo, {
          ...removals[index],
          disassemblyRequestId: `${req.requestId}:${index + 1}`,
        }, req);
        if (repair) repairOrders.push(repair);
      }
      payload = { report, repairOrders };
    } else if (action === ACTIONS.REVIEW) {
      reason ||= "主管覆核通過";
    } else if (action === ACTIONS.REJECT_REVIEW) {
      reason = requireReason(reason, "退回派工");
      await client.query(`UPDATE fault_finish_record SET is_final=false WHERE work_order_id=$1 AND is_final=true`, [wo.id]);
    } else if (action === ACTIONS.CLOSE) {
      reason ||= "主管確認結案";
    } else if (action === ACTIONS.TRANSFER) {
      reason = requireReason(reason, "轉單");
      const toUserId = body.toUserId || null;
      if (!body.toSystem && !body.toUnit && !toUserId && !body.toShift) {
        throw httpError(400, "轉單至少要指定新系統、單位、人員或班別");
      }
      if (toUserId) {
        const user = await client.query(`SELECT id FROM app_user WHERE id=$1 AND is_active=true`, [toUserId]);
        if (!user.rowCount) throw httpError(400, "轉入人員不存在或已停用");
      }
      await client.query(
        `INSERT INTO fault_work_order_assignment (
           work_order_id,assignment_type,from_system,to_system,from_unit,to_unit,
           from_user_id,to_user_id,from_shift,to_shift,reason,assigned_by,request_id
         ) VALUES ($1,'TRANSFER',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [wo.id, body.fromSystem || wo.main_system || null, body.toSystem || null,
          body.fromUnit || null, body.toUnit || null, wo.assigned_to || null, toUserId,
          body.fromShift || null, body.toShift || null, reason, actorId(req), req.requestId]
      );
      await client.query(`UPDATE work_order SET assigned_to=$2 WHERE id=$1`, [wo.id, toUserId]);
      payload = { toSystem: body.toSystem || null, toUnit: body.toUnit || null, toUserId, toShift: body.toShift || null };
    } else if (action === ACTIONS.MERGE) {
      reason = requireReason(reason, "併單");
      const targetNo = String(body.targetWorkOrderNo || "").trim();
      if (!targetNo) throw httpError(400, "請指定要併入的主 C 工單");
      const target = await assertMergeTarget(client, wo, targetNo);
      await client.query(`UPDATE fault_work_order SET merged_into_id=$2 WHERE work_order_id=$1`, [wo.id, target.id]);
      payload = { targetWorkOrderNo: target.work_order_no };
    } else if (action === ACTIONS.VOID) {
      reason = requireReason(reason, "作廢");
    } else if (action === ACTIONS.SHORTAGE) {
      reason = requireReason(reason, "缺料");
      const itemName = String(body.itemName || "").trim();
      const requiredQty = Number(body.requiredQty);
      if (!itemName || !Number.isFinite(requiredQty) || requiredQty <= 0) {
        throw httpError(400, "缺料必須填寫品名與大於 0 的需求數量");
      }
      await client.query(
        `INSERT INTO fault_work_order_shortage (
           work_order_id,previous_status,material_id,item_code,item_name,required_qty,unit,
           expected_arrival_date,supply_status,responsible_user_id,is_blocking,reason,request_id
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [wo.id, fromStatus, body.materialId || null, body.itemCode || null, itemName,
          requiredQty, body.unit || null, body.expectedArrivalDate || null,
          body.supplyStatus || "待處理", body.responsibleUserId || null,
          body.isBlocking !== false, reason, req.requestId]
      );
      await client.query(`UPDATE fault_work_order SET shortage_item=$2 WHERE work_order_id=$1`, [wo.id, itemName]);
      payload = { itemName, requiredQty, unit: body.unit || null, isBlocking: body.isBlocking !== false };
    } else if (action === ACTIONS.RESUME) {
      reason = requireReason(reason, "恢復作業");
      const shortage = await client.query(
        `SELECT * FROM fault_work_order_shortage
          WHERE work_order_id=$1 AND resolved_at IS NULL FOR UPDATE`,
        [wo.id]
      );
      if (!shortage.rowCount) throw httpError(409, "此工單沒有未解除的缺料紀錄");
      targetStatus = resolveTargetStatus({ action, previousStatus: shortage.rows[0].previous_status });
      await client.query(
        `UPDATE fault_work_order_shortage
            SET resolved_at=now(),resolved_by=$2,resolution_note=$3
          WHERE id=$1`,
        [shortage.rows[0].id, actorId(req), reason]
      );
      await client.query(`UPDATE fault_work_order SET shortage_item=NULL WHERE work_order_id=$1`, [wo.id]);
    } else if (action === ACTIONS.OBSERVE) {
      reason = requireReason(reason, "觀察");
      const dueAt = new Date(body.dueAt || "");
      const condition = String(body.observationCondition || "").trim();
      if (!condition || Number.isNaN(dueAt.getTime()) || dueAt.getTime() <= Date.now()) {
        throw httpError(400, "觀察必須填寫條件與未來的到期時間");
      }
      await client.query(
        `INSERT INTO fault_work_order_observation (
           work_order_id,previous_status,reason,observation_condition,responsible_user_id,due_at,request_id
         ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [wo.id, fromStatus, reason, condition, body.responsibleUserId || null, dueAt, req.requestId]
      );
      await client.query(`UPDATE fault_work_order SET observe_until=$2 WHERE work_order_id=$1`, [wo.id, dueAt]);
      payload = { dueAt: dueAt.toISOString(), observationCondition: condition };
    } else if (action === ACTIONS.OBSERVATION_RESULT) {
      reason = requireReason(reason || body.resultNote, "觀察結果");
      const observation = await client.query(
        `SELECT * FROM fault_work_order_observation
          WHERE work_order_id=$1 AND completed_at IS NULL FOR UPDATE`,
        [wo.id]
      );
      if (!observation.rowCount) throw httpError(409, "此工單沒有進行中的觀察紀錄");
      const resultCode = String(body.resultCode || "");
      targetStatus = resolveTargetStatus({
        action,
        observationResult: resultCode,
        previousStatus: observation.rows[0].previous_status,
      });
      if (resultCode === "EXTENDED") {
        const dueAt = new Date(body.dueAt || "");
        if (Number.isNaN(dueAt.getTime()) || dueAt.getTime() <= Date.now()) throw httpError(400, "延長觀察必須指定新的未來到期時間");
        await client.query(
          `UPDATE fault_work_order_observation SET due_at=$2,result_code='EXTENDED',result_note=$3 WHERE id=$1`,
          [observation.rows[0].id, dueAt, reason]
        );
        await client.query(`UPDATE fault_work_order SET observe_until=$2 WHERE work_order_id=$1`, [wo.id, dueAt]);
      } else {
        await client.query(
          `UPDATE fault_work_order_observation
              SET result_code=$2,result_note=$3,completed_at=now(),completed_by=$4
            WHERE id=$1`,
          [observation.rows[0].id, resultCode, reason, actorId(req)]
        );
        await client.query(`UPDATE fault_work_order SET observe_until=NULL WHERE work_order_id=$1`, [wo.id]);
      }
      payload = { resultCode };
    }

    const updated = await client.query(
      `UPDATE work_order
          SET status=$1,version=version+1,status_changed_at=now(),status_changed_by=$2,
              actual_finish_at=CASE WHEN $3 THEN now() WHEN $4 THEN NULL ELSE actual_finish_at END,
              closed_at=CASE WHEN $5 THEN now() ELSE closed_at END,
              closed_by=CASE WHEN $5 THEN $2 ELSE closed_by END,
              updated_at=now()
        WHERE id=$6 AND version=$7
        RETURNING version,status`,
      [targetStatus, actorId(req), action === ACTIONS.FINISH, action === ACTIONS.REJECT_REVIEW,
        action === ACTIONS.CLOSE, wo.id, wo.version]
    );
    if (!updated.rowCount) throw httpError(409, "工單已由其他人更新，請重新載入後再操作");
    await appendWorkflowEvent(client, { wo, req, action, fromStatus, toStatus: targetStatus, reason, payload });
    return { status: targetStatus, version: Number(updated.rows[0].version), repairOrders };
  });

  setAuditContext(req, {
    afterSummary: {
      workOrderNo: req.params.no,
      status: outcome.status,
      statusLabel: C_STATUS_LABELS[outcome.status],
      version: outcome.version,
      repairOrders: outcome.repairOrders.map((item) => item.workOrderNo),
    },
  });
  res.json({ ok: true, ...outcome });
}));

// 一般內容編輯。狀態只能透過 /actions/:action 狀態機操作。
router.patch("/:no", requireRoles(...WORK_ORDER_EDIT_ROLES), asyncHandler(async (req, res) => {
  const { status, level, tsname, fdesc, note, expectedVersion } = req.body || {};
  if (status !== undefined) {
    throw httpError(409, "C 工單狀態不可直接修改，請使用專用 action API");
  }
  const changed = [level, tsname, fdesc, note].some((value) => value !== undefined);
  if (!changed) throw httpError(400, "沒有可更新的工單內容");

  await withTransaction(async (client) => {
    const wo = await getWo(client, req.params.no, true);
    assertExpectedVersion(wo.version, expectedVersion);
    if ([C_STATUS.CLOSED, C_STATUS.MERGED, C_STATUS.VOIDED].includes(String(wo.status))) {
      throw httpError(409, "結案、併單或作廢工單不可再編輯");
    }
    setAuditContext(req, {
      actionCode: "C_WORK_ORDER_CONTENT_UPDATE",
      entityType: "work-orders",
      entityId: wo.id,
      entityNo: wo.work_order_no,
      beforeSummary: {
        workOrderNo: wo.work_order_no,
        status: String(wo.status),
        version: Number(wo.version),
        level: Number(wo.severity_level || 0),
        description: wo.fault_description || wo.title,
        note: wo.remark || null,
      },
    });
    if (fdesc !== undefined) {
      await client.query(`UPDATE fault_work_order SET fault_description=$1 WHERE work_order_id=$2`, [fdesc, wo.id]);
      await client.query(`UPDATE work_order SET title=$1 WHERE id=$2`, [String(fdesc).slice(0, 60), wo.id]);
    }
    if (note !== undefined) await client.query(`UPDATE work_order SET remark=$1 WHERE id=$2`, [note === "NA" ? null : note, wo.id]);
    if (level !== undefined) await client.query(`UPDATE fault_work_order SET severity_level=$1 WHERE work_order_id=$2`, [level, wo.id]);
    if (tsname !== undefined) {
      const train = await client.query(`SELECT id FROM train WHERE train_no=$1`, [tsname]);
      if (!train.rowCount) throw httpError(400, "指定車號不存在");
      await client.query(`UPDATE work_order SET train_id=$1 WHERE id=$2`, [train.rows[0].id, wo.id]);
    }
    const updated = await client.query(
      `UPDATE work_order SET version=version+1,updated_at=now()
        WHERE id=$1 AND version=$2 RETURNING version`,
      [wo.id, wo.version]
    );
    if (!updated.rowCount) throw httpError(409, "工單已由其他人更新，請重新載入後再操作");
    await appendWorkflowEvent(client, {
      wo,
      req,
      action: "content-update",
      fromStatus: String(wo.status),
      toStatus: String(wo.status),
      reason: "編輯原始報修內容",
      payload: { level, tsname, fdesc, note },
    });
  });

  const fresh = await query(`${LIST_SQL} AND w.work_order_no = $1`, [req.params.no]);
  const mapped = mapRow(fresh.rows[0]);
  setAuditContext(req, {
    afterSummary: {
      workOrderNo: mapped.orderno,
      status: mapped.status,
      version: mapped.version,
      level: mapped.level,
      description: mapped.fdesc,
      note: mapped.note,
    },
  });
  res.json({ ok: true, row: mapped });
}));

// 舊版完工入口停用，避免繞過狀態機、版本鎖與覆核流程。
router.post("/:no/finish", requireRoles(...WORK_ORDER_EDIT_ROLES), asyncHandler(async () => {
  throw httpError(410, "舊版完工 API 已停用，請重新載入並使用 /actions/finish");
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
