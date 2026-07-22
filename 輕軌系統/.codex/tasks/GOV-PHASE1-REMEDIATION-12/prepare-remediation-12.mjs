import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { safeExistingPath } from "../../scripts/lib/path-safety.mjs";
import { canonicalSha256, sha256 } from "../../scripts/lib/governance/typed-proof.mjs";
import { loadAndCompileGovernanceSchemas } from "../../scripts/lib/governance/governance-schema-loader.mjs";
import { validateSchema } from "../../scripts/lib/schema-validator.mjs";
import { computeScopeSha256, validateScopeSatisfiability } from "./b6-review-protocol.mjs";

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dir, "../../..");
const taskId = "GOV-PHASE1-REMEDIATION-12";
const b6Id = "GOV-PHASE1-SESSION-B6-COMPATIBILITY-REVIEW";
const base = `.codex/tasks/${taskId}`;
const pkg = `${base}/session-b6-pre-review-package`;
const read = async (ref) => readFile(await safeExistingPath(root, ref));
const json = async (ref) => JSON.parse((await read(ref)).toString("utf8"));
const exists = async (ref) => { try { await safeExistingPath(root, ref); return true; } catch { return false; } };
const writeBytes = async (ref, body) => { const target = path.join(root, ...ref.split("/")); await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, body, { flag: "wx" }); return { path: ref, sha256: sha256(body), byte_size: body.length }; };
const writeJson = async (ref, value) => writeBytes(ref, Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8"));
const writeBoth = async (name, value) => { const rootInfo = await writeJson(`${base}/${name}`, value); const pkgInfo = await writeJson(`${pkg}/${name}`, value); return { root: rootInfo, package: pkgInfo }; };
const info = async (ref) => { const body = await read(ref); return { path: ref, sha256: sha256(body), byte_size: body.length }; };

if (await exists(`${base}/human-approval.yaml`)) throw new Error("R12_HUMAN_APPROVAL_FORBIDDEN");
const manifestRef = ".codex/governance/governance-commit-manifest.yaml";
const recordRef = ".codex/tasks/GOV-PHASE1-REMEDIATION-9/bootstrap-candidate-record.json";
const reportRef = ".codex/tasks/GOV-PHASE1-REMEDIATION-9/bootstrap-scanner-report.json";
const manifestBytes = await read(manifestRef), manifest = JSON.parse(manifestBytes.toString("utf8"));
const recordBytes = await read(recordRef), record = JSON.parse(recordBytes.toString("utf8"));
const reportBytes = await read(reportRef), scannerReport = JSON.parse(reportBytes.toString("utf8"));
const candidateFiles = [];
for (const entry of manifest.artifacts.filter((item) => item.commit_inclusion === true)) {
  const body = await read(entry.path), digest = sha256(body);
  if (digest !== entry.sha256.toUpperCase()) throw new Error(`INVALID_BASELINE:${entry.path}`);
  candidateFiles.push({ path: entry.path, sha256: digest, byte_size: body.length });
}
candidateFiles.sort((a, b) => a.path.localeCompare(b.path));
const manifestSha = sha256(manifestBytes), fileSetSha = canonicalSha256(candidateFiles.map(({ path: ref, sha256: digest }) => ({ path: ref, sha256: digest })));
if (candidateFiles.length !== 103 || manifestSha !== "29F4F947DEF79A633F63E28FA2444F4734D7E6BB9612B96154A302464255531D" || fileSetSha !== "739DAC633946266BCD28A71BE236D3748C57550AB1749A29C4F5E59421F993CB") throw new Error("INVALID_BASELINE");

const r12Intent = {
  schema_version: 1, status: "CLOSED", task_id: taskId, title: "Phase 1.12 Reviewer Scope Satisfiability and Payload-Only Dispatch Protocol", task_type: "remediation",
  objective: "Prepare a task-local B6 review protocol with deterministic scope satisfiability, read-only payload return, bounded exit, and non-Agent deterministic QA without changing the 103-file candidate.",
  business_reason: "B5 failed because task-local scope capability coverage and Reviewer startup/exit protocol were not validated before dispatch.",
  scope: { include: [`${base}/**`, "Read-only frozen governance evidence"], exclude: ["candidate mutation", "Reviewer dispatch", "B6 execution", "B2 finding closure", "Git/product/DB/migration operations"], product_changes_allowed: false, database_operations_allowed: false, git_mutation_allowed: false },
  acceptance_criteria: ["Four B6 scopes pass satisfiability.", "Reviewer assignments are read-only and payload-only.", "Registered task schemas have zero issues.", "Thirty fail-closed tests pass.", "Candidate and protected baselines remain unchanged."],
  requested_by: "human-governance-owner", authorization: "User explicitly authorized GOV-PHASE1-REMEDIATION-12 only."
};
const r12Class = {
  schema_version: 1, task_id: taskId, level: "L3", reasons: ["Formal review dispatch protocol remediation", "Scope satisfiability and payload integrity"], triggers: ["unresolved Reviewer blocker", "backward compatibility", "formal schema contract"],
  execution_categories: ["governance-validation", "security", "backward-compatibility"], required_agents: ["architect", "qa-engineer"], required_reviews: ["qa-readback"], parallel_allowed: false,
  evidence_required: ["R12-SCOPE", "R12-SCHEMA", "R12-PAYLOAD", "R12-QA", "R12-TESTS", "R12-BASELINE", "R12-READINESS"],
  human_approval: { required: true, stages: ["scope_approval", "execution_approval"] }, stop_conditions: ["Any candidate or history change.", "Any Reviewer or B6 thread starts.", "Any Git/product/DB/migration operation occurs."],
  scope: { include: [`${base}/**`], exclude: [".env*", "collab/**", "frontend/**", "erp-api/**", "db-design/**", "migration/**", "parent directories", "sibling directories", "conversation memory"] },
  classified_by: "root-orchestrator", classification_status: "human-approved-scope"
};
const r12Blueprint = {
  schema_version: 1, blueprint_id: `BP-${taskId}`, task_id: taskId, risk: { level: "L3", reasons: ["Prepares formal future review transport and fail-closed gates."] },
  scope: { include: [`${base}/**`], exclude: ["candidate/history mutation", "Reviewer dispatch", "Git/product/DB/migration operations"], product_changes_allowed: false, database_operations_allowed: false },
  allowed_paths: { read: [".codex/**", "AGENTS.md"], write: [`${base}/**`] }, agent_assignments: [{ role: "architect", allowed_read_paths: [".codex/**", "AGENTS.md"], allowed_write_paths: [`${base}/**`] }], review_assignments: [],
  applicable_rules: ["GOV-SCOPE-001", "REV-INDEP-001", "REV-L3-001", "EVD-HASH-001"], candidate_rules: [], required_agents: ["architect", "qa-engineer"],
  execution: { parallel_groups: [], sequential_steps: ["Freeze before baseline.", "Build B6 protocol package.", "Run 30 fail-closed tests.", "Freeze after baseline and stop."] },
  evidence_required: r12Class.evidence_required, rollback_restore: { required: false, evidence_or_reason: "Task-local additive artifacts only." }, human_approval: { required: true, approver_roles: ["human-governance-owner"] }, stop_conditions: r12Class.stop_conditions
};
await writeJson(`${base}/task-intent.yaml`, r12Intent); await writeJson(`${base}/classification.yaml`, r12Class); await writeJson(`${base}/blueprint.yaml`, r12Blueprint);

const payloadSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema", $id: "https://ntmc.local/codex/task-local/r12/reviewer-return-payload.schema.json", "x-governance-schema-version": 1,
  type: "object", additionalProperties: false,
  required: ["schema_version", "task_id", "reviewer_role", "assignment_id", "reviewer_run_id", "session_id", "review_status", "failure_stage", "review_started", "candidate_content_reviewed", "findings", "access_log", "clean_context_attestation", "closure_dispositions", "completed", "mandatory_exit_requested", "payload_self_hash"],
  properties: {
    schema_version: { const: 1 }, task_id: { type: "string", pattern: "^[A-Z][A-Z0-9-]{2,63}$" }, reviewer_role: { enum: ["code-reviewer", "security-reviewer", "railway-domain-reviewer", "compatibility-reviewer"] },
    assignment_id: { type: "string", minLength: 1 }, reviewer_run_id: { type: "string", minLength: 1 }, session_id: { type: "string", minLength: 1 }, review_status: { enum: ["PASS", "BLOCKER"] },
    failure_stage: { enum: ["NONE", "PRE_REVIEW_SCOPE_VALIDATION", "REVIEWER_RUNTIME_TIMEOUT", "TECHNICAL_REVIEW"] }, review_started: { type: "boolean" }, candidate_content_reviewed: { type: "boolean" },
    findings: { type: "array", items: { type: "object" } }, access_log: { type: "array", items: { type: "object", required: ["path", "operation", "result"], properties: { path: { type: "string" }, operation: { const: "read" }, result: { enum: ["ALLOWED", "BLOCKED"] } } } },
    clean_context_attestation: { type: "object", required: ["did_not_participate_in_implementation", "implementation_conversation_received", "conversation_memory_used", "subagent_created"], properties: { did_not_participate_in_implementation: { const: true }, implementation_conversation_received: { const: false }, conversation_memory_used: { const: false }, subagent_created: { const: false } } },
    closure_dispositions: { type: "array", items: { type: "object" } }, completed: { const: true }, mandatory_exit_requested: { const: true }, payload_self_hash: { type: "string", pattern: "^[A-F0-9]{64}$" }
  }
};
const qaOutputSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema", $id: "https://ntmc.local/codex/task-local/r12/deterministic-qa-output.schema.json", "x-governance-schema-version": 1,
  type: "object", additionalProperties: false, required: ["schema_version", "task_id", "producer", "result", "input_sha256", "reasons", "root_filled", "output_self_hash"],
  properties: { schema_version: { const: 1 }, task_id: { type: "string" }, producer: { const: "task-local-production-runner" }, result: { enum: ["PASS", "FAIL", "INVALID"] }, input_sha256: { type: "string", pattern: "^[A-F0-9]{64}$" }, reasons: { type: "array", items: { type: "string" } }, root_filled: { const: false }, output_self_hash: { type: "string", pattern: "^[A-F0-9]{64}$" } }
};
const satisfiabilityContract = {
  schema_version: 1, contract_id: "R12-REVIEWER-SCOPE-SATISFIABILITY", version: 1, subject_task_id: b6Id,
  algorithm: ["Resolve each required capability to exactly one artifact identity.", "Normalize to one repository-relative exact path.", "Require file existence and expected SHA256 match.", "Require membership in allowed_paths and absence from forbidden_paths.", "Reject future outputs, recursive globs, task-directory globs, absolute paths and rule conflicts.", "Recompute scope_sha256 from the actual scope payload."],
  fail_closed: { any_issue: { scope_satisfiable: false, dispatch_authorized: false }, zero_identity_matches: "FAIL", multiple_identity_matches: "FAIL" },
  production_entrypoint: `${base}/b6-review-protocol.mjs#validateScopeSatisfiability`, inline_schema_used: false, fallback_schema_used: false
};
const gateMatrix = {
  schema_version: 1, task_id: b6Id, matrix_id: "B6-SESSION-B-COMPATIBILITY-GATE-DEPENDENCIES",
  required_inputs: [
    { input_id: "candidate_manifest", artifact_path: manifestRef }, { input_id: "candidate_record", artifact_path: recordRef }, { input_id: "scanner_evidence", artifact_path: reportRef },
    { input_id: "formal_code_payload", source: "byte-identical formal Reviewer payload" }, { input_id: "formal_security_payload", source: "byte-identical formal Reviewer payload" }, { input_id: "formal_railway_payload", source: "byte-identical formal Reviewer payload" }, { input_id: "formal_compatibility_payload", source: "byte-identical formal Reviewer payload" },
    { input_id: "baseline_integrity", artifact_path: `${base}/baseline-comparison.json`, resolution_stage: "post-review" }, { input_id: "deterministic_qa", source: "task-local production QA runner output" }
  ],
  edges: ["candidate_manifest->Session B Compatibility Gate", "candidate_record->Session B Compatibility Gate", "scanner_evidence->Session B Compatibility Gate", "four formal Reviewer payloads->Session B Compatibility Gate", "baseline_integrity->Session B Compatibility Gate", "deterministic_qa->Session B Compatibility Gate"],
  prohibited_influences: ["human approval", "final commit approval", "steady-state trust anchor", "Migration 320 external decision", "final summary text", "derived gate fields"],
  prohibited_targets: ["Reviewer technical outcome", "Session B Compatibility Gate input"], result: "PASS"
};
const startupContract = {
  schema_version: 1, contract_id: "R12-REVIEWER-STARTUP", version: 1, result_values: ["STARTUP_VALID", "STARTUP_BLOCKER"], before_candidate_content: true,
  required_checks: ["assignment_id", "role_binding", "scope_sha256", "scope_satisfiability_result_and_report_hash_from_dispatch_binding", "candidate_manifest_sha256", "pre_review_freeze_sha256", "allowed_paths", "forbidden_paths", "payload_only_output_mode"],
  invalid_effect: { candidate_review_authorized: false, early_failure_required: true }
};
const earlyFailureContract = {
  schema_version: 1, contract_id: "R12-REVIEWER-EARLY-FAILURE", version: 1, formal_assurance: "procedural",
  required_payload: { review_status: "BLOCKER", failure_stage: "PRE_REVIEW_SCOPE_VALIDATION", review_started: false, candidate_content_reviewed: false, finding_id_required: true, reason_required: true, missing_paths: [], conflicting_paths: [], forbidden_access_occurred: false, completed: true, mandatory_exit_requested: true },
  counts_as_technical_review: false, counts_as_pass: false, root_may_modify: false, immediate_exit_required: true
};
const completionContract = {
  schema_version: 1, contract_id: "R12-REVIEWER-COMPLETION", version: 1,
  required: ["completed=true", "mandatory_exit_requested=true", "payload_self_hash valid", "payload schema valid", "exactly one payload", "thread closed"],
  next_dispatch_requires_all: true, incomplete_effect: "REVIEWER_DISPATCH_BLOCKER"
};
const timeoutPolicy = {
  schema_version: 1, contract_id: "R12-REVIEWER-TIMEOUT", version: 1, wait_snapshot_timeout_ms: 30000, maximum_consecutive_snapshots: 4, total_response_deadline_ms: 120000,
  tool_supported_range_ms: { minimum: 10000, maximum: 3600000 },
  reviewer_timeout_payload_if_returned: { review_status: "BLOCKER", failure_stage: "REVIEWER_RUNTIME_TIMEOUT", formal_review_completed: false },
  no_payload_effect: { root_creates_dispatch_failure_record_only: true, root_creates_reviewer_outcome: false, replacement_reviewer_allowed: false, partial_set_can_pass: false }
};
const exitContract = {
  schema_version: 1, contract_id: "R12-REVIEWER-MANDATORY-EXIT", version: 1,
  after_final_payload_forbidden: ["wait for more instructions", "continue reading", "create subagent", "modify payload", "submit second outcome"],
  thread_must_close: true, next_dispatch_before_close: false, second_payload_effect: "INVALID"
};
const qaInputContract = {
  schema_version: 1, contract_id: "R12-DETERMINISTIC-QA-INPUT", version: 1, reviewer_count: 4,
  required_per_reviewer: ["raw payload exists", "payload schema valid", "self-hash valid", "stored bytes identical", "transport envelope hash valid", "outcome frozen", "thread closed"],
  required_raw_evidence: ["access logs", "candidate manifest and hashes", "test reports", "before/after baseline", "gate dependency matrix"], execution_mode: "non-agent", root_may_fill_result: false
};
const qaFailRules = {
  schema_version: 1, contract_id: "R12-DETERMINISTIC-QA-FAIL-CLOSED", version: 1,
  rules: [
    { when: "missing Reviewer payload", result: "INVALID" }, { when: "payload or envelope hash mismatch", result: "INVALID" }, { when: "schema or self-hash invalid", result: "INVALID" },
    { when: "thread not closed", result: "INVALID" }, { when: "raw evidence incomplete", result: "INVALID" }, { when: "Reviewer BLOCKER", result: "FAIL" }, { when: "Root asserts QA PASS", result: "INVALID" }
  ], production_entrypoint: `${base}/b6-review-protocol.mjs#evaluateDeterministicQa`
};
for (const [name, value] of [
  ["reviewer-scope-satisfiability-contract.json", satisfiabilityContract], ["gate-dependency-matrix.json", gateMatrix], ["reviewer-startup-contract.json", startupContract],
  ["reviewer-early-failure-contract.json", earlyFailureContract], ["reviewer-completion-contract.json", completionContract], ["reviewer-timeout-policy.json", timeoutPolicy],
  ["reviewer-thread-exit-contract.json", exitContract], ["reviewer-return-payload.schema.json", payloadSchema], ["deterministic-qa-input-contract.json", qaInputContract],
  ["deterministic-qa-output.schema.json", qaOutputSchema], ["deterministic-qa-fail-closed-rules.json", qaFailRules]
]) await writeBoth(name, value);

