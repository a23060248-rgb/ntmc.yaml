const { query } = require("../db");
const { asyncHandler, httpError } = require("./errorHandler");
const { ALL_ROLES } = require("../config/rolePolicy");
const { hashSessionToken, sessionTokenFromRequest } = require("../services/sessionService");

const VALID_ROLES = new Set(ALL_ROLES);

function decodeHeaderValue(value, fallback = "") {
  if (!value) return fallback;
  try {
    return decodeURIComponent(String(value));
  } catch {
    return String(value);
  }
}

const resolveAuth = asyncHandler(async (req, res, next) => {
  const mode = String(process.env.AUTH_MODE || "preview").toLowerCase();
  if (mode !== "api") {
    const requestedRole = String(req.get("x-user-role") || process.env.PREVIEW_USER_ROLE || "system_admin");
    req.user = {
      id: "preview-user",
      displayName: decodeHeaderValue(req.get("x-user-name"), "預覽使用者"),
      role: VALID_ROLES.has(requestedRole) ? requestedRole : "viewer",
      adapter: "preview"
    };
    return next();
  }

  const token = sessionTokenFromRequest(req);
  if (!token) throw httpError(401, "尚未登入");
  const tokenHash = hashSessionToken(token);

  const result = await query(
    `SELECT u.id,
            u.display_name,
            u.department,
            COALESCE(to_jsonb(u)->>'system_role', 'viewer') AS system_role,
            s.token AS session_row_token,
            s.created_at,
            s.expires_at,
            s.last_seen_at
       FROM user_session s
       JOIN app_user u ON u.id = s.user_id
      WHERE ((s.token_hash IS NOT NULL AND s.token_hash = $1)
             OR (s.token_hash IS NULL AND s.token = $2))
        AND s.expires_at > now()
        AND s.revoked_at IS NULL
        AND u.is_active = true
      LIMIT 1`,
    [tokenHash, token]
  );
  if (!result.rows.length) throw httpError(401, "登入已失效");
  const row = result.rows[0];
  req.user = {
    id: row.id,
    displayName: row.display_name,
    department: row.department,
    role: VALID_ROLES.has(row.system_role) ? row.system_role : "viewer",
    adapter: "api"
  };
  req.authSession = {
    rowToken: row.session_row_token,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
  if (!row.last_seen_at || Date.now() - new Date(row.last_seen_at).getTime() > 5 * 60 * 1000) {
    await query(
      `UPDATE user_session SET last_seen_at=now() WHERE token=$1 AND revoked_at IS NULL`,
      [row.session_row_token]
    );
  }
  next();
});

function requireRoles(...roles) {
  return (req, res, next) => {
    if (!req.user) return next(httpError(401, "尚未登入"));
    if (!roles.includes(req.user.role)) return next(httpError(403, "沒有執行此操作的權限"));
    return next();
  };
}

module.exports = { resolveAuth, requireRoles, VALID_ROLES, decodeHeaderValue };
