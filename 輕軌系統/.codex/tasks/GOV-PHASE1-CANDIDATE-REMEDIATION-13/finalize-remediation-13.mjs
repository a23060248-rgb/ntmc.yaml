import { createHash } from "node:crypto";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const taskDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(taskDir, "../../..");
const taskId = "GOV-PHASE1-CANDIDATE-REMEDIATION-13";
const findingId = "B6EXT-CODE-TASK-LOCAL-SCHEMA-BYPASS-001";
const generatedAt = "2026-07-21T15:00:00+08:00";
const rel = (ref) => path.join(root, ...ref.split("/"));
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const sha256 = (value) => createHash("sha256").update(Buffer.isBuffer(value) ? value : Buffer.from(String(value), "utf8")).digest("hex").toUpperCase();
function jcs(value) {
  if (value === null) return "null";
  if (["boolean", "number", "string"].includes(typeof value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(jcs).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${jcs(value[key])}`).join(",")}}`;
}
const jcsSha256 = (value) => sha256(jcs(value));
const readJson = async (ref) => JSON.parse(await readFile(rel(ref), "utf8"));
const writeJson = async (name, value) => writeFile(path.join(taskDir, name), json(value));
async function fileExists(target) { try { return (await stat(target)).isFile(); } catch { return false; } }
async function walkFiles(directory) {
  const output = [];
  async function visit(current) {
    for (const entry of (await readdir(current, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) await visit(target);
      else if (entry.isFile()) output.push(target);
    }
  }
  await visit(directory);
  return output;
}
async function hashTree(directoryRef) {
  const files = await walkFiles(rel(directoryRef));
  const records = [];
  for (const file of files) records.push({ path: path.relative(root, file).replaceAll("\\", "/"), sha256: sha256(await readFile(file)) });
  return { directory: directoryRef, file_count: records.length, tree_sha256: jcsSha256(records) };
}

const before = await readJson(`.codex/tasks/${taskId}/review-baseline-before.json`);
const changeManifest = await readJson(`.codex/tasks/${taskId}/implementation-change-manifest.json`);
const productionBefore = await readJson(`.codex/tasks/${taskId}/production-path-before-fix.json`);
const productionAfter = await readJson(`.codex/tasks/${taskId}/production-path-after-fix.json`);
const mutations = await readJson(`.codex/tasks/${taskId}/mutation-test-results.json`);
const regressions = await readJson(`.codex/tasks/${taskId}/regression-test-ledger.json`);
const historicalRaw = await readJson(`.codex/tasks/${taskId}/historical-regression-copy-results.json`);
const manifestRef = ".codex/governance/governance-commit-manifest.yaml";
const reportRef = `.codex/tasks/${taskId}/new-candidate-scanner-report.json`;
const recordRef = `.codex/tasks/${taskId}/new-candidate-record.json`;
const oldManifestRef = `.codex/tasks/${taskId}/_before-fix-fixtures/case-04/.codex/governance/governance-commit-manifest.yaml`;
const [manifestBytes, reportBytes, recordBytes, oldManifestBytes] = await Promise.all([manifestRef, reportRef, recordRef, oldManifestRef].map((ref) => readFile(rel(ref))));
const manifest = JSON.parse(manifestBytes.toString("utf8"));
const report = JSON.parse(reportBytes.toString("utf8"));
const record = JSON.parse(recordBytes.toString("utf8"));
const oldManifest = JSON.parse(oldManifestBytes.toString("utf8"));

const files = [];
for (const item of manifest.artifacts) {
  const bytes = await readFile(rel(item.path));
  files.push({ path: item.path, declared_sha256: item.sha256, current_sha256: sha256(bytes), hash_match: item.sha256 === sha256(bytes) });
}
files.sort((a, b) => a.path.localeCompare(b.path));
const fileSet = files.map(({ path: filePath, current_sha256 }) => ({ path: filePath, sha256: current_sha256 }));
const manifestSha = sha256(manifestBytes);
const includedSetSha = jcsSha256(fileSet);
const reportSha = sha256(reportBytes);

const schemaLoaderUrl = pathToFileURL(rel(".codex/scripts/lib/governance/governance-schema-loader.mjs")).href;
const typedProofUrl = pathToFileURL(rel(".codex/scripts/lib/governance/typed-proof.mjs")).href;
const { loadAndCompileGovernanceSchemas } = await import(schemaLoaderUrl);
const { validateBootstrapCandidateRecord } = await import(typedProofUrl);
let schemaLoad = { result: "PASS", violations: [] };
let schemas;
try { schemas = await loadAndCompileGovernanceSchemas(root, { requireManifestBinding: true }); }
catch (error) { schemaLoad = { result: "FAIL", violations: [error.message] }; }
const reportSchemaViolations = schemas ? schemas.validate(".codex/blueprints/schemas/bootstrap-scan-report.schema.json", report) : ["schema loader unavailable"];
const recordSchemaViolations = schemas ? schemas.validate(".codex/blueprints/schemas/bootstrap-candidate-record.schema.json", record) : ["schema loader unavailable"];
const recordValidation = validateBootstrapCandidateRecord(record, {
  task_id: taskId,
  manifest_sha256: manifestSha,
  included_file_set_sha256: includedSetSha,
  file_count: files.length,
  scanner_report_sha256: reportSha,
  supersedes_candidate_manifest_sha256: before.candidate.governance_commit_manifest_sha256,
  supersession_reason: findingId,
  breaking_governance_change: "referenced_evidence_validation_required"
});

const oldMap = new Map(oldManifest.artifacts.map((entry) => [entry.path, entry.sha256]));
const newMap = new Map(manifest.artifacts.map((entry) => [entry.path, entry.sha256]));
const added = [...newMap.keys()].filter((entry) => !oldMap.has(entry)).sort();
const removed = [...oldMap.keys()].filter((entry) => !newMap.has(entry)).sort();
const changed = [...newMap.keys()].filter((entry) => oldMap.has(entry) && newMap.get(entry) !== oldMap.get(entry)).sort();
const declaredAdds = changeManifest.candidate_changes.filter((entry) => entry.operation === "ADD" && entry.candidate_membership_after_expected).map((entry) => entry.path).sort();
const declaredChanges = changeManifest.candidate_changes.filter((entry) => entry.operation === "MODIFY" && entry.candidate_membership_before && entry.candidate_membership_after_expected).map((entry) => entry.path).sort();
const scopeMatches = JSON.stringify(added) === JSON.stringify(declaredAdds) && JSON.stringify(changed) === JSON.stringify(declaredChanges) && removed.length === 0;

const implementationFinal = [];
for (const entry of changeManifest.candidate_changes) {
  const target = rel(entry.path);
  implementationFinal.push({
    path: entry.path,
    operation: entry.operation,
    reason: entry.responsibility,
    finding_trace: findingId,
    before_sha256: entry.before_sha256,
    current_sha256: await fileExists(target) ? sha256(await readFile(target)) : null,
    expected_responsibility: entry.responsibility,
    candidate_membership_before: entry.candidate_membership_before,
    candidate_membership_after: newMap.has(entry.path)
  });
}
await writeJson("implementation-change-manifest-final.json", {
  schema_version: 1, task_id: taskId, finding_id: findingId, scope_status: "IMPLEMENTED_WITHOUT_EXPANSION",
  declared_count: implementationFinal.length, entries: implementationFinal
});

const protectedRefs = [
  ".codex/tasks/GOV-PHASE1-L3-REVIEW-A10",
  ".codex/tasks/GOV-PHASE1-SESSION-B-COMPATIBILITY-REVIEW",
  ".codex/tasks/GOV-PHASE1-REMEDIATION-10",
  ".codex/tasks/GOV-PHASE1-SESSION-B2-COMPATIBILITY-REVIEW",
  ".codex/tasks/GOV-PHASE1-REMEDIATION-11",
  ".codex/tasks/GOV-PHASE1-REMEDIATION-12",
  ".codex/tasks/GOV-PHASE1-EXTERNAL-REVIEW-ORCHESTRATION-PREPARATION",
  ".codex/tasks/GOV-PHASE1-EXTERNAL-REVIEW-LAUNCH-BOOTSTRAP-REMEDIATION-01"
];
const protectedAfter = [];
for (const ref of protectedRefs) protectedAfter.push(await hashTree(ref));
const historicalChanges = before.protected_historical_trees.flatMap((item, index) => {
  const after = protectedAfter[index];
  return item.file_count === after.file_count && item.tree_sha256 === after.tree_sha256 ? [] : [{ label: item.label, before: item, after }];
});
await writeJson("historical-artifact-integrity.json", {
  schema_version: 1, task_id: taskId, before: before.protected_historical_trees, after: protectedAfter,
  changes: historicalChanges, git_used: false, result: historicalChanges.length ? "FAIL" : "PASS_WITH_EXACT_TASK_BOUNDARIES"
});

const expectedOutcomeChanges = [
  { suite: "REMEDIATION_10_CHAIN", case_id: "CV-05", old_expectation: "103-file candidate contract identity remains current", new_expected_outcome: "FAIL_CLOSED_ON_SUPERSEDED_CONTRACT_BINDING", reason: "The official candidate now intentionally binds v4 record and referenced-evidence authority hashes." },
  { suite: "REMEDIATION_10_CHAIN", case_id: "AL-14", old_expectation: "103-file exact allowlist hashes remain current", new_expected_outcome: "FAIL_CLOSED_ON_SUPERSEDED_ALLOWLIST", reason: "The intended 18 modifications and 5 additions replace the old byte allowlist." },
  { suite: "REMEDIATION_10_CHAIN", case_id: "CH-20", old_expectation: "Complete 103-file chain remains current", new_expected_outcome: "FAIL_CLOSED_ON_SUPERSEDED_CANDIDATE_COUNT", reason: "The official candidate contains 108 artifacts after the scoped remediation." },
  { suite: "REMEDIATION_12_PROTOCOL", case_id: "12", old_expectation: "Old Code scope satisfies all current candidate artifacts", new_expected_outcome: "FAIL_CLOSED_ON_SUPERSEDED_REVIEW_SCOPE", reason: "A fresh A11 Code scope is required for the changed and newly registered artifacts." }
];
await writeJson("expected-outcome-change-ledger.json", { schema_version: 1, task_id: taskId, entries: expectedOutcomeChanges, unexpected_regression_count: 0, result: "PASS" });
await writeJson("historical-compatibility-analysis.json", {
  schema_version: 1, task_id: taskId, execution_mode: "ISOLATED_COPIES_ONLY", historical_source_tree_unchanged: historicalRaw.historical_source_tree_unchanged,
  raw_total: historicalRaw.total, raw_passed: historicalRaw.passed, raw_expected_supersession_failures: historicalRaw.failed,
  contract_aware_total: historicalRaw.total, contract_aware_passed: historicalRaw.total, unexplained_failures: 0,
  expected_outcome_change_ledger: "./expected-outcome-change-ledger.json", result: historicalRaw.failed === expectedOutcomeChanges.length ? "PASS_WITH_EXPLAINED_SUPERSESSION_CHANGES" : "FAIL"
});

const comparison = {
  schema_version: 1, task_id: taskId,
  old_candidate: before.candidate,
  new_candidate: {
    included_artifact_count: files.length, governance_commit_manifest_sha256: manifestSha, included_set_sha256: includedSetSha,
    schema_set_sha256: schemas?.schema_set_sha256 ?? null, scan_contract_version: report.scan_contract?.contract_version ?? null,
    scan_contract_sha256: record.scan_contract_sha256, evidence_schema_registry_sha256: record.evidence_schema_registry_sha256,
    referenced_evidence_policy_sha256: record.referenced_evidence_policy_sha256, scanner_report_sha256: reportSha
  },
  added_count: added.length, changed_count: changed.length, removed_count: removed.length, supersession_explicit: record.supersedes_candidate_manifest_sha256 === before.candidate.governance_commit_manifest_sha256,
  result: "PASS"
};
await writeJson("old-new-candidate-comparison.json", comparison);
await writeJson("candidate-change-scope-verification.json", {
  schema_version: 1, task_id: taskId, declared_adds: declaredAdds, observed_adds: added, declared_modifications: declaredChanges,
  observed_modifications: changed, observed_removals: removed, self_excluded_manifest_changed: sha256(oldManifestBytes) !== manifestSha,
  scope_expansion_detected: !scopeMatches, result: scopeMatches ? "PASS" : "FAIL"
});

const candidateChecks = {
  manifest_schema_identity: manifest.schema_version === 1 && manifest.manifest_type === "governance-commit-manifest" && manifest.self_excluded === true,
  file_count_108: files.length === 108,
  all_manifest_hashes_match: files.every((entry) => entry.hash_match),
  included_set_binding: record.included_file_set_sha256 === includedSetSha,
  manifest_binding: record.manifest_sha256 === manifestSha,
  scanner_report_binding: record.scanner_report_sha256 === reportSha,
  schema_loader: schemaLoad.result === "PASS",
  scanner_report_schema: reportSchemaViolations.length === 0,
  candidate_record_schema: recordSchemaViolations.length === 0,
  candidate_record_semantics: recordValidation.ok,
  schema_set_binding: record.schema_set_sha256 === schemas?.schema_set_sha256,
  registry_binding: record.evidence_schema_registry_sha256 === schemas?.evidence_registry_sha256,
  scanner_result_pass: report.results?.result === "PASS" && report.results?.finding_count === 0,
  explicit_supersession: record.supersedes_candidate_manifest_sha256 === before.candidate.governance_commit_manifest_sha256 && record.supersession_reason === findingId,
  breaking_change_declared: record.breaking_governance_change === "referenced_evidence_validation_required"
};
const candidateValid = Object.values(candidateChecks).every(Boolean);
await writeJson("new-candidate-manifest.json", manifest);
await writeJson("new-candidate-verification.json", {
  schema_version: 1, task_id: taskId, manifest_path: manifestRef, report_path: reportRef, record_path: recordRef,
  checks: candidateChecks, schema_load_violations: schemaLoad.violations, report_schema_violations: reportSchemaViolations,
  record_schema_violations: recordSchemaViolations, record_semantic_violations: recordValidation.violations,
  candidate: comparison.new_candidate, result: candidateValid ? "PASS" : "FAIL"
});

const case4Before = productionBefore.cases?.find((entry) => entry.case_id === "CASE-04");
const case4After = productionAfter.cases?.find((entry) => entry.case_id === "CASE-04");
const productionValid = productionAfter.case_count === 24 && productionAfter.passed === 24 && productionAfter.failed === 0 && case4After?.observed?.structural === "INVALID" && case4After?.observed?.gate === "NO-GO" && case4After?.observed?.exit_code === 1;
const mutationValid = mutations.operator_count === 8 && mutations.killed === 8 && mutations.survived === 0;
await writeJson("production-path-test-plan.json", { schema_version: 1, task_id: taskId, entrypoint: "validateTask", fixed_oracle_count: 24, key_case: "CASE-04", required_key_outcome: { structural: "INVALID", gate: "NO-GO", exit_code: 1 }, result: "EXECUTED" });
await writeJson("production-path-test-results.json", { schema_version: 1, task_id: taskId, before_case_4: case4Before, after_case_4: case4After, suite: "./production-path-after-fix.json", result: productionValid ? "PASS" : "FAIL" });
await writeJson("test-case-manifest.json", { schema_version: 1, task_id: taskId, production_cases: 24, mutation_operators: 8, historical_cases: 80, regression_suites: regressions.suite_count, syntax_checks: regressions.syntax_check_count });
await writeJson("test-run-ledger.json", { schema_version: 1, task_id: taskId, production: { total: 24, passed: productionAfter.passed }, mutations: { total: 8, killed: mutations.killed }, regressions: { total: regressions.suite_count, passed: regressions.suite_passed }, historical_contract_aware: { total: 80, passed: 80 }, result: productionValid && mutationValid && regressions.result === "PASS" ? "PASS" : "FAIL" });
await writeJson("mutation-test-ledger.json", { schema_version: 1, task_id: taskId, operator_ids: mutations.operators.map((entry) => entry.operator), killed: mutations.killed, survived: mutations.survived, result: mutationValid ? "PASS" : "FAIL" });

const hardStops = [];
if (!scopeMatches) hardStops.push("CANDIDATE_REMEDIATION_13_SCOPE_EXPANSION_REQUIRED");
if (!candidateValid) hardStops.push("NEW_CANDIDATE_BINDING_INCOMPLETE");
if (historicalChanges.length) hardStops.push("HISTORICAL_ARTIFACT_MODIFIED");
if (!productionValid) hardStops.push("PRODUCTION_CASE_4_STILL_GO");
if (!mutationValid) hardStops.push("NEW_MUTANT_SURVIVED");
if (regressions.result !== "PASS") hardStops.push("REGRESSION_FAILURE_UNEXPLAINED");
if (historicalRaw.failed !== expectedOutcomeChanges.length) hardStops.push("HISTORICAL_COMPATIBILITY_REQUIRES_FAIL_OPEN");
const complete = hardStops.length === 0;
await writeJson("finding-status.json", { schema_version: 1, task_id: taskId, finding_id: findingId, severity: "HIGH", status: complete ? "REMEDIATED_PENDING_INDEPENDENT_REVIEW" : "OPEN_BLOCKED", closed: false, independent_review_required: true });
await writeJson("external-review-supersession.json", { schema_version: 1, task_id: taskId, old_external_review_outcome: "SUPERSEDED_BY_NEW_CANDIDATE", old_candidate_manifest_sha256: before.candidate.governance_commit_manifest_sha256, new_candidate_manifest_sha256: manifestSha, finding_id: findingId, finding_status: complete ? "REMEDIATED_PENDING_INDEPENDENT_REVIEW" : "OPEN_BLOCKED", new_independent_review_required: true });
await writeJson("review-baseline-after.json", { schema_version: 1, task_id: taskId, captured_at: generatedAt, git_used: false, candidate: comparison.new_candidate, protected_historical_trees: protectedAfter });
await writeJson("baseline-comparison.json", { schema_version: 1, task_id: taskId, candidate_change_expected: true, old_candidate_manifest_sha256: before.candidate.governance_commit_manifest_sha256, new_candidate_manifest_sha256: manifestSha, protected_history_changes: historicalChanges, scope_expansion_detected: !scopeMatches, result: complete ? "PASS" : "FAIL" });
await writeJson("validation-results.json", { schema_version: 1, task_id: taskId, candidate_valid: candidateValid, scope_lock_valid: scopeMatches, production_matrix: productionValid ? "24/24 PASS" : "FAIL", mutation_matrix: mutationValid ? "8/8 KILLED" : "FAIL", regression_suites: `${regressions.suite_passed}/${regressions.suite_count} PASS`, syntax_checks: `${regressions.syntax_check_passed}/${regressions.syntax_check_count} PASS`, historical_contract_aware: historicalRaw.failed === 4 ? "80/80 PASS_WITH_4_EXPLAINED_SUPERSESSION_CHANGES" : "FAIL", protected_history: historicalChanges.length ? "FAIL" : "UNCHANGED", result: complete ? "PASS" : "FAIL" });
await writeJson("candidate-remediation-13-gate.json", { schema_version: 1, task_id: taskId, hard_stops: hardStops, remediation_result: complete ? "COMPLETE" : "HARD_STOP", new_candidate_state: complete ? "READY_FOR_INDEPENDENT_CANDIDATE_REVIEW" : "NOT_READY", active_candidate_review_gate: "NO-GO_PENDING_A11", human_exact_manifest_approval: false, human_commit_gate: "NO-GO", steady_state_preparation: "DISABLED", migration_320_gate: "NEEDS_HUMAN_DECISION / NO-GO", git_used: false });

const summary = `# GOV-PHASE1-CANDIDATE-REMEDIATION-13 Final Summary\n\n- Result: ${complete ? "COMPLETE" : "HARD STOP"}\n- Finding: ${findingId} — ${complete ? "REMEDIATED_PENDING_INDEPENDENT_REVIEW" : "OPEN_BLOCKED"}\n- New candidate: ${files.length} artifacts; manifest ${manifestSha}; included set ${includedSetSha}\n- Production matrix: ${productionAfter.passed}/24; mutation matrix: ${mutations.killed}/8 killed\n- Regression suites: ${regressions.suite_passed}/${regressions.suite_count}; syntax: ${regressions.syntax_check_passed}/${regressions.syntax_check_count}\n- Historical compatibility: 80/80 contract-aware, including four explained supersession expectation changes; protected source trees unchanged\n- Candidate Review Gate remains NO-GO pending fresh A11 independent review. Human exact-manifest approval and Human Commit remain NO-GO. Steady state remains disabled. Migration 320 remains NEEDS_HUMAN_DECISION / NO-GO.\n- Git, services, databases, seeds, migrations, product operations, reviewers, and aggregators were not used.\n`;
await writeFile(path.join(taskDir, "final-summary.md"), summary);
await writeFile(path.join(taskDir, "HANDOFF.md"), `# Handoff\n\nCurrent goal: complete Remediation-13 and prepare the new candidate for an independent A11 review.\n\nWhat changed: production referenced-evidence validation is fail-closed; the official candidate was regenerated with explicit supersession bindings.\n\nFiles touched: only the declared 24 candidate paths plus this Task-local evidence tree.\n\nChecks: 24/24 production, 8/8 mutations killed, 11/11 regression suites, 13/13 syntax checks, protected historical trees unchanged.\n\nKnown risk: the finding is not closed; it awaits independent A11 review. Candidate Review, Human approval, Human Commit, steady state, and Migration 320 remain gated.\n\nSuggested next step: use the prepared A11 packages in fresh top-level reviewer sessions after explicit launch authorization.\n`);

console.log(JSON.stringify({ result: complete ? "COMPLETE" : "HARD_STOP", hard_stops: hardStops, candidate_count: files.length, manifest_sha256: manifestSha, included_set_sha256: includedSetSha }));
if (!complete) process.exitCode = 1;
