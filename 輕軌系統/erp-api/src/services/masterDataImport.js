const crypto = require("node:crypto");

const ENTITY_DEFINITIONS = Object.freeze({
  OPERATING_SITE: { required: ["site_code", "site_name"], key: ["site_code"] },
  TRAIN: { required: ["train_no", "site_code"], key: ["train_no"] },
  VENDOR: { required: ["vendor_code", "vendor_name"], key: ["vendor_code"] },
  WAREHOUSE: { required: ["warehouse_code", "warehouse_name"], key: ["warehouse_code"] },
  WAREHOUSE_BIN: { required: ["warehouse_code", "bin_code"], key: ["warehouse_code", "bin_code"] },
  MATERIAL: { required: ["part_no", "material_name"], key: ["part_no"] },
  EQUIPMENT_GROUP: { required: ["group_code", "group_name", "system_name"], key: ["group_code"] },
  EQUIPMENT_ALIAS: {
    required: ["source_system", "alias_name", "target_kind", "target_code"],
    key: ["source_system", "alias_name"],
  },
});

function normalizeScalar(value) {
  if (typeof value !== "string") return value;
  const normalized = value.trim();
  return normalized === "" ? null : normalized;
}

function stableObject(value) {
  if (Array.isArray(value)) return value.map(stableObject);
  if (value && typeof value === "object") {
    return Object.keys(value).sort().reduce((result, key) => {
      result[key] = stableObject(value[key]);
      return result;
    }, {});
  }
  return value;
}

function hashPayload(payload) {
  return crypto.createHash("sha256")
    .update(JSON.stringify(stableObject(payload)))
    .digest("hex")
    .toUpperCase();
}

function validateMasterDataRow(entityKind, payload) {
  const definition = ENTITY_DEFINITIONS[entityKind];
  if (!definition) throw new Error(`Unsupported Wave 1 entity kind: ${entityKind}`);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Master-data import payload must be an object");
  }

  const normalized = Object.fromEntries(
    Object.entries(payload).map(([key, value]) => [key, normalizeScalar(value)]),
  );
  const errors = definition.required
    .filter((field) => normalized[field] === null || normalized[field] === undefined)
    .map((field) => ({ code: "REQUIRED", field, message: `${field} is required` }));
  const warnings = [];

  if (entityKind === "EQUIPMENT_ALIAS") {
    normalized.target_kind = String(normalized.target_kind || "").toUpperCase() || null;
    if (normalized.target_kind && !["GROUP", "MATERIAL"].includes(normalized.target_kind)) {
      errors.push({ code: "INVALID_TARGET_KIND", field: "target_kind", message: "target_kind must be GROUP or MATERIAL" });
    }
  }
  if (entityKind === "TRAIN" && normalized.site_code) {
    normalized.site_code = String(normalized.site_code).toUpperCase();
    if (!["D", "K"].includes(normalized.site_code)) {
      errors.push({ code: "INVALID_SITE", field: "site_code", message: "site_code must be D or K" });
    }
  }

  const missingKey = definition.key.some((field) => normalized[field] === null || normalized[field] === undefined);
  const naturalKey = missingKey ? null : definition.key.map((field) => String(normalized[field])).join("|");
  return {
    entityKind,
    naturalKey,
    normalized,
    payloadHash: hashPayload(normalized),
    validationStatus: errors.length ? "INVALID" : warnings.length ? "WARNING" : "VALID",
    errors,
    warnings,
  };
}

module.exports = { ENTITY_DEFINITIONS, hashPayload, validateMasterDataRow };
