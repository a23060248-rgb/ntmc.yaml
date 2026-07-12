const test = require("node:test");
const assert = require("node:assert/strict");
const { canonicalStringify, hashTemplateSnapshot } = require("../src/services/pmTemplateSnapshot");

test("template snapshot hash is stable across object key order", () => {
  const left = { template: { version: "2", code: "P1" }, checks: [{ item: "A1", required: true }] };
  const right = { checks: [{ required: true, item: "A1" }], template: { code: "P1", version: "2" } };
  assert.equal(canonicalStringify(left), canonicalStringify(right));
  assert.equal(hashTemplateSnapshot(left), hashTemplateSnapshot(right));
});

test("template snapshot hash changes when a required definition changes", () => {
  const original = { checks: [{ item: "A1", required: true }] };
  const revised = { checks: [{ item: "A1", required: false }] };
  assert.notEqual(hashTemplateSnapshot(original), hashTemplateSnapshot(revised));
});
