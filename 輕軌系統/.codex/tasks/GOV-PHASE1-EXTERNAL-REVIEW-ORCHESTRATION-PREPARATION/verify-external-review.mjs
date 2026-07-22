import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const taskDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(taskDir, "../../..");
const taskId = "GOV-PHASE1-EXTERNAL-REVIEW-ORCHESTRATION-PREPARATION";
const base = `.codex/tasks/${taskId}`;
const expectedManifest = "29F4F947DEF79A633F63E28FA2444F4734D7E6BB9612B96154A302464255531D";
const expectedFileSet = "739DAC633946266BCD28A71BE236D3748C57550AB1749A29C4F5E59421F993CB";

const abs = (ref) => path.resolve(root, ...ref.replaceAll("\\", "/").split("/"));
const read = (ref) => readFile(abs(ref));
const json = async (ref) => JSON.parse(await readFile(abs(ref), "utf8"));
const exists = async (ref) => { try { return (await stat(abs(ref))).isFile(); } catch { return false; } };
const sha256 = (value) => createHash("sha256").update(Buffer.isBuffer(value) ? value : Buffer.from(String(value), "utf8")).digest("hex").toUpperCase();
function jcs(value) {
  if (value === null) return "null";
  if (typeof value === "boolean" || typeof value === "number" || typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(jcs).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${jcs(value[key])}`).join(",")}}`;
}
const jcsSha256 = (value) => sha256(jcs(value));
function forbidden(ref) {
  const normalized = ref.toLowerCase().replaceAll("\\", "/");
  const segments = normalized.split("/");
  return normalized.includes("*") || ["collab", "frontend", "erp-api", "db-design", "migration"].includes(segments[0]) || segments[0]?.startsWith(".env") || normalized.endsWith("/human-approval.yaml") || normalized.endsWith("/implementation-handoff.yaml") || normalized.endsWith("/implementation-plan.md");
}

const issues = [];
const requireCondition = (condition, issue) => { if (!condition) issues.push(issue); };
const requiredRootFiles = [
  "task-intent.yaml", "classification.yaml", "blueprint.yaml", "execution-model-decision.yaml", "review-baseline-before.json", "canonicalization-contract.json", "manual-review-payload-transport-contract.json",
  "schemas/external-review-payload.schema.json", "schemas/manual-transport-attestation.schema.json", "schemas/aggregation-input.schema.json", "schemas/aggregation-output.schema.json",
  "package-scope-satisfiability-report.json", "package-integrity-report.json", "external-review-protocol-tests.json", "historical-artifact-integrity.json", "migration-320-integrity.json",
  "review-baseline-after.json", "baseline-comparison.json", "external-review-readiness.json", "validation-results.json", "human-launch-sequence.json", "final-summary.md", "HANDOFF.md"
];
for (const name of requiredRootFiles) requireCondition(await exists(`${base}/${name}`), `ROOT_DELIVERABLE_MISSING:${name}`);

const packageDirs = ["code-review", "security-review", "railway-domain-review", "compatibility-review", "aggregation-qa"];
const reviewerRequired = ["assignment.json", "exact-read-scope.json", "capability-artifact-matrix.json", "startup-contract.json", "review-requirements.json", "finding-ownership.json", "return-payload.schema.json", "transport-contract.json", "package-manifest.json", "package-verification.json", "reviewer-prompt.md"];
const aggregatorRequired = ["assignment.json", "exact-read-scope.json", "aggregation-input.schema.json", "aggregation-output.schema.json", "payload-import-contract.json", "manual-transport-attestation.schema.json", "deterministic-qa-input-contract.json", "deterministic-qa-fail-closed-rules.json", "gate-dependency-matrix.json", "package-manifest.json", "package-verification.json", "aggregator-prompt.md"];
for (const dir of packageDirs) {
  const packageBase = `${base}/external-review-packages/${dir}`;
  const required = dir === "aggregation-qa" ? aggregatorRequired : reviewerRequired;
  for (const name of required) requireCondition(await exists(`${packageBase}/${name}`), `PACKAGE_FILE_MISSING:${dir}:${name}`);
  const manifest = await json(`${packageBase}/package-manifest.json`);
  const declared = manifest.package_core_sha256;
  const core = structuredClone(manifest); delete core.package_core_sha256;
  requireCondition(declared === jcsSha256(core), `PACKAGE_CORE_HASH_MISMATCH:${dir}`);
  for (const item of manifest.files) requireCondition(sha256(await read(item.path)) === item.sha256, `PACKAGE_FILE_HASH_MISMATCH:${dir}:${item.path}`);
  const verification = await json(`${packageBase}/package-verification.json`);
  requireCondition(verification.result === "PASS" && verification.declared_package_core_sha256 === declared && verification.recomputed_package_core_sha256 === declared, `PACKAGE_VERIFICATION_FAIL:${dir}`);
  const scope = await json(`${packageBase}/exact-read-scope.json`);
  const scopeCore = structuredClone(scope); delete scopeCore.scope_sha256;
  requireCondition(scope.scope_sha256 === jcsSha256(scopeCore), `SCOPE_HASH_MISMATCH:${dir}`);
  const scopePaths = dir === "aggregation-qa" ? [...scope.static_allowed_read_paths, ...scope.package_paths] : scope.allowed_paths;
  requireCondition(scopePaths.every((ref) => !forbidden(ref)), `SCOPE_FORBIDDEN_OR_GLOB:${dir}`);
  for (const ref of scopePaths) requireCondition(await exists(ref), `SCOPE_PATH_MISSING:${dir}:${ref}`);
  const assignment = await json(`${packageBase}/assignment.json`);
  requireCondition(assignment.actual_chat_session_created === false, `CHAT_ALREADY_CREATED:${dir}`);
  requireCondition(assignment.subagent_creation_allowed === false && assignment.git_allowed === false, `AGENT_OR_GIT_PERMISSION_INVALID:${dir}`);
  if (dir !== "aggregation-qa") {
    requireCondition(assignment.workspace_write_allowed === false && assignment.artifact_write_allowed === false && assignment.allowed_write_paths.length === 0, `REVIEWER_WRITE_PERMISSION_INVALID:${dir}`);
    const prompt = await readFile(abs(`${packageBase}/reviewer-prompt.md`), "utf8");
    for (const phrase of ["brand-new top-level Codex chat", "do not attach or rely on any prior conversation", "Do not create child agents or subagents", "Do not write to the repository", "Return exactly one JSON object", "stop immediately"]) requireCondition(prompt.includes(phrase), `PROMPT_NOT_STANDALONE:${dir}:${phrase}`);
  } else {
    requireCondition(assignment.is_reviewer === false && assignment.can_close_findings === false && assignment.can_modify_reviewer_outcomes === false, "AGGREGATOR_ROLE_BOUNDARY_INVALID");
  }
}

const baseline = await json(`${base}/review-baseline-after.json`);
requireCondition(baseline.candidate.file_count === 103, "CANDIDATE_COUNT_INVALID");
const currentCandidate = [];
for (const item of baseline.candidate.files) currentCandidate.push({ path: item.path, sha256: sha256(await read(item.path)) });
currentCandidate.sort((left, right) => left.path.localeCompare(right.path));
requireCondition(sha256(await read(".codex/governance/governance-commit-manifest.yaml")) === expectedManifest, "CANDIDATE_MANIFEST_DRIFT");
requireCondition(jcsSha256(currentCandidate) === expectedFileSet, "CANDIDATE_FILE_SET_DRIFT");

const scopeReport = await json(`${base}/package-scope-satisfiability-report.json`);
requireCondition(scopeReport.result === "PASS" && scopeReport.four_reviewer_scopes_satisfiable === true && scopeReport.aggregator_static_scope_satisfiable === true && scopeReport.forbidden_path_count === 0 && scopeReport.recursive_glob_count === 0, "SCOPE_REPORT_FAIL");
const integrity = await json(`${base}/package-integrity-report.json`);
requireCondition(integrity.result === "PASS" && integrity.package_count === 5 && integrity.package_ids_unique && integrity.assignment_ids_unique && integrity.reviewer_run_ids_unique && integrity.reviewer_session_nonces_unique, "PACKAGE_INTEGRITY_REPORT_FAIL");
const tests = await json(`${base}/external-review-protocol-tests.json`);
requireCondition(tests.total === 20 && tests.passed === 20 && tests.failed === 0 && tests.negative_cases_fail_closed === true && tests.positive_case_accepted === true && tests.tests.every((item) => item.result === "PASS"), "PROTOCOL_TEST_REPORT_FAIL");
const comparison = await json(`${base}/baseline-comparison.json`);
requireCondition(comparison.result === "PASS" && comparison.candidate_changes.length === 0 && comparison.protected_history_anchor_changes.length === 0 && comparison.direct_history_file_changes.length === 0 && comparison.history_directory_state_changes.length === 0 && comparison.git_used === false, "BASELINE_COMPARISON_FAIL");
const history = await json(`${base}/historical-artifact-integrity.json`);
requireCondition(history.result === "PASS_WITH_EXPLICIT_READ_BOUNDARY" && history.changed_anchors.length === 0 && history.direct_history_file_changes.length === 0 && history.history_directory_state_changes.length === 0 && history.unapproved_handoff_read === false, "HISTORY_INTEGRITY_FAIL");
requireCondition(history.direct_task_sets_before.some((item) => item.directory.endsWith("GOV-PHASE1-SESSION-B4-COMPATIBILITY-REVIEW") && item.exists === false), "B4_MISSING_STATE_NOT_PRESERVED");
const migration = await json(`${base}/migration-320-integrity.json`);
requireCondition(migration.result === "PASS_WITH_EXACT_READ_BOUNDARY" && migration.implementation_handoff_read === false && migration.implementation_plan_read === false && migration.migration_320_status === "NEEDS_HUMAN_DECISION / NO-GO", "MIGRATION_320_INTEGRITY_FAIL");
const decision = await json(`${base}/execution-model-decision.yaml`);
requireCondition(decision.retired_model.status === "RETIRED_ENVIRONMENT_INCOMPATIBLE" && decision.replacement_model.status === "HUMAN_APPROVED" && decision.superseded_task.status === "SUPERSEDED / MUST NOT START", "EXECUTION_MODEL_DECISION_FAIL");
const readiness = await json(`${base}/external-review-readiness.json`);
requireCondition(readiness.status === "READY_FOR_HUMAN_TO_LAUNCH_EXTERNAL_TOP_LEVEL_REVIEWS" && readiness.external_reviewer_chats_started === false && readiness.aggregation_deterministic_qa_started === false && readiness.session_b_compatibility_gate === "NO-GO" && readiness.human_exact_manifest_eligibility === "NO", "READINESS_FAIL");

console.log(JSON.stringify({ task_id: taskId, candidate: "103/103", packages: "5/5", protocol_tests: "20/20", issues, result: issues.length === 0 ? "PASS" : "FAIL" }));
if (issues.length) process.exitCode = 1;
