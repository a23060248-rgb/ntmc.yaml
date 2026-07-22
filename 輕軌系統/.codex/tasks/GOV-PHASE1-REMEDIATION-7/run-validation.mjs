import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const taskDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(taskDir, "../../..");
const sha256 = (value) => createHash("sha256").update(value).digest("hex").toUpperCase();

function runNode(args, expectedExit = 0) {
  const child = spawnSync(process.execPath, args, {cwd: root, encoding: "utf8", windowsHide: true, maxBuffer: 64 * 1024 * 1024});
  const output = `${child.stdout ?? ""}\n${child.stderr ?? ""}`;
  return {exit_code: child.status, expected_exit: expectedExit, pass: child.status === expectedExit, output};
}

function parseLine(output, prefix) {
  const line = output.split(/\r?\n/).find((item) => item.startsWith(`${prefix} `));
  if (!line) throw new Error(`Missing ${prefix} output.`);
  return JSON.parse(line.slice(prefix.length + 1));
}

const syntaxRefs = [
  ".codex/scripts/build-phase-status.mjs",
  ".codex/scripts/generate-bootstrap-candidate.mjs",
  ".codex/scripts/generate-bootstrap-scan-report.mjs",
  ".codex/scripts/validate-task.mjs",
  ".codex/scripts/lib/schema-validator.mjs",
  ".codex/scripts/lib/governance-commit-manifest.mjs",
  ".codex/scripts/lib/governance/domain-review-routing.mjs",
  ".codex/scripts/lib/governance/gate-router.mjs",
  ".codex/scripts/lib/governance/lifecycle-projection.mjs",
  ".codex/scripts/lib/governance/scanner-pipeline.mjs",
  ".codex/scripts/lib/governance/scanner-report.mjs",
  ".codex/scripts/lib/governance/typed-proof.mjs",
  ".codex/tests/run-bootstrap-scanner-production.mjs",
  ".codex/tests/run-bootstrap-production-integration.mjs",
  ".codex/tests/run-bootstrap-mutation-tests.mjs",
  ".codex/tests/run-governance-fixtures.mjs",
  ".codex/tests/run-governance-fixtures-concurrency.mjs",
  ".codex/tasks/GOV-PHASE1-REMEDIATION-7/build-task-artifacts.mjs"
];
const syntaxResults = syntaxRefs.map((ref) => ({ref, ...runNode(["--check", ref])}));

const fixtureRun = runNode([".codex/tests/run-governance-fixtures.mjs"]);
const fixtureRaw = parseLine(fixtureRun.output, "FIXTURE_REPORT");
const scannerRun = runNode([".codex/tests/run-bootstrap-scanner-production.mjs"]);
const scannerRaw = parseLine(scannerRun.output, "BOOTSTRAP_SCANNER_PRODUCTION");
const productionRun = runNode([".codex/tests/run-bootstrap-production-integration.mjs"]);
const productionRaw = parseLine(productionRun.output, "BOOTSTRAP_PRODUCTION_INTEGRATION");
const mutationRun = runNode([".codex/tests/run-bootstrap-mutation-tests.mjs"]);
const mutationRaw = parseLine(mutationRun.output, "BOOTSTRAP_MUTATION_TESTS");
const concurrencyRun = runNode([".codex/tests/run-governance-fixtures-concurrency.mjs"]);
const concurrencyRaw = parseLine(concurrencyRun.output, "CONCURRENCY_ISOLATION");

const phaseStatusRun = runNode([".codex/scripts/validate-phase-status.mjs"]);
const taskRun = runNode([".codex/scripts/validate-task.mjs", "--task-id", "GOV-PHASE1-REMEDIATION-7", "--target-gate", "bootstrap-candidate-review"], 2);
const m320Run = runNode([".codex/scripts/validate-task.mjs", "--task-id", "GOV-M320-DRYRUN", "--target-gate", "migration-320-execution"], 2);

