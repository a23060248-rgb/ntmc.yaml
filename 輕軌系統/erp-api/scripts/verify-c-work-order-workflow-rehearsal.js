const assert = require("node:assert/strict");

process.env.NODE_ENV = "test";
process.env.ENV_FILE = process.env.ENV_FILE || ".env.test";
require("../src/config/loadEnvironment").loadEnvironment();
process.env.AUTH_MODE = "api";

const app = require("../src/app");
const { pool, query, withTransaction } = require("../src/db");

const TOKENS = {
  system_admin: "reh-system-admin-token",
  maintenance_supervisor: "reh-supervisor-token",
  scheduler: "reh-scheduler-token",
  technician: "reh-technician-token",
  warehouse_staff: "reh-warehouse-token",
  viewer: "reh-viewer-token",
};

const ORDERS = Object.freeze({
  main: "C-2690716-D-TS-982",
  shortage: "C-2690716-D-TS-983",
  observation: "C-2690716-D-TS-984",
  transfer: "C-2690716-D-TS-985",
  mergeSource: "C-2690716-D-TS-986",
  mergeTarget: "C-2690716-D-TS-987",
});

const ORDER_NOS = Object.values(ORDERS);
const POSITION_CODES = ["CWF-E2E-P1", "CWF-E2E-P2"];
const ASSET_SERIALS = ["CWF-E2E-ASSET-1", "CWF-E2E-ASSET-2"];
let baseUrl = "";

async function request({ method = "GET", path, role, body, requestId }) {
  const headers = { "content-type": "application/json", "x-request-id": requestId };
  if (role) headers.authorization = `Bearer ${TOKENS[role]}`;
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = { text }; }
  return { status: response.status, body: parsed };
}

async function action(no, code, role, expectedVersion, payload, requestId) {
  return request({
    method: "POST",
    path: `/api/work-orders/${no}/actions/${code}`,
    role,
    requestId,
    body: { expectedVersion, ...payload },
  });
}

async function cleanup() {
  await withTransaction(async (client) => {
    await client.query(`DELETE FROM operation_audit_log WHERE request_id LIKE 'CWF-E2E-%'`);
    const cRows = await client.query(`SELECT id FROM work_order WHERE work_order_no=ANY($1::text[])`, [ORDER_NOS]);
    const cIds = cRows.rows.map((row) => row.id);
    const rRows = cIds.length
      ? await client.query(`SELECT id FROM work_order WHERE source_work_order_id=ANY($1::uuid[])`, [cIds])
      : { rows: [] };
    const rIds = rRows.rows.map((row) => row.id);
    const allWorkOrderIds = [...cIds, ...rIds];
    const assets = await client.query(`SELECT id FROM asset WHERE serial_no=ANY($1::text[])`, [ASSET_SERIALS]);
    const assetIds = assets.rows.map((row) => row.id);

    if (rIds.length) {
      await client.query(`DELETE FROM repair_work_order WHERE work_order_id=ANY($1::uuid[])`, [rIds]);
    }
    if (assetIds.length) {
      await client.query(`UPDATE vehicle_position SET current_asset_id=NULL WHERE current_asset_id=ANY($1::uuid[])`, [assetIds]);
      await client.query(`DELETE FROM asset_event WHERE asset_id=ANY($1::uuid[]) OR related_asset_id=ANY($1::uuid[])`, [assetIds]);
      await client.query(`UPDATE asset SET last_work_order_id=NULL WHERE id=ANY($1::uuid[])`, [assetIds]);
    }
    if (allWorkOrderIds.length) {
      await client.query(`DELETE FROM asset_event WHERE work_order_id=ANY($1::uuid[])`, [allWorkOrderIds]);
      await client.query(`DELETE FROM work_order_event WHERE work_order_id=ANY($1::uuid[])`, [allWorkOrderIds]);
    }
    if (rIds.length) await client.query(`DELETE FROM work_order WHERE id=ANY($1::uuid[])`, [rIds]);
    if (cIds.length) {
      await client.query(`DELETE FROM fault_work_order_assignment WHERE work_order_id=ANY($1::uuid[])`, [cIds]);
      await client.query(`DELETE FROM fault_work_order_shortage WHERE work_order_id=ANY($1::uuid[])`, [cIds]);
      await client.query(`DELETE FROM fault_work_order_observation WHERE work_order_id=ANY($1::uuid[])`, [cIds]);
      await client.query(`DELETE FROM fault_finish_record WHERE work_order_id=ANY($1::uuid[])`, [cIds]);
      await client.query(`DELETE FROM fault_work_order WHERE work_order_id=ANY($1::uuid[])`, [cIds]);
      await client.query(`DELETE FROM work_order WHERE id=ANY($1::uuid[])`, [cIds]);
    }
    if (assetIds.length) await client.query(`DELETE FROM asset WHERE id=ANY($1::uuid[])`, [assetIds]);
    await client.query(`DELETE FROM vehicle_position WHERE position_code=ANY($1::text[])`, [POSITION_CODES]);
  });
}

