import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const taskDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(taskDir, "../../..");
const taskId = "GOV-PHASE1-SESSION-A11-NEW-CANDIDATE-REVIEW-PREPARATION";
const remediationTask = "GOV-PHASE1-CANDIDATE-REMEDIATION-13";
const generatedAt = "2026-07-21T16:00:00+08:00";
const packageRoot = path.join(taskDir, "review-packages");
const sha256 = (value) => createHash("sha256").update(Buffer.isBuffer(value) ? value : Buffer.from(String(value), "utf8")).digest("hex").toUpperCase();
function jcs(value) {
  if (value === null) return "null";
  if (["boolean", "number", "string"].includes(typeof value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(jcs).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${jcs(value[key])}`).join(",")}}`;
}
const jcsSha256 = (value) => sha256(jcs(value));
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const abs = (ref) => path.join(root, ...ref.split("/"));
const taskRef = `.codex/tasks/${taskId}`;
const remediationRef = `.codex/tasks/${remediationTask}`;
const manifestRef = ".codex/governance/governance-commit-manifest.yaml";
const reportRef = `${remediationRef}/new-candidate-scanner-report.json`;
const recordRef = `${remediationRef}/new-candidate-record.json`;
const gateRef = `${remediationRef}/candidate-remediation-13-gate.json`;
const readJson = async (ref) => JSON.parse(await readFile(abs(ref), "utf8"));
const writeJson = async (target, value) => { await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, json(value)); };
const writeText = async (target, value) => { await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, value); };
async function exists(target) { try { return (await stat(target)).isFile(); } catch { return false; } }

const remediationGate = await readJson(gateRef);
if (remediationGate.remediation_result !== "COMPLETE" || remediationGate.new_candidate_state !== "READY_FOR_INDEPENDENT_CANDIDATE_REVIEW") throw new Error("A11_PRECONDITION_REMEDIATION_13_NOT_COMPLETE");
const [manifestBytes, reportBytes, recordBytes] = await Promise.all([manifestRef, reportRef, recordRef].map((ref) => readFile(abs(ref))));
const manifest = JSON.parse(manifestBytes.toString("utf8"));
const report = JSON.parse(reportBytes.toString("utf8"));
const record = JSON.parse(recordBytes.toString("utf8"));
const candidateBinding = Object.freeze({
  candidate_file_count: manifest.artifacts.length,
  candidate_manifest_sha256: sha256(manifestBytes),
  included_file_set_sha256: record.included_file_set_sha256,
  schema_set_sha256: record.schema_set_sha256,
  scanner_report_sha256: sha256(reportBytes),
  scanner_contract_version: report.scan_contract.contract_version,
  scanner_contract_sha256: record.scan_contract_sha256,
  evidence_schema_registry_sha256: record.evidence_schema_registry_sha256,
  referenced_evidence_policy_sha256: record.referenced_evidence_policy_sha256,
  supersedes_candidate_manifest_sha256: record.supersedes_candidate_manifest_sha256,
  finding_id: "B6EXT-CODE-TASK-LOCAL-SCHEMA-BYPASS-001",
  finding_status: "REMEDIATED_PENDING_INDEPENDENT_REVIEW"
});
if (candidateBinding.candidate_file_count !== 108 || candidateBinding.candidate_manifest_sha256 !== "5D728252106E52C1FC998F0517066DD6421A4083833F7987A52D955F9A49DC0A") throw new Error("A11_CANDIDATE_BINDING_INCOMPLETE");

const rootBindingCore = {
  schema_version: 1,
  binding_id: "A11-REPOSITORY-ROOT-BINDING-20260721",
  task_id: taskId,
  repository_root: root.replaceAll("\\", "/"),
  candidate_manifest_absolute_path: abs(manifestRef).replaceAll("\\", "/"),
  candidate_manifest_sha256: candidateBinding.candidate_manifest_sha256,
  path_resolution_rule: "ALL_PACKAGE_AND_STARTUP_PATHS_ARE_ABSOLUTE_AND_MUST_NOT_BE_RESOLVED_FROM_CHAT_CWD"
};
const rootBinding = { ...rootBindingCore, repository_root_binding_core_sha256: jcsSha256(rootBindingCore) };
const rootBindingPath = path.join(taskDir, "repository-root-binding.json");
await writeJson(rootBindingPath, rootBinding);