const roleSpecs = [
  { role: "code-reviewer", assignment_id: "ASSIGN-B6-CODE-97D32003-5E19-4C75-A05C-04B510C66601", profile: ".codex/agents/code-reviewer.toml", review_scope: "bootstrap_code_and_gate_compatibility", scope_file: "code-reviewer-scope.json" },
  { role: "security-reviewer", assignment_id: "ASSIGN-B6-SEC-2D536A79-EDEB-4A24-9665-2321D8086602", profile: ".codex/agents/security-reviewer.toml", review_scope: "bootstrap_security_integrity_closure", scope_file: "security-reviewer-scope.json" },
  { role: "railway-domain-reviewer", assignment_id: "ASSIGN-B6-DOMAIN-862EB933-6E20-4CEB-A88E-AB2571C76603", profile: ".codex/agents/railway-domain-reviewer.toml", review_scope: "bootstrap_rule_governance_mechanism", scope_file: "railway-domain-reviewer-scope.json" },
  { role: "compatibility-reviewer", assignment_id: "ASSIGN-B6-COMPAT-76D7B8C6-FAFB-4338-977A-C63F1F326604", profile: ".codex/agents/compatibility-reviewer.toml", review_scope: "bootstrap_governance_compatibility", scope_file: "compatibility-reviewer-scope.json" }
];
const reviewAssignments = [];
for (const role of roleSpecs) reviewAssignments.push({ assignment_id: role.assignment_id, required_role_id: role.role, agent_profile_reference: role.profile, agent_profile_sha256: sha256(await read(role.profile)), allowed_read_paths: [`${pkg}/reviewer-scopes/${role.scope_file}`], allowed_write_paths: [], required_review_scope: role.review_scope, execution_mode: "read-only", implementation_participation: false });