async function createFixtures() {
  await cleanup();
  await withTransaction(async (client) => {
    const users = await client.query(
      `SELECT employee_no,id FROM app_user WHERE employee_no=ANY($1::text[])`,
      [["REH-ADMIN", "REH-SUPERVISOR", "REH-TECHNICIAN", "REH-WAREHOUSE"]]
    );
    const userIds = Object.fromEntries(users.rows.map((row) => [row.employee_no, row.id]));
    assert.equal(Object.keys(userIds).length, 4, "rehearsal users are missing");
    const train = await client.query(
      `SELECT id FROM train WHERE remark='Disposable integration fixture' ORDER BY train_no LIMIT 1`
    );
    const material = await client.query(`SELECT id FROM material WHERE part_no='REH-SERIAL-001'`);
    assert.equal(train.rowCount, 1, "rehearsal train is missing");
    assert.equal(material.rowCount, 1, "serialized rehearsal material is missing");

    for (let index = 0; index < POSITION_CODES.length; index += 1) {
      const position = await client.query(
        `INSERT INTO vehicle_position (
           position_code,site_code,target_code,train_id,train_set_no,module_no,
           position_name,position_type,is_installable,position_status,remark
         ) VALUES ($1,'D','TS',$2,'101',$3,$4,'COMPONENT',true,'ONLINE','C workflow E2E fixture')
         RETURNING id`,
        [POSITION_CODES[index], train.rows[0].id, `E${index + 1}`, `C workflow position ${index + 1}`]
      );
      const asset = await client.query(
        `INSERT INTO asset (
           material_id,serial_no,current_status,current_train_id,current_position_id,remark
         ) VALUES ($1,$2,'ONLINE',$3,$4,'C workflow E2E fixture') RETURNING id`,
        [material.rows[0].id, ASSET_SERIALS[index], train.rows[0].id, position.rows[0].id]
      );
      await client.query(
        `UPDATE vehicle_position SET current_asset_id=$2 WHERE id=$1`,
        [position.rows[0].id, asset.rows[0].id]
      );
    }

    for (let index = 0; index < ORDER_NOS.length; index += 1) {
      const inserted = await client.query(
        `INSERT INTO work_order (
           work_order_no,work_order_type,work_order_date,site_code,target_code,daily_sequence,
           title,status,train_id,created_by,remark,version
         ) VALUES ($1,'C',CURRENT_DATE,'D','TS',$2,$3,'0',$4,$5,'CWF-E2E',1)
         RETURNING id`,
        [ORDER_NOS[index], 982 + index, `C workflow E2E ${index + 1}`, train.rows[0].id, userIds["REH-SUPERVISOR"]]
      );
      await client.query(
        `INSERT INTO fault_work_order (
           work_order_id,fault_category,fault_description,main_system,severity_level,reporter_text
         ) VALUES ($1,'E2E',$2,'REHEARSAL',3,'Rehearsal Supervisor')`,
        [inserted.rows[0].id, `C workflow E2E ${index + 1}`]
      );
    }
    return userIds;
  });
  const tech = await query(`SELECT id FROM app_user WHERE employee_no='REH-TECHNICIAN'`);
  return { technicianId: tech.rows[0].id };
}

