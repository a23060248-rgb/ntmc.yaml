const assert = require("node:assert/strict");

process.env.NODE_ENV = "test";
process.env.ENV_FILE = process.env.ENV_FILE || ".env.test";
require("../src/config/loadEnvironment").loadEnvironment();
process.env.AUTH_MODE = "api";

const app = require("../src/app");
const { pool, query } = require("../src/db");
const { hashSessionToken } = require("../src/services/sessionService");

const PASSWORD = "Rehearsal!2026";
let baseUrl = "";

async function request(path, { method = "GET", body, cookie, requestId } = {}) {
  const headers = {
    accept: "application/json",
    "content-type": "application/json",
    "user-agent": "session-rehearsal-verifier",
    ...(requestId ? { "x-request-id": requestId } : {}),
    ...(cookie ? { cookie } : {}),
  };
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = { text }; }
  return {
    status: response.status,
    body: parsed,
    cookie: response.headers.get("set-cookie"),
  };
}

function cookiePair(setCookie) {
  return String(setCookie || "").split(";", 1)[0];
}

async function waitForAudit(requestId) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const result = await query(
      `SELECT * FROM operation_audit_log WHERE request_id=$1 ORDER BY created_at DESC LIMIT 1`,
      [requestId],
    );
    if (result.rowCount) return result.rows[0];
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`audit row not written for ${requestId}`);
}

async function setUserState(employeeNo, values) {
  const assignments = [];
  const params = [];
  Object.entries(values).forEach(([column, value], index) => {
    assignments.push(`${column}=$${index + 2}`);
    params.push(value);
  });
  await query(
    `UPDATE app_user SET ${assignments.join(",")}, updated_at=now() WHERE employee_no=$1`,
    [employeeNo, ...params],
  );
}

