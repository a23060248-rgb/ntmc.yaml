import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const taskDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(taskDir, "../../..");
const sha256 = (value) => createHash("sha256").update(value).digest("hex").toUpperCase();

function runNode(args, expectedExit = 0) {
  const child = spawnSync(process.execPath, args, { cwd: root, encoding: "utf8", windowsHide: true, maxBuffer: 32 * 1024 * 1024 });
  const output = `${child.stdout ?? ""}\n${child.stderr ?? ""}`;
  return { exit_code: child.status, expected_exit: expectedExit, pass: child.status === expectedExit, output };
}

function parseJsonLine(output, prefix) {
  const line = output.split(/\r?\n/).find((item) => item.startsWith(`${prefix} `));
  if (!line) throw new Error(`Missing ${prefix} output.`);
  return JSON.parse(line.slice(prefix.length + 1));
}

const syntaxFiles = [
  ".codex/scripts/create-task.mjs",
  ".codex/scripts/generate-bootstrap-candidate.mjs",
  ".codex/scripts/generate-bootstrap-scan-report.mjs",
  ".codex/scripts/validate-change-scope.mjs",
  ".codex/scripts/validate-task.mjs",
  ".codex/scripts/lib/governance/scope-lattice.mjs",
  ".codex/scripts/lib/governance/typed-proof.mjs",
  ".codex/scripts/lib/governance/scanner-pipeline.mjs",
  ".codex/scripts/lib/governance/rule-class.mjs",
  ".codex/tests/run-governance-fixtures.mjs",
  ".codex/tests/run-governance-fixtures-concurrency.mjs",
  ".codex/tests/run-bootstrap-production-integration.mjs",
  ".codex/tests/run-bootstrap-mutation-tests.mjs"
];
const syntax = syntaxFiles.map((ref) => ({ ref, ...runNode(["--check", ref]) }));

const fixtureRun = runNode([".codex/tests/run-governance-fixtures.mjs"]);
const fixtureReport = parseJsonLine(fixtureRun.output, "FIXTURE_REPORT");
const fixture = {
  exit_code: fixtureRun.exit_code,
  pass: fixtureRun.pass,
  suite_id: fixtureReport.suite_id,
  suite_version: fixtureReport.suite_version,
  case_manifest_sha256: fixtureReport.case_manifest_sha256,
  total: fixtureReport.cases.length,
  passed: fixtureReport.cases.filter((item) => item.pass).length,
  failed: fixtureReport.cases.filter((item) => !item.pass).length,
  cases: fixtureReport.cases.map(({ case_id, pass, asserted_invariant, production_entrypoint, artifact_hash }) => ({ case_id, pass, asserted_invariant, production_entrypoint, artifact_hash }))
};

const concurrencyRun = runNode([".codex/tests/run-governance-fixtures-concurrency.mjs"]);
const concurrencyRaw = parseJsonLine(concurrencyRun.output, "CONCURRENCY_ISOLATION");
const concurrency = {
  exit_code: concurrencyRun.exit_code,
  pass: concurrencyRun.pass && concurrencyRaw.passed,
  reports_valid: concurrencyRaw.reports_valid,
  unique_run_roots: concurrencyRaw.unique_run_roots,
  caller_ids_ignored: concurrencyRaw.caller_ids_ignored,
  unique_case_roots: concurrencyRaw.unique_case_roots,
  case_roots_owned: concurrencyRaw.case_roots_owned,
  adversarial_reports_rejected: concurrencyRaw.adversarial_reports_rejected,
  adversarial_results: concurrencyRaw.adversarial_results,
  suite_id: concurrencyRaw.suite_id,
  suite_version: concurrencyRaw.suite_version,
  case_manifest_sha256: concurrencyRaw.case_manifest_sha256
};

const productionRun = runNode([".codex/tests/run-bootstrap-production-integration.mjs"]);
const productionRaw = parseJsonLine(productionRun.output, "BOOTSTRAP_PRODUCTION_INTEGRATION");
const production = {
  exit_code: productionRun.exit_code,
  pass: productionRun.pass && productionRaw.failed === 0,
  total: productionRaw.total,
  passed: productionRaw.passed,
  failed: productionRaw.failed,
  layers: productionRaw.layers,
  results: productionRaw.results.map(({ case_id, invariant, pass, expected, exit_code, calculated_gate, gate_results, actor_role, actor_binding, proof_assurance, resolved_applicable_rules }) => ({ case_id, invariant, pass, expected, exit_code, calculated_gate, gate_results, actor_role, actor_binding, proof_assurance, resolved_applicable_rules }))
};

const mutationRun = runNode([".codex/tests/run-bootstrap-mutation-tests.mjs"]);
const mutationRaw = parseJsonLine(mutationRun.output, "BOOTSTRAP_MUTATION_TESTS");
const mutation = {
  exit_code: mutationRun.exit_code,
  pass: mutationRun.pass && mutationRaw.survived === 0,
  total: mutationRaw.total,
  killed: mutationRaw.killed,
  survived: mutationRaw.survived,
  production_entrypoint: mutationRaw.production_entrypoint,
  results: mutationRaw.results.map(({ mutation_id, expected_failed_case, targets, mutation_applied, integration_exit, expected_case_failed, killed }) => ({ mutation_id, expected_failed_case, targets, mutation_applied, integration_exit, expected_case_failed, killed }))
};

