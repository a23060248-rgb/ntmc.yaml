import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const taskDir = path.dirname(fileURLToPath(import.meta.url));
const sourceRoot = path.resolve(taskDir, "../../..");
const workRoot = path.join(taskDir, "_before-fix-fixtures");
const candidateManifestRef = ".codex/governance/governance-commit-manifest.yaml";
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const sha256 = (value) => createHash("sha256").update(Buffer.isBuffer(value) ? value : Buffer.from(String(value), "utf8")).digest("hex").toUpperCase();
function jcs(value) {
  if (value === null) return "null";
  if (["boolean", "number", "string"].includes(typeof value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(jcs).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${jcs(value[key])}`).join(",")}}`;
}
const jcsSha256 = (value) => sha256(jcs(value));
const abs = (ref, root = sourceRoot) => path.join(root, ...ref.replaceAll("\\", "/").split("/"));

const { validateTask } = await import(pathToFileURL(abs(".codex/scripts/validate-task.mjs")).href);
const { buildBootstrapScanReport, scannerReportPayload } = await import(pathToFileURL(abs(".codex/scripts/lib/governance/scanner-report.mjs")).href);
const { createBootstrapWorkspaceCandidateRecord } = await import(pathToFileURL(abs(".codex/scripts/lib/governance/typed-proof.mjs")).href);
const candidateManifestBytes = await readFile(abs(candidateManifestRef));
const candidateManifest = JSON.parse(candidateManifestBytes.toString("utf8"));

if (!path.resolve(workRoot).startsWith(path.resolve(taskDir) + path.sep)) throw new Error("Fixture cleanup escaped the authorized Task directory.");
await rm(workRoot, { recursive: true, force: true });
await mkdir(workRoot, { recursive: true });

async function copyRef(ref, targetRoot) {
  const target = abs(ref, targetRoot);
  await mkdir(path.dirname(target), { recursive: true });
  await cp(abs(ref), target, { recursive: true });
}

async function prepareRoot(caseId) {
  const root = path.join(workRoot, caseId.toLowerCase());
  await mkdir(root, { recursive: true });
  await copyRef(candidateManifestRef, root);
  for (const item of candidateManifest.artifacts) await copyRef(item.path, root);
  for (const ref of [
    ".codex/tasks/GOV-M320-DRYRUN/blueprint.yaml",
    ".codex/tasks/GOV-M320-DRYRUN/review-findings.yaml",
    ".codex/tasks/GOV-M320-DRYRUN/human-approval.yaml",
    ".codex/tasks/GOV-M320-DRYRUN/test-evidence.yaml"
  ]) await copyRef(ref, root);
  return root;
}

function formalReviews(caseTaskId, profileSha) {
  return [
    { type: "code", reviewer: "code-reviewer", formal: true, outcome: "PASS", reviewer_run_id: `RUN-${caseTaskId}-CODE`, session_id: `SESSION-${caseTaskId}-CODE`, finding_refs: ["NONE"], conditions: [], decisions_required: [] },
    { type: "security", reviewer: "security-reviewer", formal: true, outcome: "PASS", reviewer_run_id: `RUN-${caseTaskId}-SEC`, session_id: `SESSION-${caseTaskId}-SEC`, finding_refs: ["NONE"], conditions: [], decisions_required: [] },
    { type: "railway-domain", reviewer: "railway-domain-reviewer", formal: true, did_not_participate_in_implementation: true, outcome: "PASS", reviewer_run_id: `RUN-${caseTaskId}-DOMAIN`, session_id: `SESSION-${caseTaskId}-DOMAIN`, reviewer_binding: { canonical_role_id: "railway-domain-reviewer", agent_profile_reference: ".codex/agents/railway-domain-reviewer.toml", agent_profile_sha256: profileSha, task_assignment_id: `ASSIGN-${caseTaskId}-DOMAIN`, reviewer_run_id: `RUN-${caseTaskId}-DOMAIN`, session_id: `SESSION-${caseTaskId}-DOMAIN`, formal: true, execution_mode: "read-only", implementation_participation: false, reviewer_identity_assurance: "procedural_role_and_assignment_binding" }, review_scope: "bootstrap_rule_governance_mechanism", governance_mechanism_outcome: { outcome: "PASS", findings: [] }, external_decisions: [{ decision_scope: "migration_320", outcome: "NEEDS_HUMAN_DECISION", affects_gate: "migration_320_execution", decision_owner_role: "human-domain-owner", decision_question: "Retain Migration 320 NO-GO." }], finding_refs: ["NONE"], conditions: [], decisions_required: [] }
  ];
}

async function createBaseTask(root, caseTaskId) {
  const ref = `.codex/tasks/${caseTaskId}`;
  const directory = abs(ref, root);
  await mkdir(directory, { recursive: true });
  const evidenceText = "isolated before-fix production-path evidence\n";
  await writeFile(path.join(directory, "evidence.md"), evidenceText);
  const agents = ["qa-engineer", "code-reviewer", "security-reviewer", "railway-domain-reviewer"];
  const profileSha = sha256(await readFile(abs(".codex/agents/railway-domain-reviewer.toml", root)));
  const docs = {
    "task-intent.yaml": { schema_version: 1, status: "READY_FOR_REVIEW", task_id: caseTaskId, title: "Before-fix referenced evidence fixture", task_type: "governance", objective: "Exercise authoritative referenced evidence validation.", business_reason: "Capture the pre-remediation defect.", scope: { include: [`${ref}/**`], exclude: [".env*", "frontend/**", "erp-api/**", "db-design/**", "migration/**", "sibling directories"], product_changes_allowed: false, database_operations_allowed: false, git_mutation_allowed: false }, acceptance_criteria: ["Authoritative validator emits a deterministic result."], requested_by: "remediation-owner" },
    "classification.yaml": { schema_version: 1, task_id: caseTaskId, level: "L3", reasons: ["Production Gate validator verification."], triggers: ["unresolved Reviewer blocker"], execution_categories: ["governance-validation", "bootstrap-candidate"], required_agents: agents, required_reviews: ["code", "security", "railway-domain"], parallel_allowed: false, evidence_required: ["EV-PRODUCTION"], human_approval: { required: true, stages: ["scope_approval", "execution_approval", "review_completion", "final_commit_approval"] }, stop_conditions: ["Any production validation layer is bypassed."], scope: { include: [`${ref}/**`], exclude: [".env*", "sibling directories"] }, classified_by: "remediation-orchestrator", classification_status: "human-approved-scope" },
    "blueprint.yaml": { schema_version: 1, blueprint_id: `BP-${caseTaskId}`, task_id: caseTaskId, risk: { level: "L3", reasons: ["Production path verification."] }, scope: { include: [`${ref}/**`], exclude: ["product", "database", "Git mutation"], product_changes_allowed: false, database_operations_allowed: false }, allowed_paths: { read: [`${ref}/**`], write: [`${ref}/**`] }, agent_assignments: agents.map((role) => ({ role, allowed_read_paths: [`${ref}/**`], allowed_write_paths: role === "qa-engineer" ? [`${ref}/**`] : [] })), review_assignments: [{ assignment_id: `ASSIGN-${caseTaskId}-DOMAIN`, required_role_id: "railway-domain-reviewer", agent_profile_reference: ".codex/agents/railway-domain-reviewer.toml", agent_profile_sha256: profileSha, allowed_read_paths: ["AGENTS.md", ".agents/**", ".codex/**"], allowed_write_paths: [], required_review_scope: "bootstrap_rule_governance_mechanism", execution_mode: "read-only", implementation_participation: false }], applicable_rules: ["GOV-SCOPE-001", "EVD-HASH-001"], candidate_rules: [], required_agents: agents, execution: { parallel_groups: [], sequential_steps: ["Invoke validateTask production API."] }, evidence_required: ["EV-PRODUCTION"], rollback_restore: { required: false, evidence_or_reason: "Not applicable to an isolated governance fixture." }, human_approval: { required: true, approver_roles: ["remediation-owner"] }, stop_conditions: ["Any validation layer fails."] },
    "implementation-handoff.yaml": { schema_version: 1, task_id: caseTaskId, producer: "fixture-builder", actor_role: "qa-engineer", agent_session_ref: `IMPLEMENTER-${caseTaskId}`, started_at: "2026-07-21T00:30:00Z", changed_files: [`${ref}/evidence.md`], commands: ["validateTask production API"], evidence_refs: ["EV-PRODUCTION"], unverified: ["human commit decision"], residual_risks: ["Isolated fixture only."], next_role: "remediation-owner" },
    "artifact-manifest.yaml": { schema_version: 1, task_id: caseTaskId, artifacts: [{ artifact_id: "ART-PRODUCTION", type: "integration-evidence", path: `${ref}/evidence.md`, sha256: sha256(evidenceText), authority: "evidence-only", evidence_scope: "local_review_record", commit_inclusion: false, content_scan_status: "FULL", contains_operational_paths: false, contains_dump_reference: false, credential_scan_status: "PASS", redaction_status: "NOT_REQUIRED", source_verification_status: "VERIFIED" }], product_changes: [], secrets_present: false },
    "test-evidence.yaml": { schema_version: 1, task_id: caseTaskId, evidence_mode: "production-path-integration", commands: ["validateTask production API"], requirements: [{ requirement_id: "EV-PRODUCTION", semantic_category: "EVIDENCE_INTEGRITY", criticality: "CRITICAL", required_for_levels: ["L3"], required_execution_categories: ["governance-validation"] }], checks: [{ check_id: "CHECK-PRODUCTION", requirement_id: "EV-PRODUCTION", result: "PASS", note: "Fixture construction completed." }], product_tests_run: false, database_operations_run: false, limitations: ["No product, database, Git, service, seed, or migration operation."] },
    "security-evidence.yaml": { schema_version: 1, task_id: caseTaskId, scan_scope: { governance_artifacts: "DETERMINISTIC_CONTRACT", external_referenced_evidence: "LIMITED" }, scan_contract: { scan_contract_id: "GOV-DETERMINISTIC-SCAN", scan_contract_version: 5, manifest_sha256: "A".repeat(64), scanned_file_count: 1, scanned_file_set_sha256: "B".repeat(64), contract_sha256: "C".repeat(64), finding_registry_sha256: "D".repeat(64), canonicalization_config_sha256: "E".repeat(64), binary_oracle_config_sha256: "F".repeat(64), binary_magic_registry_sha256: "1".repeat(64), schema_set_sha256: "2".repeat(64) }, claims: { declared_scan_contract_executed: true, no_findings_within_declared_contract: true, external_evidence_globally_clean: false, global_sensitive_data_absence_verified: false }, external_evidence: [], limitations: ["Exact deterministic contract only."] },
    "review-findings.yaml": { schema_version: 1, task_id: caseTaskId, review_context: "Synthetic isolated production-path verification.", reviews: formalReviews(caseTaskId, profileSha), calculated_gate: "GO", overall_gate: "GO", bootstrap_candidate_review_gate: "GO", eligible_to_start_session_b: true, bootstrap_human_commit_gate: "NO-GO", steady_state_preparation_gate: "DISABLED", steady_state_execution_gate: "DISABLED", migration_320_execution_gate: "NO-GO", blockers: [], conditions: [] },
    "human-approval.yaml": { schema_version: 1, task_id: caseTaskId, required: true, status: "pending", approvals: [{ stage: "scope_approval", status: "approved", by: "fixture-owner", at: "2026-07-21T00:00:00Z", reason: "Isolated scope." }, { stage: "execution_approval", status: "approved", by: "fixture-owner", at: "2026-07-21T00:01:00Z", reason: "Governance validator only." }, { stage: "review_completion", status: "approved", by: "fixture-owner", at: "2026-07-21T00:02:00Z", reason: "Synthetic reviews." }, { stage: "final_commit_approval", status: "pending", by: "fixture-owner", at: "2026-07-21T00:03:00Z", reason: "Intentionally absent." }], prohibited_until_approved: ["Git stage", "commit"] },
    "traceability.yaml": { schema_version: 1, task_id: caseTaskId, generated_at: "2026-07-21T00:00:00Z", nodes: [{ id: `TASK:${caseTaskId}`, type: "Task", label: "Fixture Task", source_ref: `${ref}/task-intent.yaml` }, { id: `EVIDENCE:${caseTaskId}`, type: "Evidence", label: "Fixture Evidence", source_ref: `${ref}/evidence.md` }], edges: [{ from: `TASK:${caseTaskId}`, relation: "VERIFIED_BY", to: `EVIDENCE:${caseTaskId}`, source_ref: `${ref}/test-evidence.yaml` }] }
  };
  for (const [name, value] of Object.entries(docs)) await writeFile(path.join(directory, name), json(value));
  await writeFile(path.join(directory, "implementation-plan.md"), "# Isolated production-path verification\n");
  await writeFile(path.join(directory, "final-summary.md"), "# Isolated fixture\n");
  return { directory, ref };
}

async function addNestedEvidence(context, content) {
  const manifestPath = path.join(context.directory, "artifact-manifest.yaml");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const nestedRef = `${context.ref}/nested/session-b6-security-evidence.yaml`;
  const nestedPath = abs(nestedRef, context.root);
  await mkdir(path.dirname(nestedPath), { recursive: true });
  await writeFile(nestedPath, json(content));
  const bytes = await readFile(nestedPath);
  const entry = { artifact_id: "EV-NESTED-SECURITY", type: "security-evidence", path: nestedRef, sha256: sha256(bytes), authority: "evidence-only", evidence_scope: "external_reference", commit_inclusion: false, content_scan_status: "PARTIAL", contains_operational_paths: false, contains_dump_reference: false, credential_scan_status: "PASS", redaction_status: "NOT_REQUIRED", source_verification_status: "VERIFIED" };
  manifest.artifacts.push(entry);
  await writeFile(manifestPath, json(manifest));
  for (const name of ["classification.yaml", "blueprint.yaml"]) {
    const file = path.join(context.directory, name);
    const value = JSON.parse(await readFile(file, "utf8"));
    value.evidence_required.push("EV-NESTED-SECURITY");
    await writeFile(file, json(value));
  }
  const securityPath = path.join(context.directory, "security-evidence.yaml");
  const security = JSON.parse(await readFile(securityPath, "utf8"));
  security.external_evidence.push({ artifact_id: entry.artifact_id, path: entry.path, evidence_scope: entry.evidence_scope, commit_inclusion: entry.commit_inclusion, content_scan_status: entry.content_scan_status, contains_operational_paths: entry.contains_operational_paths, contains_dump_reference: entry.contains_dump_reference, credential_scan_status: entry.credential_scan_status, redaction_status: entry.redaction_status, source_verification_status: entry.source_verification_status });
  await writeFile(securityPath, json(security));
  return nestedRef;
}

async function refreshBindings(context) {
  const manifestBytes = await readFile(abs(candidateManifestRef, context.root));
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  const report = await buildBootstrapScanReport({ projectRoot: context.root, manifestBytes, manifest, startedAt: "2026-07-21T01:00:00Z", completedAt: "2026-07-21T01:00:00Z" });
  report.report_payload_sha256 = jcsSha256(scannerReportPayload(report));
  const reportBytes = Buffer.from(json(report));
  const reportRef = `${context.ref}/bootstrap-scanner-report.json`;
  await writeFile(abs(reportRef, context.root), reportBytes);
  const files = manifest.artifacts.map((item) => ({ path: item.path, sha256: item.sha256 })).sort((a, b) => a.path.localeCompare(b.path));
  const bindings = report.scan_contract;
  const record = createBootstrapWorkspaceCandidateRecord({ task_id: context.caseTaskId, manifest_sha256: sha256(manifestBytes), included_file_set_sha256: jcsSha256(files), file_count: files.length, scanner_report_sha256: sha256(reportBytes), scan_contract_sha256: bindings.contract_sha256, finding_registry_sha256: bindings.finding_registry_sha256, canonicalization_config_sha256: bindings.canonicalization_config_sha256, binary_oracle_config_sha256: bindings.binary_oracle_config_sha256, binary_magic_registry_sha256: bindings.binary_magic_registry_sha256, schema_set_sha256: bindings.schema_set_sha256, generated_at: "2026-07-21T01:01:00Z" });
  const recordRef = `${context.ref}/bootstrap-candidate-record.json`;
  const recordBytes = Buffer.from(json(record));
  await writeFile(abs(recordRef, context.root), recordBytes);
  const approvalPath = path.join(context.directory, "human-approval.yaml");
  const approval = JSON.parse(await readFile(approvalPath, "utf8"));
  approval.bootstrap_candidate_ref = recordRef;
  approval.bootstrap_scanner_report_ref = reportRef;
  await writeFile(approvalPath, json(approval));
  const securityPath = path.join(context.directory, "security-evidence.yaml");
  const security = JSON.parse(await readFile(securityPath, "utf8"));
  security.scan_contract = { scan_contract_id: bindings.contract_id, scan_contract_version: bindings.contract_version, manifest_sha256: report.candidate_binding.manifest_sha256, scanned_file_count: report.candidate_binding.scanned_file_count, scanned_file_set_sha256: report.candidate_binding.scanned_file_set_sha256, contract_sha256: bindings.contract_sha256, finding_registry_sha256: bindings.finding_registry_sha256, canonicalization_config_sha256: bindings.canonicalization_config_sha256, binary_oracle_config_sha256: bindings.binary_oracle_config_sha256, binary_magic_registry_sha256: bindings.binary_magic_registry_sha256, schema_set_sha256: bindings.schema_set_sha256 };
  await writeFile(securityPath, json(security));
  const artifactBytes = await readFile(path.join(context.directory, "artifact-manifest.yaml"));
  const freeze = { schema_version: 1, task_id: context.caseTaskId, artifact_manifest_sha256: sha256(artifactBytes), candidate_manifest_sha256: sha256(manifestBytes), scanner_report_sha256: sha256(reportBytes), candidate_record_sha256: sha256(recordBytes) };
  freeze.freeze_sha256 = jcsSha256(freeze);
  await writeFile(path.join(context.directory, "fixture-freeze.json"), json(freeze));
}

const invalidNested = (task) => ({ schema_version: 1, task_id: task, scan_scope: { governance_artifacts: "DETERMINISTIC_CONTRACT", external_referenced_evidence: "LIMITED" }, scan_contract: { scan_contract_id: "GOV-DETERMINISTIC-SCAN", scan_contract_version: 5 }, claims: { no_findings_within_declared_contract: true }, external_evidence: [] });
const caseDefinitions = [
  { index: 4, title: "Nested arbitrary-name schema-invalid Security evidence is required by manifest", content: (task) => invalidNested(task) },
  { index: 6, title: "Nested Security evidence declares an unregistered schema version", content: (task) => ({ schema_version: 999, task_id: task, kind: "unregistered-security-evidence" }) },
  { index: 8, title: "Two Security evidence files exist and the required nested one is invalid", content: (task) => invalidNested(task) },
  { index: 9, title: "Manifest marks required nested Security evidence VERIFIED although schema-invalid", content: (task) => ({ schema_version: 1, task_id: task, claim: "registered-schema-valid", invalid_extra: true }) }
];

const cases = [];
for (const definition of caseDefinitions) {
  const caseId = `CASE-${String(definition.index).padStart(2, "0")}`;
  const caseTaskId = `GOV-REM13-BEFORE-${caseId}`;
  const root = await prepareRoot(caseId);
  const base = await createBaseTask(root, caseTaskId);
  const context = { ...base, root, caseTaskId };
  const nestedRef = await addNestedEvidence(context, definition.content(caseTaskId));
  await refreshBindings(context);
  const result = await validateTask(caseTaskId, { projectRoot: root, writeGraph: true, targetGate: "bootstrap-candidate-review" });
  const structural = result.errors.length ? "INVALID" : "VALID";
  const gate = result.gateResults?.bootstrap_candidate_review?.status ?? null;
  const independentOracle = { structural: "INVALID", gate: "NO-GO", exit_code: 1 };
  const observed = { structural, gate, exit_code: result.exitCode };
  cases.push({ case_id: caseId, title: definition.title, referenced_evidence_path: nestedRef, all_bindings_regenerated_before_validation: true, independent_oracle: independentOracle, observed, defect_reproduced: observed.structural === "VALID" && observed.gate === "GO" && observed.exit_code === 0, errors: result.errors, candidate_reasons: result.candidateReasons });
}

const output = {
  schema_version: 1,
  task_id: "GOV-PHASE1-CANDIDATE-REMEDIATION-13",
  run_phase: "BEFORE_FIX",
  production_entrypoint: ".codex/scripts/validate-task.mjs#validateTask",
  git_used: false,
  product_operations_performed: false,
  case_count: cases.length,
  cases,
  all_four_defect_cases_reproduced: cases.every((item) => item.defect_reproduced),
  finding_id: "B6EXT-CODE-TASK-LOCAL-SCHEMA-BYPASS-001",
  finding_status: "OPEN"
};
await writeFile(path.join(taskDir, "production-path-before-fix.json"), json(output));
console.log(JSON.stringify({ case_count: output.case_count, all_four_defect_cases_reproduced: output.all_four_defect_cases_reproduced, observed: cases.map((item) => ({ case_id: item.case_id, ...item.observed })) }));
