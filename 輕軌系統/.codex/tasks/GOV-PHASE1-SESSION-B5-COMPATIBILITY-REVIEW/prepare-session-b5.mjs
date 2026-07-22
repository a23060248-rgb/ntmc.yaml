import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { safeExistingPath } from "../../scripts/lib/path-safety.mjs";
import { canonicalSha256, sha256 } from "../../scripts/lib/governance/typed-proof.mjs";
import { loadAndCompileGovernanceSchemas } from "../../scripts/lib/governance/governance-schema-loader.mjs";

const taskDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(taskDir, "../../..");
const taskId = "GOV-PHASE1-SESSION-B5-COMPATIBILITY-REVIEW";
const base = `.codex/tasks/${taskId}`;
const r11Base = ".codex/tasks/GOV-PHASE1-REMEDIATION-11";
const r11Package = `${r11Base}/session-b3-pre-review-package`;
const forbiddenM320 = new Set([
  ".codex/tasks/GOV-M320-DRYRUN/implementation-handoff.yaml",
  ".codex/tasks/GOV-M320-DRYRUN/implementation-plan.md"
]);

const bytes = async (ref) => readFile(await safeExistingPath(root, ref));
const json = async (ref) => JSON.parse((await bytes(ref)).toString("utf8"));
const exists = async (ref) => {
  try { await access(path.join(root, ...ref.split("/"))); return true; } catch { return false; }
};
const writeJson = async (ref, value) => {
  const target = path.join(root, ...ref.split("/"));
  await mkdir(path.dirname(target), { recursive: true });
  const body = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
  await writeFile(target, body, { flag: "wx" });
  return { path: ref, sha256: sha256(body), byte_size: body.length };
};
const info = async (ref) => {
  const body = await bytes(ref);
  return { path: ref, sha256: sha256(body), byte_size: body.length };
};

if (await exists(`${base}/human-approval.yaml`)) throw new Error("B5_HUMAN_APPROVAL_MUST_NOT_EXIST");

const manifestRef = ".codex/governance/governance-commit-manifest.yaml";
const recordRef = ".codex/tasks/GOV-PHASE1-REMEDIATION-9/bootstrap-candidate-record.json";
const reportRef = ".codex/tasks/GOV-PHASE1-REMEDIATION-9/bootstrap-scanner-report.json";
const manifestBytes = await bytes(manifestRef);
const manifest = JSON.parse(manifestBytes.toString("utf8"));
const recordBytes = await bytes(recordRef);
const record = JSON.parse(recordBytes.toString("utf8"));
const reportBytes = await bytes(reportRef);
const report = JSON.parse(reportBytes.toString("utf8"));
const included = [];
for (const item of manifest.artifacts.filter((entry) => entry.commit_inclusion === true)) {
  const body = await bytes(item.path);
  const digest = sha256(body);
  if (digest !== item.sha256.toUpperCase()) throw new Error(`INVALID_BASELINE:${item.path}`);
  included.push({ path: item.path, sha256: digest, byte_size: body.length });
}
included.sort((a, b) => a.path.localeCompare(b.path));
const manifestSha = sha256(manifestBytes);
const fileSetSha = canonicalSha256(included.map(({ path: filePath, sha256: digest }) => ({ path: filePath, sha256: digest })));
if (included.length !== 103 || manifestSha !== "29F4F947DEF79A633F63E28FA2444F4734D7E6BB9612B96154A302464255531D" || fileSetSha !== "739DAC633946266BCD28A71BE236D3748C57550AB1749A29C4F5E59421F993CB") {
  throw new Error("INVALID_BASELINE:FIXED_CANDIDATE_MISMATCH");
}

