const test = require("node:test");
const assert = require("node:assert/strict");
const { ENTITY_DEFINITIONS, hashPayload, validateMasterDataRow } = require("../src/services/masterDataImport");

test("Wave 1 defines the eight approved master-data entity kinds", () => {
  assert.deepEqual(Object.keys(ENTITY_DEFINITIONS), [
    "OPERATING_SITE", "TRAIN", "VENDOR", "WAREHOUSE", "WAREHOUSE_BIN",
    "MATERIAL", "EQUIPMENT_GROUP", "EQUIPMENT_ALIAS",
  ]);
});

test("material rows are normalized and receive a stable natural key", () => {
  const result = validateMasterDataRow("MATERIAL", { part_no: " 50.88.0004.LO ", material_name: " 濾網 " });
  assert.equal(result.validationStatus, "VALID");
  assert.equal(result.naturalKey, "50.88.0004.LO");
  assert.equal(result.normalized.material_name, "濾網");
  assert.match(result.payloadHash, /^[0-9A-F]{64}$/);
});

test("warehouse-bin keys retain their parent warehouse", () => {
  const result = validateMasterDataRow("WAREHOUSE_BIN", { warehouse_code: "TH-CENTER", bin_code: "DMS0001" });
  assert.equal(result.naturalKey, "TH-CENTER|DMS0001");
  assert.equal(result.validationStatus, "VALID");
});

test("invalid train sites are rejected", () => {
  const result = validateMasterDataRow("TRAIN", { train_no: "101", site_code: "X" });
  assert.equal(result.validationStatus, "INVALID");
  assert.ok(result.errors.some((error) => error.code === "INVALID_SITE"));
});

test("equipment aliases require a canonical target kind", () => {
  const result = validateMasterDataRow("EQUIPMENT_ALIAS", {
    source_system: "FAULT_C", alias_name: "DCU控制器", target_kind: "free_text", target_code: "DCU",
  });
  assert.equal(result.validationStatus, "INVALID");
  assert.ok(result.errors.some((error) => error.code === "INVALID_TARGET_KIND"));
});

test("payload hashes ignore object key order", () => {
  assert.equal(hashPayload({ a: 1, b: 2 }), hashPayload({ b: 2, a: 1 }));
});
