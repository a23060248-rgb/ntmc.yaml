const assert = require("node:assert/strict");

process.env.NODE_ENV = "test";
process.env.ENV_FILE = process.env.ENV_FILE || ".env.test";
require("../src/config/loadEnvironment").loadEnvironment();
process.env.AUTH_MODE = "api";

const app = require("../src/app");
const { pool, query, withTransaction } = require("../src/db");
const { ALL_ROLES, ROLE_POLICIES } = require("../src/config/rolePolicy");

const TOKENS = {
  system_admin: "reh-system-admin-token",
  maintenance_supervisor: "reh-supervisor-token",
  scheduler: "reh-scheduler-token",
  technician: "reh-technician-token",
  warehouse_staff: "reh-warehouse-token",
  viewer: "reh-viewer-token",
};

const scenarios = [
  { name: "master", method: "POST", path: "/api/master-data/pm-template-studio", body: {}, roles: ROLE_POLICIES.MASTER_WRITE },
  { name: "schedule", method: "POST", path: "/api/precheck/imports/preview", body: {}, roles: ROLE_POLICIES.SCHEDULE_WRITE },
  { name: "package", method: "PATCH", path: "/api/precheck/packages/PHASE8-NOT-FOUND", body: {}, roles: ROLE_POLICIES.PACKAGE_WRITE },
  { name: "backfill", method: "PATCH", path: "/api/precheck/backfills/PHASE8-NOT-FOUND", body: {}, roles: ROLE_POLICIES.BACKFILL_WRITE },
  { name: "work-order", method: "POST", path: "/api/work-orders", body: { password: "phase8-secret" }, roles: ROLE_POLICIES.WORK_ORDER_WRITE },
  { name: "inventory-post", method: "POST", path: "/api/inventory/transfer", body: {}, roles: ROLE_POLICIES.INVENTORY_POST, idempotencyKey: "PHASE8-INVENTORY-POST" },
  { name: "inventory-consume", method: "POST", path: "/api/inventory/consume", body: {}, roles: ROLE_POLICIES.INVENTORY_CONSUME, idempotencyKey: "PHASE8-INVENTORY-CONSUME" },
  { name: "turnaround", method: "POST", path: "/api/turnaround/r-orders/PHASE8-NOT-FOUND/actions", body: { action: "START_INTERNAL" }, roles: ROLE_POLICIES.TURNAROUND_WRITE },
  { name: "database-admin", method: "POST", path: "/api/db/workflow_option/row", body: {}, roles: ROLE_POLICIES.DATABASE_ADMIN },
];

let baseUrl = "";

async function request({ method = "GET", path, role, body, requestId, idempotencyKey }) {
  const headers = { "content-type": "application/json", "x-request-id": requestId };
  if (role) headers.authorization = `Bearer ${TOKENS[role]}`;
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = { text }; }
  return { status: response.status, body: parsed, requestId: response.headers.get("x-request-id") };
}

async function resetFixture() {
  await withTransaction(async (client) => {
    await client.query(`DELETE FROM operation_audit_log WHERE request_id LIKE 'PHASE8-%'`);
    const old = await client.query(`SELECT id FROM work_order WHERE work_order_no='C-2690711-D-TS-981'`);
    if (old.rowCount) {
      await client.query(`DELETE FROM work_order_event WHERE work_order_id=$1`, [old.rows[0].id]);
      await client.query(`DELETE FROM fault_work_order WHERE work_order_id=$1`, [old.rows[0].id]);
      await client.query(`DELETE FROM work_order WHERE id=$1`, [old.rows[0].id]);
    }
    const supervisor = await client.query(`SELECT id FROM app_user WHERE employee_no='REH-SUPERVISOR'`);
    const train = await client.query(`SELECT id FROM train WHERE remark='Disposable integration fixture' ORDER BY train_no LIMIT 1`);
    assert.equal(supervisor.rowCount, 1, "rehearsal supervisor is missing");
    assert.equal(train.rowCount, 1, "rehearsal train is missing");
    const inserted = await client.query(
      `INSERT INTO work_order (
         work_order_no,work_order_type,work_order_date,site_code,target_code,daily_sequence,
         title,status,train_id,created_by,remark
       ) VALUES ('C-2690711-D-TS-981','C',CURRENT_DATE,'D','TS',981,
         'Phase 8 audit fixture','0',$1,$2,'PHASE8-BEFORE') RETURNING id`,
      [train.rows[0].id, supervisor.rows[0].id]
    );
    await client.query(
      `INSERT INTO fault_work_order (
         work_order_id,fault_category,fault_description,main_system,severity_level,reporter_text
       ) VALUES ($1,'REHEARSAL','Phase 8 audit fixture','REHEARSAL',3,'Rehearsal Supervisor')`,
      [inserted.rows[0].id]
    );
  });
}