const manifestBytes = await readFile(path.join(root, ".codex/governance/governance-commit-manifest.yaml"));
const manifest = JSON.parse(manifestBytes.toString("utf8"));
const reportBytes = await readFile(path.join(taskDir, "bootstrap-scanner-report.json"));
const report = JSON.parse(reportBytes.toString("utf8"));
const candidateBytes = await readFile(path.join(taskDir, "bootstrap-candidate-record.json"));
const candidate = JSON.parse(candidateBytes.toString("utf8"));
const manifestChecks = [];
for (const item of manifest.artifacts) {
  const actual = sha256(await readFile(path.join(root, ...item.path.split("/"))));
  manifestChecks.push({path: item.path, expected_sha256: item.sha256, actual_sha256: actual, match: actual === item.sha256});
}
const taskResultLine = taskRun.output.split(/\r?\n/).find((item) => item.startsWith("VALIDATE_TASK_RESULT ")) ?? "";
const m320ResultLine = m320Run.output.split(/\r?\n/).find((item) => item.startsWith("VALIDATE_TASK_RESULT ")) ?? "";
const payload = {
  schema_version: 1,
  task_id: "GOV-PHASE1-REMEDIATION-7",
  generated_at: "2026-07-19T08:30:00+08:00",
  git_commands_run: false,
  product_tests_run: false,
  database_operations_run: false,
  syntax: {total: syntaxResults.length, passed: syntaxResults.filter((item) => item.pass).length, failed: syntaxResults.filter((item) => !item.pass).length, results: syntaxResults.map(({ref, exit_code, pass}) => ({ref, exit_code, pass}))},
  fixtures: {suite_id: fixtureRaw.suite_id, suite_version: fixtureRaw.suite_version, case_manifest_sha256: fixtureRaw.case_manifest_sha256, total: fixtureRaw.cases.length, passed: fixtureRaw.cases.filter((item) => item.pass).length, failed: fixtureRaw.cases.filter((item) => !item.pass).length, exit_code: fixtureRun.exit_code},
  scanner_production: {suite_id: scannerRaw.suite_id, suite_version: scannerRaw.suite_version, total: scannerRaw.total, passed: scannerRaw.passed, failed: scannerRaw.failed, production_entrypoint: scannerRaw.production_entrypoint, exit_code: scannerRun.exit_code},
  production_integration: {total: productionRaw.total, passed: productionRaw.passed, failed: productionRaw.failed, layers: productionRaw.layers, exit_code: productionRun.exit_code},
  mutation: {total: mutationRaw.total, killed: mutationRaw.killed, survived: mutationRaw.survived, production_entrypoints: mutationRaw.production_entrypoints, exit_code: mutationRun.exit_code},
  concurrency: {passed: concurrencyRaw.passed, reports_valid: concurrencyRaw.reports_valid, unique_run_roots: concurrencyRaw.unique_run_roots, caller_ids_ignored: concurrencyRaw.caller_ids_ignored, unique_case_roots: concurrencyRaw.unique_case_roots, case_roots_owned: concurrencyRaw.case_roots_owned, adversarial_reports_rejected: concurrencyRaw.adversarial_reports_rejected, exit_code: concurrencyRun.exit_code},
  candidate: {
    artifact_count: manifest.artifacts.length,
    manifest_sha256: sha256(manifestBytes),
    all_manifest_hashes_match: manifestChecks.every((item) => item.match),
    scanner_report_sha256: sha256(reportBytes),
    scanner_result: report.results.result,
    scanner_finding_count: report.results.finding_count,
    scanner_contract_version: report.scan_contract.contract_version,
    candidate_record_type: candidate.record_type,
    candidate_assurance: candidate.assurance,
    candidate_manifest_binding_match: candidate.manifest_sha256 === sha256(manifestBytes),
    candidate_scanner_binding_match: candidate.scanner_report_sha256 === sha256(reportBytes),
    candidate_file_count_match: candidate.file_count === manifest.artifacts.length,
    scanner_bundle_binding_match: candidate.scan_contract_sha256 === report.scan_contract.contract_sha256 && candidate.finding_registry_sha256 === report.scan_contract.finding_registry_sha256 && candidate.canonicalization_config_sha256 === report.scan_contract.canonicalization_config_sha256 && candidate.binary_oracle_config_sha256 === report.scan_contract.binary_oracle_config_sha256
  },
  lifecycle: {validator_exit_code: phaseStatusRun.exit_code, pass: phaseStatusRun.pass},
  current_r7: {validator_exit_code: taskRun.exit_code, expected_exit_code: 2, structural_error_count: taskRun.output.split(/\r?\n/).filter((item) => item.startsWith("VALIDATION_ERROR ")).length, result_line: taskResultLine},
  migration_320: {validator_exit_code: m320Run.exit_code, expected_exit_code: 2, structural_error_count: m320Run.output.split(/\r?\n/).filter((item) => item.startsWith("VALIDATION_ERROR ")).length, result_line: m320ResultLine},
  overall_pass: false
};
payload.overall_pass = syntaxResults.every((item) => item.pass) && fixtureRun.pass && scannerRun.pass && productionRun.pass && mutationRun.pass && concurrencyRun.pass && concurrencyRaw.passed && phaseStatusRun.pass && taskRun.pass && m320Run.pass && payload.candidate.all_manifest_hashes_match && payload.candidate.scanner_result === "PASS" && payload.candidate.scanner_finding_count === 0 && payload.candidate.candidate_manifest_binding_match && payload.candidate.candidate_scanner_binding_match && payload.candidate.candidate_file_count_match && payload.candidate.scanner_bundle_binding_match && payload.current_r7.structural_error_count === 0 && payload.migration_320.structural_error_count === 0;
await writeFile(path.join(taskDir, "validation-results.json"), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(`REMEDIATION7_VALIDATION overall_pass=${payload.overall_pass} syntax=${payload.syntax.passed}/${payload.syntax.total} fixtures=${payload.fixtures.passed}/${payload.fixtures.total} scanner=${payload.scanner_production.passed}/${payload.scanner_production.total} production=${payload.production_integration.passed}/${payload.production_integration.total} mutations=${payload.mutation.killed}/${payload.mutation.total} concurrency=${payload.concurrency.passed} candidate_files=${payload.candidate.artifact_count} r7_exit=${payload.current_r7.validator_exit_code} m320_exit=${payload.migration_320.validator_exit_code}`);
process.exit(payload.overall_pass ? 0 : 1);
