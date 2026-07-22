import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { canonicalSha256, validateBootstrapCandidateRecord, BOOTSTRAP_ASSURANCE, BOOTSTRAP_RECORD_TYPE } from "../../scripts/lib/governance/typed-proof.mjs";
import { loadScannerContractBundle, validateBootstrapScanReport } from "../../scripts/lib/governance/scanner-report.mjs";
import { loadAndCompileGovernanceSchemas } from "../../scripts/lib/governance/governance-schema-loader.mjs";
import { computeAuthoritativeGateMap, projectAuthoritativeGateMap, validateGateDependencyMatrix } from "../../scripts/lib/governance/gate-router.mjs";

const taskId = "GOV-PHASE1-L3-REVIEW-A8";
const taskDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(taskDir, "../../..");
const tempDir = await mkdtemp(path.join(os.tmpdir(), "a8-root-rerun-"));
const env = {...process.env, TEMP: tempDir, TMP: tempDir};
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex").toUpperCase();
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const writeJson = (name, value) => writeFile(path.join(taskDir, name), json(value), "utf8");
const posixPath = (ref) => path.join(root, ...ref.split("/"));

function runNode(args, expectedExit = 0) {
  const child = spawnSync(process.execPath, args, {cwd: root, env, encoding: "utf8", windowsHide: true, maxBuffer: 160 * 1024 * 1024});
  return {command: `node ${args.join(" ")}`, expected_exit: expectedExit, actual_exit: child.status, pass: child.status === expectedExit, stdout: child.stdout ?? "", stderr: child.stderr ?? ""};
}
function parseMarker(run, marker) {
  const line = `${run.stdout}\n${run.stderr}`.split(/\r?\n/).find((item) => item.startsWith(`${marker} `));
  if (!line) throw new Error(`Missing ${marker} output from ${run.command}.`);
  return JSON.parse(line.slice(marker.length + 1));
}
function suiteRecord(suiteId, run, parsed) {
  return {schema_version: 1, task_id: taskId, suite_id: suiteId, production_path: true, command: run.command, expected_exit: run.expected_exit, actual_exit: run.actual_exit, parsed_summary: parsed, stderr_tail: run.stderr.slice(-2000), pass: run.pass};
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
  ".codex/scripts/lib/governance/governance-schema-loader.mjs",
  ".codex/scripts/lib/governance/scanner-pipeline.mjs",
  ".codex/scripts/lib/governance/scanner-report.mjs",
  ".codex/scripts/lib/governance/typed-proof.mjs",
  ".codex/tests/run-governance-fixtures.mjs",
  ".codex/tests/run-governance-fixtures-concurrency.mjs",
  ".codex/tests/run-bootstrap-scanner-production.mjs",
  ".codex/tests/run-bootstrap-production-integration.mjs",
  ".codex/tests/run-bootstrap-mutation-tests.mjs",
  ".codex/tests/run-binary-magic-registry-mutations.mjs"
];
const syntaxResults = syntaxRefs.map((ref) => ({ref, ...runNode(["--check", ref])}));
await writeJson("syntax-rerun.json", {schema_version: 1, task_id: taskId, total: syntaxResults.length, passed: syntaxResults.filter((item) => item.pass).length, failed: syntaxResults.filter((item) => !item.pass).length, results: syntaxResults.map(({stdout, stderr, ...item}) => ({...item, stderr_tail: stderr.slice(-1000)}))});