async function waitForAudit(requestId) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const result = await query(`SELECT * FROM operation_audit_log WHERE request_id=$1 ORDER BY created_at DESC LIMIT 1`, [requestId]);
    if (result.rowCount) return result.rows[0];
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`audit row not written for ${requestId}`);
}

async function main() {
  await resetFixture();
  const sessionCount = await query(
    `SELECT count(*)::int AS count FROM user_session s
      JOIN app_user u ON u.id=s.user_id
     WHERE s.token LIKE 'reh-%-token' AND s.expires_at>now() AND u.system_role=ANY($1::text[])`,
    [ALL_ROLES]
  );
  assert.equal(sessionCount.rows[0].count, 6, "six rehearsal API sessions are required");

  const server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const anonymousRead = await request({ path: "/api/work-orders?limit=1", requestId: "PHASE8-ANON-READ" });
    assert.equal(anonymousRead.status, 401);
    for (const role of ALL_ROLES) {
      const read = await request({ path: "/api/work-orders?limit=1", role, requestId: `PHASE8-READ-${role}` });
      assert.equal(read.status, 200, `${role} cannot read work orders`);
      assert.equal(read.requestId, `PHASE8-READ-${role}`);
    }

    const matrix = [];
    for (const scenario of scenarios) {
      for (const role of ALL_ROLES) {
        const requestId = `PHASE8-MATRIX-${scenario.name}-${role}`;
        const result = await request({ ...scenario, role, requestId, idempotencyKey: scenario.idempotencyKey ? `${scenario.idempotencyKey}-${role}` : undefined });
        const allowed = scenario.roles.includes(role);
        if (allowed) {
          assert.notEqual(result.status, 401, `${scenario.name} rejected authenticated ${role}`);
          assert.notEqual(result.status, 403, `${scenario.name} denied allowed ${role}`);
          assert.ok(result.status < 500, `${scenario.name} returned ${result.status} for allowed ${role}`);
        } else {
          assert.equal(result.status, 403, `${scenario.name} allowed forbidden ${role}`);
        }
        matrix.push({ policy: scenario.name, role, allowed, status: result.status });
      }
    }

    const successId = "PHASE8-AUDIT-SUCCESS";
    const success = await request({
      method: "PATCH",
      path: "/api/work-orders/C-2690711-D-TS-981",
      role: "maintenance_supervisor",
      requestId: successId,
      body: { note: "PHASE8-AFTER" },
    });
    assert.equal(success.status, 200);
    assert.equal(success.body.row.note, "PHASE8-AFTER");
    const successAudit = await waitForAudit(successId);
    assert.equal(successAudit.actor_role, "maintenance_supervisor");
    assert.equal(successAudit.response_status, 200);
    assert.equal(successAudit.action_code, "WORK_ORDER_UPDATE");
    assert.equal(successAudit.before_summary.note, "PHASE8-BEFORE");
    assert.equal(successAudit.after_summary.note, "PHASE8-AFTER");
    assert.equal(successAudit.metadata.adapter, "api");
    assert.ok(successAudit.actor_id);
    assert.ok(successAudit.ip_address);

    const deniedId = "PHASE8-MATRIX-work-order-viewer";
    const deniedAudit = await waitForAudit(deniedId);
    assert.equal(deniedAudit.actor_role, "viewer");
    assert.equal(deniedAudit.response_status, 403);
    assert.equal(deniedAudit.request_payload.password, "[REDACTED]");
    assert.ok(deniedAudit.after_summary.error);

    const anonymousMutationId = "PHASE8-ANON-MUTATION";
    const anonymousMutation = await request({ method: "POST", path: "/api/work-orders", requestId: anonymousMutationId, body: {} });
    assert.equal(anonymousMutation.status, 401);
    const anonymousAudit = await waitForAudit(anonymousMutationId);
    assert.equal(anonymousAudit.actor_id, null);
    assert.equal(anonymousAudit.actor_role, null);
    assert.equal(anonymousAudit.response_status, 401);

    const auditCount = await query(`SELECT count(*)::int AS count FROM operation_audit_log WHERE request_id LIKE 'PHASE8-%'`);
    const forbiddenCount = matrix.filter((item) => !item.allowed).length;
    console.log(JSON.stringify({
      ok: true,
      roleCount: ALL_ROLES.length,
      policyCount: scenarios.length,
      matrixChecks: matrix.length,
      forbiddenChecks: forbiddenCount,
      anonymousReadStatus: anonymousRead.status,
      auditRows: auditCount.rows[0].count,
      successfulAudit: {
        requestId: successAudit.request_id,
        actorRole: successAudit.actor_role,
        before: successAudit.before_summary,
        after: successAudit.after_summary,
      },
    }, null, 2));
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
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