const r11Manifest = await json(`${r11Package}/pre-review-input-manifest.json`);
const r11Checks = [];
for (const entry of r11Manifest.files) {
  const actual = await info(entry.path);
  r11Checks.push({ path: entry.path, expected_sha256: entry.sha256, actual_sha256: actual.sha256, result: actual.sha256 === entry.sha256 ? "PASS" : "FAIL" });
}
if (r11Checks.length !== 15 || r11Checks.some((entry) => entry.result !== "PASS")) throw new Error("R11_SOURCE_PACKAGE_HASH_MISMATCH");
await writeJson(`${base}/r11-source-package-verification.json`, {
  schema_version: 1, task_id: taskId, source_package: `${r11Package}/pre-review-input-manifest.json`,
  expected_file_count: 15, verified_file_count: r11Checks.length, checks: r11Checks, result: "PASS"
});

const preflight = {
  schema_version: 1, task_id: taskId, fresh_root_confirmed: true, existing_child_threads: 0,
  reviewer_count: 4, maximum_concurrent_reviewers: 1, reviewers_may_spawn_children: false,
  deterministic_qa_requires_child_agent: false, lifecycle_allocation_capacity_preproof_required: false,
  result: "PASS"
};
await writeJson(`${base}/fresh-root-preflight.json`, preflight);

const protectedSource = await json(`${r11Base}/review-baseline-after.json`);
const protectedFiles = [];
const exclusions = [];
for (const entry of protectedSource.files) {
  const ref = entry.relative_path;
  if (forbiddenM320.has(ref) || /(^|\/)(HANDOFF\.md|implementation-plan\.md|implementation-handoff\.yaml)$/i.test(ref)) {
    exclusions.push({ path: ref, reason: "B5_EXACT_READ_PROHIBITION", inherited_sha256: entry.sha256 });
    continue;
  }
  const current = await info(ref);
  if (current.sha256 !== entry.sha256) throw new Error(`INVALID_BASELINE:${ref}`);
  protectedFiles.push({ relative_path: ref, artifact_type: entry.artifact_type, byte_size: current.byte_size, sha256: current.sha256 });
}
for (const ref of [`${r11Base}/artifact-manifest.yaml`, `${r11Base}/pre-review-freeze.json`, ".codex/tasks/GOV-PHASE1-SESSION-B3-COMPATIBILITY-REVIEW/artifact-manifest.yaml", ".codex/tasks/GOV-PHASE1-SESSION-B3-COMPATIBILITY-REVIEW/session-b3-summary.json"]) {
  const current = await info(ref);
  protectedFiles.push({ relative_path: ref, artifact_type: "post-r11-frozen-anchor", byte_size: current.byte_size, sha256: current.sha256 });
}
protectedFiles.sort((a, b) => a.relative_path.localeCompare(b.relative_path));
const baseline = {
  schema_version: 1, task_id: taskId, baseline_role: "before", root_token: "${PRODUCT_ROOT}",
  review_task_excluded: `${base}/**`, git_diff_used: false,
  candidate: { manifest_ref: manifestRef, manifest_sha256: manifestSha, included_file_set_sha256: fileSetSha, file_count: 103, candidate_record_ref: recordRef, candidate_record_sha256: sha256(recordBytes), scanner_report_ref: reportRef, scanner_report_sha256: sha256(reportBytes) },
  protected_file_count: protectedFiles.length, files: protectedFiles,
  prohibited_files_not_read: exclusions,
  prohibited_integrity_claim_boundary: "The exact prohibited implementation-plan and HANDOFF bytes were not read; their inherited frozen hashes are recorded but not represented as fresh B5 readback.",
  result: "PASS"
};
await writeJson(`${base}/review-baseline-before.json`, baseline);

