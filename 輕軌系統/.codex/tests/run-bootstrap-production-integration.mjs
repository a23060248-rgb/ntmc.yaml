import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile as writeFileRaw } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { collectGovernanceCommitRefs, excludedGovernanceRecords } from "../scripts/lib/governance-commit-manifest.mjs";
import { BOOTSTRAP_ASSURANCE, BOOTSTRAP_RECORD_TYPE, canonicalSha256, createBootstrapWorkspaceCandidateRecord, sha256 } from "../scripts/lib/governance/typed-proof.mjs";
import { buildBootstrapScanReport, scannerReportPayload } from "../scripts/lib/governance/scanner-report.mjs";
import { validateTask } from "../scripts/validate-task.mjs";

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const runRoot = await mkdtemp(path.join(os.tmpdir(), "ntmc-bootstrap-production-"));
const taskId = "GOV-BOOTSTRAP-PROD";
const taskRef = `.codex/tasks/${taskId}`;
const taskDir = path.join(runRoot, ".codex", "tasks", taskId);
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
async function writeFile(target, value, ...options) {
  await writeFileRaw(target, value, ...options);
  if (path.dirname(target) !== taskDir || !["test-evidence.yaml", "security-evidence.yaml", "review-findings.yaml"].includes(path.basename(target))) return;
  try {
    const manifestPath = path.join(taskDir, "artifact-manifest.yaml");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    const ref = `${taskRef}/${path.basename(target)}`;
    const artifact = manifest.artifacts?.find((item) => item.path === ref && item.artifact_class === "typed_evidence");
    if (artifact) { artifact.sha256 = sha256(await readFile(target)); await writeFileRaw(manifestPath, json(manifest)); }
  } catch (error) { if (error?.code !== "ENOENT") throw error; }
}
const results = [];
const record = (caseId, invariant, pass, result, expected) => results.push({case_id: caseId, invariant, production_entrypoint: "validateTask", pass: Boolean(pass), expected, exit_code: result?.exitCode ?? null, calculated_gate: result?.calculatedGate ?? null, target_gate: result?.targetGate ?? null, gate_results: result?.gateResults ?? null, errors: result?.errors ?? [], candidate_reasons: result?.candidateReasons ?? [], migration_320_reasons: result?.migrationReasons ?? []});

async function copySource(ref) { const target = path.join(runRoot, ...ref.split("/")); await mkdir(path.dirname(target), {recursive: true}); await cp(path.join(sourceRoot, ...ref.split("/")), target, {recursive: true}); }
for (const ref of ["AGENTS.md", ".agents", ".codex/agents", ".codex/blueprints", ".codex/checklists", ".codex/config.toml", ".codex/domain", ".codex/environment", ".codex/governance", ".codex/meta-rules", ".codex/scripts", ".codex/tests", ".codex/workflows", ".codex/tasks/GOV-M320-DRYRUN"]) await copySource(ref);
await mkdir(taskDir, {recursive: true});
const railwayProfileRef = ".codex/agents/railway-domain-reviewer.toml";
const railwayProfileSha256 = sha256(await readFile(path.join(runRoot, ...railwayProfileRef.split("/"))));
const railwayAssignmentId = "ASSIGN-RAILWAY-DOMAIN";

async function rebuildManifest() {
  const refs = await collectGovernanceCommitRefs(runRoot);
  const artifacts = [];
  for (const ref of refs) { const bytes = await readFile(path.join(runRoot, ...ref.split("/"))); artifacts.push({path: ref, artifact_type: ref === "AGENTS.md" ? "governance-policy" : `governance-${path.extname(ref).slice(1).toLowerCase() || "text"}`, commit_inclusion: true, scan_required: true, sha256: sha256(bytes), binary_allowed: false}); }
  const manifest = {schema_version: 1, manifest_type: "governance-commit-manifest", generated_at: "2026-07-19T01:00:00Z", self_excluded: true, artifacts, excluded_records: excludedGovernanceRecords};
  const bytes = Buffer.from(json(manifest));
  await writeFile(path.join(runRoot, ".codex", "governance", "governance-commit-manifest.yaml"), bytes);
  const files = artifacts.map((item) => ({path: item.path, sha256: item.sha256})).sort((a, b) => a.path.localeCompare(b.path));
  return {manifest, bytes, files};
}

async function writeCandidateForReport(governance, report, recomputePayload = true) {
  if (recomputePayload) report.report_payload_sha256 = canonicalSha256(scannerReportPayload(report));
  const scannerBytes = Buffer.from(json(report));
  await writeFile(path.join(taskDir, "bootstrap-scanner-report.json"), scannerBytes);
  const bindings = report.scan_contract;
  const candidate = createBootstrapWorkspaceCandidateRecord({task_id: taskId, manifest_sha256: sha256(governance.bytes), included_file_set_sha256: canonicalSha256(governance.files), file_count: governance.files.length, scanner_report_sha256: sha256(scannerBytes), scan_contract_sha256: bindings.contract_sha256, finding_registry_sha256: bindings.finding_registry_sha256, canonicalization_config_sha256: bindings.canonicalization_config_sha256, binary_oracle_config_sha256: bindings.binary_oracle_config_sha256, binary_magic_registry_sha256: bindings.binary_magic_registry_sha256, schema_set_sha256: bindings.schema_set_sha256, evidence_schema_registry_sha256: bindings.evidence_schema_registry_sha256, referenced_evidence_policy_sha256: bindings.referenced_evidence_policy_sha256, supersedes_candidate_manifest_sha256: "29F4F947DEF79A633F63E28FA2444F4734D7E6BB9612B96154A302464255531D", supersession_reason: "Production integration fixture exercises candidate supersession bindings.", breaking_governance_change: "referenced_evidence_validation_required", generated_at: "2026-07-19T01:02:00Z"});
  await writeFile(path.join(taskDir, "bootstrap-candidate-record.json"), json(candidate));
  return candidate;
}

async function refreshBindings() {
  const governance = await rebuildManifest();
  const report = await buildBootstrapScanReport({projectRoot: runRoot, manifestBytes: governance.bytes, manifest: governance.manifest, startedAt: "2026-07-19T01:01:00Z", completedAt: "2026-07-19T01:01:00Z"});
  if (report.results.finding_count) throw new Error(`Transient candidate has scanner findings: ${report.results.findings.slice(0, 3).map((item) => item.finding_class).join("|")}`);
  const candidate = await writeCandidateForReport(governance, report);
  const approvalPath = path.join(taskDir, "human-approval.yaml");
  const approval = JSON.parse(await readFile(approvalPath, "utf8"));
  approval.bootstrap_candidate_ref = `${taskRef}/bootstrap-candidate-record.json`;
  approval.bootstrap_scanner_report_ref = `${taskRef}/bootstrap-scanner-report.json`;
  await writeFile(approvalPath, json(approval));
  const securityPath = path.join(taskDir, "security-evidence.yaml");
  const security = JSON.parse(await readFile(securityPath, "utf8"));
  security.scan_contract = {scan_contract_id: report.scan_contract.contract_id, scan_contract_version: report.scan_contract.contract_version, manifest_sha256: report.candidate_binding.manifest_sha256, scanned_file_count: report.candidate_binding.scanned_file_count, scanned_file_set_sha256: report.candidate_binding.scanned_file_set_sha256, contract_sha256: report.scan_contract.contract_sha256, finding_registry_sha256: report.scan_contract.finding_registry_sha256, canonicalization_config_sha256: report.scan_contract.canonicalization_config_sha256, binary_oracle_config_sha256: report.scan_contract.binary_oracle_config_sha256, binary_magic_registry_sha256: report.scan_contract.binary_magic_registry_sha256, schema_set_sha256: report.scan_contract.schema_set_sha256};
  security.claims = {declared_scan_contract_executed: true, no_findings_within_declared_contract: true};
  await writeFile(securityPath, json(security));
  const taskManifestPath = path.join(taskDir, "artifact-manifest.yaml");
  const taskManifest = JSON.parse(await readFile(taskManifestPath, "utf8"));
  for (const artifact of taskManifest.artifacts.filter((item) => item.artifact_class === "typed_evidence")) artifact.sha256 = sha256(await readFile(path.join(runRoot, ...artifact.path.split("/"))));
  await writeFile(taskManifestPath, json(taskManifest));
  return {governance, report, candidate};
}