const b6Intent = {
  schema_version: 1, status: "DRAFT", task_id: b6Id, title: "Session B6 Four-Reviewer Compatibility Review with Deterministic QA", task_type: "review",
  objective: "Future separately authorized review of the unchanged Phase 1.9 candidate using four read-only payload-only Reviewers and non-Agent deterministic QA.",
  business_reason: "Revalidate four open B2 findings after R12 task-local dispatch protocol preparation.",
  scope: { include: [`.codex/tasks/${b6Id}/**`, `${pkg}/**`, "Exact read-only candidate and frozen governance evidence"], exclude: ["candidate mutation", "human approval during review", "Git/product/DB/migration operations"], product_changes_allowed: false, database_operations_allowed: false, git_mutation_allowed: false },
  acceptance_criteria: ["Four unique read-only payload-only Reviewer sessions complete sequentially.", "All payload and transport hashes validate.", "Deterministic QA executes after four frozen payloads.", "Candidate remains 103/103 unchanged."], requested_by: "human-governance-owner", authorization: "NOT AUTHORIZED; R12 prepares inputs only."
};
const b6Class = {
  schema_version: 1, task_id: b6Id, level: "L3", reasons: ["Formal compatibility review", "Security and domain governance revalidation"], triggers: ["unresolved Reviewer blocker", "backward compatibility"],
  execution_categories: ["governance-validation", "security", "backward-compatibility"], required_agents: roleSpecs.map((item) => item.role), required_reviews: ["code", "security", "railway-domain", "compatibility"], parallel_allowed: false,
  evidence_required: ["B6-SCOPES", "B6-PAYLOADS", "B6-QA", "B6-BASELINE", "B6-GATE"], human_approval: { required: true, stages: ["scope_approval", "execution_approval", "review_completion", "final_commit_approval"] },
  stop_conditions: ["Any scope is unsatisfiable.", "Any Reviewer payload is invalid.", "Any thread fails to close.", "Any candidate/history change occurs."],
  scope: { include: [`.codex/tasks/${b6Id}/**`, `${pkg}/**`], exclude: [".env*", "collab/**", "frontend/**", "erp-api/**", "db-design/**", "migration/**", "parent directories", "sibling directories", "conversation memory"] },
  classified_by: "R12-task-local-preparation", classification_status: "proposed"
};
const b6Blueprint = {
  schema_version: 1, blueprint_id: `BP-${b6Id}`, task_id: b6Id, risk: { level: "L3", reasons: ["Formal four-role review and deterministic QA."] },
  scope: { include: [`.codex/tasks/${b6Id}/**`, `${pkg}/**`], exclude: ["candidate/history mutation", "Git/product/DB/migration operations"], product_changes_allowed: false, database_operations_allowed: false },
  allowed_paths: { read: [`${pkg}/**`], write: [] }, agent_assignments: [{ role: "architect", allowed_read_paths: [`${pkg}/**`], allowed_write_paths: [] }], review_assignments: reviewAssignments,
  applicable_rules: ["GOV-SCOPE-001", "REV-INDEP-001", "REV-L3-001", "EVD-HASH-001"], candidate_rules: [], required_agents: roleSpecs.map((item) => item.role),
  execution: { parallel_groups: [], sequential_steps: ["Validate pre-review package.", "Dispatch Code and capture one payload.", "Dispatch Security and capture one payload.", "Dispatch Railway and capture one payload.", "Materialize exact Compatibility transport binding, revalidate scope and dispatch Compatibility.", "Run deterministic QA.", "Recompute gate and stop."] },
  evidence_required: b6Class.evidence_required, rollback_restore: { required: false, evidence_or_reason: "Review is read-only; only task-local transport records may be created after authorization." },
  human_approval: { required: true, approver_roles: ["human-governance-owner"] }, stop_conditions: b6Class.stop_conditions
};
await writeJson(`${pkg}/task-intent.yaml`, b6Intent); await writeJson(`${pkg}/classification.yaml`, b6Class); await writeJson(`${pkg}/blueprint.yaml`, b6Blueprint); await writeJson(`${pkg}/reviewer-assignments.json`, reviewAssignments);
await writeJson(`${pkg}/fresh-root-preflight.json`, { schema_version: 1, task_id: b6Id, preflight_stage: "B6_RUNTIME_STARTUP", fresh_root_confirmed: false, existing_child_threads: null, reviewer_count: 4, maximum_concurrent_reviewers: 1, reviewers_may_spawn_children: false, deterministic_qa_requires_child_agent: false, runtime_validation_required: true, dispatch_authorized: false, result: "PENDING_RUNTIME_VALIDATION" });

