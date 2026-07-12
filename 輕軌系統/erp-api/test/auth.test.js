const test = require("node:test");
const assert = require("node:assert/strict");
process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/not-connected";
const { decodeHeaderValue, requireRoles } = require("../src/middleware/auth");

function invoke(role, allowedRoles) {
  return new Promise((resolve) => {
    const middleware = requireRoles(...allowedRoles);
    middleware(role ? { user: { role } } : {}, {}, (error) => resolve(error || null));
  });
}

test("allowed role can execute a protected mutation", async () => {
  assert.equal(await invoke("warehouse_staff", ["system_admin", "warehouse_staff"]), null);
});

test("viewer cannot execute a protected mutation", async () => {
  const error = await invoke("viewer", ["system_admin", "warehouse_staff"]);
  assert.equal(error.status, 403);
});

test("anonymous request is rejected before mutation", async () => {
  const error = await invoke(null, ["system_admin"]);
  assert.equal(error.status, 401);
});

test("preview user name header preserves Unicode through URI encoding", () => {
  assert.equal(decodeHeaderValue(encodeURIComponent("系統管理員")), "系統管理員");
  assert.equal(decodeHeaderValue("%not-valid"), "%not-valid");
});
