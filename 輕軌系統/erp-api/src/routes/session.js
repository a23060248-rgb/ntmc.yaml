const express = require("express");
const { withTransaction } = require("../db");
const { ALL_ROLES } = require("../config/rolePolicy");
const { resolveAuth } = require("../middleware/auth");
const { asyncHandler, httpError } = require("../middleware/errorHandler");
const { setAuditContext } = require("../services/auditService");
const {
  createSessionCredential,
  serializeSessionCookie,
  sessionExpiryDate,
  verifyPassword,
} = require("../services/sessionService");

const router = express.Router();
const VALID_ROLES = new Set(ALL_ROLES);
const MAX_FAILED_LOGINS = Math.max(3, Number(process.env.MAX_FAILED_LOGINS || 5));
const LOCK_MINUTES = Math.max(1, Number(process.env.LOGIN_LOCK_MINUTES || 15));
const DUMMY_PASSWORD_HASH =
  "scrypt$16384$8$1$MDAwMDAwMDAwMDAwMDAwMA$yfySdRul68Vo2P3bvhmgHHH6xsWWW0bR9it8HLs-nJk";

function publicSession(row) {
  return {
    user: {
      id: row.id,
      displayName: row.display_name,
      department: row.department || undefined,
      role: VALID_ROLES.has(row.system_role) ? row.system_role : "viewer",
    },
    issuedAt: new Date(row.created_at).toISOString(),
    expiresAt: new Date(row.expires_at).toISOString(),
    adapter: "api",
  };
}

router.post("/login", asyncHandler(async (req, res) => {
  const account = String(req.body?.account || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  if (!account || account.length > 200 || !password || password.length > 256) {
    throw httpError(400, "請輸入帳號與密碼");
  }

  setAuditContext(req, {
    actionCode: "SESSION_LOGIN",
    entityType: "session",
    entityNo: account,
    beforeSummary: { account, authenticated: false },
  });

  const outcome = await withTransaction(async (client) => {
    const result = await client.query(
      `SELECT id, employee_no, display_name, department, account, password_hash,
              status, is_active, system_role, failed_login_count, locked_until
         FROM app_user
        WHERE lower(account) = $1
        LIMIT 1
        FOR UPDATE`,
      [account],
    );
    const user = result.rows[0] || null;

    if (user?.locked_until && new Date(user.locked_until) > new Date()) {
      await verifyPassword(password, user.password_hash || DUMMY_PASSWORD_HASH);
      return { error: "LOCKED", lockedUntil: user.locked_until };
    }

    const passwordMatches = await verifyPassword(
      password,
      user?.password_hash || DUMMY_PASSWORD_HASH,
    );
    if (!user || !passwordMatches) {
      if (user) {
        await client.query(
          `UPDATE app_user
              SET failed_login_count = failed_login_count + 1,
                  locked_until = CASE
                    WHEN failed_login_count + 1 >= $2
                    THEN now() + ($3::text || ' minutes')::interval
                    ELSE NULL
                  END,
                  updated_at = now()
            WHERE id = $1`,
          [user.id, MAX_FAILED_LOGINS, LOCK_MINUTES],
        );
      }
      return { error: "INVALID" };
    }

    if (!user.is_active || Number(user.status) === 2) return { error: "INACTIVE" };
    if (Number(user.status) === 1) return { error: "PENDING" };
    if (Number(user.status) === 9) return { error: "RESET_REQUIRED" };

    const credential = createSessionCredential();
    const expiresAt = sessionExpiryDate();
    const session = await client.query(
      `INSERT INTO user_session (
         token, token_hash, user_id, created_at, expires_at,
         last_seen_at, ip_address, user_agent
       ) VALUES ($1,$2,$3,now(),$4,now(),$5,$6)
       RETURNING token, created_at, expires_at`,
      [
        credential.rowToken,
        credential.tokenHash,
        user.id,
        expiresAt,
        req.ip || null,
        req.get("user-agent") || null,
      ],
    );
    await client.query(
      `UPDATE app_user
          SET failed_login_count=0,
              locked_until=NULL,
              last_login_at=now(),
              updated_at=now()
        WHERE id=$1`,
      [user.id],
    );
    await client.query(
      `DELETE FROM user_session
        WHERE user_id=$1
          AND token <> $2
          AND (expires_at < now() - interval '30 days' OR revoked_at < now() - interval '30 days')`,
      [user.id, credential.rowToken],
    );
    return {
      user,
      rawToken: credential.rawToken,
      createdAt: session.rows[0].created_at,
      expiresAt: session.rows[0].expires_at,
    };
  });

  if (outcome.error === "LOCKED") {
    setAuditContext(req, { afterSummary: { account, authenticated: false, reason: "LOCKED" } });
    throw httpError(423, "帳號暫時鎖定，請稍後再試", { lockedUntil: outcome.lockedUntil });
  }
  if (outcome.error === "INVALID") {
    setAuditContext(req, { afterSummary: { account, authenticated: false, reason: "INVALID" } });
    throw httpError(401, "帳號或密碼錯誤");
  }
  if (outcome.error) {
    setAuditContext(req, { afterSummary: { account, authenticated: false, reason: outcome.error } });
    const messages = {
      INACTIVE: "帳號已停用",
      PENDING: "帳號尚待審核",
      RESET_REQUIRED: "帳號必須先重設密碼",
    };
    throw httpError(403, messages[outcome.error] || "帳號無法登入");
  }

  const row = {
    ...outcome.user,
    created_at: outcome.createdAt,
    expires_at: outcome.expiresAt,
  };
  req.user = {
    id: row.id,
    displayName: row.display_name,
    department: row.department,
    role: VALID_ROLES.has(row.system_role) ? row.system_role : "viewer",
    adapter: "api",
  };
  setAuditContext(req, {
    entityId: row.id,
    afterSummary: { account, authenticated: true, role: req.user.role },
  });
  res.set("Set-Cookie", serializeSessionCookie(outcome.rawToken));
  res.json(publicSession(row));
}));

router.get("/", resolveAuth, (req, res) => {
  res.json({
    user: {
      id: req.user.id,
      displayName: req.user.displayName,
      department: req.user.department || undefined,
      role: req.user.role,
    },
    issuedAt: new Date(req.authSession.createdAt).toISOString(),
    expiresAt: new Date(req.authSession.expiresAt).toISOString(),
    adapter: "api",
  });
});

router.post("/logout", resolveAuth, asyncHandler(async (req, res) => {
  await withTransaction(async (client) => {
    await client.query(
      `UPDATE user_session SET revoked_at=now(), last_seen_at=now() WHERE token=$1`,
      [req.authSession.rowToken],
    );
  });
  setAuditContext(req, {
    actionCode: "SESSION_LOGOUT",
    entityType: "session",
    entityId: req.user.id,
    beforeSummary: { authenticated: true, role: req.user.role },
    afterSummary: { authenticated: false },
  });
  res.set("Set-Cookie", serializeSessionCookie("", { clear: true }));
  res.status(204).end();
}));

module.exports = router;
