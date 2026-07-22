import { createHash } from "node:crypto";

export const BOOTSTRAP_RECORD_TYPE = "BOOTSTRAP_WORKSPACE_CANDIDATE";
export const BOOTSTRAP_ASSURANCE = "INTERNAL_CONSISTENCY_ONLY";
export const VALIDATOR_VERSION = "PHASE1-BOOTSTRAP-3";

export function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}

export function sha256(value) {
  return createHash("sha256").update(Buffer.isBuffer(value) ? value : String(value)).digest("hex").toUpperCase();
}

export function canonicalSha256(value) {
  return sha256(JSON.stringify(canonical(value)));
}

function recordPayload(record) {
  const { record_payload_sha256: _ignored, ...payload } = record;
  return payload;
}

export function createBootstrapWorkspaceCandidateRecord({ task_id, manifest_sha256, included_file_set_sha256, file_count, scanner_report_sha256, scan_contract_sha256, finding_registry_sha256, canonicalization_config_sha256, binary_oracle_config_sha256, binary_magic_registry_sha256, schema_set_sha256, generated_at, validator_version = VALIDATOR_VERSION }) {
  const payload = {
    schema_version: 3,
    record_type: BOOTSTRAP_RECORD_TYPE,
    assurance: BOOTSTRAP_ASSURANCE,
    governance_mode: "bootstrap",
    task_id,
    manifest_sha256,
    included_file_set_sha256,
    file_count,
    scanner_report_sha256,
    scan_contract_sha256,
    finding_registry_sha256,
    canonicalization_config_sha256,
    binary_oracle_config_sha256,
    binary_magic_registry_sha256,
    schema_set_sha256,
    generated_at,
    validator_version
  };
  return { ...payload, record_payload_sha256: canonicalSha256(payload) };
}

function requireSha(value, field, violations) {
  if (!/^[A-F0-9]{64}$/.test(value ?? "")) violations.push(`BOOTSTRAP_CANDIDATE ${field} must be uppercase SHA256.`);
}

export function validateBootstrapCandidateRecord(record, expected = {}) {
  const violations = [];
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return { ok: false, record: null, violations: ["BOOTSTRAP_CANDIDATE record object is required."] };
  }
  const legacyRequired = [
    "schema_version", "record_type", "assurance", "governance_mode", "task_id", "manifest_sha256",
    "included_file_set_sha256", "file_count", "scanner_report_sha256", "generated_at", "validator_version", "record_payload_sha256"
  ];
  const v2BindingFields = ["scan_contract_sha256", "finding_registry_sha256", "canonicalization_config_sha256", "binary_oracle_config_sha256"];
  const v3BindingFields = [...v2BindingFields, "binary_magic_registry_sha256", "schema_set_sha256"];
  const bindingFields = record.schema_version === 3 ? v3BindingFields : v2BindingFields;
  const required = record.schema_version === 1 ? legacyRequired : [...legacyRequired, ...bindingFields];
  for (const field of required) if (record[field] === undefined || record[field] === null || record[field] === "") violations.push(`BOOTSTRAP_CANDIDATE missing ${field}.`);
  for (const field of Object.keys(record)) if (!required.includes(field)) violations.push(`BOOTSTRAP_CANDIDATE unexpected field ${field}.`);
  if (![1, 2, 3].includes(record.schema_version)) violations.push("BOOTSTRAP_CANDIDATE schema_version must be 1, 2, or 3.");
  if (record.schema_version === 1 && record.validator_version !== "PHASE1-BOOTSTRAP-1") violations.push("BOOTSTRAP_CANDIDATE legacy validator_version mismatch.");
  if (record.schema_version === 2 && record.validator_version !== "PHASE1-BOOTSTRAP-2") violations.push("BOOTSTRAP_CANDIDATE v2 validator_version mismatch.");
  if (record.schema_version === 3 && record.validator_version !== VALIDATOR_VERSION) violations.push(`BOOTSTRAP_CANDIDATE validator_version must be ${VALIDATOR_VERSION}.`);
  if (record.record_type !== BOOTSTRAP_RECORD_TYPE) violations.push(`BOOTSTRAP_CANDIDATE unsupported record_type ${record.record_type ?? "<missing>"}.`);
  if (record.assurance !== BOOTSTRAP_ASSURANCE) violations.push(`BOOTSTRAP_CANDIDATE assurance must be ${BOOTSTRAP_ASSURANCE}.`);
  if (record.governance_mode !== "bootstrap") violations.push("BOOTSTRAP_CANDIDATE governance_mode must be bootstrap.");
  for (const field of ["manifest_sha256", "included_file_set_sha256", "scanner_report_sha256", "record_payload_sha256", ...(record.schema_version === 2 ? bindingFields : [])]) requireSha(record[field], field, violations);
  if (!Number.isInteger(record.file_count) || record.file_count < 1) violations.push("BOOTSTRAP_CANDIDATE file_count must be a positive integer.");
  if (!Number.isFinite(Date.parse(record.generated_at))) violations.push("BOOTSTRAP_CANDIDATE generated_at must be an ISO date-time.");
  if (record.record_payload_sha256 !== canonicalSha256(recordPayload(record))) violations.push("BOOTSTRAP_CANDIDATE payload hash mismatch.");
  for (const field of ["task_id", "manifest_sha256", "included_file_set_sha256", "file_count", "scanner_report_sha256", "record_type", "assurance", ...bindingFields]) {
    if (expected[field] !== undefined && record[field] !== expected[field]) violations.push(`BOOTSTRAP_CANDIDATE ${field} does not match expected subject.`);
  }
  return { ok: violations.length === 0, record: violations.length === 0 ? Object.freeze({ ...record }) : null, violations };
}