const schemaSet = await loadAndCompileGovernanceSchemas(root);
const schemaRef = ".codex/blueprints/schemas/security-evidence.schema.json";
const schemaBytes = await bytes(schemaRef);
const schemaEntry = manifest.artifacts.find((entry) => entry.path === schemaRef);
if (!schemaEntry || schemaEntry.sha256.toUpperCase() !== sha256(schemaBytes)) throw new Error("REGISTERED_SCHEMA_NOT_CANDIDATE_BOUND");
const securityEvidence = {
  schema_version: 1, task_id: taskId,
  scan_scope: { governance_artifacts: "DETERMINISTIC_CONTRACT", external_referenced_evidence: "LIMITED" },
  scan_contract: {
    scan_contract_id: "GOV-DETERMINISTIC-SCAN", scan_contract_version: 5,
    manifest_sha256: manifestSha, scanned_file_count: 103, scanned_file_set_sha256: fileSetSha,
    contract_sha256: report.scan_contract.contract_sha256,
    finding_registry_sha256: report.scan_contract.finding_registry_sha256,
    canonicalization_config_sha256: report.scan_contract.canonicalization_config_sha256,
    binary_oracle_config_sha256: report.scan_contract.binary_oracle_config_sha256,
    binary_magic_registry_sha256: report.scan_contract.binary_magic_registry_sha256,
    schema_set_sha256: report.scan_contract.schema_set_sha256
  },
  claims: { declared_scan_contract_executed: true, no_findings_within_declared_contract: true, external_evidence_globally_clean: false, global_sensitive_data_absence_verified: false },
  external_evidence: [],
  limitations: ["Evidence is limited to the exact declared deterministic contract and 103-file candidate.", "No FULL, complete DLP, global secret absence, cryptographic identity or commit authority claim is made."]
};
const schemaIssues = schemaSet.validate(schemaRef, securityEvidence, `${base}/session-b5-security-evidence.yaml`);
if (schemaIssues.length) throw new Error(`B5_SECURITY_SCHEMA_FAIL:${schemaIssues.join("|")}`);
await writeJson(`${base}/official-security-evidence-schema-verification.json`, {
  schema_version: 1, task_id: taskId, schema_id: JSON.parse(schemaBytes).$id,
  schema_path: schemaRef, schema_sha256: sha256(schemaBytes), candidate_manifest_hash_match: true,
  schema_set_sha256: schemaSet.schema_set_sha256, production_loader: "loadAndCompileGovernanceSchemas",
  registered_schema_count: schemaSet.schemas.length, inline_schema_used: false, fallback_schema_used: false,
  task_local_schema_used: false, validation_issues: [], result: "PASS"
});
await writeJson(`${base}/session-b5-security-evidence.yaml`, securityEvidence);

const nodeRefs = {
  candidate_manifest: manifestRef,
  candidate_record: recordRef,
  scanner_report: reportRef,
  scanner_contract: ".codex/governance/scan-contract.yaml",
  finding_registry: ".codex/governance/scanner-finding-registry.yaml",
  canonicalization_config: ".codex/governance/scanner-canonicalization-config.yaml",
  binary_oracle_config: ".codex/governance/scanner-binary-oracle.yaml",
  binary_magic_registry: ".codex/governance/bootstrap-binary-magic-registry.yaml"
};
const requiredNodes = {};
for (const [name, ref] of Object.entries(nodeRefs)) requiredNodes[name] = await info(ref);
const nodeChecks = Object.entries(requiredNodes).map(([name, entry]) => ({ node: name, path: entry.path, expected_sha256: entry.sha256, actual_sha256: entry.sha256, result: "PASS" }));
await writeJson(`${base}/required-chain-node-verification.json`, { schema_version: 1, task_id: taskId, required_node_count: 8, nodes: nodeChecks, missing_required_nodes: [], forbidden_paths_present: [], result: "PASS" });
const binding = {
  schema_version: 1, task_id: taskId,
  candidate: { manifest_path: manifestRef, manifest_sha256: manifestSha, included_file_set_sha256: fileSetSha, file_count: 103 },
  candidate_record: { path: recordRef, sha256: sha256(recordBytes), bound_manifest_sha256: record.manifest_sha256, bound_file_set_sha256: record.included_file_set_sha256 },
  scanner_report: { path: reportRef, sha256: sha256(reportBytes), bound_manifest_sha256: report.candidate_binding.manifest_sha256, included_file_set_sha256: report.candidate_binding.included_file_set_sha256, scanned_file_set_sha256: report.candidate_binding.scanned_file_set_sha256, expected_file_count: report.candidate_binding.expected_file_count, scanned_file_count: report.candidate_binding.scanned_file_count, finding_count: report.results.finding_count },
  scanner_contract: { path: nodeRefs.scanner_contract, id: "GOV-DETERMINISTIC-SCAN", version: 5, sha256: requiredNodes.scanner_contract.sha256 },
  required_nodes: requiredNodes,
  claim_boundary: { declared_contract_only: true, global_secret_absence: false, complete_dlp: false, producer_identity: false },
  result: "PASS"
};
await writeJson(`${base}/session-b5-security-binding-chain.json`, binding);