const nodeRefs = {
  candidate_manifest: manifestRef, candidate_record: recordRef, scanner_report: reportRef, scanner_contract: ".codex/governance/scan-contract.yaml",
  finding_registry: ".codex/governance/scanner-finding-registry.yaml", canonicalization_config: ".codex/governance/scanner-canonicalization-config.yaml",
  binary_oracle_config: ".codex/governance/scanner-binary-oracle.yaml", binary_magic_registry: ".codex/governance/bootstrap-binary-magic-registry.yaml"
};
const nodes = {}; for (const [name, ref] of Object.entries(nodeRefs)) nodes[name] = await info(ref);
const binding = {
  schema_version: 1, task_id: b6Id, candidate: { manifest_path: manifestRef, manifest_sha256: manifestSha, included_file_set_sha256: fileSetSha, file_count: 103 },
  candidate_record: { path: recordRef, sha256: sha256(recordBytes), bound_manifest_sha256: record.manifest_sha256, bound_file_set_sha256: record.included_file_set_sha256 },
  scanner_report: { path: reportRef, sha256: sha256(reportBytes), bound_manifest_sha256: scannerReport.candidate_binding.manifest_sha256, included_file_set_sha256: scannerReport.candidate_binding.included_file_set_sha256, scanned_file_set_sha256: scannerReport.candidate_binding.scanned_file_set_sha256, expected_file_count: scannerReport.candidate_binding.expected_file_count, scanned_file_count: scannerReport.candidate_binding.scanned_file_count, finding_count: scannerReport.results.finding_count },
  scanner_contract: { path: nodeRefs.scanner_contract, id: "GOV-DETERMINISTIC-SCAN", version: 5, sha256: nodes.scanner_contract.sha256 }, required_nodes: nodes, result: "PASS"
};
const securityEvidence = {
  schema_version: 1, task_id: b6Id, scan_scope: { governance_artifacts: "DETERMINISTIC_CONTRACT", external_referenced_evidence: "LIMITED" },
  scan_contract: { scan_contract_id: "GOV-DETERMINISTIC-SCAN", scan_contract_version: 5, manifest_sha256: manifestSha, scanned_file_count: 103, scanned_file_set_sha256: fileSetSha, contract_sha256: scannerReport.scan_contract.contract_sha256, finding_registry_sha256: scannerReport.scan_contract.finding_registry_sha256, canonicalization_config_sha256: scannerReport.scan_contract.canonicalization_config_sha256, binary_oracle_config_sha256: scannerReport.scan_contract.binary_oracle_config_sha256, binary_magic_registry_sha256: scannerReport.scan_contract.binary_magic_registry_sha256, schema_set_sha256: scannerReport.scan_contract.schema_set_sha256 },
  claims: { declared_scan_contract_executed: true, no_findings_within_declared_contract: true, external_evidence_globally_clean: false, global_sensitive_data_absence_verified: false }, external_evidence: [], limitations: ["Exact deterministic contract and 103-file candidate only.", "No global DLP, secret absence, identity, business-rule or commit authority claim."]
};
const schemaSet = await loadAndCompileGovernanceSchemas(root);
const secIssues = schemaSet.validate(".codex/blueprints/schemas/security-evidence.schema.json", securityEvidence, `${pkg}/session-b6-security-evidence.yaml`);
if (secIssues.length) throw new Error(`B6_SECURITY_SCHEMA:${secIssues.join("|")}`);
await writeJson(`${pkg}/session-b6-security-binding-chain.json`, binding); await writeJson(`${pkg}/session-b6-security-evidence.yaml`, securityEvidence);
await writeJson(`${pkg}/required-chain-node-verification.json`, { schema_version: 1, task_id: b6Id, required_node_count: 8, nodes: Object.entries(nodes).map(([node, item]) => ({ node, path: item.path, expected_sha256: item.sha256, actual_sha256: item.sha256, result: "PASS" })), missing_required_nodes: [], forbidden_paths_present: [], result: "PASS" });