async function main() {
  await query(`DELETE FROM operation_audit_log WHERE request_id LIKE 'AUTH-REH-%'`);
  await query(`DELETE FROM user_session WHERE user_agent='session-rehearsal-verifier'`);
  await setUserState("REH-ADMIN", { failed_login_count: 0, locked_until: null });
  await setUserState("REH-VIEWER", { status: 0, is_active: true });
  await setUserState("REH-WAREHOUSE", { status: 0, is_active: true });
  await setUserState("REH-SCHEDULER", { status: 0, is_active: true, locked_until: null });

  const server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const wrong = await request("/api/session/login", {
      method: "POST",
      requestId: "AUTH-REH-WRONG",
      body: { account: "rehearsal.admin@example.invalid", password: "wrong-password" },
    });
    assert.equal(wrong.status, 401);
    const wrongAudit = await waitForAudit("AUTH-REH-WRONG");
    assert.equal(wrongAudit.request_payload.password, "[REDACTED]");
    assert.equal(JSON.stringify(wrongAudit).includes("wrong-password"), false);

    const login = await request("/api/session/login", {
      method: "POST",
      requestId: "AUTH-REH-LOGIN",
      body: { account: "rehearsal.admin@example.invalid", password: PASSWORD },
    });
    assert.equal(login.status, 200);
    assert.equal(login.body.user.role, "system_admin");
    assert.match(login.cookie, /HttpOnly/);
    assert.match(login.cookie, /SameSite=Lax/);
    const cookie = cookiePair(login.cookie);
    const rawToken = decodeURIComponent(cookie.split("=")[1]);
    const stored = await query(
      `SELECT token, token_hash, revoked_at FROM user_session
        WHERE token_hash=$1 AND user_agent='session-rehearsal-verifier'`,
      [hashSessionToken(rawToken)],
    );
    assert.equal(stored.rowCount, 1);
    assert.notEqual(stored.rows[0].token, rawToken);
    assert.equal(stored.rows[0].revoked_at, null);

    const current = await request("/api/session", { cookie });
    assert.equal(current.status, 200);
    assert.equal(current.body.user.displayName, "Rehearsal Admin");

    const protectedRead = await request("/api/work-orders?limit=1", { cookie });
    assert.equal(protectedRead.status, 200);

    await setUserState("REH-VIEWER", { status: 1 });
    const pending = await request("/api/session/login", {
      method: "POST",
      requestId: "AUTH-REH-PENDING",
      body: { account: "rehearsal.viewer@example.invalid", password: PASSWORD },
    });
    assert.equal(pending.status, 403);
    await setUserState("REH-VIEWER", { status: 0 });

    await setUserState("REH-WAREHOUSE", { is_active: false });
    const inactive = await request("/api/session/login", {
      method: "POST",
      requestId: "AUTH-REH-INACTIVE",
      body: { account: "rehearsal.warehouse@example.invalid", password: PASSWORD },
    });
    assert.equal(inactive.status, 403);
    await setUserState("REH-WAREHOUSE", { is_active: true });

    await setUserState("REH-SCHEDULER", { locked_until: new Date(Date.now() + 10 * 60 * 1000) });
    const locked = await request("/api/session/login", {
      method: "POST",
      requestId: "AUTH-REH-LOCKED",
      body: { account: "rehearsal.scheduler@example.invalid", password: PASSWORD },
    });
    assert.equal(locked.status, 423);
    await setUserState("REH-SCHEDULER", { locked_until: null, failed_login_count: 0 });

    const expiredRaw = "auth-rehearsal-expired-token";
    await query(
      `INSERT INTO user_session (
         token, token_hash, user_id, created_at, expires_at, last_seen_at, user_agent
       ) SELECT $1,$2,id,now()-interval '2 hours',now()-interval '1 hour',now()-interval '2 hours',$3
           FROM app_user WHERE employee_no='REH-ADMIN'`,
      ["auth-rehearsal-expired-row", hashSessionToken(expiredRaw), "session-rehearsal-verifier"],
    );
    const expired = await request("/api/session", { cookie: `ntmc_session=${expiredRaw}` });
    assert.equal(expired.status, 401);

    const logout = await request("/api/session/logout", {
      method: "POST",
      cookie,
      requestId: "AUTH-REH-LOGOUT",
    });
    assert.equal(logout.status, 204);
    assert.match(logout.cookie, /Max-Age=0/);
    const afterLogout = await request("/api/session", { cookie });
    assert.equal(afterLogout.status, 401);
    const revoked = await query(`SELECT revoked_at FROM user_session WHERE token=$1`, [stored.rows[0].token]);
    assert.ok(revoked.rows[0].revoked_at);

    const loginAudit = await waitForAudit("AUTH-REH-LOGIN");
    const logoutAudit = await waitForAudit("AUTH-REH-LOGOUT");
    assert.equal(loginAudit.actor_role, "system_admin");
    assert.equal(loginAudit.request_payload.password, "[REDACTED]");
    assert.equal(logoutAudit.actor_role, "system_admin");

    console.log(JSON.stringify({
      ok: true,
      loginStatus: login.status,
      sessionStatus: current.status,
      protectedReadStatus: protectedRead.status,
      wrongPasswordStatus: wrong.status,
      pendingStatus: pending.status,
      inactiveStatus: inactive.status,
      lockedStatus: locked.status,
      expiredStatus: expired.status,
      logoutStatus: logout.status,
      revokedAfterLogout: Boolean(revoked.rows[0].revoked_at),
      rawTokenStored: stored.rows[0].token === rawToken,
      passwordRedacted: loginAudit.request_payload.password === "[REDACTED]",
    }, null, 2));
  } finally {
    await setUserState("REH-VIEWER", { status: 0, is_active: true });
    await setUserState("REH-WAREHOUSE", { status: 0, is_active: true });
    await setUserState("REH-SCHEDULER", { status: 0, is_active: true, locked_until: null, failed_login_count: 0 });
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