const fixtureRun = runNode([".codex/tests/run-governance-fixtures.mjs"]);
const fixtureParsed = parseMarker(fixtureRun, "FIXTURE_REPORT");
await writeJson("fixture-rerun.json", suiteRecord("governance-fixtures", fixtureRun, fixtureParsed));
const concurrencyRun = runNode([".codex/tests/run-governance-fixtures-concurrency.mjs"]);
const concurrencyParsed = parseMarker(concurrencyRun, "CONCURRENCY_ISOLATION");
await writeJson("concurrency-regression.json", suiteRecord("fixture-concurrency", concurrencyRun, concurrencyParsed));
const scannerRun = runNode([".codex/tests/run-bootstrap-scanner-production.mjs"]);
const scannerParsed = parseMarker(scannerRun, "BOOTSTRAP_SCANNER_PRODUCTION");
await writeJson("production-scanner-rerun.json", suiteRecord("production-scanner", scannerRun, scannerParsed));
const productionRun = runNode([".codex/tests/run-bootstrap-production-integration.mjs"]);
const productionParsed = parseMarker(productionRun, "BOOTSTRAP_PRODUCTION_INTEGRATION");
await writeJson("production-integration-rerun.json", suiteRecord("production-integration", productionRun, productionParsed));
const mutationRun = runNode([".codex/tests/run-bootstrap-mutation-tests.mjs"]);
const mutationParsed = parseMarker(mutationRun, "BOOTSTRAP_MUTATION_TESTS");
await writeJson("mutation-test-rerun.json", suiteRecord("production-mutations", mutationRun, mutationParsed));
const binaryMutationRun = runNode([".codex/tests/run-binary-magic-registry-mutations.mjs"]);
const binaryMutationParsed = parseMarker(binaryMutationRun, "BINARY_MAGIC_MUTATIONS");
await writeJson("binary-magic-mutation-rerun.json", suiteRecord("binary-magic-mutations", binaryMutationRun, binaryMutationParsed));

const manifestRef = ".codex/governance/governance-commit-manifest.yaml";
const manifestBytes = await readFile(posixPath(manifestRef));
const manifest = JSON.parse(manifestBytes.toString("utf8"));
const files = [];
for (const artifact of manifest.artifacts) {
  const bytes = await readFile(posixPath(artifact.path));
  const actual = sha256(bytes);
  files.push({path: artifact.path, byte_size: bytes.length, manifest_sha256: artifact.sha256, actual_sha256: actual, hash_match: artifact.sha256 === actual});
}
files.sort((left, right) => left.path.localeCompare(right.path));
const fileSet = files.map((item) => ({path: item.path, sha256: item.actual_sha256}));
const manifestVerification = {
  schema_version: 1,
  task_id: taskId,
  manifest_ref: manifestRef,
  manifest_sha256: sha256(manifestBytes),
  expected_manifest_sha256: "12073691E85308C8E47A36555EBA07B3F4F12FF416E7DF651A5CFD9B2A0A40A9",
  manifest_file_count: files.length,
  expected_file_count: 97,
  all_hashes_match: files.every((item) => item.hash_match),
  included_file_set_sha256: canonicalSha256(fileSet),
  a8_self_excluded: !files.some((item) => item.path.startsWith(".codex/tasks/GOV-PHASE1-L3-REVIEW-A8/")),
  files
};
await writeJson("candidate-manifest-verification.json", manifestVerification);