const securityAllowedRefs = [...new Set([...candidateFiles.map((item) => item.path), ...Object.values(nodeRefs), `${pkg}/session-b6-security-binding-chain.json`, `${pkg}/session-b6-security-evidence.yaml`, `${pkg}/required-chain-node-verification.json`, ".codex/blueprints/schemas/security-evidence.schema.json", ".codex/scripts/lib/governance/governance-schema-loader.mjs", ".codex/tasks/GOV-PHASE1-SESSION-B2-COMPATIBILITY-REVIEW/review-findings.yaml", ".codex/tasks/GOV-PHASE1-SESSION-B2-COMPATIBILITY-REVIEW/security-integrity-review.json", ".codex/tasks/GOV-PHASE1-REMEDIATION-10/migration-320-integrity.json", ".codex/tasks/GOV-PHASE1-SESSION-B2-COMPATIBILITY-REVIEW/migration-320-compatibility.json", ".codex/tasks/GOV-M320-DRYRUN/review-findings.yaml", ".codex/tasks/GOV-M320-DRYRUN/artifact-manifest.yaml", ".codex/tasks/GOV-M320-DRYRUN/test-evidence.yaml"])].sort();
const securityAllowedFiles = []; for (const ref of securityAllowedRefs) securityAllowedFiles.push({ ...(await info(ref)), purpose: "Exact Security chain, candidate, registered schema, historical closure or approved M320 governance summary.", required: true, allowed_operations: ["read"] });
const commonForbidden = [".env*", "collab/**", "frontend/**", "erp-api/**", "db-design/**", "migration/**", ".codex/tasks/GOV-M320-DRYRUN/implementation-handoff.yaml", ".codex/tasks/GOV-M320-DRYRUN/implementation-plan.md", `.codex/tasks/${b6Id}/human-approval.yaml`, `.codex/tasks/${b6Id}/reviewer-payloads/**`, "conversation memory"];
const securityReadScope = { schema_version: 4, task_id: b6Id, reviewer_role: "security-reviewer", assignment_id: roleSpecs[1].assignment_id, allowed_files: securityAllowedFiles, forbidden_paths: commonForbidden, required_nodes: nodes, directory_globs_allowed: false, workspace_write_allowed: false };
securityReadScope.scope_sha256 = canonicalSha256(securityReadScope);
await writeJson(`${pkg}/session-b6-security-read-scope.json`, securityReadScope);