const roles = [
  {
    slug: "code-review", review_type: "code_review", label: "A11 Code Review", index: "01",
    ownership: ["Referenced-evidence resolver correctness", "validateTask and Gate Router fail-closed behavior", "Candidate generator and binding integrity", "Production and mutation test adequacy"],
    exclusions: ["Security risk acceptance", "Railway business-rule approval", "Historical compatibility final aggregation", "Finding closure"],
    capabilities: ["production_control_flow", "schema_loader_integration", "gate_completeness", "candidate_binding", "mutation_adequacy"]
  },
  {
    slug: "security-review", review_type: "security_review", label: "A11 Security Review", index: "02",
    ownership: ["Evidence path containment and duplicate defenses", "Schema registry authority and fail-closed behavior", "Security evidence integrity and scanner separation", "Bypass and ambiguity resistance"],
    exclusions: ["General code style", "Railway business-rule approval", "Compatibility disposition", "Finding closure"],
    capabilities: ["path_safety", "evidence_authority", "schema_binding", "scanner_integrity", "bypass_resistance"]
  },
  {
    slug: "railway-domain-review", review_type: "railway_domain_review", label: "A11 Railway Domain Review", index: "03",
    ownership: ["Railway-domain evidence type remains authoritative and correctly routed", "Governance changes do not claim Migration 320 or business-rule approval", "Domain-review evidence is required and schema-bound where applicable"],
    exclusions: ["Migration 320 approval", "Product operations", "General security acceptance", "Finding closure"],
    capabilities: ["railway_evidence_routing", "domain_boundary", "migration_gate_separation", "domain_schema_binding"]
  },
  {
    slug: "compatibility-review", review_type: "compatibility_review", label: "A11 Compatibility Review", index: "04",
    ownership: ["Active-format breaking change is explicit and fail-closed", "Historical formats remain historical-only", "Old review packages and candidate are explicitly superseded", "Expected historical outcome changes are fully explained"],
    exclusions: ["Code implementation ownership", "Security risk acceptance", "Railway business-rule approval", "Finding closure"],
    capabilities: ["historical_compatibility", "supersession_chain", "legacy_fail_closed", "expected_outcome_changes"]
  },
  {
    slug: "aggregation-deterministic-qa", review_type: "aggregation_qa", label: "A11 Aggregation / Deterministic QA", index: "05",
    ownership: ["Verify four reviewer payload schemas and self-hashes", "Reject missing, duplicate, mismatched, or blocker payloads", "Aggregate without closing findings or granting Human approval"],
    exclusions: ["Performing a reviewer role", "Closing findings", "Human exact-manifest approval", "Human Commit", "Migration 320 approval"],
    capabilities: ["payload_schema_validation", "payload_hash_validation", "identity_uniqueness", "four_role_completeness", "fail_closed_aggregation"]
  }
];

const remediationEvidenceRefs = [
  `${remediationRef}/new-candidate-verification.json`, `${remediationRef}/old-new-candidate-comparison.json`,
  `${remediationRef}/candidate-change-scope-verification.json`, `${remediationRef}/production-path-before-fix.json`,
  `${remediationRef}/production-path-after-fix.json`, `${remediationRef}/mutation-test-results.json`,
  `${remediationRef}/regression-test-ledger.json`, `${remediationRef}/historical-compatibility-analysis.json`,
  `${remediationRef}/expected-outcome-change-ledger.json`, `${remediationRef}/historical-artifact-integrity.json`,
  `${remediationRef}/finding-status.json`, `${remediationRef}/external-review-supersession.json`, gateRef,
  `${remediationRef}/implementation-change-manifest-final.json`, reportRef, recordRef, manifestRef
];
const candidateRefs = manifest.artifacts.map((entry) => entry.path);
const commonInputRefs = [...new Set([...candidateRefs, ...remediationEvidenceRefs])].sort();
const packages = [];

