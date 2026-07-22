import { readFile } from "node:fs/promises";
import path from "node:path";
import { safeExistingPath, validateRelativeRef } from "../path-safety.mjs";
import { sha256 } from "./typed-proof.mjs";

export const ACTIVE_MANIFEST_CONTRACT_VERSION = 2;
export const REQUIRED_ACTIVE_EVIDENCE_TYPES = Object.freeze(["security_evidence", "test_evidence", "review_findings"]);
const EVIDENCE_CLASS = "typed_evidence";

function structural(errors, code, detail) { errors.push(`REFERENCED_EVIDENCE ${code}: ${detail}`); }
function exactTaskPrefix(taskId) { return `.codex/tasks/${taskId}/`; }

export async function resolveReferencedEvidence({ projectRoot, taskId, manifest, schemaSet }) {
  const errors = [], resolved = [], declared = [];
  const active = manifest?.manifest_contract_version === ACTIVE_MANIFEST_CONTRACT_VERSION;
  if (!active) {
    return {
      active_manifest_contract: false,
      manifest_contract_version: manifest?.manifest_contract_version ?? null,
      disposition: "HISTORICAL_FORMAT_UNSUPPORTED_FOR_ACTIVE_GATE",
      complete: false,
      errors: [],
      declared_count: 0,
      required_count: REQUIRED_ACTIVE_EVIDENCE_TYPES.length,
      resolved_count: 0,
      validated_count: 0,
      invalid_count: 0,
      unresolved_count: REQUIRED_ACTIVE_EVIDENCE_TYPES.length,
      duplicate_count: 0,
      required_types: [...REQUIRED_ACTIVE_EVIDENCE_TYPES],
      satisfied_required_types: [],
      missing_required_types: [...REQUIRED_ACTIVE_EVIDENCE_TYPES],
      evidence: []
    };
  }
  const registry = schemaSet?.evidenceRegistry;
  const byType = schemaSet?.evidenceByType;
  if (!registry || !byType) structural(errors, "REGISTRY_UNAVAILABLE", "Official evidence-schema registry is unavailable.");
  const artifacts = Array.isArray(manifest?.artifacts) ? manifest.artifacts : [];
  for (const artifact of artifacts) {
    const evidenceFields = ["evidence_type", "required", "schema_id", "referenced_by"];
    const hasEvidenceMetadata = evidenceFields.some((field) => Object.hasOwn(artifact ?? {}, field)) || artifact?.artifact_class === EVIDENCE_CLASS;
    if (!hasEvidenceMetadata) continue;
    if (artifact?.artifact_class !== EVIDENCE_CLASS || evidenceFields.some((field) => !Object.hasOwn(artifact, field))) {
      structural(errors, "MANIFEST_METADATA_INCOMPLETE", `${artifact?.artifact_id ?? "<missing>"} must declare artifact_class, evidence_type, required, schema_id, and referenced_by.`);
      continue;
    }
    if (typeof artifact.required !== "boolean" || !Array.isArray(artifact.referenced_by) || !artifact.referenced_by.length || artifact.referenced_by.some((item) => typeof item !== "string" || !item)) structural(errors, "MANIFEST_METADATA_INVALID", `${artifact.artifact_id} has invalid required/referenced_by metadata.`);
    declared.push(artifact);
  }
  const pathKeys = new Map(), physicalKeys = new Map(), typePaths = new Map();
  for (const artifact of declared) {
    const entry = byType?.get(artifact.evidence_type);
    if (!entry) { structural(errors, "UNREGISTERED_EVIDENCE_TYPE", `${artifact.artifact_id} declares ${artifact.evidence_type}.`); continue; }
    if (artifact.schema_id !== entry.schema_id) structural(errors, "SCHEMA_ID_MISMATCH", `${artifact.artifact_id} schema_id does not match registry.`);
    let normalized, physical;
    try {
      if (artifact.path.includes("\\")) throw new Error("Backslashes are forbidden.");
      normalized = validateRelativeRef(artifact.path);
      const prefix = exactTaskPrefix(taskId);
      if (!normalized.startsWith(prefix) || normalized.length <= prefix.length) throw new Error(`Path must remain under exact Task root ${prefix}`);
      const lower = normalized.toLowerCase();
      if (pathKeys.has(lower)) structural(errors, "CASE_OR_PATH_COLLISION", `${artifact.path} collides with ${pathKeys.get(lower)}.`);
      else pathKeys.set(lower, artifact.path);
      physical = await safeExistingPath(projectRoot, normalized);
      const physicalKey = path.resolve(physical).toLowerCase();
      if (physicalKeys.has(physicalKey)) structural(errors, "DUPLICATE_PHYSICAL_PATH", `${artifact.path} aliases ${physicalKeys.get(physicalKey)}.`);
      else physicalKeys.set(physicalKey, artifact.path);
    } catch (error) { structural(errors, "PATH_INVALID", `${artifact.path}: ${error.message}`); continue; }
    const typePathKey = `${artifact.evidence_type}|${normalized.toLowerCase()}`;
    if (typePaths.has(typePathKey)) structural(errors, "CONFLICTING_TYPE_PATH", `${artifact.evidence_type} duplicates ${artifact.path}.`);
    else typePaths.set(typePathKey, artifact.artifact_id);
    let bytes, document;
    try { bytes = await readFile(physical); }
    catch (error) { structural(errors, "READ_FAILED", `${artifact.path}: ${error.message}`); continue; }
    if (sha256(bytes) !== String(artifact.sha256 ?? "").toUpperCase()) structural(errors, "SHA256_MISMATCH", artifact.path);
    try { document = JSON.parse(bytes.toString("utf8")); }
    catch (error) { structural(errors, "PARSE_FAILED", `${artifact.path}: ${error.message}`); continue; }
    const schemaDeclaresDocumentVersion = Object.hasOwn(schemaSet?.byRef?.get(entry.schema_path)?.properties ?? {}, "schema_version");
    if (schemaDeclaresDocumentVersion && document?.schema_version !== entry.schema_version) structural(errors, "SCHEMA_VERSION_MISMATCH", `${artifact.path} declares ${document?.schema_version ?? "missing"}; registry requires ${entry.schema_version}.`);
    const taskBindingValid = entry.evidence_type === "railway_domain_review" || document?.task_id === taskId;
    if (!taskBindingValid) structural(errors, "TASK_BINDING_MISMATCH", `${artifact.path} task_id does not match ${taskId}.`);
    const issues = schemaSet?.validate(entry.schema_path, document, artifact.path) ?? ["Schema set unavailable."];
    for (const issue of issues) structural(errors, "SCHEMA_INVALID", issue);
    resolved.push({ artifact_id: artifact.artifact_id, evidence_id: artifact.artifact_id, evidence_type: artifact.evidence_type, path: artifact.path, normalized_path: normalized, required: artifact.required, schema_id: artifact.schema_id, declared_schema_id: artifact.schema_id, resolved_schema_id: entry.schema_id, schema_path: entry.schema_path, schema_sha256: entry.schema_sha256, sha256: sha256(bytes), content_sha256: sha256(bytes), schema_valid: issues.length === 0, schema_validation: issues.length === 0 ? "PASS" : "FAIL", task_binding_valid: taskBindingValid, referenced_by: artifact.referenced_by, document });
  }
  for (const entry of registry?.entries ?? []) {
    const matches = declared.filter((item) => item.evidence_type === entry.evidence_type);
    if (!entry.allow_multiple && matches.length > 1) structural(errors, "MULTIPLICITY_VIOLATION", `${entry.evidence_type} resolved ${matches.length} times.`);
  }
  const satisfied = REQUIRED_ACTIVE_EVIDENCE_TYPES.filter((type) => resolved.some((item) => item.evidence_type === type && item.required && item.schema_valid && item.task_binding_valid));
  const missing = REQUIRED_ACTIVE_EVIDENCE_TYPES.filter((type) => !satisfied.includes(type));
  const requiredResolvedTypes = new Set(resolved.filter((item) => item.required && REQUIRED_ACTIVE_EVIDENCE_TYPES.includes(item.evidence_type)).map((item) => item.evidence_type));
  const requiredValidatedTypes = new Set(resolved.filter((item) => item.required && item.schema_valid && item.task_binding_valid && REQUIRED_ACTIVE_EVIDENCE_TYPES.includes(item.evidence_type)).map((item) => item.evidence_type));
  const required_count = REQUIRED_ACTIVE_EVIDENCE_TYPES.length;
  const resolved_count = requiredResolvedTypes.size;
  const validated_count = requiredValidatedTypes.size;
  const invalid_count = resolved.filter((item) => !item.schema_valid || !item.task_binding_valid).length;
  const unresolved_count = missing.length + Math.max(0, declared.length - resolved.length);
  const duplicate_count = errors.filter((item) => /CASE_OR_PATH_COLLISION|DUPLICATE_PHYSICAL_PATH|CONFLICTING_TYPE_PATH|MULTIPLICITY_VIOLATION/.test(item)).length;
  const complete = errors.length === 0 && required_count === resolved_count && required_count === validated_count && invalid_count === 0 && unresolved_count === 0 && duplicate_count === 0;
  return { active_manifest_contract: true, manifest_contract_version: ACTIVE_MANIFEST_CONTRACT_VERSION, disposition: complete ? "COMPLETE" : "INCOMPLETE", complete, errors, declared_count: declared.length, required_count, resolved_count, validated_count, invalid_count, unresolved_count, duplicate_count, required_types: [...REQUIRED_ACTIVE_EVIDENCE_TYPES], satisfied_required_types: satisfied, missing_required_types: missing, evidence: resolved };
}