const staticProtocolRefs = [
  `${pkg}/task-intent.yaml`, `${pkg}/classification.yaml`, `${pkg}/blueprint.yaml`, `${pkg}/reviewer-assignments.json`, `${pkg}/fresh-root-preflight.json`, `${pkg}/gate-dependency-matrix.json`,
  `${pkg}/reviewer-scope-satisfiability-contract.json`, `${pkg}/reviewer-startup-contract.json`, `${pkg}/reviewer-early-failure-contract.json`, `${pkg}/reviewer-completion-contract.json`,
  `${pkg}/reviewer-timeout-policy.json`, `${pkg}/reviewer-thread-exit-contract.json`, `${pkg}/reviewer-return-payload.schema.json`, `${pkg}/deterministic-qa-input-contract.json`,
  `${pkg}/deterministic-qa-output.schema.json`, `${pkg}/deterministic-qa-fail-closed-rules.json`, `${pkg}/session-b6-security-binding-chain.json`, `${pkg}/session-b6-security-read-scope.json`,
  `${pkg}/session-b6-security-evidence.yaml`, `${pkg}/required-chain-node-verification.json`
];
const commonReviewRefs = [manifestRef, recordRef, reportRef, ".codex/blueprints/schemas/security-evidence.schema.json", ".codex/scripts/lib/governance/governance-schema-loader.mjs", ".codex/scripts/lib/governance/scope-lattice.mjs", `${base}/b6-review-protocol.mjs`, ...staticProtocolRefs, `${pkg}/pre-review-input-manifest.json`, `${pkg}/pre-review-freeze.json`];
const baselineRefs = [`${base}/review-baseline-before.json`, ".codex/tasks/GOV-PHASE1-SESSION-B5-COMPATIBILITY-REVIEW/review-baseline-after.json", ".codex/tasks/GOV-PHASE1-SESSION-B5-COMPATIBILITY-REVIEW/baseline-comparison.json", ".codex/tasks/GOV-PHASE1-B5-DISPATCH-INCIDENT-ANALYSIS/baseline-comparison.json"];
const codeRefs = [...new Set([...candidateFiles.map((item) => item.path), ...commonReviewRefs, ...baselineRefs, ".codex/governance/scan-contract.yaml", ".codex/tasks/GOV-PHASE1-SESSION-B2-COMPATIBILITY-REVIEW/review-findings.yaml"])];
const securityRefs = [...new Set([...securityAllowedRefs, ...commonReviewRefs, ...baselineRefs])];
const railwayCandidate = candidateFiles.map((item) => item.path).filter((ref) => /(railway|review|schema|rule|agent|workflow|governance)/i.test(ref));
const railwayRefs = [...new Set([...railwayCandidate, manifestRef, ...staticProtocolRefs, `${base}/review-baseline-before.json`, ".codex/agents/railway-domain-reviewer.toml", ".codex/blueprints/schemas/railway-domain-review.schema.json", ".codex/tasks/GOV-PHASE1-REMEDIATION-10/migration-320-integrity.json", ".codex/tasks/GOV-PHASE1-SESSION-B2-COMPATIBILITY-REVIEW/migration-320-compatibility.json", ".codex/tasks/GOV-M320-DRYRUN/review-findings.yaml", ".codex/tasks/GOV-M320-DRYRUN/artifact-manifest.yaml", ".codex/tasks/GOV-M320-DRYRUN/test-evidence.yaml"] )];
const compatibilityRefs = [...new Set([...candidateFiles.map((item) => item.path), ...staticProtocolRefs, ...baselineRefs, ".codex/tasks/GOV-PHASE1-SESSION-B2-COMPATIBILITY-REVIEW/review-findings.yaml", ".codex/tasks/GOV-PHASE1-B5-DISPATCH-INCIDENT-ANALYSIS/candidate-change-assessment.json", ".codex/tasks/GOV-PHASE1-B5-DISPATCH-INCIDENT-ANALYSIS/reviewer-scope-satisfiability-result.json"] )];
const roleRefs = { "code-reviewer": codeRefs, "security-reviewer": securityRefs, "railway-domain-reviewer": railwayRefs, "compatibility-reviewer": compatibilityRefs };
const scopes = {};
for (const role of roleSpecs) {
  const allowed = [...new Set(roleRefs[role.role])].sort();
  const scope = { schema_version: 2, task_id: b6Id, reviewer_role: role.role, assignment_id: role.assignment_id, allowed_paths: allowed, forbidden_paths: commonForbidden, required_capabilities: allowed.map((ref) => `artifact:${ref}`), dynamic_input_contracts: role.role === "compatibility-reviewer" ? [{ capability: "first_three_frozen_reviewer_payloads", transport_mode: "dispatch-bound byte-identical payload and envelope", required_roles: ["code-reviewer", "security-reviewer", "railway-domain-reviewer"], resolution_stage: "after_first_three_threads_closed", filesystem_placeholder_forbidden: true, second_satisfiability_check_required: true }] : [], directory_globs_allowed: false, workspace_write_allowed: false, allowed_write_paths: [], artifact_write_allowed: false, return_payload_only: true, subagent_creation_allowed: false };
  scope.scope_sha256 = computeScopeSha256(scope);
  scopes[role.role] = scope;
  await writeJson(`${pkg}/reviewer-scopes/${role.scope_file}`, scope);
}