function formalReviews() {
  return [
    {type: "code", reviewer: "code-reviewer", formal: true, outcome: "PASS", reviewer_run_id: "RUN-CODE-UNIQUE", session_id: "SESSION-CODE-UNIQUE", finding_refs: ["NO-CODE-FINDINGS"], conditions: [], decisions_required: []},
    {type: "security", reviewer: "security-reviewer", formal: true, outcome: "PASS", reviewer_run_id: "RUN-SECURITY-UNIQUE", session_id: "SESSION-SECURITY-UNIQUE", finding_refs: ["NO-SECURITY-FINDINGS"], conditions: [], decisions_required: []},
    {type: "railway-domain", reviewer: "railway-domain-reviewer", formal: true, did_not_participate_in_implementation: true, outcome: "PASS", reviewer_run_id: "RUN-DOMAIN-UNIQUE", session_id: "SESSION-DOMAIN-UNIQUE", reviewer_binding: {canonical_role_id: "railway-domain-reviewer", agent_profile_reference: railwayProfileRef, agent_profile_sha256: railwayProfileSha256, task_assignment_id: railwayAssignmentId, reviewer_run_id: "RUN-DOMAIN-UNIQUE", session_id: "SESSION-DOMAIN-UNIQUE", formal: true, execution_mode: "read-only", implementation_participation: false, reviewer_identity_assurance: "procedural_role_and_assignment_binding"}, review_scope: "bootstrap_rule_governance_mechanism", governance_mechanism_outcome: {outcome: "PASS", findings: []}, external_decisions: [{decision_scope: "migration_320", outcome: "NEEDS_HUMAN_DECISION", affects_gate: "migration_320_execution", decision_owner_role: "human-domain-owner", decision_question: "Resolve the proposed Migration 320 candidate Rules before execution."}], finding_refs: ["NO-MECHANISM-FINDINGS"], conditions: [], decisions_required: []}
  ];
}

const evidenceText = "deterministic bootstrap production integration evidence\n";
await writeFile(path.join(taskDir, "evidence.md"), evidenceText);
const agents = ["qa-engineer", "code-reviewer", "security-reviewer", "railway-domain-reviewer"];
const docs = {
  "task-intent.yaml": {schema_version: 1, status: "READY_FOR_REVIEW", task_id: taskId, title: "Bootstrap production integration fixture", task_type: "governance", objective: "Exercise the complete bootstrap production validator path.", business_reason: "Prove Gate, scanner report, Domain routing, schema, scope, identity, evidence, Rule, and candidate binding.", scope: {include: [`${taskRef}/**`], exclude: [".env*", "frontend/**", "erp-api/**", "db-design/**", "migration/**", "sibling directories"], product_changes_allowed: false, database_operations_allowed: false, git_mutation_allowed: false}, acceptance_criteria: ["Production validator returns target-specific structural and Gate results."], requested_by: "fixture-owner"},
  "classification.yaml": {schema_version: 1, task_id: taskId, level: "L3", reasons: ["Production bootstrap integration fixture."], triggers: ["bootstrap trust boundary"], execution_categories: ["governance-validation", "bootstrap-candidate"], required_agents: agents, required_reviews: ["code", "security", "railway-domain"], parallel_allowed: false, evidence_required: ["EV-PRODUCTION"], human_approval: {required: true, stages: ["scope_approval", "execution_approval", "review_completion", "final_commit_approval"]}, stop_conditions: ["Any production validation layer is bypassed."], scope: {include: [`${taskRef}/**`], exclude: [".env*", "sibling directories"]}, classified_by: "fixture-orchestrator", classification_status: "human-approved-scope"},
  "blueprint.yaml": {schema_version: 1, blueprint_id: `BP-${taskId}`, task_id: taskId, risk: {level: "L3", reasons: ["Production path integration."]}, scope: {include: [`${taskRef}/**`], exclude: ["product", "database", "Git mutation"], product_changes_allowed: false, database_operations_allowed: false}, allowed_paths: {read: [`${taskRef}/**`], write: [`${taskRef}/**`]}, agent_assignments: agents.map((role) => ({role, allowed_read_paths: [`${taskRef}/**`], allowed_write_paths: role === "qa-engineer" ? [`${taskRef}/**`] : []})), review_assignments: [{assignment_id: railwayAssignmentId, required_role_id: "railway-domain-reviewer", agent_profile_reference: railwayProfileRef, agent_profile_sha256: railwayProfileSha256, allowed_read_paths: ["AGENTS.md", ".agents/**", ".codex/**"], allowed_write_paths: [], required_review_scope: "bootstrap_rule_governance_mechanism", execution_mode: "read-only", implementation_participation: false}], applicable_rules: ["GOV-SCOPE-001", "EVD-HASH-001"], candidate_rules: [], required_agents: agents, execution: {parallel_groups: [], sequential_steps: ["Run the production validator."]}, evidence_required: ["EV-PRODUCTION"], rollback_restore: {required: false, evidence_or_reason: "Not applicable to a transient governance-only fixture."}, human_approval: {required: true, approver_roles: ["fixture-owner"]}, stop_conditions: ["Any layer fails."]},
  "implementation-handoff.yaml": {schema_version: 1, task_id: taskId, producer: "fixture-implementer", actor_role: "qa-engineer", agent_session_ref: `IMPLEMENTER-${taskId}`, started_at: "2026-07-19T00:30:00Z", changed_files: [`${taskRef}/evidence.md`], commands: ["validateTask production API"], evidence_refs: ["EV-PRODUCTION"], unverified: ["human bootstrap commit decision"], residual_risks: ["Transient fixture only."], next_role: "human-owner"},
  "artifact-manifest.yaml": {schema_version: 1, task_id: taskId, artifacts: [{artifact_id: "ART-PRODUCTION", type: "integration-evidence", path: `${taskRef}/evidence.md`, sha256: sha256(evidenceText), authority: "evidence-only", evidence_scope: "local_review_record", commit_inclusion: false, content_scan_status: "FULL", contains_operational_paths: false, contains_dump_reference: false, credential_scan_status: "PASS", redaction_status: "NOT_REQUIRED", source_verification_status: "VERIFIED"}], product_changes: [], secrets_present: false},
  "test-evidence.yaml": {schema_version: 1, task_id: taskId, evidence_mode: "production-path-integration", commands: ["validateTask production API"], requirements: [{requirement_id: "EV-PRODUCTION", semantic_category: "EVIDENCE_INTEGRITY", criticality: "CRITICAL", required_for_levels: ["L3"], required_execution_categories: ["governance-validation"]}], checks: [{check_id: "CHECK-PRODUCTION", requirement_id: "EV-PRODUCTION", result: "PASS", note: "Production integration evidence passed."}], product_tests_run: false, database_operations_run: false, limitations: ["No product, database, Git, or external system was used."]},
  "security-evidence.yaml": {schema_version: 1, task_id: taskId, scan_scope: {governance_artifacts: "DETERMINISTIC_CONTRACT", external_referenced_evidence: "LIMITED"}, scan_contract: {scan_contract_id: "GOV-DETERMINISTIC-SCAN", scan_contract_version: 5, manifest_sha256: "A".repeat(64), scanned_file_count: 1, scanned_file_set_sha256: "B".repeat(64), contract_sha256: "C".repeat(64), finding_registry_sha256: "D".repeat(64), canonicalization_config_sha256: "E".repeat(64), binary_oracle_config_sha256: "F".repeat(64), binary_magic_registry_sha256: "1".repeat(64), schema_set_sha256: "2".repeat(64)}, claims: {declared_scan_contract_executed: true, no_findings_within_declared_contract: true}, external_evidence: [], limitations: ["The declared contract is not global sensitive-data assurance."]},
  "review-findings.yaml": {schema_version: 1, task_id: taskId, review_context: "Synthetic production integration reviews only.", reviews: formalReviews(), calculated_gate: "GO", overall_gate: "GO", bootstrap_candidate_review_gate: "GO", eligible_to_start_session_b: true, bootstrap_human_commit_gate: "NO-GO", steady_state_preparation_gate: "DISABLED", steady_state_execution_gate: "DISABLED", migration_320_execution_gate: "NO-GO", blockers: [], conditions: []},
  "human-approval.yaml": {schema_version: 1, task_id: taskId, required: true, status: "pending", approvals: [{stage: "scope_approval", status: "approved", by: "fixture-owner", at: "2026-07-19T00:00:00Z", reason: "Fixture scope approved."}, {stage: "execution_approval", status: "approved", by: "fixture-owner", at: "2026-07-19T00:01:00Z", reason: "Governance validation only."}, {stage: "review_completion", status: "approved", by: "fixture-owner", at: "2026-07-19T00:02:00Z", reason: "Synthetic reviews complete."}, {stage: "final_commit_approval", status: "pending", by: "fixture-owner", at: "2026-07-19T00:03:00Z", reason: "Human commit decision intentionally absent."}], prohibited_until_approved: ["Git stage", "commit"]},
  "traceability.yaml": {schema_version: 1, task_id: taskId, generated_at: "2026-07-19T00:00:00Z", nodes: [{id: `TASK:${taskId}`, type: "Task", label: "Integration Task", source_ref: `${taskRef}/task-intent.yaml`}, {id: `EVIDENCE:${taskId}`, type: "Evidence", label: "Integration Evidence", source_ref: `${taskRef}/evidence.md`}], edges: [{from: `TASK:${taskId}`, relation: "VERIFIED_BY", to: `EVIDENCE:${taskId}`, source_ref: `${taskRef}/test-evidence.yaml`}]}
};
const typedArtifact = (artifactId, evidenceType, name, schemaId) => ({artifact_id: artifactId, type: "typed-evidence", path: `${taskRef}/${name}`, sha256: sha256(Buffer.from(json(docs[name]))), authority: "evidence-only", evidence_scope: "local_review_record", commit_inclusion: false, content_scan_status: "FULL", contains_operational_paths: false, contains_dump_reference: false, credential_scan_status: "PASS", redaction_status: "NOT_REQUIRED", source_verification_status: "VERIFIED", artifact_class: "typed_evidence", evidence_type: evidenceType, required: true, schema_id: schemaId, referenced_by: ["validateTask", "bootstrap_candidate_review"]});
docs["artifact-manifest.yaml"].manifest_contract_version = 2;
docs["artifact-manifest.yaml"].artifacts.push(
  typedArtifact("ART-TYPED-TEST", "test_evidence", "test-evidence.yaml", "https://ntmc.local/codex/schemas/test-evidence.schema.json"),
  typedArtifact("ART-TYPED-SECURITY", "security_evidence", "security-evidence.yaml", "https://ntmc.local/codex/schemas/security-evidence.schema.json"),
  typedArtifact("ART-TYPED-REVIEWS", "review_findings", "review-findings.yaml", "https://ntmc.local/codex/schemas/review-findings.schema.json")
);
for (const [name, value] of Object.entries(docs)) await writeFile(path.join(taskDir, name), json(value));
await writeFile(path.join(taskDir, "implementation-plan.md"), "# Bootstrap production integration\n\nRun every production validation layer.\n");
await writeFile(path.join(taskDir, "final-summary.md"), "# Bootstrap production integration\n\nCalculated gate: GO\n");
let bindings = await refreshBindings();