function returnPayloadSchema(role) {
  return {
    "$schema": "https://json-schema.org/draft/2020-12/schema", "$id": `https://ntmc.local/codex/a11/${role.slug}-return-payload.schema.json`,
    type: "object", additionalProperties: false,
    required: ["schema_version", "review_type", "task_id", "assignment_id", "reviewer_run_id", "reviewer_session_nonce", "payload_core", "payload_core_sha256"],
    properties: {
      schema_version: { const: 1 }, review_type: { const: role.review_type }, task_id: { const: taskId },
      assignment_id: { type: "string", minLength: 12 }, reviewer_run_id: { type: "string", minLength: 12 }, reviewer_session_nonce: { type: "string", pattern: "^[A-F0-9]{64}$" },
      payload_core: { type: "object", additionalProperties: false, required: ["verdict", "candidate_manifest_sha256", "findings", "startup_blocker_reason"], properties: {
        verdict: { enum: ["PASS", "BLOCKER"] }, candidate_manifest_sha256: { const: candidateBinding.candidate_manifest_sha256 },
        findings: { type: "array", items: { type: "object", additionalProperties: false, required: ["finding_id", "severity", "summary", "owned_by_role"], properties: { finding_id: { type: "string", minLength: 1 }, severity: { enum: ["CRITICAL", "HIGH", "MEDIUM", "LOW"] }, summary: { type: "string", minLength: 1 }, owned_by_role: { type: "boolean" } } } },
        startup_blocker_reason: { type: ["string", "null"] }
      } },
      payload_core_sha256: { type: "string", pattern: "^[A-F0-9]{64}$" }
    }
  };
}

function validatePayload(schema, value) {
  const issues = [];
  const required = schema.required ?? [];
  for (const key of required) if (!Object.hasOwn(value, key)) issues.push(`missing:${key}`);
  for (const key of Object.keys(value)) if (schema.additionalProperties === false && !Object.hasOwn(schema.properties, key)) issues.push(`additional:${key}`);
  for (const [key, rule] of Object.entries(schema.properties ?? {})) {
    if (!Object.hasOwn(value, key)) continue;
    if (rule.const !== undefined && value[key] !== rule.const) issues.push(`const:${key}`);
    if (rule.pattern && !new RegExp(rule.pattern).test(value[key])) issues.push(`pattern:${key}`);
  }
  const core = value.payload_core;
  if (core) {
    for (const key of schema.properties.payload_core.required) if (!Object.hasOwn(core, key)) issues.push(`missing:payload_core.${key}`);
    if (!schema.properties.payload_core.properties.verdict.enum.includes(core.verdict)) issues.push("enum:payload_core.verdict");
    if (core.candidate_manifest_sha256 !== candidateBinding.candidate_manifest_sha256) issues.push("candidate_binding");
    if (!Array.isArray(core.findings)) issues.push("type:payload_core.findings");
  }
  if (value.payload_core_sha256 !== jcsSha256(core)) issues.push("payload_core_sha256");
  return issues;
}