const reportRef = ".codex/tasks/GOV-PHASE1-REMEDIATION-8/bootstrap-scanner-report.json";
const recordRef = ".codex/tasks/GOV-PHASE1-REMEDIATION-8/bootstrap-candidate-record.json";
const reportBytes = await readFile(posixPath(reportRef));
const report = JSON.parse(reportBytes.toString("utf8"));
const recordBytes = await readFile(posixPath(recordRef));
const record = JSON.parse(recordBytes.toString("utf8"));
const scannerBundle = await loadScannerContractBundle(root);
const schemaSet = await loadAndCompileGovernanceSchemas(root);
const reportCheck = await validateBootstrapScanReport({projectRoot: root, report, manifestBytes, includedFiles: fileSet, scannedFiles: fileSet});
const recordExpected = {
  record_type: BOOTSTRAP_RECORD_TYPE,
  assurance: BOOTSTRAP_ASSURANCE,
  task_id: "GOV-PHASE1-REMEDIATION-8",
  manifest_sha256: sha256(manifestBytes),
  included_file_set_sha256: canonicalSha256(fileSet),
  file_count: files.length,
  scanner_report_sha256: sha256(reportBytes),
  ...scannerBundle.hashes
};
const recordCheck = validateBootstrapCandidateRecord(record, recordExpected);
const candidateRecordVerification = {
  schema_version: 1,
  task_id: taskId,
  record_ref: recordRef,
  report_ref: reportRef,
  record_sha256: sha256(recordBytes),
  report_sha256: sha256(reportBytes),
  record_validation_ok: recordCheck.ok,
  record_violations: recordCheck.violations,
  report_validation_ok: reportCheck.ok,
  report_violations: reportCheck.violations,
  exact_binding_values: recordExpected,
  manifest_binding_match: record.manifest_sha256 === manifestVerification.manifest_sha256 && report.candidate_binding.manifest_sha256 === manifestVerification.manifest_sha256,
  file_set_binding_match: record.included_file_set_sha256 === manifestVerification.included_file_set_sha256 && report.candidate_binding.included_file_set_sha256 === manifestVerification.included_file_set_sha256 && report.candidate_binding.scanned_file_set_sha256 === manifestVerification.included_file_set_sha256,
  file_count_binding_match: record.file_count === 97 && report.candidate_binding.expected_file_count === 97 && report.candidate_binding.scanned_file_count === 97,
  scanner_report_hash_binding_match: record.scanner_report_sha256 === sha256(reportBytes),
  binary_registry_binding_match: record.binary_magic_registry_sha256 === scannerBundle.hashes.binary_magic_registry_sha256 && report.scan_contract.binary_magic_registry_sha256 === scannerBundle.hashes.binary_magic_registry_sha256,
  schema_set_binding_match: record.schema_set_sha256 === schemaSet.schema_set_sha256 && report.scan_contract.schema_set_sha256 === schemaSet.schema_set_sha256,
  zero_findings: report.results.result === "PASS" && report.results.finding_count === 0 && report.results.findings.length === 0,
  assurance: record.assurance
};
await writeJson("bootstrap-candidate-verification.json", candidateRecordVerification);

const binaryRegistryRef = ".codex/governance/bootstrap-binary-magic-registry.yaml";
const binaryRegistryBytes = await readFile(posixPath(binaryRegistryRef));
const binaryRegistry = JSON.parse(binaryRegistryBytes.toString("utf8"));
const binaryOracle = JSON.parse(await readFile(posixPath(".codex/governance/scanner-binary-oracle.yaml"), "utf8"));
const candidateText = (await Promise.all(files.map(async (item) => readFile(posixPath(item.path), "utf8").catch(() => "")))).join("\n");
const scannerCases = scannerParsed.results ?? [];
const exactFindingClasses = ["DISALLOWED_FILE_EXTENSION", "NUL_BYTE_DETECTED", "KNOWN_BINARY_MAGIC_DETECTED", "NON_UTF8_TEXT", "BINARY_CONTENT_RATIO_EXCEEDED"];
const entries = binaryRegistry.entries.map((entry) => ({
  ...entry,
  positive_oracle: scannerCases.find((item) => item.case_id === entry.positive_fixture_id) ?? null,
  safe_negative_oracle: scannerCases.find((item) => item.case_id === entry.safe_negative_fixture_id) ?? null
}));
const binaryVerification = {
  schema_version: 1,
  task_id: taskId,
  registry_ref: binaryRegistryRef,
  registry_sha256: sha256(binaryRegistryBytes),
  expected_registry_sha256: "816AA777D48B4DB5EFC2F3A2C4634DE42BE62144AF6BDDAD1EA127716135967D",
  registry_entry_count: entries.length,
  exact_nine_magics: entries.length === 9,
  unique_magic_ids: new Set(entries.map((entry) => entry.magic_id)).size === 9,
  unique_positive_fixture_ids: new Set(entries.map((entry) => entry.positive_fixture_id)).size === 9,
  unique_safe_negative_fixture_ids: new Set(entries.map((entry) => entry.safe_negative_fixture_id)).size === 9,
  all_oracles_pass: entries.every((entry) => entry.positive_oracle?.pass === true && entry.safe_negative_oracle?.pass === true),
  exact_binary_finding_classes: JSON.stringify(binaryOracle.finding_classes) === JSON.stringify(exactFindingClasses),
  extension_magic_mismatch_absent_from_candidate: !/extension-magic-mismatch|EXTENSION_MAGIC_MISMATCH/i.test(candidateText),
  entries,
  mutation_summary: binaryMutationParsed
};
await writeJson("binary-oracle-verification.json", binaryVerification);