if (process.argv.includes("--referenced-evidence-matrix")) {
  const baselineTaskDir = path.join(runRoot, "referenced-evidence-baseline");
  await cp(taskDir, baselineTaskDir, {recursive: true});
  const manifestPath = () => path.join(taskDir, "artifact-manifest.yaml");
  const readManifest = async () => JSON.parse(await readFile(manifestPath(), "utf8"));
  const writeManifest = async (manifest) => writeFileRaw(manifestPath(), json(manifest));
  const taskPath = (ref) => path.join(runRoot, ...ref.split("/"));
  const typed = (manifest, evidenceType) => manifest.artifacts.find((item) => item.evidence_type === evidenceType);
  const restore = async () => { await rm(taskDir, {recursive: true, force: true}); await cp(baselineTaskDir, taskDir, {recursive: true}); };
  async function nestedEvidence(evidenceType, name, document) {
    const manifest = await readManifest();
    const artifact = typed(manifest, evidenceType);
    const ref = `${taskRef}/nested/${name}`;
    await mkdir(path.dirname(taskPath(ref)), {recursive: true});
    const bytes = Buffer.from(json(document));
    await writeFileRaw(taskPath(ref), bytes);
    artifact.path = ref; artifact.sha256 = sha256(bytes);
    await writeManifest(manifest);
  }
  async function duplicateTyped(evidenceType, name) {
    const manifest = await readManifest();
    const original = typed(manifest, evidenceType);
    const duplicate = structuredClone(original);
    duplicate.artifact_id = `${original.artifact_id}-DUPLICATE`;
    duplicate.path = `${taskRef}/nested/${name}`;
    const bytes = await readFile(taskPath(original.path));
    await mkdir(path.dirname(taskPath(duplicate.path)), {recursive: true});
    await writeFileRaw(taskPath(duplicate.path), bytes);
    duplicate.sha256 = sha256(bytes);
    manifest.artifacts.push(duplicate);
    await writeManifest(manifest);
  }
  const validRailway = () => { const review = formalReviews().find((item) => item.type === "railway-domain"); return {review_scope: review.review_scope, reviewer_binding: review.reviewer_binding, governance_mechanism_outcome: review.governance_mechanism_outcome, external_decisions: review.external_decisions}; };
  const addOptionalRailway = async (document) => {
    const ref = `${taskRef}/nested/railway-domain-review.yaml`;
    const bytes = Buffer.from(json(document));
    await mkdir(path.dirname(taskPath(ref)), {recursive: true});
    await writeFileRaw(taskPath(ref), bytes);
    const manifest = await readManifest();
    manifest.artifacts.push({artifact_id: "ART-TYPED-RAILWAY", type: "typed-evidence", path: ref, sha256: sha256(bytes), authority: "evidence-only", evidence_scope: "local_review_record", commit_inclusion: false, content_scan_status: "FULL", contains_operational_paths: false, contains_dump_reference: false, credential_scan_status: "PASS", redaction_status: "NOT_REQUIRED", source_verification_status: "VERIFIED", artifact_class: "typed_evidence", evidence_type: "railway_domain_review", required: false, schema_id: "https://ntmc.local/codex/schemas/railway-domain-review.schema.json", referenced_by: ["validateTask"]});
    await writeManifest(manifest);
  };
  const invalidSecurity = () => ({schema_version: 1, task_id: taskId, scan_scope: {governance_artifacts: "DETERMINISTIC_CONTRACT", external_referenced_evidence: "LIMITED"}, scan_contract: {scan_contract_id: "GOV-DETERMINISTIC-SCAN", scan_contract_version: 5}, claims: {no_findings_within_declared_contract: true}, external_evidence: []});
  const definitions = [
    [1, "Active v2 standard typed evidence is valid.", {structural: "VALID", gate: "GO", exit_code: 0}, async () => {}],
    [2, "Arbitrary nested valid Security evidence is discovered from manifest.", {structural: "VALID", gate: "GO", exit_code: 0}, async () => nestedEvidence("security_evidence", "renamed-security-proof.yaml", JSON.parse(await readFile(path.join(taskDir, "security-evidence.yaml"), "utf8")))],
    [3, "Arbitrary nested valid Review findings are discovered from manifest.", {structural: "VALID", gate: "GO", exit_code: 0}, async () => nestedEvidence("review_findings", "renamed-review-proof.yaml", JSON.parse(await readFile(path.join(taskDir, "review-findings.yaml"), "utf8")))],
    [4, "Nested schema-invalid Security evidence remains invalid after every hash is regenerated.", {structural: "INVALID", gate: "NO-GO", exit_code: 1}, async () => nestedEvidence("security_evidence", "session-b6-security-evidence.yaml", invalidSecurity())],
    [5, "Missing referenced Security evidence fails closed.", {structural: "INVALID", gate: "NO-GO", exit_code: 1}, async () => { const m=await readManifest(); typed(m,"security_evidence").path=`${taskRef}/nested/missing-security.yaml`; await writeManifest(m); }],
    [6, "Unregistered Security evidence schema version fails closed.", {structural: "INVALID", gate: "NO-GO", exit_code: 1}, async () => nestedEvidence("security_evidence", "unregistered-security.yaml", {schema_version: 999, task_id: taskId, kind: "security"})],
    [7, "Traversal outside exact Task root fails closed.", {structural: "INVALID", gate: "NO-GO", exit_code: 1}, async () => { const m=await readManifest(); typed(m,"security_evidence").path=`${taskRef}/nested/../../escaped-security.yaml`; await writeManifest(m); }],
    [8, "Duplicate non-multiple Security evidence fails closed.", {structural: "INVALID", gate: "NO-GO", exit_code: 1}, async () => duplicateTyped("security_evidence", "duplicate-security.yaml")],
    [9, "Manifest VERIFIED metadata cannot bless schema-invalid Security evidence.", {structural: "INVALID", gate: "NO-GO", exit_code: 1}, async () => nestedEvidence("security_evidence", "verified-but-invalid.yaml", {schema_version: 1, task_id: taskId, claim: "valid", invalid_extra: true})],
    [10, "Missing required Security declaration makes Gate incomplete without magic-filename fallback.", {structural: "INVALID", gate: "NO-GO", exit_code: 1}, async () => { const m=await readManifest(); m.artifacts=m.artifacts.filter((item)=>item.evidence_type!=="security_evidence"); await writeManifest(m); }],
    [11, "Arbitrary nested valid Review evidence is accepted by registered schema.", {structural: "VALID", gate: "GO", exit_code: 0}, async () => nestedEvidence("review_findings", "review-evidence-any-name.json", JSON.parse(await readFile(path.join(taskDir, "review-findings.yaml"), "utf8")))],
    [12, "Present schema-invalid Review evidence is structural invalid.", {structural: "INVALID", gate: "NO-GO", exit_code: 1}, async () => { const v=JSON.parse(await readFile(path.join(taskDir,"review-findings.yaml"),"utf8")); delete v.reviews; await writeFile(path.join(taskDir,"review-findings.yaml"),json(v)); }],
    [13, "Arbitrary nested valid Test evidence is accepted.", {structural: "VALID", gate: "GO", exit_code: 0}, async () => nestedEvidence("test_evidence", "test-proof-any-name.json", JSON.parse(await readFile(path.join(taskDir, "test-evidence.yaml"), "utf8")))],
    [14, "Present schema-invalid Test evidence is structural invalid.", {structural: "INVALID", gate: "NO-GO", exit_code: 1}, async () => { const v=JSON.parse(await readFile(path.join(taskDir,"test-evidence.yaml"),"utf8")); delete v.checks; await writeFile(path.join(taskDir,"test-evidence.yaml"),json(v)); }],
    [15, "Typed evidence Task binding mismatch fails closed.", {structural: "INVALID", gate: "NO-GO", exit_code: 1}, async () => { const v=JSON.parse(await readFile(path.join(taskDir,"security-evidence.yaml"),"utf8")); v.task_id="GOV-OTHER-TASK"; await writeFile(path.join(taskDir,"security-evidence.yaml"),json(v)); }],
    [16, "Typed evidence byte hash mismatch fails closed.", {structural: "INVALID", gate: "NO-GO", exit_code: 1}, async () => { const v=JSON.parse(await readFile(path.join(taskDir,"security-evidence.yaml"),"utf8")); v.limitations.push("Bytes changed after manifest freeze."); await writeFileRaw(path.join(taskDir,"security-evidence.yaml"),json(v)); }],
    [17, "Typed evidence schema_id mismatch fails closed.", {structural: "INVALID", gate: "NO-GO", exit_code: 1}, async () => { const m=await readManifest(); typed(m,"security_evidence").schema_id="https://invalid.local/security.schema.json"; await writeManifest(m); }],
    [18, "Unregistered evidence_type fails closed.", {structural: "INVALID", gate: "NO-GO", exit_code: 1}, async () => { const m=await readManifest(); typed(m,"security_evidence").evidence_type="unknown_security"; await writeManifest(m); }],
    [19, "Backslash evidence path fails closed.", {structural: "INVALID", gate: "NO-GO", exit_code: 1}, async () => { const m=await readManifest(); typed(m,"security_evidence").path=`${taskRef}\\security-evidence.yaml`; await writeManifest(m); }],
    [20, "Absolute drive evidence path fails closed.", {structural: "INVALID", gate: "NO-GO", exit_code: 1}, async () => { const m=await readManifest(); typed(m,"security_evidence").path=["C:","outside","security-evidence.yaml"].join("/"); await writeManifest(m); }],
    [21, "Case-colliding evidence paths fail closed.", {structural: "INVALID", gate: "NO-GO", exit_code: 1}, async () => { const m=await readManifest(); const d=structuredClone(typed(m,"security_evidence")); d.artifact_id="ART-TYPED-SECURITY-CASE"; d.path=d.path.toUpperCase(); d.evidence_type="railway_domain_review"; d.required=false; d.schema_id="https://ntmc.local/codex/schemas/railway-domain-review.schema.json"; m.artifacts.push(d); await writeManifest(m); }],
    [22, "Absent optional Railway evidence is allowed.", {structural: "VALID", gate: "GO", exit_code: 0}, async () => {}],
    [23, "Present valid optional Railway evidence is validated and allowed.", {structural: "VALID", gate: "GO", exit_code: 0}, async () => addOptionalRailway(validRailway())],
    [24, "Present invalid optional Railway evidence is structural invalid.", {structural: "INVALID", gate: "NO-GO", exit_code: 1}, async () => { const v=validRailway(); delete v.reviewer_binding; await addOptionalRailway(v); }]
  ];
  const matrixResults = [];
  const invalidCountOneCases = new Set([4, 6, 9, 12, 14, 15, 24]);
  for (const [index, title, oracle, mutate] of definitions) {
    await restore();
    await mutate();
    const observedResult = await validateTask(taskId, {projectRoot: runRoot, writeGraph: true, targetGate: "bootstrap-candidate-review"});
    const expected = {...oracle, expected_invalid_count: invalidCountOneCases.has(index) ? 1 : 0, expected_complete: oracle.gate === "GO"};
    const observed = {structural: observedResult.errors.length ? "INVALID" : "VALID", gate: observedResult.gateResults.bootstrap_candidate_review.status, exit_code: observedResult.exitCode, invalid_count: observedResult.referencedEvidenceValidation?.invalid_count ?? null, complete: observedResult.referencedEvidenceValidation?.complete ?? null};
    const pass = observed.structural === oracle.structural && observed.gate === oracle.gate && observed.exit_code === oracle.exit_code && observed.invalid_count === expected.expected_invalid_count && observed.complete === expected.expected_complete;
    matrixResults.push({case_id: `CASE-${String(index).padStart(2,"0")}`, title, production_entrypoint: "validateTask", independent_oracle: expected, observed, pass, schema_loader_invoked: true, referenced_evidence_validation: observedResult.referencedEvidenceValidation, errors: observedResult.errors});
  }
  const failed = matrixResults.filter((item) => !item.pass);
  const payload = {suite_id: "GOV-REFERENCED-EVIDENCE-PRODUCTION-24", case_count: matrixResults.length, passed: matrixResults.length-failed.length, failed: failed.length, fixed_oracles: true, cases: matrixResults};
  console.log(`REFERENCED_EVIDENCE_MATRIX ${JSON.stringify(payload)}`);
  await rm(runRoot, {recursive: true, force: true});
  process.exit(failed.length ? 1 : 0);
}

