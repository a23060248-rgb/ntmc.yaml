const test = require("node:test");
const assert = require("node:assert/strict");
const { canonicalize, requestHash, validateKey } = require("../src/services/idempotencyService");

test("idempotency hashes are stable across object key order", () => {
  assert.equal(
    requestHash("CONSUME", { qty: 2, partNo: "A" }),
    requestHash("CONSUME", { partNo: "A", qty: 2 })
  );
  assert.deepEqual(canonicalize({ z: 1, a: { d: 2, b: 1 } }), { a: { b: 1, d: 2 }, z: 1 });
});

test("inventory posting requires a bounded idempotency key", () => {
  assert.equal(validateKey("phase7-key"), "phase7-key");
  assert.throws(() => validateKey(""), /required/);
  assert.throws(() => validateKey("x".repeat(161)), /too long/);
});
