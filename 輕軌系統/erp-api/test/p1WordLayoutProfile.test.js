const test = require("node:test");
const assert = require("node:assert/strict");
const { seatCoordinates } = require("../scripts/build-p1-word-layout-profile");

test("P1 seat overlay coordinates match every seat in the official M5 to M1 drawing", () => {
  const coordinates = seatCoordinates();
  assert.equal(Object.keys(coordinates).length, 62);
  assert.ok(coordinates["M4-R3-C3"]);
  assert.ok(coordinates["M5-R1-C4"]);
  assert.ok(coordinates["M2-R2-C5"]);
  assert.ok(coordinates["M1-R4-C5"]);
  assert.equal(coordinates["M4-R2-C1"], undefined);
});