if (process.argv.includes("--referenced-evidence-mutations")) {
  const pristine = await validateTask(taskId, {projectRoot: runRoot, writeGraph: true, targetGate: "bootstrap-candidate-review"});
  if (pristine.exitCode !== 0 || pristine.errors.length) throw new Error("Mutation baseline must be structural VALID and Candidate GO.");
  const baselineTaskDir = path.join(runRoot, "referenced-evidence-mutation-baseline");
  await cp(taskDir, baselineTaskDir, {recursive: true});
  const sourceRefs = [".codex/scripts/lib/governance/evidence-resolver.mjs", ".codex/scripts/validate-task.mjs", ".codex/scripts/lib/governance/gate-router.mjs"];
  const sourceBytes = new Map();
  for (const ref of sourceRefs) sourceBytes.set(ref, await readFile(path.join(runRoot, ...ref.split("/"))));
  const manifestPath = () => path.join(taskDir, "artifact-manifest.yaml");
  const readManifest = async () => JSON.parse(await readFile(manifestPath(), "utf8"));
  const writeManifest = async (manifest) => writeFileRaw(manifestPath(), json(manifest));
  const taskPath = (ref) => path.join(runRoot, ...ref.split("/"));
  const typed = (manifest, evidenceType) => manifest.artifacts.find((item) => item.evidence_type === evidenceType);
  async function restore() {
    await rm(taskDir, {recursive: true, force: true}); await cp(baselineTaskDir, taskDir, {recursive: true});
    for (const [ref, bytes] of sourceBytes) await writeFileRaw(path.join(runRoot, ...ref.split("/")), bytes);
  }
  async function replaceSource(ref, from, to) {
    const target = path.join(runRoot, ...ref.split("/"));
    const original = await readFile(target, "utf8");
    if (!original.includes(from)) throw new Error(`Mutation anchor not found for ${ref}: ${from}`);
    await writeFileRaw(target, original.replace(from, to));
  }
  async function setSecurity(document, {staleHash = false, ref = `${taskRef}/security-evidence.yaml`} = {}) {
    const bytes = Buffer.from(json(document));
    await mkdir(path.dirname(taskPath(ref)), {recursive: true});
    await writeFileRaw(taskPath(ref), bytes);
    const manifest = await readManifest();
    const artifact = typed(manifest, "security_evidence");
    artifact.path = ref;
    if (!staleHash) artifact.sha256 = sha256(bytes);
    await writeManifest(manifest);
  }
  async function duplicateSecurity() {
    const manifest = await readManifest();
    const first = typed(manifest, "security_evidence");
    const second = structuredClone(first); second.artifact_id = "ART-TYPED-SECURITY-MUTANT-DUP"; second.path = `${taskRef}/nested/duplicate-security.yaml`;
    const bytes = await readFile(taskPath(first.path)); await mkdir(path.dirname(taskPath(second.path)), {recursive:true}); await writeFileRaw(taskPath(second.path), bytes); second.sha256 = sha256(bytes); manifest.artifacts.push(second); await writeManifest(manifest);
  }
  const invalidSecurity = () => ({schema_version: 1, task_id: taskId, scan_scope: {governance_artifacts: "DETERMINISTIC_CONTRACT", external_referenced_evidence: "LIMITED"}, scan_contract: {scan_contract_id: "GOV-DETERMINISTIC-SCAN", scan_contract_version: 5}, claims: {no_findings_within_declared_contract: true}, external_evidence: []});
  const mutations = [
    {operator:"MUT-REF-EVIDENCE-SKIP-NESTED", mutateCode:()=>replaceSource(sourceRefs[0], "const issues = schemaSet?.validate(entry.schema_path, document, artifact.path) ?? [\"Schema set unavailable.\"];", "const issues = artifact.path.includes(\"/nested/\") ? [] : (schemaSet?.validate(entry.schema_path, document, artifact.path) ?? [\"Schema set unavailable.\"]);"), mutateInput:()=>setSecurity({schema_version:1,task_id:taskId,claim:"nested-schema-bypass",invalid_extra:true},{ref:`${taskRef}/nested/session-b6-security-evidence.yaml`})},
    {operator:"MUT-REF-EVIDENCE-TRUST-HASH-ONLY", mutateCode:()=>replaceSource(sourceRefs[0], "const issues = schemaSet?.validate(entry.schema_path, document, artifact.path) ?? [\"Schema set unavailable.\"];", "const issues = [];"), mutateInput:()=>setSecurity({schema_version:1,task_id:taskId,claim:"hash-only-bypass",invalid_extra:true})},
    {operator:"MUT-REF-EVIDENCE-IGNORE-UNKNOWN-TYPE", mutateCode:async()=>{await replaceSource(sourceRefs[0], "const entry = byType?.get(artifact.evidence_type);", "const entry = byType?.get(artifact.evidence_type) ?? byType?.get(\"security_evidence\");");await replaceSource(sourceRefs[0], "if (!entry) { structural(errors, \"UNREGISTERED_EVIDENCE_TYPE\", `${artifact.artifact_id} declares ${artifact.evidence_type}.`); continue; }", "if (!entry) continue;");await replaceSource(sourceRefs[0], "resolved.push({ artifact_id: artifact.artifact_id, evidence_id: artifact.artifact_id, evidence_type: artifact.evidence_type,", "resolved.push({ artifact_id: artifact.artifact_id, evidence_id: artifact.artifact_id, evidence_type: entry.evidence_type,");await replaceSource(sourceRefs[1], "for (const issue of validateSchema(schemas[schemaName], documents[name], name)) errors.push(`SCHEMA ${issue}`);", "if (name !== \"artifact-manifest.yaml\") for (const issue of validateSchema(schemas[schemaName], documents[name], name)) errors.push(`SCHEMA ${issue}`);");}, mutateInput:async()=>{const m=await readManifest();typed(m,"security_evidence").evidence_type="unknown_security";await writeManifest(m);}},
    {operator:"MUT-REF-EVIDENCE-ALLOW-SCHEMA-MISMATCH", mutateCode:()=>replaceSource(sourceRefs[0], "if (artifact.schema_id !== entry.schema_id) structural(errors, \"SCHEMA_ID_MISMATCH\", `${artifact.artifact_id} schema_id does not match registry.`);", "if (false) structural(errors, \"SCHEMA_ID_MISMATCH\", `${artifact.artifact_id} schema_id does not match registry.`);"), mutateInput:async()=>{const m=await readManifest();typed(m,"security_evidence").schema_id="https://invalid.local/security.schema.json";await writeManifest(m);}},
    {operator:"MUT-REF-EVIDENCE-FIRST-MATCH-ONLY", mutateCode:async()=>{await replaceSource(sourceRefs[0], "for (const artifact of declared) {", "for (const artifact of declared.filter((item,index,array) => array.findIndex((candidate) => candidate.evidence_type === item.evidence_type) === index)) {");await replaceSource(sourceRefs[0], "if (!entry.allow_multiple && matches.length > 1) structural(errors, \"MULTIPLICITY_VIOLATION\", `${entry.evidence_type} resolved ${matches.length} times.`);", "if (false) structural(errors, \"MULTIPLICITY_VIOLATION\", `${entry.evidence_type} resolved ${matches.length} times.`);");await replaceSource(sourceRefs[0], "const unresolved_count = missing.length + Math.max(0, declared.length - resolved.length);", "const unresolved_count = missing.length;");await replaceSource(sourceRefs[0], "const duplicate_count = errors.filter((item) => /CASE_OR_PATH_COLLISION|DUPLICATE_PHYSICAL_PATH|CONFLICTING_TYPE_PATH|MULTIPLICITY_VIOLATION/.test(item)).length;", "const duplicate_count = 0;");}, mutateInput:async()=>{const m=await readManifest();const d=structuredClone(typed(m,"security_evidence"));d.artifact_id="ART-TYPED-SECURITY-SECOND";d.path=`${taskRef}/nested/second-invalid-security.yaml`;const bytes=Buffer.from(json({schema_version:1,task_id:taskId,invalid_extra:true}));await mkdir(path.dirname(taskPath(d.path)),{recursive:true});await writeFileRaw(taskPath(d.path),bytes);d.sha256=sha256(bytes);m.artifacts.push(d);await writeManifest(m);}},
    {operator:"MUT-REF-EVIDENCE-DROP-DUPLICATE-CHECK", mutateCode:()=>replaceSource(sourceRefs[0], "if (!entry.allow_multiple && matches.length > 1) structural(errors, \"MULTIPLICITY_VIOLATION\", `${entry.evidence_type} resolved ${matches.length} times.`);", "if (false) structural(errors, \"MULTIPLICITY_VIOLATION\", `${entry.evidence_type} resolved ${matches.length} times.`);"), mutateInput:()=>duplicateSecurity()},
    {operator:"MUT-REF-EVIDENCE-DROP-MANIFEST-BACKREF", mutateCode:async()=>{await replaceSource(sourceRefs[0], "const resolved_count = requiredResolvedTypes.size;", "const resolved_count = required_count;");await replaceSource(sourceRefs[0], "const validated_count = requiredValidatedTypes.size;", "const validated_count = required_count;");await replaceSource(sourceRefs[0], "const unresolved_count = missing.length + Math.max(0, declared.length - resolved.length);", "const unresolved_count = 0;");await replaceSource(sourceRefs[0], "const complete = errors.length === 0 && required_count === resolved_count && required_count === validated_count && invalid_count === 0 && unresolved_count === 0 && duplicate_count === 0;", "const complete = errors.length === 0;");}, mutateInput:async()=>{const m=await readManifest();m.artifacts=m.artifacts.filter((item)=>item.evidence_type!=="security_evidence");await writeManifest(m);}},
    {operator:"MUT-REF-EVIDENCE-DROP-GATE-COMPLETENESS", mutateCode:async()=>{await replaceSource(sourceRefs[1], "if (!referencedEvidenceValidation.complete) gateReasons.push(`Referenced evidence validation is ${referencedEvidenceValidation.disposition}.`);", "if (false) gateReasons.push(`Referenced evidence validation is ${referencedEvidenceValidation.disposition}.`);");await replaceSource(sourceRefs[2], "if (evidence.complete !== true || !evidenceCountsValid) candidateBlockers.push(\"REFERENCED_EVIDENCE_INCOMPLETE\");", "if (false) candidateBlockers.push(\"REFERENCED_EVIDENCE_INCOMPLETE\");");}, mutateInput:async()=>{const m=await readManifest();m.artifacts=m.artifacts.filter((item)=>item.evidence_type!=="security_evidence");await writeManifest(m);}}
  ];
  const mutationResults = [];
  for (const mutation of mutations) {
    await restore();
    await mutation.mutateCode();
    await refreshBindings();
    await mutation.mutateInput();
    const cli = path.join(runRoot, ".codex", "scripts", "validate-task.mjs");
    const child = spawnSync(process.execPath, [cli, "--task-id", taskId, "--target-gate", "bootstrap-candidate-review"], {cwd: runRoot, encoding:"utf8", windowsHide:true, maxBuffer:16*1024*1024});
    const observed = {exit_code: child.status, accepted: child.status === 0 && child.stdout.includes("bootstrap_candidate_review=GO") && child.stdout.includes("structural=VALID")};
    mutationResults.push({operator:mutation.operator, production_entrypoint:"validateTask CLI", fixed_oracle:{structural:"INVALID",gate:"NO-GO",exit_code:1}, mutant_observed:observed, killed:observed.accepted});
  }
  const killed = mutationResults.filter((item)=>item.killed).length;
  const payload={suite_id:"GOV-REFERENCED-EVIDENCE-MUTATIONS-8",operator_count:mutationResults.length,killed,survived:mutationResults.length-killed,mutation_definition:"A mutant is killed when the fixed rejection oracle fails under the mutated production implementation.",operators:mutationResults};
  console.log(`REFERENCED_EVIDENCE_MUTATIONS ${JSON.stringify(payload)}`);
  await rm(runRoot,{recursive:true,force:true});
  process.exit(killed===mutations.length?0:1);
}