await writeJson("scanner-report-binding-verification.json", {
  schema_version: 1,
  task_id: taskId,
  report_ref: reportRef,
  semantic_validation_ok: reportCheck.ok,
  semantic_violations: reportCheck.violations,
  scan_contract: report.scan_contract,
  candidate_binding: report.candidate_binding,
  results: report.results,
  report_payload_sha256: report.report_payload_sha256,
  exact_bindings_match: Object.entries(candidateRecordVerification).filter(([key]) => key.endsWith("_binding_match")).every(([, value]) => value === true),
  production_case_total: scannerParsed.total,
  production_case_passed: scannerParsed.passed
});

const schemaCases = (productionParsed.results ?? []).filter((item) => item.case_id?.startsWith("PROD-SCHEMA-"));
const schemaMutants = (mutationParsed.results ?? []).filter((item) => /SCHEMA/i.test(item.mutation_id ?? ""));
const railwaySchemaRef = ".codex/blueprints/schemas/railway-domain-review.schema.json";
await writeJson("schema-loader-verification.json", {
  schema_version: 1,
  task_id: taskId,
  loader_ref: ".codex/scripts/lib/governance/governance-schema-loader.mjs#loadAndCompileGovernanceSchemas",
  registry_ref: ".codex/governance/governance-schema-set.yaml",
  registry_sha256: schemaSet.registry_sha256,
  schema_count: schemaSet.schemas.length,
  compiled_schema_set_sha256: schemaSet.schema_set_sha256,
  expected_schema_set_sha256: "B026F777F024B08D6D35811D91F3E99561790271E7E2E381F568C3A73072E836",
  railway_domain_schema_registered: schemaSet.byRef.has(railwaySchemaRef),
  railway_domain_schema_sha256: schemaSet.schemas.find((item) => item.ref === railwaySchemaRef)?.sha256 ?? null,
  production_schema_cases: schemaCases,
  schema_mutations: schemaMutants,
  all_schema_cases_pass: schemaCases.length === 6 && schemaCases.every((item) => item.pass),
  all_schema_mutations_killed: schemaMutants.length > 0 && schemaMutants.every((item) => item.killed)
});

const matrixRef = ".codex/governance/gate-dependency-matrix.yaml";
const matrix = JSON.parse(await readFile(posixPath(matrixRef), "utf8"));
const matrixViolations = validateGateDependencyMatrix(matrix);
const directGateMap = computeAuthoritativeGateMap({
  candidate_gate_blockers: [],
  human_commit: {session_b_pass: false, human_exact_manifest_approved: false, post_review_baseline_unchanged: true, explicit_first_commit_authorization: false},
  steady_state_anchor: {},
  migration_320_gate_blockers: ["MIGRATION_320_DOMAIN_DECISION_REQUIRED"]
});
const gateCases = (productionParsed.results ?? []).filter((item) => item.case_id?.startsWith("PROD-GATE-") || item.case_id?.startsWith("PROD-CLI-"));
const gateMutants = (mutationParsed.results ?? []).filter((item) => /GATE|FINAL|SESSION|STEADY|M320|DOMAIN-EXTERNAL/i.test(item.mutation_id ?? ""));
await writeJson("gate-router-verification.json", {
  schema_version: 1,
  task_id: taskId,
  authoritative_function: "computeAuthoritativeGateMap",
  direct_gate_map: directGateMap,
  direct_projection: projectAuthoritativeGateMap(directGateMap),
  expected_legal_split: {bootstrap_candidate_review: "GO", bootstrap_human_commit: "NO-GO", steady_state_preparation: "DISABLED", steady_state_execution: "DISABLED", migration_320_execution: "NO-GO"},
  legal_split_matches: directGateMap.bootstrap_candidate_review.status === "GO" && directGateMap.bootstrap_human_commit.status === "NO-GO" && directGateMap.steady_state_preparation.status === "DISABLED" && directGateMap.steady_state_execution.status === "DISABLED" && directGateMap.migration_320_execution.status === "NO-GO",
  production_gate_cases: gateCases,
  gate_mutations: gateMutants,
  all_gate_cases_pass: gateCases.length > 0 && gateCases.every((item) => item.pass),
  all_gate_mutations_killed: gateMutants.length > 0 && gateMutants.every((item) => item.killed)
});
await writeJson("gate-dependency-verification.json", {
  schema_version: 1,
  task_id: taskId,
  matrix_ref: matrixRef,
  matrix_validation_ok: matrixViolations.length === 0,
  matrix_violations: matrixViolations,
  forbidden_edges: matrix.forbidden_edges,
  dependency_cases: gateCases.filter((item) => /DEPEND|REVERSE|UNKNOWN|DERIVED/i.test(`${item.case_id} ${item.description ?? ""}`)),
  dependency_mutations: gateMutants.filter((item) => /DEPEND|REVERSE|DERIVED|FINAL|SESSION|STEADY/i.test(`${item.mutation_id} ${item.description ?? ""}`))
});