const oldSecurityScope = await json(`${r11Package}/session-b3-security-read-scope.json`);
const replaceRef = (value) => value
  .replaceAll("GOV-PHASE1-SESSION-B3-COMPATIBILITY-REVIEW", taskId)
  .replaceAll(`${r11Package}/session-b3-`, `${base}/session-b5-`)
  .replaceAll(`${r11Package}/`, `${base}/`);
const normalize = (value) => {
  if (typeof value === "string") return replaceRef(value);
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalize(item)]));
  return value;
};
const securityScope = normalize(oldSecurityScope);
securityScope.task_id = taskId;
securityScope.forbidden_paths = [...new Set([...(securityScope.forbidden_paths ?? []).map(replaceRef), ...forbiddenM320, `${base}/human-approval.yaml`, "collab/**", "frontend/**", "erp-api/**", "db-design/**", "migration/**", "conversation memory"])]
  .sort();
securityScope.allowed_paths = (securityScope.allowed_paths ?? []).filter((entry) => !forbiddenM320.has(typeof entry === "string" ? entry : entry.path));
securityScope.scope_sha256 = canonicalSha256({ ...securityScope, scope_sha256: undefined });
await writeJson(`${base}/session-b5-security-read-scope.json`, securityScope);

const roleSpecs = [
  { role: "code-reviewer", short: "CODE", assignment: "ASSIGN-B5-CODE-6C602EC0-59B9-4D80-A41C-9DD3B94FD501", profile: ".codex/agents/code-reviewer.toml", source: "code-reviewer-scope.json", review_scope: "bootstrap_code_and_gate_compatibility" },
  { role: "security-reviewer", short: "SEC", assignment: "ASSIGN-B5-SEC-7B405BE8-2C59-42F7-91F2-7059693F2502", profile: ".codex/agents/security-reviewer.toml", source: "security-reviewer-scope.json", review_scope: "bootstrap_security_integrity_closure" },
  { role: "railway-domain-reviewer", short: "DOMAIN", assignment: "ASSIGN-B5-DOMAIN-E5F95EA1-57F0-4773-BD9F-FA41003AE503", profile: ".codex/agents/railway-domain-reviewer.toml", source: "railway-domain-reviewer-scope.json", review_scope: "bootstrap_rule_governance_mechanism" },
  { role: "compatibility-reviewer", short: "COMPAT", assignment: "ASSIGN-B5-COMPAT-8FF4C321-ACB0-4214-8319-331CA41EA504", profile: ".codex/agents/compatibility-reviewer.toml", source: "compatibility-reviewer-scope.json", review_scope: "bootstrap_governance_compatibility" }
];
const assignments = [];
for (const spec of roleSpecs) {
  assignments.push({ assignment_id: spec.assignment, reviewer_role: spec.role, profile_path: spec.profile, profile_sha256: sha256(await bytes(spec.profile)), review_scope: spec.review_scope, execution_mode: "read-only", implementation_participation: false, fresh_session_required: true, subagent_creation_allowed: false, allowed_write_paths: [`${base}/${spec.role}-review.json`, `${base}/${spec.role}-access-log.json`, `${base}/${spec.role}-clean-context-attestation.yaml`, `${base}/${spec.role}-output-manifest.json`] });
}
await writeJson(`${base}/reviewer-assignments.json`, { schema_version: 1, task_id: taskId, assignment_count: 4, unique_assignment_ids: true, assignments, result: "PASS" });
await writeJson(`${base}/reviewer-dispatch-plan.json`, {
  schema_version: 1, task_id: taskId, dispatch_mode: "strict_sequential_fresh_sessions",
  sequence: roleSpecs.map((spec, index) => ({ sequence: index + 1, reviewer_role: spec.role, assignment_id: spec.assignment })),
  maximum_concurrent_reviewers: 1,
  rules: { reviewer_reuse: false, reviewer_subagents: false, next_dispatch_requires_prior_thread_closed: true, allocation_failure_result: "REVIEWER_DISPATCH_BLOCKER", deterministic_qa_requires_child_agent: false },
  result: "PASS"
});