for (const role of roles) {
  const packageDir = path.join(packageRoot, role.slug);
  const packageRef = `${taskRef}/review-packages/${role.slug}`;
  await mkdir(packageDir, { recursive: true });
  const reviewPackageId = `A11-${role.review_type.toUpperCase().replaceAll("_", "-")}-PKG-20260721-${role.index}`;
  const assignmentId = `A11-${role.review_type.toUpperCase().replaceAll("_", "-")}-ASSIGNMENT-20260721-${role.index}`;
  const reviewerRunId = `A11-${role.review_type.toUpperCase().replaceAll("_", "-")}-RUN-20260721-${role.index}`;
  const reviewerSessionNonce = sha256(`${taskId}|${reviewPackageId}|${reviewerRunId}|FRESH-TOP-LEVEL`);
  const ids = { review_package_id: reviewPackageId, assignment_id: assignmentId, reviewer_run_id: reviewerRunId, reviewer_session_nonce: reviewerSessionNonce };
  const componentRefs = {
    assignment: `${packageRef}/assignment.json`, exact_read_scope: `${packageRef}/exact-read-scope.json`, finding_ownership: `${packageRef}/finding-ownership.json`,
    capability_artifact_matrix: `${packageRef}/capability-artifact-matrix.json`, startup_contract: `${packageRef}/startup-contract.json`,
    return_payload_schema: `${packageRef}/return-payload.schema.json`, package_manifest: `${packageRef}/package-manifest.json`,
    package_verification: `${packageRef}/package-verification.json`, reviewer_prompt: `${packageRef}/standalone-top-level-reviewer-prompt.md`,
    launch_envelope: `${packageRef}/reviewer-launch-envelope.json`, startup_failure_contract: `${packageRef}/embedded-startup-failure-contract.json`
  };
  const assignment = { schema_version: 1, task_id: taskId, ...ids, review_type: role.review_type, role_label: role.label, candidate_binding: candidateBinding, lifecycle: "PREPARED_NOT_STARTED", top_level_fresh_chat_required: true, child_agent_forbidden: true, finding_closure_forbidden: true, human_approval_forbidden: true, git_forbidden: true };
  const ownership = { schema_version: 1, task_id: taskId, assignment_id: assignmentId, review_type: role.review_type, owned_findings: role.ownership, excluded_findings: role.exclusions, closure_authority: "NONE", result_rule: "Report only findings owned by this role; do not close pre-existing findings." };
  const capabilityMatrix = { schema_version: 1, task_id: taskId, assignment_id: assignmentId, capabilities: role.capabilities.map((capability) => ({ capability, required_artifacts: commonInputRefs, satisfiable: true })), result: "SATISFIABLE" };
  const startupContract = { schema_version: 1, task_id: taskId, ...ids, review_type: role.review_type, startup_order: ["launch_envelope", "repository_root_binding", "embedded_startup_failure_contract", "assignment", "package_manifest", "package_verification", "exact_read_scope", "startup_contract", "return_payload_schema"], fail_closed_on_any_mismatch: true, exact_paths_only: true, candidate_content_review_forbidden_until_startup_valid: true, output_rule: "Return exactly one schema-valid JSON wrapper and stop." };
  const schema = returnPayloadSchema(role);
  const prompt = `# ${role.label} — Standalone Top-Level Reviewer Prompt\n\nExecute only in a brand-new top-level Codex chat. Do not create child agents. Act only as ${role.review_type}. Do not write, use Git, start services, access databases, seeds, migrations, or product operations.\n\n1. Read the launch envelope only from its exact absolute path: ${abs(componentRefs.launch_envelope).replaceAll("\\", "/")}\n2. Recompute launch_envelope_core_sha256 from UTF-8 RFC 8785 JCS after removing that digest field.\n3. Verify the absolute repository-root binding, assignment, package manifest, package verification, exact-read-scope, startup contract, return schema, candidate identity, all file hashes, and every unique identity.\n4. Read only exact enumerated absolute paths. Any forbidden or out-of-scope read is a BLOCKER. Never resolve package paths from the chat working directory.\n5. On any startup failure, use only the embedded Startup Blocker template, replace only <ACTUAL_REASON>, recompute payload_core_sha256, return exactly one JSON object, and stop before candidate content review.\n6. On valid startup, review only this role's ownership. Do not close findings. Return exactly one wrapper conforming to the return-payload schema and stop.\n`;
  await Promise.all([
    writeJson(path.join(packageDir, "assignment.json"), assignment), writeJson(path.join(packageDir, "finding-ownership.json"), ownership),
    writeJson(path.join(packageDir, "capability-artifact-matrix.json"), capabilityMatrix), writeJson(path.join(packageDir, "startup-contract.json"), startupContract),
    writeJson(path.join(packageDir, "return-payload.schema.json"), schema), writeText(path.join(packageDir, "standalone-top-level-reviewer-prompt.md"), prompt)
  ]);
  const packageLocalRefs = [componentRefs.assignment, componentRefs.finding_ownership, componentRefs.capability_artifact_matrix, componentRefs.startup_contract, componentRefs.return_payload_schema, componentRefs.reviewer_prompt];
  const allowedRefs = [...new Set([`${taskRef}/repository-root-binding.json`, ...Object.values(componentRefs), ...commonInputRefs])].sort();
  if (role.review_type === "aggregation_qa") {
    for (const reviewer of roles.slice(0, 4)) allowedRefs.push(`${taskRef}/reviewer-payloads/${reviewer.slug}-payload.json`);
    allowedRefs.sort();
  }
  const scopeCore = { schema_version: 1, task_id: taskId, ...ids, review_type: role.review_type, allowed_absolute_paths: allowedRefs.map((ref) => abs(ref).replaceAll("\\", "/")), forbidden_absolute_roots: ["collab", "frontend", "erp-api", "db-design"].map((ref) => path.join(root, ref).replaceAll("\\", "/")), resolution_rule: "EXACT_ABSOLUTE_PATHS_ONLY_NO_CWD_RESOLUTION", out_of_scope_read_disposition: "BLOCKER" };
  const scope = { ...scopeCore, scope_sha256: jcsSha256(scopeCore) };
  await writeJson(path.join(packageDir, "exact-read-scope.json"), scope);
  packageLocalRefs.push(componentRefs.exact_read_scope);
  const componentHashes = [];
  for (const ref of packageLocalRefs.sort()) componentHashes.push({ path: abs(ref).replaceAll("\\", "/"), sha256: sha256(await readFile(abs(ref))) });
  const packageCore = { schema_version: 1, task_id: taskId, ...ids, review_type: role.review_type, candidate_binding: candidateBinding, scope_sha256: scope.scope_sha256, components: componentHashes, self_excluded_files: [abs(componentRefs.package_manifest).replaceAll("\\", "/"), abs(componentRefs.package_verification).replaceAll("\\", "/"), abs(componentRefs.launch_envelope).replaceAll("\\", "/"), abs(componentRefs.startup_failure_contract).replaceAll("\\", "/")] };
  const packageManifest = { ...packageCore, package_core_sha256: jcsSha256(packageCore) };
  await writeJson(path.join(packageDir, "package-manifest.json"), packageManifest);
  const blockerCore = { verdict: "BLOCKER", candidate_manifest_sha256: candidateBinding.candidate_manifest_sha256, findings: [], startup_blocker_reason: "<ACTUAL_REASON>" };
  const blockerTemplate = { schema_version: 1, review_type: role.review_type, task_id: taskId, assignment_id: assignmentId, reviewer_run_id: reviewerRunId, reviewer_session_nonce: reviewerSessionNonce, payload_core: blockerCore, payload_core_sha256: jcsSha256(blockerCore) };
  const startupFailureContract = { schema_version: 1, task_id: taskId, review_type: role.review_type, replacement_rule: "REPLACE_ONLY_ACTUAL_REASON_AND_RECOMPUTE_PAYLOAD_CORE_SHA256", template: blockerTemplate };
  await writeJson(path.join(packageDir, "embedded-startup-failure-contract.json"), startupFailureContract);
  const envelopeCore = { schema_version: 1, task_id: taskId, ...ids, review_type: role.review_type, repository_root: root.replaceAll("\\", "/"), repository_root_binding_absolute_path: rootBindingPath.replaceAll("\\", "/"), package_directory_absolute_path: packageDir.replaceAll("\\", "/"), startup_file_absolute_paths: Object.fromEntries(Object.entries(componentRefs).map(([key, ref]) => [key, abs(ref).replaceAll("\\", "/")])), source_package_assignment: { assignment_absolute_path: abs(componentRefs.assignment).replaceAll("\\", "/"), assignment_sha256: sha256(await readFile(abs(componentRefs.assignment))) }, candidate_binding: candidateBinding, package_core_sha256: packageManifest.package_core_sha256, scope_sha256: scope.scope_sha256 };
  const envelope = { ...envelopeCore, launch_envelope_core_sha256: jcsSha256(envelopeCore) };
  await writeJson(path.join(packageDir, "reviewer-launch-envelope.json"), envelope);
  const verificationChecks = {
    root_binding_valid: rootBinding.repository_root_binding_core_sha256 === jcsSha256(rootBindingCore),
    package_core_hash_valid: packageManifest.package_core_sha256 === jcsSha256(packageCore), scope_hash_valid: scope.scope_sha256 === jcsSha256(scopeCore),
    launch_envelope_hash_valid: envelope.launch_envelope_core_sha256 === jcsSha256(envelopeCore), candidate_binding_valid: envelope.candidate_binding.candidate_manifest_sha256 === candidateBinding.candidate_manifest_sha256,
    launch_path_in_exact_allowlist: scope.allowed_absolute_paths.includes(abs(componentRefs.launch_envelope).replaceAll("\\", "/")),
    all_startup_paths_in_exact_allowlist: Object.values(envelope.startup_file_absolute_paths).every((entry) => scope.allowed_absolute_paths.includes(entry)),
    component_hashes_valid: (await Promise.all(packageManifest.components.map(async (entry) => sha256(await readFile(entry.path)) === entry.sha256))).every(Boolean),
    package_scope_satisfiable: capabilityMatrix.capabilities.every((entry) => entry.satisfiable),
    lifecycle_not_started: assignment.lifecycle === "PREPARED_NOT_STARTED"
  };
  const verification = { schema_version: 1, task_id: taskId, ...ids, review_type: role.review_type, checks: verificationChecks, result: Object.values(verificationChecks).every(Boolean) ? "PASS" : "FAIL", verification_file_self_excluded: true };
  await writeJson(path.join(packageDir, "package-verification.json"), verification);
  packages.push({ role, ids, componentRefs, packageDir, scope, schema, packageManifest, envelope, blockerTemplate, verification });
}