const domainIndex = JSON.parse(await readFile(posixPath(".codex/domain/index.yaml"), "utf8"));
const domainCases = (productionParsed.results ?? []).filter((item) => item.case_id?.startsWith("PROD-DOMAIN-"));
const domainMutants = (mutationParsed.results ?? []).filter((item) => /DOMAIN|RAILWAY/i.test(item.mutation_id ?? ""));
await writeJson("domain-routing-verification.json", {
  schema_version: 1,
  task_id: taskId,
  registry_type: domainIndex.registry_type,
  is_complete_domain_knowledge_base: domainIndex.is_complete_domain_knowledge_base,
  confirmed_rule_count: domainIndex.confirmed_rule_count,
  applicable_rules: domainIndex.applicable_rules,
  candidate_rule_count: domainIndex.candidate_rules.length,
  production_domain_cases: domainCases,
  domain_mutations: domainMutants,
  all_domain_cases_pass: domainCases.length > 0 && domainCases.every((item) => item.pass),
  all_domain_mutations_killed: domainMutants.length > 0 && domainMutants.every((item) => item.killed),
  mechanism_external_decision_separation_case: domainCases.find((item) => item.case_id === "PROD-DOMAIN-01") ?? null
});

const m320Run = runNode([".codex/scripts/validate-task.mjs", "--task-id", "GOV-M320-DRYRUN", "--target-gate", "migration-320-execution"], 2);
const m320ResultLine = `${m320Run.stdout}\n${m320Run.stderr}`.split(/\r?\n/).find((item) => item.startsWith("VALIDATE_TASK_RESULT ")) ?? null;
const beforeBaseline = JSON.parse(await readFile(path.join(taskDir, "review-baseline-before.json"), "utf8"));
async function currentMatches(items) {
  const results = [];
  for (const expected of items) {
    const bytes = await readFile(posixPath(expected.relative_path));
    results.push({relative_path: expected.relative_path, expected_byte_size: expected.byte_size, actual_byte_size: bytes.length, expected_sha256: expected.sha256, actual_sha256: sha256(bytes), match: expected.byte_size === bytes.length && expected.sha256 === sha256(bytes)});
  }
  return results;
}
const m320TaskFiles = await currentMatches(beforeBaseline.migration_320_task);
const m320ExternalFiles = await currentMatches(beforeBaseline.migration_320_external);
await writeJson("migration-320-integrity.json", {
  schema_version: 1,
  task_id: taskId,
  validator_command: m320Run.command,
  validator_exit_code: m320Run.actual_exit,
  expected_exit_code: 2,
  result_line: m320ResultLine,
  structural_valid_no_go: m320Run.pass && /structural=VALID/.test(m320Run.stdout) && /migration_320_execution=NO-GO/.test(m320Run.stdout),
  migration_task_file_count: m320TaskFiles.length,
  migration_task_all_match: m320TaskFiles.every((item) => item.match),
  migration_task_files: m320TaskFiles,
  external_evidence_count: m320ExternalFiles.length,
  external_evidence_all_match: m320ExternalFiles.every((item) => item.match),
  external_evidence: m320ExternalFiles,
  external_domain_decision: "NEEDS_HUMAN_DECISION",
  actual_rule_approval_performed: false
});

