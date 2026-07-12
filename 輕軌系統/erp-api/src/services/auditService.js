const { randomUUID } = require("node:crypto");
const { query } = require("../db");

const SENSITIVE_KEYS = new Set(["password", "token", "authorization", "accesstoken", "refreshtoken"]);
const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;

function sanitizedPayload(value, depth = 0) {
  if (depth > 4 || value === null || value === undefined) return value ?? null;
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => sanitizedPayload(item, depth + 1));
  if (typeof value !== "object") return typeof value === "string" ? value.slice(0, 2000) : value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      SENSITIVE_KEYS.has(key.toLowerCase()) ? "[REDACTED]" : sanitizedPayload(item, depth + 1),
    ])
  );
}

function entityFromPath(pathname) {
  const parts = String(pathname || "").split("?")[0].split("/").filter(Boolean);
  const actionSuffixes = new Set(["finish", "actions", "complete", "print-jobs", "apply", "publish", "generate", "replan"]);
  const last = parts.at(-1) || null;
  return {
    entityType: parts[1] || "api",
    entityId: parts.length > 2 ? decodeURIComponent(actionSuffixes.has(last) ? parts.at(-2) : last) : null,
  };
}

function requestContextMiddleware(req, res, next) {
  const requestedId = String(req.get("x-request-id") || "").trim();
  req.requestId = REQUEST_ID_PATTERN.test(requestedId) ? requestedId : randomUUID();
  res.set("X-Request-Id", req.requestId);
  next();
}

function setAuditContext(req, context = {}) {
  req.auditContext = {
    ...(req.auditContext || {}),
    ...context,
    ...(context.beforeSummary !== undefined ? { beforeSummary: sanitizedPayload(context.beforeSummary) } : {}),
    ...(context.afterSummary !== undefined ? { afterSummary: sanitizedPayload(context.afterSummary) } : {}),
  };
}

function responseSummary(body) {
  if (!body || typeof body !== "object") return sanitizedPayload(body);
  return sanitizedPayload(body.item ?? body.row ?? body.movement ?? body.consumption ?? body);
}

async function recordMutationAudit(req, responseStatus) {
  const inferred = entityFromPath(req.originalUrl);
  const context = req.auditContext || {};
  const entityType = context.entityType || inferred.entityType;
  const entityId = context.entityId || inferred.entityId;
  const actorId = req.user?.id && req.user.id !== "preview-user" ? req.user.id : null;
  const beforeSummary = context.beforeSummary === undefined ? null : JSON.stringify(context.beforeSummary);
  const afterSummary = context.afterSummary === undefined ? null : JSON.stringify(context.afterSummary);
  await query(
    `INSERT INTO operation_audit_log (
       actor_id,actor_text,actor_role,action_code,entity_type,entity_id,entity_no,
       request_method,request_path,request_id,response_status,request_payload,
       before_summary,after_summary,metadata,ip_address,user_agent
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb,$14::jsonb,$15::jsonb,$16,$17)`,
    [
      actorId,
      req.user?.displayName || "Unknown user",
      req.user?.role || null,
      context.actionCode || `${req.method} ${entityType}`,
      entityType,
      entityId,
      context.entityNo || req.params?.no || req.params?.partNo || null,
      req.method,
      req.originalUrl,
      req.requestId || null,
      responseStatus,
      JSON.stringify(sanitizedPayload(req.body || {})),
      beforeSummary,
      afterSummary,
      JSON.stringify({ adapter: req.user?.adapter || null, ...(context.metadata || {}) }),
      req.ip || null,
      req.get("user-agent") || null,
    ]
  );
}

function mutationAuditMiddleware(req, res, next) {
  if (!MUTATION_METHODS.has(req.method)) return next();
  const sendJson = res.json.bind(res);
  res.json = (body) => {
    if (req.auditContext?.afterSummary === undefined) {
      setAuditContext(req, { afterSummary: responseSummary(body) });
    }
    return sendJson(body);
  };
  res.on("finish", () => {
    recordMutationAudit(req, res.statusCode).catch((error) => {
      if (error.code !== "42P01") console.error("operation audit failed", error);
    });
  });
  return next();
}

module.exports = {
  mutationAuditMiddleware,
  recordMutationAudit,
  requestContextMiddleware,
  sanitizedPayload,
  entityFromPath,
  responseSummary,
  setAuditContext,
};