let result = await validateTask(taskId, {projectRoot: runRoot, writeGraph: true, targetGate: "bootstrap-candidate-review"});
record("PROD-GATE-01", "Candidate Review GO is legal while final commit approval is pending.", result.exitCode === 0 && result.errors.length === 0 && result.gateResults.bootstrap_candidate_review.status === "GO" && result.gateResults.bootstrap_human_commit.status === "NO-GO", result, {exit: 0, candidate: "GO", human_commit: "NO-GO"});
result = await validateTask(taskId, {projectRoot: runRoot});
record("PROD-GATE-02", "No target uses conservative aggregate exit while emitting the full distinct map.", result.exitCode === 2 && result.calculatedGate === "GO" && result.gateResults.bootstrap_candidate_review.status === "GO" && result.gateResults.steady_state_preparation.status === "DISABLED" && result.gateResults.steady_state_execution.status === "DISABLED" && result.gateResults.migration_320_execution.status === "NO-GO", result, {exit: 2, legal_combination: true});
result = await validateTask(taskId, {projectRoot: runRoot, targetGate: "bootstrap-human-commit"});
record("PROD-GATE-03", "Session B absence affects Human Commit only.", result.exitCode === 2 && result.gateResults.bootstrap_candidate_review.status === "GO" && result.gateResults.bootstrap_human_commit.reason_codes.includes("SESSION_B_NOT_PASS"), result, {exit: 2, candidate: "GO"});
result = await validateTask(taskId, {projectRoot: runRoot, targetGate: "migration-320-execution"});
record("PROD-GATE-04", "Migration 320 remains independently NO-GO.", result.exitCode === 2 && result.gateResults.migration_320_execution.status === "NO-GO" && result.migrationReasons.length >= 3, result, {exit: 2, migration: "NO-GO"});

