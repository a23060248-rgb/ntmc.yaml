import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const taskDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(taskDir, "../../..");
const tempDir = path.join(taskDir, "root-temp");
await mkdir(tempDir, { recursive: true });
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex").toUpperCase();
const canonicalSha256 = (value) => sha256(Buffer.from(JSON.stringify(value)));
const env = { ...process.env, TEMP: tempDir, TMP: tempDir };

function runNode(args, expectedExit = 0) {
  const child = spawnSync(process.execPath, args, { cwd: root, env, encoding: "utf8", windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  return { exit_code: child.status, expected_exit: expectedExit, pass: child.status === expectedExit, stdout: child.stdout ?? "", stderr: child.stderr ?? "" };
}
function parseLine(run, prefix) {
  const line = `${run.stdout}\n${run.stderr}`.split(/\r?\n/).find((item) => item.startsWith(`${prefix} `));
  if (!line) throw new Error(`Missing ${prefix}.`);
  return JSON.parse(line.slice(prefix.length + 1));
}
async function writeJson(name, value) {
  await writeFile(path.join(taskDir, name), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

const fixtureRun = runNode([".codex/tests/run-governance-fixtures.mjs"]);
const fixtureRaw = parseLine(fixtureRun, "FIXTURE_REPORT");
const fixture = {
  schema_version: 1, task_id: "GOV-PHASE1-L3-REVIEW-A6", production_entrypoint: ".codex/tests/run-governance-fixtures.mjs",
  exit_code: fixtureRun.exit_code, suite_id: fixtureRaw.suite_id, suite_version: fixtureRaw.suite_version,
  case_manifest_sha256: fixtureRaw.case_manifest_sha256, total: fixtureRaw.cases.length,
  passed: fixtureRaw.cases.filter((item) => item.pass).length, failed: fixtureRaw.cases.filter((item) => !item.pass).length,
  exact_invariant_and_entrypoint_verified: fixtureRaw.cases.every((item) => item.asserted_invariant && item.production_entrypoint && /^[A-F0-9]{64}$/.test(item.artifact_hash ?? "")),
  cases: fixtureRaw.cases.map(({ case_id, pass, asserted_invariant, production_entrypoint, artifact_hash }) => ({ case_id, pass, asserted_invariant, production_entrypoint, artifact_hash }))
};
await writeJson("fixture-rerun.json", fixture);

const concurrencyRun = runNode([".codex/tests/run-governance-fixtures-concurrency.mjs"]);
const concurrencyRaw = parseLine(concurrencyRun, "CONCURRENCY_ISOLATION");
const concurrency = {
  schema_version: 1, task_id: "GOV-PHASE1-L3-REVIEW-A6", production_entrypoint: ".codex/tests/run-governance-fixtures-concurrency.mjs",
  exit_code: concurrencyRun.exit_code, passed: concurrencyRaw.passed, reports_valid: concurrencyRaw.reports_valid,
  unique_run_roots: concurrencyRaw.unique_run_roots, caller_ids_ignored: concurrencyRaw.caller_ids_ignored,
  unique_case_roots: concurrencyRaw.unique_case_roots, case_roots_owned: concurrencyRaw.case_roots_owned,
  adversarial_reports_rejected: concurrencyRaw.adversarial_reports_rejected,
  suite_id: concurrencyRaw.suite_id, suite_version: concurrencyRaw.suite_version, case_manifest_sha256: concurrencyRaw.case_manifest_sha256
};
await writeJson("concurrency-regression.json", concurrency);
await writeJson("forged-report-rejection.json", {
  schema_version: 1, task_id: "GOV-PHASE1-L3-REVIEW-A6", production_entrypoint: ".codex/tests/run-governance-fixtures-concurrency.mjs",
  all_rejected: concurrencyRaw.adversarial_reports_rejected,
  adversarial_results: concurrencyRaw.adversarial_results
});

const productionRun = runNode([".codex/tests/run-bootstrap-production-integration.mjs"]);
const productionRaw = parseLine(productionRun, "BOOTSTRAP_PRODUCTION_INTEGRATION");
const production = {
  schema_version: 1, task_id: "GOV-PHASE1-L3-REVIEW-A6", production_entrypoint: ".codex/tests/run-bootstrap-production-integration.mjs",
  exit_code: productionRun.exit_code, total: productionRaw.total, passed: productionRaw.passed, failed: productionRaw.failed,
  layers: productionRaw.layers, results: productionRaw.results
};
await writeJson("production-integration-rerun.json", production);

const mutationRun = runNode([".codex/tests/run-bootstrap-mutation-tests.mjs"]);
const mutationRaw = parseLine(mutationRun, "BOOTSTRAP_MUTATION_TESTS");
const mutation = {
  schema_version: 1, task_id: "GOV-PHASE1-L3-REVIEW-A6", production_entrypoint: mutationRaw.production_entrypoint,
  exit_code: mutationRun.exit_code, total: mutationRaw.total, killed: mutationRaw.killed, survived: mutationRaw.survived,
  results: mutationRaw.results
};
await writeJson("mutation-test-rerun.json", mutation);

const manifestRef = ".codex/governance/governance-commit-manifest.yaml";
const manifestBytes = await readFile(path.join(root, ...manifestRef.split("/")));
const manifest = JSON.parse(manifestBytes.toString("utf8"));
const manifestFiles = [];
for (const item of manifest.artifacts) {
  const bytes = await readFile(path.join(root, ...item.path.split("/")));
  manifestFiles.push({ path: item.path, byte_size: bytes.length, manifest_sha256: item.sha256, actual_sha256: sha256(bytes), hash_match: item.sha256 === sha256(bytes) });
}
manifestFiles.sort((a, b) => a.path.localeCompare(b.path));
const fileSet = manifestFiles.map(({ path: filePath, actual_sha256 }) => ({ path: filePath, sha256: actual_sha256 }));
const candidateVerification = {
  schema_version: 1, task_id: "GOV-PHASE1-L3-REVIEW-A6", manifest_ref: manifestRef,
  manifest_sha256: sha256(manifestBytes), manifest_file_count: manifestFiles.length,
  expected_file_count: 81, all_hashes_match: manifestFiles.every((item) => item.hash_match),
  included_file_set_sha256: canonicalSha256(fileSet), a6_artifact_in_manifest: manifestFiles.some((item) => item.path.startsWith(".codex/tasks/GOV-PHASE1-L3-REVIEW-A6/")),
  files: manifestFiles
};
await writeJson("candidate-manifest-verification.json", candidateVerification);

const scannerOutputRef = ".codex/tasks/GOV-PHASE1-L3-REVIEW-A6/root-temp/scanner-rerun.json";
const scannerRun = runNode([".codex/scripts/generate-bootstrap-scan-report.mjs", "2026-07-19T01:00:00+08:00", scannerOutputRef]);
const scannerRerunBytes = await readFile(path.join(root, ...scannerOutputRef.split("/")));
const scannerRerun = JSON.parse(scannerRerunBytes.toString("utf8"));
const originalScannerRef = ".codex/tasks/GOV-PHASE1-REMEDIATION-6/bootstrap-scanner-report.json";
const originalScannerBytes = await readFile(path.join(root, ...originalScannerRef.split("/")));
const originalScanner = JSON.parse(originalScannerBytes.toString("utf8"));
const recordRef = ".codex/tasks/GOV-PHASE1-REMEDIATION-6/bootstrap-candidate-record.json";
const recordBytes = await readFile(path.join(root, ...recordRef.split("/")));
const record = JSON.parse(recordBytes.toString("utf8"));
const bootstrapVerification = {
  schema_version: 1, task_id: "GOV-PHASE1-L3-REVIEW-A6", record_ref: recordRef,
  record_type: record.record_type, assurance: record.assurance, record_payload_sha256: record.record_payload_sha256,
  manifest_binding_match: record.manifest_sha256 === candidateVerification.manifest_sha256,
  file_set_binding_match: record.included_file_set_sha256 === candidateVerification.included_file_set_sha256,
  file_count_binding_match: record.file_count === candidateVerification.manifest_file_count,
  original_scanner_hash_binding_match: record.scanner_report_sha256 === sha256(originalScannerBytes),
  original_scanner_manifest_binding_match: originalScanner.manifest_sha256 === candidateVerification.manifest_sha256,
  original_scanner_file_set_binding_match: originalScanner.scanned_file_set_sha256 === candidateVerification.included_file_set_sha256,
  rerun_scanner_exit_code: scannerRun.exit_code, rerun_scanner_result: scannerRerun.result, rerun_scanner_findings: scannerRerun.findings.length,
  rerun_scanner_manifest_binding_match: scannerRerun.manifest_sha256 === candidateVerification.manifest_sha256,
  rerun_scanner_file_set_binding_match: scannerRerun.scanned_file_set_sha256 === candidateVerification.included_file_set_sha256,
  prohibited_trust_claims_absent: record.assurance === "INTERNAL_CONSISTENCY_ONLY" && record.producer === undefined && record.staged_file_set_sha256 === undefined
};
await writeJson("bootstrap-candidate-verification.json", bootstrapVerification);
await writeJson("scanner-v4-verification.json", {
  schema_version: 1, task_id: "GOV-PHASE1-L3-REVIEW-A6", formal_manifest_scanner_entrypoint: ".codex/scripts/generate-bootstrap-scan-report.mjs",
  exit_code: scannerRun.exit_code, scan_contract_id: scannerRerun.scan_contract_id, scan_contract_version: scannerRerun.scan_contract_version,
  assurance: scannerRerun.assurance, scanned_file_count: scannerRerun.scanned_file_count,
  manifest_sha256: scannerRerun.manifest_sha256, scanned_file_set_sha256: scannerRerun.scanned_file_set_sha256,
  result: scannerRerun.result, findings: scannerRerun.findings, claims: scannerRerun.claims,
  manifest_binding_match: bootstrapVerification.rerun_scanner_manifest_binding_match,
  file_set_binding_match: bootstrapVerification.rerun_scanner_file_set_binding_match
});

const domain = JSON.parse(await readFile(path.join(root, ".codex", "domain", "index.yaml"), "utf8"));
await writeJson("rule-class-verification.json", {
  schema_version: 1, task_id: "GOV-PHASE1-L3-REVIEW-A6",
  registry_type: domain.registry_type, is_complete_domain_knowledge_base: domain.is_complete_domain_knowledge_base,
  confirmed_rule_count: domain.confirmed_rule_count, applicable_rules_count: domain.applicable_rules.length,
  candidate_rules_count: domain.candidate_rules.length,
  production_rule_cases: productionRaw.results.filter((item) => /RULE|DOMAIN|META/i.test(item.case_id)),
  mutation_rule_cases: mutationRaw.results.filter((item) => /RULE|DOMAIN|META/i.test(item.mutation_id))
});

const phaseStatus = JSON.parse(await readFile(path.join(root, ".codex", "governance", "phase-status.json"), "utf8"));
await writeJson("lifecycle-informational-verification.json", {
  schema_version: 1, task_id: "GOV-PHASE1-L3-REVIEW-A6", authority: phaseStatus.authority, generated: phaseStatus.generated,
  may_be_stale: phaseStatus.may_be_stale, used_as_gate_input: phaseStatus.used_as_gate_input,
  used_as_scope_input: phaseStatus.used_as_scope_input, used_as_approval_input: phaseStatus.used_as_approval_input,
  exact_informational_contract_match: phaseStatus.authority === "informational" && phaseStatus.generated === true && phaseStatus.may_be_stale === true && phaseStatus.used_as_gate_input === false && phaseStatus.used_as_scope_input === false && phaseStatus.used_as_approval_input === false
});

const m320Run = runNode([".codex/scripts/validate-task.mjs", "--task-id", "GOV-M320-DRYRUN"], 2);
const baseline = JSON.parse(await readFile(path.join(taskDir, "review-baseline-before.json"), "utf8"));
const m320TaskNow = [];
for (const expected of baseline.migration_320_task) {
  const bytes = await readFile(path.join(root, ...expected.relative_path.split("/")));
  m320TaskNow.push({ relative_path: expected.relative_path, expected_sha256: expected.sha256, actual_sha256: sha256(bytes), match: expected.sha256 === sha256(bytes) });
}
const externalNow = [];
for (const expected of baseline.migration_320_external) {
  const bytes = await readFile(path.join(root, ...expected.relative_path.split("/")));
  externalNow.push({ artifact_id: expected.artifact_id, relative_path: expected.relative_path, expected_sha256: expected.sha256, actual_sha256: sha256(bytes), match: expected.sha256 === sha256(bytes) });
}
const m320Findings = JSON.parse(await readFile(path.join(root, ".codex", "tasks", "GOV-M320-DRYRUN", "review-findings.yaml"), "utf8"));
await writeJson("migration-320-integrity.json", {
  schema_version: 1, task_id: "GOV-PHASE1-L3-REVIEW-A6", validator_exit_code: m320Run.exit_code,
  structural_valid: m320Run.exit_code === 2 && !m320Run.stderr.includes("VALIDATION_ERROR"), calculated_gate: "NO-GO",
  result_line: `${m320Run.stdout}\n${m320Run.stderr}`.split(/\r?\n/).find((item) => item.startsWith("VALIDATE_TASK_RESULT ")),
  original_blockers: m320Findings.blockers, original_blocker_count: m320Findings.blockers.length,
  migration_task_file_count: m320TaskNow.length, migration_task_all_match: m320TaskNow.every((item) => item.match), migration_task_files: m320TaskNow,
  external_evidence_count: externalNow.length, external_evidence_all_match: externalNow.every((item) => item.match), external_evidence: externalNow
});

const overall = fixture.exit_code === 0 && fixture.failed === 0 && fixture.total === 68 && concurrencyRun.exit_code === 0 && concurrency.passed && concurrency.adversarial_reports_rejected && productionRun.exit_code === 0 && production.failed === 0 && production.total === 20 && mutationRun.exit_code === 0 && mutation.killed === 10 && mutation.survived === 0 && candidateVerification.manifest_file_count === 81 && candidateVerification.all_hashes_match && !candidateVerification.a6_artifact_in_manifest && Object.entries(bootstrapVerification).filter(([key]) => key.endsWith("_match") || key === "prohibited_trust_claims_absent").every(([, value]) => value === true) && scannerRun.exit_code === 0 && scannerRerun.result === "PASS" && scannerRerun.findings.length === 0 && m320Run.exit_code === 2 && m320TaskNow.every((item) => item.match) && externalNow.every((item) => item.match);
await writeJson("authoritative-rerun-summary.json", {
  schema_version: 1, task_id: "GOV-PHASE1-L3-REVIEW-A6", overall_pass: overall,
  fixtures: `${fixture.passed}/${fixture.total}`, production: `${production.passed}/${production.total}`,
  mutations: `${mutation.killed}/${mutation.total}`, concurrency_pass: concurrency.passed,
  forged_reports_rejected: concurrency.adversarial_reports_rejected, candidate_files: candidateVerification.manifest_file_count,
  scanner_findings: scannerRerun.findings.length, migration_320_exit: m320Run.exit_code,
  git_commands_run: false, product_tests_run: false, database_operations_run: false
});
console.log(`A6_AUTHORITATIVE_RERUN overall=${overall} fixtures=${fixture.passed}/${fixture.total} production=${production.passed}/${production.total} mutations=${mutation.killed}/${mutation.total} candidate=${candidateVerification.manifest_file_count} scanner_findings=${scannerRerun.findings.length} m320_exit=${m320Run.exit_code}`);
process.exit(overall ? 0 : 1);
