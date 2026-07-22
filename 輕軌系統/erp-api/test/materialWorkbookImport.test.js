const test = require("node:test");
const assert = require("node:assert/strict");

const {
  compareMaterialRow,
  markDuplicateNaturalKeys,
  normalizeMaterialRow,
} = require("../src/services/materialWorkbookImport");

function lookups() {
  return {
    systems: new Map([["50", { systemName: "輕軌電聯車", property: "專屬物料" }]]),
    categories: new Map([["50|83", { categoryName: "電聯車特殊設備車門類" }]]),
    subsystems: new Map([["DOOR", "車門系統"]]),
    units: new Set(["PC"]),
  };
}

function source(overrides = {}) {
  return {
    system_code: "50",
    category_code: "83",
    sequence_no: "1",
    type_code: "lo",
    part_no: "50.83.0001.LO",
    material_name: "車門按鈕墊塊",
    spec: "鋁合金",
    unit: "pc",
    material_property: "專屬物料",
    system_name: "輕軌電聯車",
    source_subsystem_code: "DOOR",
    category_name: "電聯車特殊設備車門類",
    safety_level: "2",
    repairable: "否",
    is_serialized: "否",
    reorder_point: 3,
    lead_time_days: 30,
    estimated_unit_price: 120,
    market_available: "是",
    review_note: "測試",
    ...overrides,
  };
}

test("normalizes a valid material workbook row", () => {
  const row = normalizeMaterialRow(source(), lookups());
  assert.equal(row.naturalKey, "50.83.0001.LO");
  assert.equal(row.validationStatus, "VALID");
  assert.equal(row.normalized.sequence_no, "0001");
  assert.equal(row.normalized.repairable, false);
  assert.equal(row.normalized.market_available, true);
  assert.equal(row.normalized.source_subsystem_name, "車門系統");
});

test("keeps blank nullable market availability as null", () => {
  const row = normalizeMaterialRow(source({ market_available: "" }), lookups());
  assert.equal(row.validationStatus, "VALID");
  assert.equal(row.normalized.market_available, null);
});

test("keeps unknown safety and subsystem as review warnings", () => {
  const row = normalizeMaterialRow(source({ safety_level: "30", source_subsystem_code: "UNKNOWN" }), lookups());
  assert.equal(row.validationStatus, "WARNING");
  assert.equal(row.normalized.safety_level, null);
  assert.deepEqual(row.messages.map((item) => item.code), ["UNKNOWN_SUBSYSTEM", "UNKNOWN_SAFETY_LEVEL"]);
});

test("does not replace a source category name with a corrupted lookup value", () => {
  const sourceLookups = lookups();
  sourceLookups.categories.set("50|83", {
    categoryName: null,
    rawCategoryName: "[object Object]",
  });
  const row = normalizeMaterialRow(source(), sourceLookups);
  assert.equal(row.validationStatus, "WARNING");
  assert.equal(row.normalized.category_name, "電聯車特殊設備車門類");
  assert.ok(row.messages.some((item) => item.code === "INVALID_CATEGORY_LOOKUP_NAME"));
});

test("rejects a source part number that differs from computed segments", () => {
  const row = normalizeMaterialRow(source({ part_no: "50.83.9999.LO" }), lookups());
  assert.equal(row.validationStatus, "INVALID");
  assert.ok(row.messages.some((item) => item.code === "PART_NO_MISMATCH"));
});

test("marks every occurrence of a duplicate natural key invalid", () => {
  const first = { sourceRowNo: 2, naturalKey: "50.83.0001.LO", messages: [], validationStatus: "VALID" };
  const second = { sourceRowNo: 8, naturalKey: "50.83.0001.LO", messages: [], validationStatus: "VALID" };
  markDuplicateNaturalKeys([first, second]);
  assert.equal(first.validationStatus, "INVALID");
  assert.equal(second.validationStatus, "INVALID");
  assert.match(first.messages[0].message, /2, 8/);
});

test("classifies invalid, new, unchanged, and changed rows", () => {
  const normalized = normalizeMaterialRow(source(), lookups());
  const invalid = { ...normalized, validationStatus: "INVALID" };
  assert.equal(compareMaterialRow(invalid, new Map()).proposedAction, "REJECT");
  assert.equal(compareMaterialRow(normalized, new Map()).proposedAction, "INSERT");

  const existing = { id: "00000000-0000-0000-0000-000000000001", ...normalized.normalized };
  const unchanged = compareMaterialRow(normalized, new Map([[normalized.naturalKey, existing]]));
  assert.equal(unchanged.proposedAction, "NO_CHANGE");
  assert.deepEqual(unchanged.differences, []);

  const changed = compareMaterialRow(normalized, new Map([[
    normalized.naturalKey,
    { ...existing, material_name: "舊名稱" },
  ]]));
  assert.equal(changed.proposedAction, "UPDATE");
  assert.deepEqual(changed.differences.map((item) => item.field), ["material_name"]);
});
