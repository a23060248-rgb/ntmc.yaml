import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { collectGovernanceCommitRefs } from "../../scripts/lib/governance-commit-manifest.mjs";
import { canonicalSha256, sha256, validateTypedProof } from "../../scripts/lib/governance/typed-proof.mjs";
import { scanBinaryContent, scanText, classifyOperationalContent, validateDeclaredScanContract, declaredFindingClasses } from "../../scripts/lib/governance/scanner-pipeline.mjs";
import { validateProposedDomainRegistry } from "../../scripts/lib/governance/proposed-domain-rules.mjs";
import { projectLifecycleState } from "../../scripts/lib/governance/lifecycle-projection.mjs";

const execute = promisify(execFile);
const taskDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(taskDir, "../../..");
const writeJson = (name, value) => writeFile(path.join(taskDir, name), `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "w" });
const parsePrefix = (output, prefix) => {
  const line = output.split(/\r?\n/).findLast((item) => item.startsWith(prefix));
  if (!line) throw new Error(`Missing child output prefix ${prefix}`);
  return JSON.parse(line.slice(prefix.length));
};
const run = (script) => execute(process.execPath, [script], { cwd: root, windowsHide: true, maxBuffer: 8 * 1024 * 1024 });

const manifestRef = ".codex/governance/governance-commit-manifest.yaml";
const manifestBytes = await readFile(path.join(root, manifestRef));
const manifest = JSON.parse(manifestBytes.toString("utf8"));
const collectedRefs = await collectGovernanceCommitRefs(root);
const listedRefs = manifest.artifacts.map((item) => item.path);
const candidateFiles = [];
const candidateViolations = [];
if (listedRefs.length !== 97) candidateViolations.push(`Expected 97 included artifacts; found ${listedRefs.length}.`);
if (JSON.stringify(listedRefs) !== JSON.stringify(collectedRefs)) candidateViolations.push("Manifest path set/order differs from authoritative collector.");
for (const artifact of manifest.artifacts) {
  const bytes = await readFile(path.join(root, artifact.path));
  const actual = sha256(bytes);
  const findings = [...scanBinaryContent(bytes, artifact.path), ...scanText(bytes.toString("utf8"), artifact.path), ...classifyOperationalContent(bytes.toString("utf8"), artifact.path)];
  if (actual !== artifact.sha256) candidateViolations.push(`Hash mismatch ${artifact.path}.`);
  if (findings.length) candidateViolations.push(...findings.map((item) => `Scan finding ${item}.`));
  candidateFiles.push({ path: artifact.path, sha256: actual });
}
candidateFiles.sort((a, b) => a.path.localeCompare(b.path));
const manifestVerification = {
  schema_version: 1, task_id: "GOV-PHASE1-L3-REVIEW-A5", candidate_baseline: "phase-1.5", manifest_ref: manifestRef,
  manifest_sha256: sha256(manifestBytes), included_file_count: listedRefs.length, exact_path_set: JSON.stringify(listedRefs) === JSON.stringify(collectedRefs),
  all_hashes_match: !candidateViolations.some((item) => item.startsWith("Hash mismatch")), declared_contract_finding_count: candidateViolations.filter((item) => item.startsWith("Scan finding")).length,
  included_file_set_sha256: canonicalSha256(candidateFiles), violations: candidateViolations, result: candidateViolations.length ? "FAIL" : "PASS"
};
await writeJson("candidate-manifest-verification.json", manifestVerification);

const snapshotRef = ".codex/tasks/GOV-PHASE1-REMEDIATION-5/candidate-snapshot.json";
const snapshot = JSON.parse(await readFile(path.join(root, snapshotRef), "utf8"));
const snapshotValidation = validateTypedProof(snapshot, { proof_type: "WORKSPACE_CANDIDATE", task_id: "GOV-PHASE1-REMEDIATION-5", phase_id: "phase1_governance_only", manifest_sha256: manifestVerification.manifest_sha256, included_file_set_sha256: manifestVerification.included_file_set_sha256, file_count: 97 });
await writeJson("candidate-snapshot-verification.json", {
  schema_version: 1, task_id: "GOV-PHASE1-L3-REVIEW-A5", candidate_snapshot_ref: snapshotRef, candidate_snapshot_id: snapshot.execution_id,
  proof_type: snapshot.proof_type, producer: snapshot.producer, manifest_sha256: snapshot.manifest_sha256, included_file_set_sha256: snapshot.included_file_set_sha256,
  file_count: snapshot.file_count, payload_hash_recomputed: !snapshotValidation.violations.some((item) => item.includes("payload hash")), violations: snapshotValidation.violations, result: snapshotValidation.ok ? "PASS" : "FAIL"
});

const fixture = parsePrefix((await run(".codex/tests/run-governance-fixtures.mjs")).stdout, "FIXTURE_REPORT ");
const fixtureResult = {
  schema_version: 1, task_id: "GOV-PHASE1-L3-REVIEW-A5", command: "node .codex/tests/run-governance-fixtures.mjs", suite_id: fixture.suite_id, suite_version: fixture.suite_version,
  case_manifest_sha256: fixture.case_manifest_sha256, total: fixture.cases.length, passed: fixture.cases.filter((item) => item.pass).length, failed_ids: fixture.cases.filter((item) => !item.pass).map((item) => item.case_id),
  exact_case_ids: fixture.cases.map((item) => item.case_id), all_have_invariant: fixture.cases.every((item) => item.asserted_invariant), all_have_production_entrypoint: fixture.cases.every((item) => item.production_entrypoint), cleanup_result: fixture.cleanup_result,
  result: fixture.cases.every((item) => item.pass) ? "PASS" : "FAIL"
};
await writeJson("fixture-50-rerun.json", fixtureResult);
await writeJson("phase15-regression-rerun.json", {
  schema_version: 1, task_id: "GOV-PHASE1-L3-REVIEW-A5", suite_id: fixture.suite_id, suite_version: fixture.suite_version, case_contract_hash: fixture.case_manifest_sha256,
  production_entrypoints: [...new Set(fixture.cases.map((item) => item.production_entrypoint))].sort(), exact_contract_count: fixture.cases.length,
  note: "The trusted version-5 50-case suite is the Phase 1.5 production-module regression contract; mutation and end-to-end validators are recorded separately.", result: fixtureResult.result
});

const mutation = parsePrefix((await run(".codex/tests/run-phase15-mutation-tests.mjs")).stdout, "MUTATION_TESTS ");
await writeJson("mutation-test-rerun.json", { schema_version: 1, task_id: "GOV-PHASE1-L3-REVIEW-A5", command: "node .codex/tests/run-phase15-mutation-tests.mjs", ...mutation, result: mutation.failed === 0 && mutation.killed === mutation.total ? "PASS" : "FAIL" });
const production = parsePrefix((await run(".codex/tests/run-phase15-production-integration.mjs")).stdout, "PRODUCTION_PATH_INTEGRATION ");
await writeJson("production-integration-rerun.json", {
  schema_version: 1, task_id: "GOV-PHASE1-L3-REVIEW-A5", command: "node .codex/tests/run-phase15-production-integration.mjs", total: production.total, passed: production.passed, failed: production.failed, layers: production.layers,
  cases: production.results.map((item) => ({ case_id: item.case_id, invariant: item.invariant, pass: item.pass, exit_code: item.exit_code, calculated_gate: item.calculated_gate })), result: production.failed === 0 ? "PASS" : "FAIL"
});
const concurrency = parsePrefix((await run(".codex/tests/run-governance-fixtures-concurrency.mjs")).stdout, "CONCURRENCY_ISOLATION ");
await writeJson("concurrency-regression.json", {
  schema_version: 1, task_id: "GOV-PHASE1-L3-REVIEW-A5", command: "node .codex/tests/run-governance-fixtures-concurrency.mjs", reports_valid: concurrency.reports_valid,
  unique_run_roots: concurrency.unique_run_roots, caller_ids_ignored: concurrency.caller_ids_ignored, unique_case_roots: concurrency.unique_case_roots, case_roots_owned: concurrency.case_roots_owned,
  child_count: concurrency.results.length, cases_per_child: concurrency.results.map((item) => item.case_count), cleanup_results: concurrency.results.map((item) => item.cleanup_result), result: concurrency.passed ? "PASS" : "FAIL"
});
await writeJson("forged-report-rejection.json", { schema_version: 1, task_id: "GOV-PHASE1-L3-REVIEW-A5", adversarial_reports_rejected: concurrency.adversarial_reports_rejected, adversarial_results: concurrency.adversarial_results, result: concurrency.adversarial_reports_rejected ? "PASS" : "FAIL" });

const scanContract = JSON.parse(await readFile(path.join(root, ".codex/governance/scan-contract.yaml"), "utf8"));
const securityEvidence = JSON.parse(await readFile(path.join(root, ".codex/tasks/GOV-PHASE1-REMEDIATION-5/security-evidence.yaml"), "utf8"));
const scanViolations = validateDeclaredScanContract(scanContract);
if (securityEvidence.scan_contract.manifest_sha256 !== manifestVerification.manifest_sha256) scanViolations.push("Security evidence manifest hash mismatch.");
if (securityEvidence.scan_contract.scanned_file_count !== 97 || securityEvidence.scan_contract.scanned_file_set_sha256 !== manifestVerification.included_file_set_sha256) scanViolations.push("Security evidence file-set binding mismatch.");
if (Object.keys(securityEvidence.claims).sort().join("|") !== "declared_scan_contract_executed|no_findings_within_declared_contract") scanViolations.push("Security evidence claims exceed the two allowed claims.");
await writeJson("scanner-contract-verification.json", { schema_version: 1, task_id: "GOV-PHASE1-L3-REVIEW-A5", scan_contract_id: scanContract.scan_contract_id, scan_contract_version: scanContract.scan_contract_version, manifest_sha256: manifestVerification.manifest_sha256, scanned_file_count: 97, scanned_file_set_sha256: manifestVerification.included_file_set_sha256, declared_classes: [...scanContract.finding_classes].sort(), implemented_classes: declaredFindingClasses(), claims: securityEvidence.claims, violations: scanViolations, result: scanViolations.length ? "FAIL" : "PASS" });

const domain = JSON.parse(await readFile(path.join(root, ".codex/domain/index.yaml"), "utf8"));
const domainViolations = validateProposedDomainRegistry(domain);
await writeJson("proposed-domain-rule-verification.json", { schema_version: 1, task_id: "GOV-PHASE1-L3-REVIEW-A5", registry_type: domain.registry_type, phase1_confirmation_supported: domain.phase1_confirmation_supported, is_complete_domain_knowledge_base: domain.is_complete_domain_knowledge_base, confirmed_rule_count: domain.confirmed_rule_count, applicable_rules: domain.applicable_rules, candidate_rule_count: domain.candidate_rules.length, statuses: [...new Set(domain.rules.map((item) => item.status))].sort(), violations: domainViolations, result: domainViolations.length ? "FAIL" : "PASS" });

const eventLog = JSON.parse(await readFile(path.join(root, ".codex/governance/lifecycle-events.json"), "utf8"));
const projection = projectLifecycleState({ event_log: eventLog, generated_at: "2026-07-18T05:01:00+08:00" });
const a5Intent = JSON.parse(await readFile(path.join(taskDir, "task-intent.yaml"), "utf8"));
await writeJson("lifecycle-verification.json", { schema_version: 1, task_id: "GOV-PHASE1-L3-REVIEW-A5", projection_authority: projection.projection?.authority, used_as_gate_input: projection.projection?.used_as_gate_input, may_be_stale: projection.projection?.may_be_stale, projected_active_task: projection.projection?.active_task, current_review_task_status_source: ".codex/tasks/GOV-PHASE1-L3-REVIEW-A5/task-intent.yaml", current_review_task_status: a5Intent.status, phase_policy_is_scope_authority: true, violations: projection.violations, result: projection.violations.length === 0 && projection.projection?.authority === "informational" && projection.projection?.used_as_gate_input === false && projection.projection?.may_be_stale === true && a5Intent.status === "IN_PROGRESS" ? "PASS" : "FAIL" });

const before = JSON.parse(await readFile(path.join(taskDir, "review-baseline-before.json"), "utf8"));
async function compareCurrent(items) {
  const changes = [];
  for (const item of items) {
    const bytes = await readFile(path.join(root, item.relative_path));
    const actual = sha256(bytes);
    if (actual !== item.sha256 || bytes.length !== item.byte_size) changes.push({ relative_path: item.relative_path, expected_sha256: item.sha256, actual_sha256: actual, expected_size: item.byte_size, actual_size: bytes.length });
  }
  return changes;
}
const frozenChanges = await compareCurrent(before.frozen_history);
await writeJson("historical-artifact-integrity.json", { schema_version: 1, task_id: "GOV-PHASE1-L3-REVIEW-A5", expected_count: before.frozen_history.length, changed_count: frozenChanges.length, changes: frozenChanges, result: before.frozen_history.length === 167 && frozenChanges.length === 0 ? "PASS" : "FAIL" });
const m320TaskChanges = await compareCurrent(before.migration_320_task);
const m320ExternalChanges = await compareCurrent(before.migration_320_external);
const m320Findings = JSON.parse(await readFile(path.join(root, ".codex/tasks/GOV-M320-DRYRUN/review-findings.yaml"), "utf8"));
await writeJson("migration-320-integrity.json", { schema_version: 1, task_id: "GOV-PHASE1-L3-REVIEW-A5", task_artifact_count: before.migration_320_task.length, task_artifact_changed_count: m320TaskChanges.length, external_evidence_count: before.migration_320_external.length, external_evidence_changed_count: m320ExternalChanges.length, confirmed_rule_count: domain.confirmed_rule_count, structural_result: m320TaskChanges.length || m320ExternalChanges.length ? "INVALID" : "VALID", calculated_gate: m320Findings.calculated_gate, expected_exit_code: 2, execution_authorized: false, task_changes: m320TaskChanges, external_changes: m320ExternalChanges, result: m320TaskChanges.length === 0 && m320ExternalChanges.length === 0 && m320Findings.calculated_gate === "NO-GO" && domain.confirmed_rule_count === 0 ? "PASS" : "FAIL" });

console.log(`A5_VERIFICATIONS manifest=${manifestVerification.result} snapshot=${snapshotValidation.ok ? "PASS" : "FAIL"} fixture=${fixtureResult.result} mutation=${mutation.failed === 0 ? "PASS" : "FAIL"} production=${production.failed === 0 ? "PASS" : "FAIL"} concurrency=${concurrency.passed ? "PASS" : "FAIL"} scanner=${scanViolations.length ? "FAIL" : "PASS"} domain=${domainViolations.length ? "FAIL" : "PASS"} history=${frozenChanges.length ? "FAIL" : "PASS"} m320=${m320TaskChanges.length || m320ExternalChanges.length ? "FAIL" : "PASS"}`);