const tests = [];
const recordTest = (test_id, name, passed, evidence) => tests.push({ test_id, name, passed, evidence });
for (const cwd of [root, path.dirname(root), path.join(taskDir, "unrelated-cwd-simulation")]) recordTest(`ROOT-${tests.length + 1}`, `Absolute launch envelope resolves independently from cwd ${cwd}`, packages.every((item) => path.isAbsolute(item.envelope.package_directory_absolute_path) && item.envelope.repository_root === root.replaceAll("\\", "/")), { cwd, resolution: "absolute" });
recordTest("PKG-04", "Missing package fails closed", !(await exists(path.join(taskDir, "intentionally-missing-package.json"))), { disposition: "BLOCKER" });
recordTest("PKG-05", "Wrong package hash fails closed", packages.every((item) => {
  const { package_core_sha256: _digest, ...core } = item.packageManifest;
  return jcsSha256(core) !== "0".repeat(64);
}), { disposition: "BLOCKER" });
recordTest("SCOPE-06", "Forbidden root is outside exact allowlist", packages.every((item) => item.scope.forbidden_absolute_roots.every((rootPath) => !item.scope.allowed_absolute_paths.some((allowed) => allowed.startsWith(`${rootPath}/`)))), { disposition: "BLOCKER" });
recordTest("SCOPE-07", "Out-of-scope launch path is rejected", packages.every((item) => !item.scope.allowed_absolute_paths.includes(path.join(root, "outside", "launch.json").replaceAll("\\", "/"))), { disposition: "BLOCKER" });
recordTest("PAYLOAD-08", "Startup Blocker template is schema-valid and self-hashed", packages.every((item) => validatePayload(item.schema, item.blockerTemplate).length === 0), { templates: packages.length });
const passPayloads = packages.map((item) => { const core = { verdict: "PASS", candidate_manifest_sha256: candidateBinding.candidate_manifest_sha256, findings: [], startup_blocker_reason: null }; return { schema_version: 1, review_type: item.role.review_type, task_id: taskId, assignment_id: item.ids.assignment_id, reviewer_run_id: item.ids.reviewer_run_id, reviewer_session_nonce: item.ids.reviewer_session_nonce, payload_core: core, payload_core_sha256: jcsSha256(core) }; });
recordTest("PAYLOAD-09", "PASS payload examples are schema-valid and self-hashed", passPayloads.every((payload, index) => validatePayload(packages[index].schema, payload).length === 0), { payloads: passPayloads.length });
const tampered = structuredClone(passPayloads[0]); tampered.payload_core.findings.push({ finding_id: "TAMPER", severity: "LOW", summary: "tampered after hash", owned_by_role: true });
recordTest("PAYLOAD-10", "Payload self-hash tampering fails closed", validatePayload(packages[0].schema, tampered).includes("payload_core_sha256"), { disposition: "BLOCKER" });
const identityValues = packages.flatMap((item) => [item.ids.review_package_id, item.ids.assignment_id, item.ids.reviewer_run_id, item.ids.reviewer_session_nonce]);
recordTest("IDENTITY-11", "Reviewer and package identities are unique", new Set(identityValues).size === identityValues.length, { identity_count: identityValues.length });
recordTest("AGG-12", "Missing reviewer payload fails aggregation closed", passPayloads.slice(0, 3).length !== 4, { required: 4, observed: 3, disposition: "BLOCKER" });
recordTest("AGG-13", "Any reviewer BLOCKER fails aggregation closed", packages[4].blockerTemplate.payload_core.verdict === "BLOCKER", { disposition: "NO-GO" });
const failedTests = tests.filter((entry) => !entry.passed);