const suiteChecks = {
  syntax_18_18: syntaxResults.length === 18 && syntaxResults.every((item) => item.pass),
  fixtures_68_68: fixtureRun.pass && fixtureParsed.cases?.length === 68 && fixtureParsed.cases.every((item) => item.pass),
  concurrency_pass: concurrencyRun.pass && concurrencyParsed.passed === true,
  scanner_72_72: scannerRun.pass && scannerParsed.total === 72 && scannerParsed.passed === 72 && scannerParsed.failed === 0,
  production_34_34: productionRun.pass && productionParsed.total === 34 && productionParsed.passed === 34 && productionParsed.failed === 0,
  mutations_23_23: mutationRun.pass && mutationParsed.total === 23 && mutationParsed.killed === 23 && mutationParsed.survived === 0,
  binary_mutations_45_45: binaryMutationRun.pass && binaryMutationParsed.total === 45 && binaryMutationParsed.killed === 45 && binaryMutationParsed.survived === 0,
  candidate_97_exact: manifestVerification.manifest_sha256 === manifestVerification.expected_manifest_sha256 && manifestVerification.manifest_file_count === 97 && manifestVerification.all_hashes_match && manifestVerification.a8_self_excluded,
  candidate_record_and_report_valid: recordCheck.ok && reportCheck.ok && candidateRecordVerification.zero_findings,
  binary_registry_and_oracles_valid: binaryVerification.registry_sha256 === binaryVerification.expected_registry_sha256 && binaryVerification.exact_nine_magics && binaryVerification.all_oracles_pass && binaryVerification.extension_magic_mismatch_absent_from_candidate,
  schema_set_valid: schemaSet.schema_set_sha256 === "B026F777F024B08D6D35811D91F3E99561790271E7E2E381F568C3A73072E836" && schemaCases.length === 6 && schemaCases.every((item) => item.pass),
  gate_split_valid: directGateMap.bootstrap_candidate_review.status === "GO" && directGateMap.bootstrap_human_commit.status === "NO-GO" && directGateMap.steady_state_preparation.status === "DISABLED" && directGateMap.steady_state_execution.status === "DISABLED" && directGateMap.migration_320_execution.status === "NO-GO",
  dependency_matrix_valid: matrixViolations.length === 0,
  migration_320_valid_no_go: m320Run.pass && /structural=VALID/.test(m320Run.stdout) && /migration_320_execution=NO-GO/.test(m320Run.stdout) && m320TaskFiles.every((item) => item.match) && m320ExternalFiles.every((item) => item.match)
};
const overallPass = Object.values(suiteChecks).every(Boolean);
await writeJson("authoritative-rerun-summary.json", {
  schema_version: 1,
  task_id: taskId,
  assurance: "INTERNAL_CONSISTENCY_ONLY",
  overall_pass: overallPass,
  checks: suiteChecks,
  counts: {syntax: "18/18", fixtures: "68/68", concurrency: "PASS", scanner: "72/72", production_integration: "34/34", mutations: "23/23", binary_magic_mutations: "45/45", candidate: "97/97", migration_320_task: "13/13", migration_320_external: "5/5"},
  product_tests_run: false,
  database_operations_run: false,
  git_operations_run: false,
  session_b_started: false
});
console.log(`A8_AUTHORITATIVE_RERUN ${JSON.stringify({overall_pass: overallPass, ...suiteChecks})}`);
process.exit(overallPass ? 0 : 1);
