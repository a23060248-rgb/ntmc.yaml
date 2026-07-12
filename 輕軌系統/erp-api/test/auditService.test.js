const test = require("node:test");
const assert = require("node:assert/strict");
process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/not-connected";
const { entityFromPath, requestContextMiddleware, sanitizedPayload, setAuditContext } = require("../src/services/auditService");

test("audit payload removes credentials while retaining business input", () => {
  assert.deepEqual(sanitizedPayload({ workOrderNo: "P-1150101-D-TS-001", password: "secret", nested: { token: "abc", qty: 2 } }), {
    workOrderNo: "P-1150101-D-TS-001",
    password: "[REDACTED]",
    nested: { token: "[REDACTED]", qty: 2 },
  });
});

test("audit entity derives from API route", () => {
  assert.deepEqual(entityFromPath("/api/work-orders/C-1150101-D-TS-001/finish"), {
    entityType: "work-orders",
    entityId: "C-1150101-D-TS-001",
  });
});

test("request context preserves a valid caller request id", () => {
  const req = { get: (name) => name.toLowerCase() === "x-request-id" ? "PHASE8-REQUEST-001" : "" };
  const headers = {};
  const res = { set: (name, value) => { headers[name] = value; } };
  let continued = false;
  requestContextMiddleware(req, res, () => { continued = true; });
  assert.equal(req.requestId, "PHASE8-REQUEST-001");
  assert.equal(headers["X-Request-Id"], "PHASE8-REQUEST-001");
  assert.equal(continued, true);
});

test("audit context sanitizes before and after summaries", () => {
  const req = {};
  setAuditContext(req, {
    beforeSummary: { status: "OPEN", token: "secret" },
    afterSummary: { status: "DONE", password: "secret" },
  });
  assert.deepEqual(req.auditContext.beforeSummary, { status: "OPEN", token: "[REDACTED]" });
  assert.deepEqual(req.auditContext.afterSummary, { status: "DONE", password: "[REDACTED]" });
});
