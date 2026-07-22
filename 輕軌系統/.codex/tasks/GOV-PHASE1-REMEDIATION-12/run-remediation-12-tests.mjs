import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { safeExistingPath } from "../../scripts/lib/path-safety.mjs";
import { loadAndCompileGovernanceSchemas } from "../../scripts/lib/governance/governance-schema-loader.mjs";
import { validateSchema } from "../../scripts/lib/schema-validator.mjs";
import { computeScopeSha256, validateScopeSatisfiability, finalizePayload, validateReviewerPayload, buildTransportEnvelope, evaluateStartup, evaluateCompletion, validatePayloadOnlyAssignments, evaluateDeterministicQa } from "./b6-review-protocol.mjs";

const dir = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(dir, "../../..");
const taskId = "GOV-PHASE1-REMEDIATION-12", base = `.codex/tasks/${taskId}`, pkg = `${base}/session-b6-pre-review-package`;
const read = async (ref) => readFile(await safeExistingPath(root, ref));
const json = async (ref) => JSON.parse((await read(ref)).toString("utf8"));
const write = async (name, value) => writeFile(path.join(dir, name), `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "w" });
const clone = (value) => structuredClone(value);
const reports = { scope: [], schema: [], protocol: [], qa: [] };
const test = (group, id, name, expected, observed, passed) => reports[group].push({ test_id: id, name, expected, observed, result: passed ? "PASS" : "FAIL" });
const matrix = await json(`${pkg}/reviewer-capability-artifact-matrix.json`), codeScope = await json(`${pkg}/reviewer-scopes/code-reviewer-scope.json`);
const codeCapabilities = matrix.roles.find((item) => item.reviewer_role === "code-reviewer").capabilities;
const mutateScope = (removeRefs = [], addForbidden = []) => { const scope = clone(codeScope); scope.allowed_paths = scope.allowed_paths.filter((ref) => !removeRefs.includes(ref)); scope.forbidden_paths = [...scope.forbidden_paths, ...addForbidden]; scope.scope_sha256 = computeScopeSha256(scope); return scope; };
const validateCode = (scope, capabilities = codeCapabilities) => validateScopeSatisfiability({ projectRoot: root, scope, capabilityEntries: capabilities });

{
  const ref = `${pkg}/reviewer-capacity-preflight.json`, scope = clone(codeScope); scope.allowed_paths.push(ref); scope.required_capabilities.push(`artifact:${ref}`); scope.allowed_paths.sort(); scope.required_capabilities.sort(); scope.scope_sha256 = computeScopeSha256(scope);
  const caps = [...clone(codeCapabilities), { capability: `artifact:${ref}`, artifact_path: ref, expected_sha256: "0".repeat(64), required: true }], result = await validateCode(scope, caps);
  test("scope", "01", "Old reviewer-capacity-preflight filename blocks dispatch", "BLOCKED", result.dispatch_authorized ? "AUTHORIZED" : "BLOCKED", !result.dispatch_authorized);
}
{
  const ref = `${pkg}/fresh-root-preflight.json`, scope = clone(codeScope); scope.allowed_paths = [ref]; scope.required_capabilities = [`artifact:${ref}`]; scope.scope_sha256 = computeScopeSha256(scope);
  const cap = codeCapabilities.find((item) => item.artifact_path === ref), result = await validateCode(scope, [cap]);
  test("scope", "02", "Correct fresh-root-preflight path resolves", "PASS", result.scope_satisfiable ? "PASS" : result.issues, result.scope_satisfiable);
}
for (const [id, name, refs] of [
  ["03", "Missing candidate manifest blocks dispatch", [".codex/governance/governance-commit-manifest.yaml"]],
  ["04", "Missing candidate record blocks dispatch", [".codex/tasks/GOV-PHASE1-REMEDIATION-9/bootstrap-candidate-record.json"]],
  ["05", "Missing scanner report blocks dispatch", [".codex/tasks/GOV-PHASE1-REMEDIATION-9/bootstrap-scanner-report.json"]],
  ["06", "Missing pre-review manifest or freeze blocks dispatch", [`${pkg}/pre-review-input-manifest.json`, `${pkg}/pre-review-freeze.json`]],
  ["07", "Missing Security read-scope or required-node verification blocks dispatch", [`${pkg}/session-b6-security-read-scope.json`, `${pkg}/required-chain-node-verification.json`]],
  ["08", "Missing gate dependency matrix blocks dispatch", [`${pkg}/gate-dependency-matrix.json`]]
]) {
  const result = await validateCode(mutateScope(refs));
  test("scope", id, name, "BLOCKED", result.dispatch_authorized ? "AUTHORIZED" : "BLOCKED", !result.dispatch_authorized);
}
{
  const ref = ".codex/governance/governance-commit-manifest.yaml", result = await validateCode(mutateScope([], [ref]));
  test("scope", "09", "Required path simultaneously forbidden blocks dispatch", "BLOCKED", result.dispatch_authorized ? "AUTHORIZED" : "BLOCKED", !result.dispatch_authorized);
}
{
  const ref = ".codex/tasks/GOV-PHASE1-SESSION-B6-COMPATIBILITY-REVIEW/reviewer-payloads/code-reviewer-raw-payload.json", scope = clone(codeScope); scope.allowed_paths.push(ref); scope.required_capabilities.push(`artifact:${ref}`); scope.allowed_paths.sort(); scope.required_capabilities.sort(); scope.scope_sha256 = computeScopeSha256(scope);
  const caps = [...clone(codeCapabilities), { capability: `artifact:${ref}`, artifact_path: ref, expected_sha256: "0".repeat(64), required: true }], result = await validateCode(scope, caps);
  test("scope", "10", "Required future output blocks dispatch", "BLOCKED_FUTURE", result.dispatch_authorized ? "AUTHORIZED" : "BLOCKED_FUTURE", !result.dispatch_authorized && result.checks.some((item) => item.artifact_path === ref && item.future_output));
}
{
  const caps = clone(codeCapabilities); caps[0].expected_sha256 = "0".repeat(64); const result = await validateCode(codeScope, caps);
  test("scope", "11", "Path or hash mismatch blocks dispatch", "BLOCKED", result.dispatch_authorized ? "AUTHORIZED" : "BLOCKED", !result.dispatch_authorized);
}
{
  const result = await validateCode(codeScope);
  test("scope", "12", "Complete Code scope passes", "PASS", result.scope_satisfiable ? "PASS" : result.issues, result.scope_satisfiable);
}

const schemaSet = await loadAndCompileGovernanceSchemas(root);
const intentRef = `${pkg}/task-intent.yaml`, classRef = `${pkg}/classification.yaml`, blueprintRef = `${pkg}/blueprint.yaml`, assignmentRef = `${pkg}/reviewer-assignments.json`;
{
  const value = await json(intentRef); delete value.business_reason; const issues = schemaSet.validate(".codex/blueprints/schemas/task-intent.schema.json", value, "invalid-intent");
  test("schema", "13", "Invalid Task Intent rejected", "INVALID", issues.length ? "INVALID" : "VALID", issues.length > 0);
}
{
  const value = await json(classRef); delete value.stop_conditions; const issues = schemaSet.validate(".codex/blueprints/schemas/classification.schema.json", value, "invalid-classification");
  test("schema", "14", "Invalid Classification rejected", "INVALID", issues.length ? "INVALID" : "VALID", issues.length > 0);
}
{
  const value = await json(blueprintRef); delete value.agent_assignments; const issues = schemaSet.validate(".codex/blueprints/schemas/blueprint.schema.json", value, "invalid-blueprint");
  test("schema", "15", "Invalid Blueprint rejected", "INVALID", issues.length ? "INVALID" : "VALID", issues.length > 0);
}
const blueprintSchema = schemaSet.byRef.get(".codex/blueprints/schemas/blueprint.schema.json"), assignmentSchema = blueprintSchema.properties.review_assignments;
{
  const value = await json(assignmentRef); value[0].allowed_write_paths = [".codex/tasks/FUTURE/review.json"]; const issues = validatePayloadOnlyAssignments(value, assignmentSchema);
  test("schema", "16", "Read-only Reviewer write assignment rejected", "INVALID", issues.length ? "INVALID" : "VALID", issues.length > 0);
}
{
  const value = await json(assignmentRef); const issues = validatePayloadOnlyAssignments(value, assignmentSchema); const protocolValid = value.every((item) => item.execution_mode === "read-only" && item.allowed_write_paths.length === 0);
  test("schema", "17", "Payload-only assignment passes", "PASS", issues.length === 0 && protocolValid ? "PASS" : { issues, protocolValid }, issues.length === 0 && protocolValid);
}

const payloadSchema = await json(`${pkg}/reviewer-return-payload.schema.json`);
const payload = (role = "code-reviewer", status = "PASS", early = false) => finalizePayload({ schema_version: 1, task_id: "GOV-PHASE1-SESSION-B6-COMPATIBILITY-REVIEW", reviewer_role: role, assignment_id: `ASSIGN-${role}`, reviewer_run_id: `RUN-${role}`, session_id: `SESSION-${role}`, review_status: status, failure_stage: early ? "PRE_REVIEW_SCOPE_VALIDATION" : status === "PASS" ? "NONE" : "TECHNICAL_REVIEW", review_started: !early, candidate_content_reviewed: !early, findings: early ? [{ finding_id: "SCOPE-BLOCKER", reason: "scope invalid", missing_paths: [], conflicting_paths: [], forbidden_access_occurred: false }] : [], access_log: [], clean_context_attestation: { did_not_participate_in_implementation: true, implementation_conversation_received: false, conversation_memory_used: false, subagent_created: false }, closure_dispositions: [], completed: true, mandatory_exit_requested: true });
{
  const startup = evaluateStartup({ assignmentIdMatches: true, roleBindingMatches: true, scopeHashMatches: true, scopeSatisfiable: false, candidateManifestMatches: true, preReviewFreezeMatches: true, allowedPathsValidated: false, forbiddenPathsValidated: true, payloadOnlyMode: true });
  const early = payload("code-reviewer", "BLOCKER", true), validation = validateReviewerPayload(early, payloadSchema);
  test("protocol", "18", "Invalid startup produces valid Early-Failure payload", "STARTUP_BLOCKER+VALID_PAYLOAD", `${startup.startup_result}+${validation.valid ? "VALID_PAYLOAD" : "INVALID_PAYLOAD"}`, startup.startup_result === "STARTUP_BLOCKER" && validation.valid && early.review_started === false);
}
{
  const early = payload("code-reviewer", "BLOCKER", true); early.mandatory_exit_requested = false; early.payload_self_hash = "0".repeat(64); const validation = validateReviewerPayload(early, payloadSchema);
  test("protocol", "19", "Early-Failure without mandatory exit is invalid", "INVALID", validation.valid ? "VALID" : "INVALID", !validation.valid);
}
{
  const value = payload(); value.payload_self_hash = "0".repeat(64); const validation = validateReviewerPayload(value, payloadSchema);
  test("protocol", "20", "Wrong payload self-hash is invalid", "INVALID", validation.valid ? "VALID" : "INVALID", !validation.valid && validation.self_hash_validation === "FAIL");
}
{
  const raw = Buffer.from(`${JSON.stringify(payload(), null, 2)}\n`), changed = JSON.parse(raw.toString("utf8")); changed.review_status = "BLOCKER"; const stored = Buffer.from(`${JSON.stringify(changed, null, 2)}\n`); const envelope = buildTransportEnvelope({ rawBytes: raw, storedBytes: stored, payloadSchema });
  test("protocol", "21", "Root outcome modification fails byte/hash verification", "FAIL", envelope.transport_valid ? "PASS" : "FAIL", !envelope.transport_valid && !envelope.stored_byte_identical);
}
{
  const value = payload(), validation = validateReviewerPayload(value, payloadSchema), completion = evaluateCompletion({ payloadValidation: validation, threadClosed: true, payloadCount: 2 });
  test("protocol", "22", "Two Reviewer outcomes are invalid", "BLOCKER", completion.result, completion.result === "BLOCKER" && completion.duplicate_outcome);
}
{
  const policy = await json(`${pkg}/reviewer-timeout-policy.json`); const observed = policy.no_payload_effect.root_creates_dispatch_failure_record_only && !policy.no_payload_effect.root_creates_reviewer_outcome && !policy.no_payload_effect.replacement_reviewer_allowed ? "DISPATCH_BLOCKER" : "INVALID_POLICY";
  test("protocol", "23", "Timeout without payload is dispatch blocker", "DISPATCH_BLOCKER", observed, observed === "DISPATCH_BLOCKER");
}
{
  const value = payload(), validation = validateReviewerPayload(value, payloadSchema), completion = evaluateCompletion({ payloadValidation: validation, threadClosed: false, payloadCount: 1 });
  test("protocol", "24", "Completed Reviewer with open thread cannot continue", "BLOCKER", completion.result, completion.result === "BLOCKER" && !completion.dispatch_may_continue);
}
{
  const value = payload(), raw = Buffer.from(`${JSON.stringify(value, null, 2)}\n`), envelope = buildTransportEnvelope({ rawBytes: raw, storedBytes: raw, payloadSchema }), validation = validateReviewerPayload(value, payloadSchema), completion = evaluateCompletion({ payloadValidation: validation, threadClosed: true, payloadCount: 1 });
  test("protocol", "25", "Complete PASS payload, identical storage and closed thread can continue", "PASS", envelope.transport_valid && completion.dispatch_may_continue ? "PASS" : "BLOCKER", envelope.transport_valid && completion.dispatch_may_continue);
}

const makeRecord = (role, status = "PASS") => { const value = payload(role, status), raw = Buffer.from(`${JSON.stringify(value, null, 2)}\n`); return { role, payload: value, envelope: buildTransportEnvelope({ rawBytes: raw, storedBytes: raw, payloadSchema }), thread_closed: true }; };
const fullRecords = [makeRecord("code-reviewer"), makeRecord("security-reviewer"), makeRecord("railway-domain-reviewer"), makeRecord("compatibility-reviewer")];
{
  const result = evaluateDeterministicQa({ reviewerRecords: fullRecords.slice(0, 3), rawEvidenceComplete: true }); test("qa", "26", "Missing one Reviewer payload makes QA INVALID", "INVALID", result.result, result.result === "INVALID");
}
{
  const records = clone(fullRecords); records[1] = makeRecord("security-reviewer", "BLOCKER"); const result = evaluateDeterministicQa({ reviewerRecords: records, rawEvidenceComplete: true }); test("qa", "27", "Reviewer BLOCKER makes QA FAIL", "FAIL", result.result, result.result === "FAIL");
}
{
  const records = clone(fullRecords); records[0].envelope.transport_valid = false; const result = evaluateDeterministicQa({ reviewerRecords: records, rawEvidenceComplete: true }); test("qa", "28", "Raw payload and envelope mismatch makes QA INVALID", "INVALID", result.result, result.result === "INVALID");
}
{
  const result = evaluateDeterministicQa({ reviewerRecords: fullRecords, rawEvidenceComplete: true, rootAssertedResult: "PASS" }); test("qa", "29", "Root-filled QA PASS is invalid", "INVALID", result.result, result.result === "INVALID");
}
{
  const result = evaluateDeterministicQa({ reviewerRecords: fullRecords, rawEvidenceComplete: true }); test("qa", "30", "Four complete PASS payloads and raw evidence allow QA", "PASS", result.result, result.result === "PASS");
}

for (const [group, name, suite] of [["scope", "scope-satisfiability-tests.json", "scope-satisfiability-production-path"], ["schema", "task-local-schema-tests.json", "registered-task-local-schema-production-path"], ["protocol", "reviewer-protocol-tests.json", "payload-only-reviewer-protocol-production-path"], ["qa", "deterministic-qa-contract-tests.json", "deterministic-qa-production-path"]]) {
  const cases = reports[group], passed = cases.filter((item) => item.result === "PASS").length;
  await write(name, { schema_version: 1, task_id: taskId, suite, total: cases.length, passed, failed: cases.length - passed, cases, result: passed === cases.length ? "PASS" : "FAIL" });
}
const all = Object.values(reports).flat(), passed = all.filter((item) => item.result === "PASS").length;
await write("preparation-test-summary.json", { schema_version: 1, task_id: taskId, total: all.length, passed, failed: all.length - passed, reports: [{ suite: "scope", total: reports.scope.length, passed: reports.scope.filter((item) => item.result === "PASS").length }, { suite: "schema", total: reports.schema.length, passed: reports.schema.filter((item) => item.result === "PASS").length }, { suite: "protocol", total: reports.protocol.length, passed: reports.protocol.filter((item) => item.result === "PASS").length }, { suite: "qa", total: reports.qa.length, passed: reports.qa.filter((item) => item.result === "PASS").length }], result: all.length === 30 && passed === 30 ? "PASS" : "FAIL" });
console.log(JSON.stringify({ total: all.length, passed, result: all.length === 30 && passed === 30 ? "PASS" : "FAIL" }));
if (all.length !== 30 || passed !== 30) process.exit(1);