const approvalPath = path.join(taskDir, "human-approval.yaml");
const approvalOriginal = await readFile(approvalPath, "utf8");
const rejectedFinal = JSON.parse(approvalOriginal); rejectedFinal.approvals.find((item) => item.stage === "final_commit_approval").status = "rejected"; await writeFile(approvalPath, json(rejectedFinal));
result = await validateTask(taskId, {projectRoot: runRoot, targetGate: "bootstrap-candidate-review"});
record("PROD-GATE-05", "Final commit rejection cannot change a clean Candidate Review result.", result.exitCode === 0 && result.gateResults.bootstrap_candidate_review.status === "GO", result, {exit: 0, candidate: "GO"});
await writeFile(approvalPath, approvalOriginal);

const findingsPath = path.join(taskDir, "review-findings.yaml");
const findingsOriginal = await readFile(findingsPath, "utf8");
const blueprintPath = path.join(taskDir, "blueprint.yaml");
const blueprintOriginal = await readFile(blueprintPath, "utf8");
const railwayProfilePath = path.join(runRoot, ...railwayProfileRef.split("/"));
const railwayProfileOriginal = await readFile(railwayProfilePath, "utf8");
const finalSummaryPath = path.join(taskDir, "final-summary.md");
const finalSummaryOriginal = await readFile(finalSummaryPath, "utf8");
function projectCandidateGate(findings, status) {
  findings.calculated_gate = status;
  findings.overall_gate = status;
  findings.bootstrap_candidate_review_gate = status;
  findings.eligible_to_start_session_b = status === "GO";
  return findings;
}
const handWrittenNoGo = JSON.parse(findingsOriginal);
handWrittenNoGo.calculated_gate = "NO-GO";
handWrittenNoGo.overall_gate = "NO-GO";
handWrittenNoGo.bootstrap_candidate_review_gate = "NO-GO";
await writeFile(findingsPath, json(handWrittenNoGo));
result = await validateTask(taskId, {projectRoot: runRoot, targetGate: "bootstrap-candidate-review"});
record("PROD-GATE-07", "A hand-written Candidate NO-GO is only a projection mismatch and cannot change the authoritative GO map.", result.exitCode === 1 && result.gateResults.bootstrap_candidate_review.status === "GO" && result.errors.some((item) => item.includes("GATE_PROJECTION")), result, {exit: 1, authoritative_candidate: "GO"});
await writeFile(findingsPath, findingsOriginal);

const handWrittenEligibility = JSON.parse(findingsOriginal);
handWrittenEligibility.eligible_to_start_session_b = false;
await writeFile(findingsPath, json(handWrittenEligibility));
result = await validateTask(taskId, {projectRoot: runRoot, targetGate: "bootstrap-candidate-review"});
record("PROD-GATE-08", "A hand-written Session B eligibility projection cannot become a Candidate Gate input.", result.exitCode === 1 && result.gateResults.bootstrap_candidate_review.status === "GO" && result.errors.some((item) => item.includes("eligible_to_start_session_b")), result, {exit: 1, authoritative_candidate: "GO"});
await writeFile(findingsPath, findingsOriginal);

const missingCode = projectCandidateGate(JSON.parse(findingsOriginal), "NO-GO"); missingCode.reviews = missingCode.reviews.filter((item) => item.type !== "code"); await writeFile(findingsPath, json(missingCode)); await writeFile(finalSummaryPath, "# Bootstrap production integration\n\nCalculated gate: NO-GO\n");
const pendingReviewApproval = JSON.parse(approvalOriginal); pendingReviewApproval.approvals.find((item) => item.stage === "review_completion").status = "pending"; await writeFile(approvalPath, json(pendingReviewApproval));
result = await validateTask(taskId, {projectRoot: runRoot, targetGate: "bootstrap-candidate-review"});
record("PROD-GATE-06", "Missing Candidate Reviewer makes Candidate Review NO-GO without changing other gate inputs.", result.exitCode === 2 && result.errors.length === 0 && result.gateResults.bootstrap_candidate_review.status === "NO-GO" && result.candidateReasons.some((item) => item.includes("Missing required code review")), result, {exit: 2, candidate: "NO-GO"});
await writeFile(findingsPath, findingsOriginal); await writeFile(finalSummaryPath, finalSummaryOriginal); await writeFile(approvalPath, approvalOriginal);