function assertAction(result, status, version, label) {
  assert.equal(result.status, 200, `${label} returned ${result.status}: ${JSON.stringify(result.body)}`);
  assert.equal(String(result.body.status), String(status), `${label} status mismatch`);
  assert.equal(Number(result.body.version), version, `${label} version mismatch`);
}

async function main() {
  const fixture = await createFixtures();
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const anonymous = await request({ path: "/api/work-orders?limit=1", requestId: "CWF-E2E-ANON" });
    assert.equal(anonymous.status, 401);

    for (const role of ["scheduler", "viewer", "warehouse_staff"]) {
      const denied = await action(ORDERS.main, "accept", role, 1, {}, `CWF-E2E-DENIED-${role}`);
      assert.equal(denied.status, 403, `${role} unexpectedly accepted a C work order`);
    }

    const legacyStatusPatch = await request({
      method: "PATCH",
      path: `/api/work-orders/${ORDERS.main}`,
      role: "maintenance_supervisor",
      requestId: "CWF-E2E-LEGACY-STATUS",
      body: { status: "1", expectedVersion: 1 },
    });
    assert.equal(legacyStatusPatch.status, 409);

    const stale = await action(ORDERS.main, "accept", "maintenance_supervisor", 99, {}, "CWF-E2E-STALE");
    assert.equal(stale.status, 409);
    assert.equal(stale.body.error.code, "WORK_ORDER_VERSION_CONFLICT");

    let result = await action(ORDERS.main, "accept", "technician", 1, {}, "CWF-E2E-MAIN-ACCEPT");
    assertAction(result, "1", 2, "accept");
    result = await action(ORDERS.main, "dispatch", "maintenance_supervisor", 2, {
      toUserId: fixture.technicianId,
      toSystem: "REHEARSAL",
      reason: "E2E dispatch",
    }, "CWF-E2E-MAIN-DISPATCH");
    assertAction(result, "2", 3, "dispatch");
    result = await action(ORDERS.main, "finish", "technician", 3, {
      report: "E2E completed with two removals",
      removals: ASSET_SERIALS.map((removedSerial) => ({ removedSerial })),
    }, "CWF-E2E-MAIN-FINISH");
    assertAction(result, "3", 4, "finish");
    assert.equal(result.body.repairOrders.length, 2, "one C order must create two R orders for two removal events");
    assert.equal(new Set(result.body.repairOrders.map((item) => item.workOrderNo)).size, 2);
    result = await action(ORDERS.main, "review", "maintenance_supervisor", 4, {}, "CWF-E2E-MAIN-REVIEW");
    assertAction(result, "4", 5, "review");
    result = await action(ORDERS.main, "close", "maintenance_supervisor", 5, {}, "CWF-E2E-MAIN-CLOSE");
    assertAction(result, "5", 6, "close");

    result = await action(ORDERS.shortage, "accept", "technician", 1, {}, "CWF-E2E-SHORT-ACCEPT");
    assertAction(result, "1", 2, "shortage accept");
    result = await action(ORDERS.shortage, "shortage", "technician", 2, {
      itemName: "E2E brake part",
      requiredQty: 2,
      unit: "EA",
      reason: "Waiting for material",
      isBlocking: true,
    }, "CWF-E2E-SHORT-ENTER");
    assertAction(result, "9", 3, "enter shortage");
    result = await action(ORDERS.shortage, "resume", "warehouse_staff", 3, {
      reason: "Material arrived",
    }, "CWF-E2E-SHORT-RESUME");
    assertAction(result, "1", 4, "resume shortage");

    result = await action(ORDERS.observation, "accept", "technician", 1, {}, "CWF-E2E-OBS-ACCEPT");
    assertAction(result, "1", 2, "observation accept");
    result = await action(ORDERS.observation, "observe", "technician", 2, {
      reason: "Monitor intermittent symptom",
      observationCondition: "No repeat alarm during service",
      dueAt: new Date(Date.now() + 86400000).toISOString(),
      responsibleUserId: fixture.technicianId,
    }, "CWF-E2E-OBS-ENTER");
    assertAction(result, "10", 3, "enter observation");
    result = await action(ORDERS.observation, "observation-result", "technician", 3, {
      resultCode: "NORMAL",
      resultNote: "No recurrence",
    }, "CWF-E2E-OBS-NORMAL");
    assertAction(result, "1", 4, "complete observation");

    result = await action(ORDERS.transfer, "transfer", "maintenance_supervisor", 1, {
      toSystem: "DOOR",
      toUserId: fixture.technicianId,
      reason: "Reclassified to door system",
    }, "CWF-E2E-TRANSFER");
    assertAction(result, "7", 2, "transfer");
    result = await action(ORDERS.transfer, "accept", "technician", 2, {}, "CWF-E2E-TRANSFER-ACCEPT");
    assertAction(result, "1", 3, "accept transferred order");

    const selfMerge = await action(ORDERS.mergeSource, "merge", "maintenance_supervisor", 1, {
      targetWorkOrderNo: ORDERS.mergeSource,
      reason: "Self merge must fail",
    }, "CWF-E2E-MERGE-SELF");
    assert.equal(selfMerge.status, 409);
    result = await action(ORDERS.mergeSource, "merge", "maintenance_supervisor", 1, {
      targetWorkOrderNo: ORDERS.mergeTarget,
      reason: "Same reported symptom",
    }, "CWF-E2E-MERGE");
    assertAction(result, "6", 2, "merge");
    const cycleMerge = await action(ORDERS.mergeTarget, "merge", "maintenance_supervisor", 1, {
      targetWorkOrderNo: ORDERS.mergeSource,
      reason: "Cycle must fail",
    }, "CWF-E2E-MERGE-CYCLE");
    assert.equal(cycleMerge.status, 409);

    const repairCheck = await query(
      `SELECT count(*)::int AS count,
              count(DISTINCT rwo.source_disassembly_event_id)::int AS event_count,
              count(DISTINCT rwo.removed_asset_id)::int AS asset_count
         FROM repair_work_order rwo
         JOIN work_order c ON c.id=rwo.source_fault_work_order_id
        WHERE c.work_order_no=$1`,
      [ORDERS.main]
    );
    assert.deepEqual(repairCheck.rows[0], { count: 2, event_count: 2, asset_count: 2 });

    const eventCheck = await query(
      `SELECT action_code,event_type,from_status,to_status,request_id
         FROM work_order_event e
         JOIN work_order w ON w.id=e.work_order_id
        WHERE w.work_order_no=$1 AND e.request_id LIKE 'CWF-E2E-%'
        ORDER BY e.created_at`,
      [ORDERS.main]
    );
    assert.equal(eventCheck.rowCount, 5);
    assert.ok(eventCheck.rows.every((row) => row.event_type === "C_WORKFLOW_ACTION"));
    assert.deepEqual(eventCheck.rows.map((row) => row.action_code), ["ACCEPT", "DISPATCH", "FINISH", "REVIEW", "CLOSE"]);

    const audits = await query(
      `SELECT count(*)::int AS count FROM operation_audit_log WHERE request_id LIKE 'CWF-E2E-%'`
    );
    assert.ok(audits.rows[0].count >= 20, "workflow actions must produce audit records");
    const mainStatus = await query(`SELECT status FROM work_order WHERE work_order_no=$1`, [ORDERS.main]);
    assert.equal(String(mainStatus.rows[0].status), "5", "main C work order should be closed");

    console.log(JSON.stringify({
      ok: true,
      anonymousStatus: anonymous.status,
      deniedRoles: ["scheduler", "viewer", "warehouse_staff"],
      legacyStatusPatch: legacyStatusPatch.status,
      staleVersion: stale.body.error.code,
      finalMainStatus: String(mainStatus.rows[0].status),
      repairOrders: repairCheck.rows[0],
      workflowEvents: eventCheck.rows.map((row) => ({
        action: row.action_code,
        from: row.from_status,
        to: row.to_status,
      })),
      auditRows: audits.rows[0].count,
    }, null, 2));
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await cleanup();
  }
}

main()
  .catch((error) => {
    console.error(error.stack || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
