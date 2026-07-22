const test = require("node:test");
const assert = require("node:assert/strict");
const { canonicalStringify, hashValue } = require("../scripts/lib/compatibilityEvidence");

test("compatibility hash normalizes JSON key order, null, and timestamps", () => {
  const left = {
    timestamp: new Date("2026-07-16T01:02:03.000+08:00"),
    payload: { z: null, a: 1 },
  };
  const right = {
    payload: { a: 1, z: null },
    timestamp: new Date("2026-07-15T17:02:03.000Z"),
  };
  assert.equal(canonicalStringify(left), canonicalStringify(right));
  assert.equal(hashValue(left), hashValue(right));
});

test("compatibility hash keeps array order significant", () => {
  assert.notEqual(hashValue([1, 2]), hashValue([2, 1]));
});