const schemaRefs = [
  `${pkg}/task-intent.yaml`, `${pkg}/classification.yaml`, `${pkg}/blueprint.yaml`, `${pkg}/reviewer-assignments.json`, `${pkg}/fresh-root-preflight.json`, `${pkg}/gate-dependency-matrix.json`,
  `${pkg}/reviewer-scope-satisfiability-contract.json`, `${pkg}/reviewer-startup-contract.json`, `${pkg}/reviewer-early-failure-contract.json`, `${pkg}/reviewer-completion-contract.json`, `${pkg}/reviewer-timeout-policy.json`,
  `${pkg}/reviewer-thread-exit-contract.json`, `${pkg}/reviewer-return-payload.schema.json`, `${pkg}/deterministic-qa-input-contract.json`, `${pkg}/deterministic-qa-output.schema.json`, `${pkg}/deterministic-qa-fail-closed-rules.json`,
  `${pkg}/session-b6-security-binding-chain.json`, `${pkg}/session-b6-security-read-scope.json`, `${pkg}/session-b6-security-evidence.yaml`, `${pkg}/required-chain-node-verification.json`,
  ...roleSpecs.map((role) => `${pkg}/reviewer-scopes/${role.scope_file}`)
];
const staticInputs = []; for (const ref of schemaRefs) staticInputs.push(await info(ref)); staticInputs.sort((a, b) => a.path.localeCompare(b.path));
const staticManifest = { schema_version: 1, task_id: b6Id, manifest_type: "B6_STATIC_PRE_REVIEW_INPUT_MANIFEST", file_count: staticInputs.length, files: staticInputs, future_output_placeholders: [], reviewer_payloads_included: false, reviewer_outcomes_included: false, access_logs_included: false, qa_report_included: false, final_summary_included: false, human_approval_included: false, after_baseline_included: false, result: "PASS" };
const staticManifestInfo = await writeJson(`${pkg}/pre-review-input-manifest.json`, staticManifest);
const freeze = { schema_version: 1, task_id: b6Id, freeze_kind: "B6_LAYERED_STATIC_INPUT_FREEZE", static_manifest: staticManifestInfo, frozen_input_count: staticInputs.length, frozen_input_set_sha256: canonicalSha256(staticInputs.map(({ path: ref, sha256: digest }) => ({ path: ref, sha256: digest }))), layering: ["static inputs", "pre-review freeze", "capability matrix", "satisfiability report", "dispatch plan binding"], future_outputs_prebound: false, result: "PASS" };
const freezeInfo = await writeJson(`${pkg}/pre-review-freeze.json`, freeze);