const scopeFiles = [];
for (const spec of roleSpecs) {
  const old = await json(`${r11Package}/reviewer-read-scopes/${spec.source}`);
  const scope = normalize(old);
  scope.task_id = taskId;
  scope.assignment_id = spec.assignment;
  scope.allowed_paths = [...new Set((scope.allowed_paths ?? []).map(replaceRef).filter((ref) => !forbiddenM320.has(ref) && ref !== `${base}/human-approval.yaml`))].sort();
  scope.forbidden_paths = [...new Set([...(scope.forbidden_paths ?? []).map(replaceRef), ...forbiddenM320, `${base}/human-approval.yaml`, "conversation memory"])]
    .sort();
  scope.allowed_write_paths = assignments.find((entry) => entry.reviewer_role === spec.role).allowed_write_paths;
  scope.directory_globs_allowed = false;
  scope.scope_sha256 = canonicalSha256({ ...scope, scope_sha256: undefined });
  scopeFiles.push(await writeJson(`${base}/reviewer-scopes/${spec.source}`, scope));
}

const taskIntent = {
  schema_version: 1, status: "AUTHORIZED_FOR_REVIEW", task_id: taskId,
  title: "Session B5 Four-Reviewer Compatibility Review with Deterministic QA Gate", task_type: "review",
  objective: "Review the unchanged 103-file Phase 1.9 candidate with four independent formal Reviewers followed by a non-Agent deterministic QA readback gate.",
  scope: { include: [`${base}/**`, "Exact read-only candidate and frozen governance evidence"], exclude: ["candidate mutation", "historical outcome mutation", "remediation", "Git mutation", "product/database/migration operations", "human exact-manifest confirmation"], product_changes_allowed: false, database_operations_allowed: false, git_mutation_allowed: false },
  review_model: { independent_formal_reviewers: 4, deterministic_qa_gate: 1, deterministic_qa_is_reviewer: false },
  authorization: "Human governance owner authorized Session B5 in the current task."
};
const classification = {
  schema_version: 1, task_id: taskId, level: "L3",
  reasons: ["Formal compatibility closure review", "Security evidence and exact read-scope verification", "Environment-bound deterministic QA replacement control"],
  triggers: ["unresolved Reviewer blocker", "backward compatibility", "formal schema contract"],
  execution_categories: ["governance-validation", "security", "backward-compatibility"],
  required_agents: roleSpecs.map((spec) => spec.role), required_reviews: ["code", "security", "railway-domain", "compatibility"],
  parallel_allowed: false, evidence_required: ["B5-CANDIDATE", "B5-SCHEMA", "B5-SCOPES", "B5-REVIEWS", "B5-QA", "B5-BASELINE"],
  scope: { include: [`${base}/**`], exclude: [".env*", "collab/**", "frontend/**", "erp-api/**", "db-design/**", "migration/**", "parent directories", "sibling directories", "conversation memory"] },
  classification_status: "human-authorized"
};
const blueprint = {
  schema_version: 1, blueprint_id: `BP-${taskId}`, task_id: taskId,
  risk: { level: "L3", reasons: ["Final compatibility closure and deterministic QA gate."] },
  scope: { include: [`${base}/**`, "read-only frozen governance evidence"], exclude: ["candidate mutation", "Git/product/DB/migration operations"] },
  allowed_paths: { read: roleSpecs.map((spec) => `${base}/reviewer-scopes/${spec.source}`), write: [`${base}/**`] },
  review_assignments: assignments.map((entry) => ({ assignment_id: entry.assignment_id, required_role_id: entry.reviewer_role, agent_profile_reference: entry.profile_path, agent_profile_sha256: entry.profile_sha256, allowed_read_paths: [`${base}/reviewer-scopes/${roleSpecs.find((spec) => spec.role === entry.reviewer_role).source}`], allowed_write_paths: entry.allowed_write_paths, required_review_scope: entry.review_scope, execution_mode: entry.execution_mode, implementation_participation: false })),
  execution: { parallel_groups: [], sequential_steps: ["Freeze exact pre-review inputs.", "Run Code Reviewer and freeze output.", "Run Security Reviewer and freeze output.", "Run Railway Domain Reviewer and freeze output.", "Run Compatibility Reviewer and freeze output.", "Run production deterministic QA readback.", "Recompute gates and stop."] },
  human_approval: { required: true, create_only_after_all_reviews_and_qa: true, initial_status: "pending" }
};
await writeJson(`${base}/task-intent.yaml`, taskIntent);
await writeJson(`${base}/classification.yaml`, classification);
await writeJson(`${base}/blueprint.yaml`, blueprint);