const domainExternal = JSON.parse(findingsOriginal).reviews.find((item) => item.type === "railway-domain");
result = await validateTask(taskId, {projectRoot: runRoot, targetGate: "bootstrap-candidate-review"});
record("PROD-DOMAIN-01", "Mechanism PASS and Migration 320 NEEDS_HUMAN_DECISION is a legal split.", domainExternal.governance_mechanism_outcome.outcome === "PASS" && domainExternal.external_decisions[0].outcome === "NEEDS_HUMAN_DECISION" && result.exitCode === 0 && result.gateResults.migration_320_execution.status === "NO-GO", result, {candidate: "GO", migration: "NO-GO"});
const mechanismBlocker = projectCandidateGate(JSON.parse(findingsOriginal), "NO-GO"); const typedReview = mechanismBlocker.reviews.find((item) => item.type === "railway-domain"); typedReview.outcome = "BLOCKER"; typedReview.governance_mechanism_outcome.outcome = "BLOCKER"; await writeFile(findingsPath, json(mechanismBlocker)); await writeFile(finalSummaryPath, "# Bootstrap production integration\n\nCalculated gate: NO-GO\n"); await writeFile(approvalPath, json(pendingReviewApproval));
result = await validateTask(taskId, {projectRoot: runRoot, targetGate: "bootstrap-candidate-review"});
record("PROD-DOMAIN-02", "Mechanism BLOCKER affects Candidate Review.", result.exitCode === 2 && result.gateResults.bootstrap_candidate_review.status === "NO-GO", result, {candidate: "NO-GO"});
await writeFile(findingsPath, findingsOriginal); await writeFile(finalSummaryPath, finalSummaryOriginal); await writeFile(approvalPath, approvalOriginal);
const escapedDecision = JSON.parse(findingsOriginal); escapedDecision.reviews.find((item) => item.type === "railway-domain").external_decisions[0].affects_gate = "bootstrap_candidate_review"; await writeFile(findingsPath, json(escapedDecision));
result = await validateTask(taskId, {projectRoot: runRoot, targetGate: "bootstrap-candidate-review"});
record("PROD-DOMAIN-03", "External business decision cannot be routed into Candidate Review.", result.exitCode === 1 && result.errors.some((item) => item.includes("DOMAIN_REVIEW") || item.includes("SCHEMA")), result, {exit: 1});
await writeFile(findingsPath, findingsOriginal);

const candidateApplicable = JSON.parse(blueprintOriginal); candidateApplicable.applicable_rules.push("COMPAT-M320-001"); await writeFile(blueprintPath, json(candidateApplicable));
result = await validateTask(taskId, {projectRoot: runRoot});
record("PROD-DOMAIN-04", "Railway candidate cannot enter applicable_rules.", result.exitCode === 1 && result.errors.some((item) => item.includes("cannot be an applicable")), result, {exit: 1});
await writeFile(blueprintPath, blueprintOriginal);
const globalRulesPath = path.join(runRoot, ".codex", "meta-rules", "global.yaml");
const globalRulesOriginal = await readFile(globalRulesPath, "utf8");
const businessMeta = JSON.parse(globalRulesOriginal); businessMeta.rules[0].category = "domain"; await writeFile(globalRulesPath, json(businessMeta));
result = await validateTask(taskId, {projectRoot: runRoot});
record("PROD-DOMAIN-05", "Generic meta-rule business authority bypass is rejected.", result.exitCode === 1 && result.errors.some((item) => item.includes("business category")), result, {exit: 1});
await writeFile(globalRulesPath, globalRulesOriginal); bindings = await refreshBindings();

async function reviewerBindingAttack(caseId, invariant, mutateFindings = (value) => value, mutateBlueprint = (value) => value, expectedFragment = "REVIEWER_BINDING") {
  const attackedFindings = mutateFindings(JSON.parse(findingsOriginal));
  const attackedBlueprint = mutateBlueprint(JSON.parse(blueprintOriginal));
  await writeFile(findingsPath, json(attackedFindings));
  await writeFile(blueprintPath, json(attackedBlueprint));
  const attackResult = await validateTask(taskId, {projectRoot: runRoot, targetGate: "bootstrap-candidate-review"});
  record(caseId, invariant, attackResult.exitCode === 1 && attackResult.errors.some((item) => item.includes(expectedFragment)), attackResult, {exit: 1, error: expectedFragment});
  await writeFile(findingsPath, findingsOriginal);
  await writeFile(blueprintPath, blueprintOriginal);
}

const railwayReview = (document) => document.reviews.find((item) => item.type === "railway-domain");
await reviewerBindingAttack("PROD-REVIEWER-01", "A substituted implementer cannot occupy the formal Railway reviewer slot.", (document) => { railwayReview(document).reviewer = "fixture-implementer"; return document; });
await reviewerBindingAttack("PROD-REVIEWER-02", "Missing Railway review assignment fails closed.", (document) => document, (document) => { document.review_assignments = []; return document; });
await reviewerBindingAttack("PROD-REVIEWER-03", "Duplicate assignment identity fails closed.", (document) => document, (document) => { document.review_assignments.push(structuredClone(document.review_assignments[0])); return document; });
await reviewerBindingAttack("PROD-REVIEWER-04", "A root or unrelated assignment role cannot satisfy Railway review authority.", (document) => document, (document) => { document.review_assignments[0].required_role_id = "root"; return document; });
await reviewerBindingAttack("PROD-REVIEWER-05", "An alternate agent profile reference cannot satisfy Railway review authority.", (document) => document, (document) => { document.review_assignments[0].agent_profile_reference = ".codex/agents/code-reviewer.toml"; return document; });
await reviewerBindingAttack("PROD-REVIEWER-06", "An assignment profile hash mismatch fails closed.", (document) => document, (document) => { document.review_assignments[0].agent_profile_sha256 = "A".repeat(64); return document; });
await reviewerBindingAttack("PROD-REVIEWER-07", "Any formal Railway reviewer write path fails closed.", (document) => document, (document) => { document.review_assignments[0].allowed_write_paths = [`.codex/tasks/${taskId}/**`]; return document; });
await reviewerBindingAttack("PROD-REVIEWER-08", "Assignment and review scope mismatch fails closed.", (document) => document, (document) => { document.review_assignments[0].required_review_scope = "migration_320_business_approval"; return document; });
await reviewerBindingAttack("PROD-REVIEWER-09", "Bound reviewer run must equal the outer formal review run.", (document) => { railwayReview(document).reviewer_binding.reviewer_run_id = "RUN-SUBSTITUTED"; return document; });
await reviewerBindingAttack("PROD-REVIEWER-10", "Bound reviewer session must equal the outer formal review session.", (document) => { railwayReview(document).reviewer_binding.session_id = "SESSION-SUBSTITUTED"; return document; });
await reviewerBindingAttack("PROD-REVIEWER-11", "Railway reviewer and implementer sessions must differ.", (document) => { const review = railwayReview(document); review.session_id = `IMPLEMENTER-${taskId}`; review.reviewer_binding.session_id = `IMPLEMENTER-${taskId}`; return document; });
await reviewerBindingAttack("PROD-REVIEWER-12", "A case-variant Railway reviewer alias fails closed.", (document) => { railwayReview(document).reviewer = "Railway-Domain-Reviewer"; return document; }, (document) => document, "REVIEW_ROLE");
await reviewerBindingAttack("PROD-REVIEWER-13", "Missing reviewer_binding fails closed.", (document) => { delete railwayReview(document).reviewer_binding; return document; }, (document) => document, "reviewer_binding");
const profileRoleAttack = railwayProfileOriginal.replace('canonical_role_id = "railway-domain-reviewer"', 'canonical_role_id = "root"');
await writeFile(railwayProfilePath, profileRoleAttack);
bindings = await refreshBindings();
result = await validateTask(taskId, {projectRoot: runRoot, targetGate: "bootstrap-candidate-review"});
record("PROD-REVIEWER-14", "A manifest-rebound profile with the wrong canonical role still fails closed.", result.exitCode === 1 && result.errors.some((item) => item.includes("REVIEWER_BINDING canonical reviewer profile name and canonical_role_id")), result, {exit: 1, error: "REVIEWER_BINDING canonical reviewer profile name and canonical_role_id"});
await writeFile(railwayProfilePath, railwayProfileOriginal);
bindings = await refreshBindings();