const manifestBytes = await readFile(path.join(root, ".codex", "governance", "governance-commit-manifest.yaml"));
const manifest = JSON.parse(manifestBytes.toString("utf8"));
const manifestFiles = [];
for (const artifact of manifest.artifacts) {
  const bytes = await readFile(path.join(root, ...artifact.path.split("/")));
  manifestFiles.push({ path: artifact.path, expected_sha256: artifact.sha256, actual_sha256: sha256(bytes), match: artifact.sha256 === sha256(bytes) });
}
const scannerBytes = await readFile(path.join(taskDir, "bootstrap-scanner-report.json"));
const scannerReport = JSON.parse(scannerBytes.toString("utf8"));
const candidateBytes = await readFile(path.join(taskDir, "bootstrap-candidate-record.json"));
const candidateRecord = JSON.parse(candidateBytes.toString("utf8"));
const candidate = {
  artifact_count: manifest.artifacts.length,
  manifest_sha256: sha256(manifestBytes),
  all_manifest_hashes_match: manifestFiles.every((item) => item.match),
  manifest_files: manifestFiles,
  scanner_report_sha256: sha256(scannerBytes),
  scanner_result: scannerReport.result,
  scanner_findings: scannerReport.findings.length,
  scan_contract_id: scannerReport.scan_contract_id,
  scan_contract_version: scannerReport.scan_contract_version,
  candidate_record_type: candidateRecord.record_type,
  candidate_assurance: candidateRecord.assurance,
  candidate_manifest_binding_match: candidateRecord.manifest_sha256 === sha256(manifestBytes),
  candidate_scanner_binding_match: candidateRecord.scanner_report_sha256 === sha256(scannerBytes),
  candidate_file_count_match: candidateRecord.file_count === manifest.artifacts.length
};

const m320Run = runNode([".codex/scripts/validate-task.mjs", "--task-id", "GOV-M320-DRYRUN"], 2);
const m320ResultLine = m320Run.output.split(/\r?\n/).find((item) => item.startsWith("VALIDATE_TASK_RESULT ")) ?? "";
const m320Manifest = JSON.parse(await readFile(path.join(root, ".codex", "tasks", "GOV-M320-DRYRUN", "artifact-manifest.yaml"), "utf8"));
const externalArtifacts = m320Manifest.artifacts.filter((item) => item.evidence_scope === "external_reference");
const m320Hashes = [];
for (const artifact of externalArtifacts) {
  const bytes = await readFile(path.join(root, ...artifact.path.split("/")));
  m320Hashes.push({ artifact_id: artifact.artifact_id, path: artifact.path, expected_sha256: artifact.sha256, actual_sha256: sha256(bytes), match: artifact.sha256 === sha256(bytes) });
}
const migration320 = {
  validator_exit_code: m320Run.exit_code,
  expected_exit_code: 2,
  validator_pass: m320Run.pass,
  result_line: m320ResultLine,
  structural_error_count: m320Run.output.split(/\r?\n/).filter((item) => item.startsWith("VALIDATION_ERROR ")).length,
  gate_reason_count: m320Run.output.split(/\r?\n/).filter((item) => item.startsWith("GATE_NO_GO ")).length,
  external_hash_count: m320Hashes.length,
  external_hashes_unchanged: m320Hashes.length === 5 && m320Hashes.every((item) => item.match),
  external_hashes: m320Hashes
};

const payload = {
  schema_version: 1,
  task_id: "GOV-PHASE1-REMEDIATION-6",
  generated_at: "2026-07-18T07:30:00+08:00",
  git_commands_run: false,
  product_tests_run: false,
  database_operations_run: false,
  syntax: { total: syntax.length, passed: syntax.filter((item) => item.pass).length, failed: syntax.filter((item) => !item.pass).length, results: syntax.map(({ ref, exit_code, pass }) => ({ ref, exit_code, pass })) },
  fixture,
  concurrency,
  production,
  mutation,
  candidate,
  migration_320: migration320,
  overall_pass: syntax.every((item) => item.pass) && fixture.pass && concurrency.pass && production.pass && mutation.pass && candidate.all_manifest_hashes_match && candidate.scanner_result === "PASS" && candidate.scanner_findings === 0 && candidate.candidate_manifest_binding_match && candidate.candidate_scanner_binding_match && candidate.candidate_file_count_match && migration320.validator_pass && migration320.external_hashes_unchanged
};
await writeFile(path.join(taskDir, "validation-results.json"), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(`REMEDIATION6_VALIDATION overall_pass=${payload.overall_pass} syntax=${payload.syntax.passed}/${payload.syntax.total} fixtures=${fixture.passed}/${fixture.total} production=${production.passed}/${production.total} mutations=${mutation.killed}/${mutation.total} candidate_files=${candidate.artifact_count} m320_exit=${migration320.validator_exit_code} m320_hashes=${migration320.external_hashes.filter((item) => item.match).length}/${migration320.external_hash_count}`);
process.exit(payload.overall_pass ? 0 : 1);