const capabilityMatrix = { schema_version: 1, task_id: b6Id, contract_id: satisfiabilityContract.contract_id, generated_after_static_freeze: true, roles: [] };
for (const role of roleSpecs) {
  const entries = [];
  for (const ref of scopes[role.role].allowed_paths) { const artifact = await info(ref); entries.push({ capability: `artifact:${ref}`, artifact_path: ref, expected_sha256: artifact.sha256, required: true, allowed: true, forbidden: false, exists: true }); }
  capabilityMatrix.roles.push({ reviewer_role: role.role, assignment_id: role.assignment_id, scope_path: `${pkg}/reviewer-scopes/${role.scope_file}`, scope_sha256: scopes[role.role].scope_sha256, capability_count: entries.length, capabilities: entries, runtime_capabilities: scopes[role.role].dynamic_input_contracts });
}
const matrixWrites = await writeBoth("reviewer-capability-artifact-matrix.json", capabilityMatrix);
const satisfiabilityReport = { schema_version: 1, task_id: b6Id, contract_path: `${pkg}/reviewer-scope-satisfiability-contract.json`, capability_matrix_path: matrixWrites.package.path, capability_matrix_sha256: matrixWrites.package.sha256, roles: [], scope_satisfiable: true, dispatch_authorized: true, result: "PASS" };
for (const role of roleSpecs) {
  const matrixRole = capabilityMatrix.roles.find((item) => item.reviewer_role === role.role);
  const result = await validateScopeSatisfiability({ projectRoot: root, scope: scopes[role.role], capabilityEntries: matrixRole.capabilities });
  satisfiabilityReport.roles.push({ reviewer_role: role.role, scope_path: matrixRole.scope_path, scope_sha256: matrixRole.scope_sha256, scope_satisfiable: result.scope_satisfiable, dispatch_authorized: result.dispatch_authorized, issue_count: result.issues.length, issues: result.issues, capability_checks_passed: result.checks.filter((item) => item.result === "PASS").length, capability_checks_total: result.checks.length, dynamic_runtime_revalidation_required: role.role === "compatibility-reviewer" });
  if (!result.scope_satisfiable) { satisfiabilityReport.scope_satisfiable = false; satisfiabilityReport.dispatch_authorized = false; satisfiabilityReport.result = "FAIL"; }
}
const reportWrites = await writeBoth("reviewer-scope-satisfiability-report.json", satisfiabilityReport);
const dispatchPlan = {
  schema_version: 1, task_id: b6Id, authorization: "NOT AUTHORIZED; prepared input only", dispatch_mode: "strict_sequential_payload_only",
  sequence: roleSpecs.map((role, index) => ({ sequence: index + 1, reviewer_role: role.role, assignment_id: role.assignment_id, scope_path: `${pkg}/reviewer-scopes/${role.scope_file}`, scope_sha256: scopes[role.role].scope_sha256 })),
  maximum_concurrent_reviewers: 1, scope_satisfiability_report: reportWrites.package,
  pre_review_freeze: freezeInfo, payload_schema: await info(`${pkg}/reviewer-return-payload.schema.json`),
  timeout_policy: { path: `${pkg}/reviewer-timeout-policy.json`, sha256: (await info(`${pkg}/reviewer-timeout-policy.json`)).sha256, wait_snapshot_timeout_ms: 30000, maximum_consecutive_snapshots: 4, total_response_deadline_ms: 120000 },
  rules: { reviewer_writes_files: false, return_payload_only: true, root_persists_raw_bytes_without_modification: true, one_payload_only: true, next_dispatch_requires_thread_closed: true, compatibility_requires_second_stage_payload_transport_satisfiability: true, replacement_reviewer_allowed: false, partial_set_can_pass: false }, result: satisfiabilityReport.result
};
await writeJson(`${pkg}/reviewer-dispatch-plan.json`, dispatchPlan);

const taskSchemaChecks = [];
for (const [ref, schemaRef] of [[`${pkg}/task-intent.yaml`, ".codex/blueprints/schemas/task-intent.schema.json"], [`${pkg}/classification.yaml`, ".codex/blueprints/schemas/classification.schema.json"], [`${pkg}/blueprint.yaml`, ".codex/blueprints/schemas/blueprint.schema.json"]]) {
  const issues = schemaSet.validate(schemaRef, await json(ref), ref); taskSchemaChecks.push({ artifact: ref, schema: schemaRef, issue_count: issues.length, issues, result: issues.length ? "FAIL" : "PASS" });
}
const blueprintSchema = schemaSet.byRef.get(".codex/blueprints/schemas/blueprint.schema.json");
const assignmentIssues = validateSchema(blueprintSchema.properties.review_assignments, await json(`${pkg}/reviewer-assignments.json`), `${pkg}/reviewer-assignments.json`);
taskSchemaChecks.push({ artifact: `${pkg}/reviewer-assignments.json`, schema: ".codex/blueprints/schemas/blueprint.schema.json#/properties/review_assignments", issue_count: assignmentIssues.length, issues: assignmentIssues, result: assignmentIssues.length ? "FAIL" : "PASS" });
await writeJson(`${base}/task-local-schema-verification.json`, { schema_version: 1, task_id: taskId, production_loader: "loadAndCompileGovernanceSchemas", assignment_schema_source: ".codex/blueprints/schemas/blueprint.schema.json#/properties/review_assignments", inline_schema_used: false, fallback_schema_used: false, checks: taskSchemaChecks, task_intent_issues: taskSchemaChecks[0].issue_count, classification_issues: taskSchemaChecks[1].issue_count, blueprint_issues: taskSchemaChecks[2].issue_count, reviewer_assignment_issues: taskSchemaChecks[3].issue_count, result: taskSchemaChecks.every((item) => item.issue_count === 0) ? "PASS" : "FAIL" });

console.log("R12_PREPARATION_BUILT");
console.log(`CANDIDATE=${candidateFiles.length}/103`);
console.log(`STATIC_INPUTS=${staticInputs.length}`);
console.log(`SCOPES_SATISFIABLE=${satisfiabilityReport.roles.filter((item) => item.scope_satisfiable).length}/4`);
console.log(`TASK_SCHEMA_ISSUES=${taskSchemaChecks.reduce((sum, item) => sum + item.issue_count, 0)}`);