async function scannerAttack(caseId, invariant, mutate, expectedFragment, recomputePayload = true) {
  const report = structuredClone(bindings.report);
  mutate(report);
  await writeCandidateForReport(bindings.governance, report, recomputePayload);
  const attackResult = await validateTask(taskId, {projectRoot: runRoot, targetGate: "bootstrap-candidate-review"});
  record(caseId, invariant, attackResult.exitCode === 1 && attackResult.errors.some((item) => item.includes(expectedFragment)), attackResult, {exit: 1, error: expectedFragment});
  await writeCandidateForReport(bindings.governance, structuredClone(bindings.report));
}
await scannerAttack("PROD-SCAN-01", "Wrong contract version is structural invalid.", (report) => { report.scan_contract.contract_version = 999; }, "contract");
await scannerAttack("PROD-SCAN-02", "Wrong contract hash is structural invalid.", (report) => { report.scan_contract.contract_sha256 = "A".repeat(64); }, "contract_sha256");
await scannerAttack("PROD-SCAN-03", "Wrong finding registry hash is structural invalid.", (report) => { report.scan_contract.finding_registry_sha256 = "A".repeat(64); }, "finding_registry_sha256");
await scannerAttack("PROD-SCAN-04", "Clean claim cannot disagree with findings.", (report) => { report.results.findings = [{finding_class: "PRIVATE_KEY", ref: "probe.md", transformations: ["raw-text"], location: null}]; report.results.finding_count = 1; report.results.result = "FAIL"; report.results.no_findings_within_declared_contract = true; }, "no-findings claim");
await scannerAttack("PROD-SCAN-05", "Truncated scanned file set is rejected.", (report) => { report.candidate_binding.scanned_file_set_sha256 = "A".repeat(64); }, "scanned file-set");
await scannerAttack("PROD-SCAN-06", "Expanded scanned count is rejected.", (report) => { report.candidate_binding.scanned_file_count += 1; }, "file counts");
await scannerAttack("PROD-SCAN-07", "Report replay against another manifest is rejected.", (report) => { report.candidate_binding.manifest_sha256 = "A".repeat(64); }, "manifest binding");
await scannerAttack("PROD-SCAN-08", "Unregistered finding class is rejected.", (report) => { report.results.findings = [{finding_class: "UNREGISTERED_CLASS", ref: "probe.md", transformations: ["raw-text"], location: null}]; report.results.finding_count = 1; report.results.result = "FAIL"; report.results.no_findings_within_declared_contract = false; }, "unregistered finding class");
await scannerAttack("PROD-SCAN-09", "False declared-contract execution claim is rejected.", (report) => { report.results.declared_contract_executed = false; }, "declared_contract_executed");
await scannerAttack("PROD-SCAN-10", "Report payload mutation is rejected.", (report) => { report.report_payload_sha256 = "A".repeat(64); }, "payload hash", false);

const matrixPath = path.join(runRoot, ".codex", "governance", "scanner-contract-matrix.yaml");
const matrixOriginal = await readFile(matrixPath, "utf8");
const noPositive = JSON.parse(matrixOriginal); noPositive.finding_classes[0][2] = "MISSING-POSITIVE"; await writeFile(matrixPath, json(noPositive));
result = await validateTask(taskId, {projectRoot: runRoot});
record("PROD-SCAN-11", "Every finding class requires a formal positive production case.", result.exitCode === 1 && result.errors.some((item) => item.includes("lacks production implementation or positive/safe-negative case")), result, {exit: 1});
await writeFile(matrixPath, matrixOriginal);
const noNegative = JSON.parse(matrixOriginal); noNegative.finding_classes[0][3] = "MISSING-NEGATIVE"; await writeFile(matrixPath, json(noNegative));
result = await validateTask(taskId, {projectRoot: runRoot});
record("PROD-SCAN-12", "Every finding class requires a formal safe-negative production case.", result.exitCode === 1 && result.errors.some((item) => item.includes("lacks production implementation or positive/safe-negative case")), result, {exit: 1});
await writeFile(matrixPath, matrixOriginal); bindings = await refreshBindings();

const classificationPath = path.join(taskDir, "classification.yaml");
const classificationOriginal = await readFile(classificationPath, "utf8");
const schemaBypass = JSON.parse(classificationOriginal); schemaBypass.unknown_control = true; await writeFile(classificationPath, json(schemaBypass));
result = await validateTask(taskId, {projectRoot: runRoot});
record("PROD-SCHEMA-01", "Production schema loader rejects unknown fields.", result.exitCode === 1 && result.errors.some((item) => item.includes("SCHEMA")), result, {exit: 1});
await writeFile(classificationPath, classificationOriginal);

const railwaySchemaPath = path.join(runRoot, ".codex", "blueprints", "schemas", "railway-domain-review.schema.json");
const railwaySchemaOriginal = await readFile(railwaySchemaPath, "utf8");
await writeFile(railwaySchemaPath, "{ invalid-json\n");
result = await validateTask(taskId, {projectRoot: runRoot});
record("PROD-SCHEMA-02", "Invalid Railway Domain Review Schema fails startup without fallback.", result.exitCode === 1 && result.errors.some((item) => item.includes("SCHEMA_SET")), result, {exit: 1});
await writeFile(railwaySchemaPath, railwaySchemaOriginal);

await rm(railwaySchemaPath);
result = await validateTask(taskId, {projectRoot: runRoot});
record("PROD-SCHEMA-03", "Missing Railway Domain Review Schema fails startup without fallback.", result.exitCode === 1 && result.errors.some((item) => item.includes("SCHEMA_SET") || item.includes("ENOENT")), result, {exit: 1});
await writeFile(railwaySchemaPath, railwaySchemaOriginal);

const duplicateIdSchema = JSON.parse(railwaySchemaOriginal);
duplicateIdSchema.$id = "https://ntmc.local/codex/schemas/review-findings.schema.json";
await writeFile(railwaySchemaPath, json(duplicateIdSchema));
result = await validateTask(taskId, {projectRoot: runRoot});
record("PROD-SCHEMA-04", "Duplicate governance Schema $id fails startup.", result.exitCode === 1 && result.errors.some((item) => item.includes("SCHEMA_SET")), result, {exit: 1});
await writeFile(railwaySchemaPath, railwaySchemaOriginal);

const missingAffectsGate = JSON.parse(findingsOriginal);
delete missingAffectsGate.reviews.find((item) => item.type === "railway-domain").external_decisions[0].affects_gate;
await writeFile(findingsPath, json(missingAffectsGate));
result = await validateTask(taskId, {projectRoot: runRoot});
record("PROD-SCHEMA-05", "Typed external Domain decision missing affects_gate is structural invalid.", result.exitCode === 1 && result.errors.some((item) => item.includes("SCHEMA")), result, {exit: 1});
await writeFile(findingsPath, findingsOriginal);

const domainSchemaOnlyViolation = JSON.parse(findingsOriginal);
domainSchemaOnlyViolation.reviews.find((item) => item.type === "railway-domain").governance_mechanism_outcome.self_asserted_authority = true;
await writeFile(findingsPath, json(domainSchemaOnlyViolation));
result = await validateTask(taskId, {projectRoot: runRoot});
record("PROD-SCHEMA-06", "Typed Railway Domain Review is validated by the dedicated production Schema, not only inline routing checks.", result.exitCode === 1 && result.errors.some((item) => item.includes("governance_mechanism_outcome") && item.includes("unknown property")), result, {exit: 1});
await writeFile(findingsPath, findingsOriginal);

const cli = path.join(runRoot, ".codex", "scripts", "validate-task.mjs");
const candidateCli = spawnSync(process.execPath, [cli, "--task-id", taskId, "--target-gate", "bootstrap-candidate-review"], {cwd: runRoot, encoding: "utf8", windowsHide: true});
record("PROD-CLI-01", "CLI target Candidate Review exits 0 on GO.", candidateCli.status === 0 && candidateCli.stdout.includes("bootstrap_candidate_review=GO"), {exitCode: candidateCli.status, gateResults: {bootstrap_candidate_review: {status: "GO"}}}, {exit: 0});
const defaultCli = spawnSync(process.execPath, [cli, "--task-id", taskId], {cwd: runRoot, encoding: "utf8", windowsHide: true});
record("PROD-CLI-02", "CLI without target is conservative and emits full Gate map.", defaultCli.status === 2 && defaultCli.stdout.includes("GATE_RESULTS") && defaultCli.stdout.includes("steady_state_preparation=DISABLED"), {exitCode: defaultCli.status}, {exit: 2});
const badTargetCli = spawnSync(process.execPath, [cli, "--task-id", taskId, "--target-gate", "unknown"], {cwd: runRoot, encoding: "utf8", windowsHide: true});
record("PROD-CLI-03", "Unsupported target gate exits structural invalid.", badTargetCli.status === 1, {exitCode: badTargetCli.status}, {exit: 1});

const failed = results.filter((item) => !item.pass);
for (const item of results) console.log(`${item.pass ? "PASS" : "FAIL"} ${item.case_id} ${item.invariant} exit=${item.exit_code}`);
console.log(`BOOTSTRAP_PRODUCTION_INTEGRATION ${JSON.stringify({total: results.length, passed: results.length - failed.length, failed: failed.length, layers: ["schema-loader", "gate-router", "target-gate-cli", "bootstrap-candidate-binding", "scanner-report-schema", "scanner-contract-bundle", "domain-review-routing", "migration-gate-separation", "scope-lattice", "rule-class-authority"], results})}`);
await rm(runRoot, {recursive: true, force: true});
process.exit(failed.length ? 1 : 0);
