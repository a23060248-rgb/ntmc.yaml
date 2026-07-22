import { readFile } from "node:fs/promises";
import path from "node:path";
import { canonicalSha256, sha256 } from "../../scripts/lib/governance/typed-proof.mjs";
import { validateSchema } from "../../scripts/lib/schema-validator.mjs";
import { pathMatchesPattern } from "../../scripts/lib/governance/scope-lattice.mjs";

export const FUTURE_OUTPUT_PATTERN = /(^|\/)(reviewer-payloads\/|human-approval\.yaml$|qa-.*(?:report|output)|final-summary\.md$|review-baseline-after\.json$)/i;

export function normalizeExactPath(value) {
  if (typeof value !== "string" || !value.trim()) throw new Error("EMPTY_PATH");
  if (/^[A-Za-z]:/.test(value) || value.startsWith("/") || value.includes("\\")) throw new Error(`NON_REPOSITORY_RELATIVE_PATH:${value}`);
  const normalized = value.replace(/^\.\//, "");
  if (normalized.split("/").some((part) => part === "" || part === "." || part === "..")) throw new Error(`UNSAFE_PATH_SEGMENT:${value}`);
  if (/[*?\[\]{}]/.test(normalized)) throw new Error(`NON_EXACT_PATH:${value}`);
  return normalized;
}

export function scopePayload(scope) {
  const copy = structuredClone(scope);
  delete copy.scope_sha256;
  return copy;
}

export function computeScopeSha256(scope) {
  return canonicalSha256(scopePayload(scope));
}

function matchesForbidden(ref, patterns) {
  for (const pattern of patterns) {
    try { if (pathMatchesPattern(ref, pattern)) return true; }
    catch { if (ref === pattern) return true; }
  }
  return false;
}

export async function validateScopeSatisfiability({ projectRoot, scope, capabilityEntries }) {
  const issues = [];
  const allowed = new Set();
  for (const raw of scope.allowed_paths ?? []) {
    try { const ref = normalizeExactPath(raw); if (allowed.has(ref)) issues.push(`DUPLICATE_ALLOWED_PATH:${ref}`); allowed.add(ref); }
    catch (error) { issues.push(error.message); }
  }
  if (scope.directory_globs_allowed !== false) issues.push("DIRECTORY_GLOBS_MUST_BE_FALSE");
  if (scope.workspace_write_allowed !== false || scope.artifact_write_allowed !== false || scope.return_payload_only !== true || (scope.allowed_write_paths ?? []).length !== 0) issues.push("REVIEWER_MUST_BE_READ_ONLY_PAYLOAD_ONLY");
  if (scope.scope_sha256 !== computeScopeSha256(scope)) issues.push("SCOPE_SHA256_MISMATCH");
  const capabilityIds = new Map();
  const checks = [];
  for (const item of capabilityEntries) {
    capabilityIds.set(item.capability, (capabilityIds.get(item.capability) ?? 0) + 1);
    const check = { capability: item.capability, artifact_path: item.artifact_path, expected_sha256: item.expected_sha256, required: item.required === true, allowed: false, forbidden: false, exists: false, hash_match: false, future_output: false, result: "FAIL" };
    let ref;
    try { ref = normalizeExactPath(item.artifact_path); }
    catch (error) { issues.push(`${item.capability}:${error.message}`); checks.push(check); continue; }
    check.allowed = allowed.has(ref);
    check.forbidden = matchesForbidden(ref, scope.forbidden_paths ?? []);
    const subjectTaskPrefix = `.codex/tasks/${scope.task_id}/`;
    check.future_output = ref.startsWith(subjectTaskPrefix) && FUTURE_OUTPUT_PATTERN.test(ref);
    try {
      const body = await readFile(path.join(projectRoot, ...ref.split("/")));
      check.exists = true;
      check.actual_sha256 = sha256(body);
      check.hash_match = typeof item.expected_sha256 === "string" && item.expected_sha256 === check.actual_sha256;
    } catch { check.exists = false; }
    check.result = check.allowed && !check.forbidden && !check.future_output && check.exists && check.hash_match ? "PASS" : "FAIL";
    if (item.required && check.result !== "PASS") issues.push(`UNSATISFIED_CAPABILITY:${item.capability}:${ref}`);
    checks.push(check);
  }
  for (const [capability, count] of capabilityIds) if (count !== 1) issues.push(`CAPABILITY_IDENTITY_RESOLUTION_COUNT:${capability}:${count}`);
  return { scope_satisfiable: issues.length === 0, dispatch_authorized: issues.length === 0, issues: [...new Set(issues)].sort(), checks };
}

export function payloadSelfHash(payload) {
  const copy = structuredClone(payload);
  delete copy.payload_self_hash;
  return canonicalSha256(copy);
}

export function finalizePayload(payload) {
  const copy = structuredClone(payload);
  delete copy.payload_self_hash;
  copy.payload_self_hash = payloadSelfHash(copy);
  return copy;
}

export function validateReviewerPayload(payload, schema, location = "reviewer-payload") {
  const schemaIssues = validateSchema(schema, payload, location);
  const selfHashValid = typeof payload?.payload_self_hash === "string" && payload.payload_self_hash === payloadSelfHash(payload);
  const completionValid = payload?.completed === true && payload?.mandatory_exit_requested === true;
  return { schema_validation: schemaIssues.length ? "FAIL" : "PASS", schema_issues: schemaIssues, self_hash_validation: selfHashValid ? "PASS" : "FAIL", completion_validation: completionValid ? "PASS" : "FAIL", valid: schemaIssues.length === 0 && selfHashValid && completionValid };
}

export function buildTransportEnvelope({ rawBytes, storedBytes, payloadSchema, receivedAt = "2026-07-20T00:00:00Z" }) {
  let payload = null, parseError = null;
  try { payload = JSON.parse(Buffer.from(rawBytes).toString("utf8")); }
  catch (error) { parseError = error.message; }
  const validation = payload ? validateReviewerPayload(payload, payloadSchema) : { schema_validation: "FAIL", schema_issues: [`INVALID_JSON:${parseError}`], self_hash_validation: "FAIL", completion_validation: "FAIL", valid: false };
  const rawHash = sha256(Buffer.from(rawBytes));
  const storedHash = sha256(Buffer.from(storedBytes));
  const byteIdentical = Buffer.from(rawBytes).equals(Buffer.from(storedBytes));
  return { received_at: receivedAt, raw_payload_sha256: rawHash, stored_payload_sha256: storedHash, schema_validation: validation.schema_validation, schema_issues: validation.schema_issues, self_hash_validation: validation.self_hash_validation, completion_validation: validation.completion_validation, stored_byte_identical: byteIdentical, transport_valid: validation.valid && byteIdentical && rawHash === storedHash };
}

export function evaluateStartup({ assignmentIdMatches, roleBindingMatches, scopeHashMatches, scopeSatisfiable, candidateManifestMatches, preReviewFreezeMatches, allowedPathsValidated, forbiddenPathsValidated, payloadOnlyMode }) {
  const checks = { assignment_id: assignmentIdMatches, role_binding: roleBindingMatches, scope_sha256: scopeHashMatches, scope_satisfiability: scopeSatisfiable, candidate_manifest_sha256: candidateManifestMatches, pre_review_freeze_sha256: preReviewFreezeMatches, allowed_paths: allowedPathsValidated, forbidden_paths: forbiddenPathsValidated, payload_only_output_mode: payloadOnlyMode };
  const valid = Object.values(checks).every(Boolean);
  return { startup_result: valid ? "STARTUP_VALID" : "STARTUP_BLOCKER", candidate_review_authorized: valid, checks };
}

export function evaluateCompletion({ payloadValidation, threadClosed, payloadCount }) {
  const duplicate = payloadCount !== 1;
  const dispatchMayContinue = payloadValidation.valid && threadClosed === true && !duplicate;
  return { completed: payloadValidation.valid, thread_closed: threadClosed === true, duplicate_outcome: duplicate, dispatch_may_continue: dispatchMayContinue, result: dispatchMayContinue ? "PASS" : "BLOCKER" };
}

export function validatePayloadOnlyAssignments(assignments, registeredAssignmentArraySchema) {
  const issues = validateSchema(registeredAssignmentArraySchema, assignments, "reviewer-assignments");
  const registeredMaxWrites = registeredAssignmentArraySchema?.items?.properties?.allowed_write_paths?.maxItems;
  if (registeredMaxWrites !== 0) issues.push("REGISTERED_ASSIGNMENT_SCHEMA_MUST_REQUIRE_ZERO_WRITE_PATHS");
  for (const assignment of assignments ?? []) {
    if (assignment?.execution_mode !== "read-only") issues.push(`ASSIGNMENT_NOT_READ_ONLY:${assignment?.assignment_id ?? "<missing>"}`);
    if (!Array.isArray(assignment?.allowed_write_paths) || assignment.allowed_write_paths.length !== 0) issues.push(`ASSIGNMENT_WRITE_PATHS_FORBIDDEN:${assignment?.assignment_id ?? "<missing>"}`);
  }
  return [...new Set(issues)].sort();
}

export function evaluateDeterministicQa({ reviewerRecords, rawEvidenceComplete, rootAssertedResult = null }) {
  if (rootAssertedResult !== null) return { result: "INVALID", reasons: ["ROOT_ASSERTED_QA_RESULT_FORBIDDEN"] };
  const roles = ["code-reviewer", "security-reviewer", "railway-domain-reviewer", "compatibility-reviewer"];
  const reasons = [];
  for (const role of roles) {
    const matches = reviewerRecords.filter((item) => item.role === role);
    if (matches.length !== 1) { reasons.push(`REVIEWER_RECORD_COUNT:${role}:${matches.length}`); continue; }
    const record = matches[0];
    if (!record.envelope?.transport_valid) reasons.push(`INVALID_TRANSPORT:${role}`);
    if (record.thread_closed !== true) reasons.push(`THREAD_NOT_CLOSED:${role}`);
  }
  if (!rawEvidenceComplete) reasons.push("RAW_EVIDENCE_INCOMPLETE");
  if (reasons.length) return { result: "INVALID", reasons };
  if (reviewerRecords.some((item) => item.payload.review_status !== "PASS")) return { result: "FAIL", reasons: reviewerRecords.filter((item) => item.payload.review_status !== "PASS").map((item) => `REVIEWER_${item.role}_${item.payload.review_status}`) };
  return { result: "PASS", reasons: [] };
}