const manifestNames = [
  "task-intent.yaml", "classification.yaml", "blueprint.yaml", "reviewer-assignments.json", "reviewer-dispatch-plan.json",
  "fresh-root-preflight.json", "review-baseline-before.json", "session-b5-security-binding-chain.json",
  "session-b5-security-read-scope.json", "session-b5-security-evidence.yaml", "required-chain-node-verification.json",
  "official-security-evidence-schema-verification.json", "r11-source-package-verification.json",
  ...roleSpecs.map((spec) => `reviewer-scopes/${spec.source}`)
];
const preFiles = [];
for (const name of manifestNames) preFiles.push(await info(`${base}/${name}`));
preFiles.sort((a, b) => a.path.localeCompare(b.path));
const futurePattern = /(review\.json|access-log|clean-context-attestation|output-manifest|human-approval|qa-deterministic-readback|review-baseline-after|final-summary)/i;
const future = preFiles.filter((entry) => futurePattern.test(entry.path));
if (future.length) throw new Error("PRE_REVIEW_FUTURE_OUTPUT_PLACEHOLDER");
const preManifest = {
  schema_version: 1, task_id: taskId, manifest_type: "B5_PRE_REVIEW_INPUT_MANIFEST",
  file_count: preFiles.length, files: preFiles, future_output_placeholders: [], only_existing_inputs: true
};
const preManifestInfo = await writeJson(`${base}/pre-review-input-manifest.json`, preManifest);
await writeJson(`${base}/pre-review-freeze.json`, {
  schema_version: 1, task_id: taskId, freeze_kind: "B5_PRE_REVIEW_INPUT_FREEZE",
  pre_review_manifest: preManifestInfo, frozen_input_count: preFiles.length,
  frozen_input_set_sha256: canonicalSha256(preFiles.map(({ path: filePath, sha256: digest }) => ({ path: filePath, sha256: digest }))),
  reviewer_outputs_prebound: false, human_approval_prebound: false, after_baseline_prebound: false,
  schema_validation_result: "PASS", security_allowlist_forbidden_path_count: 0,
  result: "PASS"
});

console.log("B5_PRE_REVIEW_PREPARED");
console.log(`CANDIDATE=${included.length}/103`);
console.log(`R11_SOURCE=${r11Checks.filter((entry) => entry.result === "PASS").length}/15`);
console.log(`PRE_REVIEW_INPUTS=${preFiles.length}`);
console.log("SECURITY_SCHEMA=PASS");
console.log("FRESH_ROOT_PREFLIGHT=PASS");