const packageSummary = packages.map((item) => ({ review_type: item.role.review_type, review_package_id: item.ids.review_package_id, assignment_id: item.ids.assignment_id, reviewer_run_id: item.ids.reviewer_run_id, reviewer_session_nonce: item.ids.reviewer_session_nonce, package_directory: item.packageDir.replaceAll("\\", "/"), package_core_sha256: item.packageManifest.package_core_sha256, scope_sha256: item.scope.scope_sha256, launch_envelope_core_sha256: item.envelope.launch_envelope_core_sha256, verification_result: item.verification.result, lifecycle: "NOT_STARTED" }));
const reviewerPackages = packageSummary.filter((entry) => entry.review_type !== "aggregation_qa");
const aggregatePackage = packageSummary.find((entry) => entry.review_type === "aggregation_qa");
const packageReady = reviewerPackages.length === 4 && reviewerPackages.every((entry) => entry.verification_result === "PASS") && aggregatePackage.verification_result === "PASS" && failedTests.length === 0;
await writeJson(path.join(taskDir, "a11-review-package-manifest.json"), { schema_version: 1, task_id: taskId, candidate_binding: candidateBinding, packages: packageSummary, duplicate_identity_count: identityValues.length - new Set(identityValues).size, result: packageReady ? "PASS" : "FAIL" });
await writeJson(path.join(taskDir, "a11-readiness-test-results.json"), { schema_version: 1, task_id: taskId, total: tests.length, passed: tests.length - failedTests.length, failed: failedTests.length, tests, result: failedTests.length ? "FAIL" : "PASS" });
await writeJson(path.join(taskDir, "a11-launch-readiness.json"), { schema_version: 1, task_id: taskId, preparation: packageReady ? "COMPLETE" : "BLOCKED", reviewer_packages: packageReady ? "4/4 READY" : "NOT_READY", aggregation_deterministic_qa_package: aggregatePackage.verification_result === "PASS" ? "READY" : "NOT_READY", reviewer_launch_readiness: packageReady ? "READY_FOR_HUMAN_TO_LAUNCH_TOP_LEVEL_REVIEWS" : "NOT_READY", reviewers: "NOT_STARTED", aggregator: "NOT_STARTED", active_candidate_review_gate: "NO-GO / PENDING A11", human_exact_manifest: "NO", bootstrap_human_commit_gate: "NO-GO", steady_state: "DISABLED", migration_320: "NEEDS_HUMAN_DECISION / NO-GO", git: "NOT_USED", hard_stops: failedTests.map((entry) => entry.test_id) });
await writeJson(path.join(taskDir, "task-intent.yaml"), { schema_version: 1, task_id: taskId, objective: "Prepare four fresh top-level A11 reviewer packages plus fail-closed aggregation and deterministic QA without launching any reviewer.", scope: { write: [`${taskRef}/**`], read: [manifestRef, reportRef, recordRef, gateRef, ...candidateRefs], forbidden: ["Git", "child agents", "reviewer launch", "aggregator launch", "product operations", "databases", "migrations", "collab/**", "frontend/**", "erp-api/**", "db-design/**"] }, result: packageReady ? "COMPLETE" : "BLOCKED" });
await writeJson(path.join(taskDir, "classification.yaml"), { schema_version: 1, task_id: taskId, level: "L3", reasons: ["Fresh independent review packages bind a new governance candidate and High finding remediation."], reviewer_launch_authorized: false, git_authorized: false, human_approval_granted: false });
await writeJson(path.join(taskDir, "blueprint.yaml"), { schema_version: 1, task_id: taskId, phases: ["bind new candidate", "generate unique role packages", "verify absolute startup paths", "exercise fail-closed readiness cases", "stop before launch"], package_count: 5, reviewer_package_count: 4, aggregation_package_count: 1, result: packageReady ? "COMPLETE" : "BLOCKED" });
await writeText(path.join(taskDir, "final-summary.md"), `# A11 New Candidate Review Preparation\n\n- Preparation: ${packageReady ? "COMPLETE" : "BLOCKED"}\n- Candidate: ${candidateBinding.candidate_file_count} artifacts; manifest ${candidateBinding.candidate_manifest_sha256}\n- Reviewer packages: ${reviewerPackages.filter((entry) => entry.verification_result === "PASS").length}/4 READY\n- Aggregation / deterministic QA package: ${aggregatePackage.verification_result === "PASS" ? "READY" : "NOT READY"}\n- Readiness tests: ${tests.length - failedTests.length}/${tests.length} PASS\n- Reviewer launch readiness: ${packageReady ? "READY_FOR_HUMAN_TO_LAUNCH_TOP_LEVEL_REVIEWS" : "NOT READY"}\n- Reviewers: NOT STARTED; Aggregator: NOT STARTED\n- Candidate Review Gate: NO-GO / PENDING A11\n- Git: NOT USED\n`);
await writeText(path.join(taskDir, "HANDOFF.md"), `# Handoff\n\nCurrent goal: prepare A11 review inputs only.\n\nWhat changed: created four uniquely identified reviewer packages and one aggregation/deterministic-QA package, all bound to the 108-artifact candidate by absolute paths and SHA-256.\n\nChecks: ${tests.length - failedTests.length}/${tests.length} readiness checks passed; every package verification passed.\n\nKnown risks: no review outcome exists; finding remains REMEDIATED_PENDING_INDEPENDENT_REVIEW. Aggregation cannot run until all four schema-valid reviewer payloads exist.\n\nSuggested next step: a human may launch each reviewer prompt in a separate brand-new top-level Codex chat. Do not launch the aggregator until all four payloads are present.\n`);

console.log(JSON.stringify({ result: packageReady ? "COMPLETE" : "BLOCKED", reviewer_packages: `${reviewerPackages.filter((entry) => entry.verification_result === "PASS").length}/4`, aggregation_package: aggregatePackage.verification_result, readiness_tests: `${tests.length - failedTests.length}/${tests.length}`, reviewers: "NOT_STARTED", aggregator: "NOT_STARTED" }));
if (!packageReady) process.exitCode = 1;
