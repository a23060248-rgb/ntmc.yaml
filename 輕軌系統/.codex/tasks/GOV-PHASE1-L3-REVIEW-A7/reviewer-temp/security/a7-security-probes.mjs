import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";

const projectRoot = process.cwd();
const reviewerTemp = path.join(
  projectRoot,
  ".codex",
  "tasks",
  "GOV-PHASE1-L3-REVIEW-A7",
  "reviewer-temp",
  "security"
);
await mkdir(reviewerTemp, { recursive: true });

const importFromRoot = async (ref) => import(pathToFileURL(path.join(projectRoot, ...ref.split("/"))).href);
const { canonicalSha256, sha256 } = await importFromRoot(".codex/scripts/lib/governance/typed-proof.mjs");
const { validateSchema } = await importFromRoot(".codex/scripts/lib/schema-validator.mjs");
const {
  loadScannerContractBundle,
  scannerReportPayload,
  validateBootstrapScanReport
} = await importFromRoot(".codex/scripts/lib/governance/scanner-report.mjs");
const { validateDeclaredScanContract } = await importFromRoot(".codex/scripts/lib/governance/scanner-pipeline.mjs");

const manifestRef = ".codex/governance/governance-commit-manifest.yaml";
const reportRef = ".codex/tasks/GOV-PHASE1-REMEDIATION-7/bootstrap-scanner-report.json";
const candidateRef = ".codex/tasks/GOV-PHASE1-REMEDIATION-7/bootstrap-candidate-record.json";
const manifestBytes = await readFile(path.join(projectRoot, ...manifestRef.split("/")));
const manifest = JSON.parse(manifestBytes.toString("utf8"));
const reportBytes = await readFile(path.join(projectRoot, ...reportRef.split("/")));
const report = JSON.parse(reportBytes.toString("utf8"));
const candidate = JSON.parse(await readFile(path.join(projectRoot, ...candidateRef.split("/")), "utf8"));
const reportSchema = JSON.parse(await readFile(path.join(projectRoot, ".codex/blueprints/schemas/bootstrap-scan-report.schema.json"), "utf8"));
const files = [];
const manifestChecks = [];
for (const artifact of manifest.artifacts) {
  const bytes = await readFile(path.join(projectRoot, ...artifact.path.split("/")));
  const actual = sha256(bytes);
  files.push({ path: artifact.path, sha256: actual });
  manifestChecks.push({ path: artifact.path, expected: artifact.sha256, actual, match: actual === artifact.sha256 });
}
files.sort((left, right) => left.path.localeCompare(right.path));

const bundle = await loadScannerContractBundle(projectRoot);
const currentSchemaIssues = validateSchema(reportSchema, report, reportRef);
const currentSemantic = await validateBootstrapScanReport({
  projectRoot,
  report,
  manifestBytes,
  includedFiles: files,
  scannedFiles: files
});

function finalizePayload(document) {
  document.report_payload_sha256 = canonicalSha256(scannerReportPayload(document));
  return document;
}

const reportAttacks = [
  ["wrong-version", (value) => { value.scan_contract.contract_version = 999; }, "contract"],
  ["wrong-contract-hash", (value) => { value.scan_contract.contract_sha256 = "A".repeat(64); }, "contract_sha256"],
  ["wrong-registry-hash", (value) => { value.scan_contract.finding_registry_sha256 = "A".repeat(64); }, "finding_registry_sha256"],
  ["wrong-canonicalization-hash", (value) => { value.scan_contract.canonicalization_config_sha256 = "A".repeat(64); }, "canonicalization_config_sha256"],
  ["wrong-binary-oracle-hash", (value) => { value.scan_contract.binary_oracle_config_sha256 = "A".repeat(64); }, "binary_oracle_config_sha256"],
  ["wrong-manifest-hash", (value) => { value.candidate_binding.manifest_sha256 = "A".repeat(64); }, "manifest binding"],
  ["wrong-included-set", (value) => { value.candidate_binding.included_file_set_sha256 = "A".repeat(64); }, "included file-set"],
  ["wrong-scanned-set", (value) => { value.candidate_binding.scanned_file_set_sha256 = "A".repeat(64); }, "scanned file-set"],
  ["wrong-expected-count", (value) => { value.candidate_binding.expected_file_count += 1; }, "file counts"],
  ["wrong-scanned-count", (value) => { value.candidate_binding.scanned_file_count += 1; }, "file counts"],
  ["false-contract-executed", (value) => { value.results.declared_contract_executed = false; }, "declared_contract_executed"],
  ["unregistered-finding", (value) => {
    value.results.findings = [{ finding_class: "UNREGISTERED_CLASS", ref: "probe.md", transformations: ["raw-text"], location: null }];
    value.results.finding_count = 1;
    value.results.result = "FAIL";
    value.results.no_findings_within_declared_contract = false;
  }, "unregistered finding class"],
  ["fake-clean-claim", (value) => {
    value.results.findings = [{ finding_class: "PRIVATE_KEY", ref: "probe.md", transformations: ["raw-text"], location: null }];
    value.results.finding_count = 1;
    value.results.result = "FAIL";
    value.results.no_findings_within_declared_contract = true;
  }, "no-findings claim"],
  ["finding-count-mismatch", (value) => { value.results.finding_count = 1; }, "finding_count"],
  ["result-mismatch", (value) => { value.results.result = "FAIL"; }, "result disagrees"],
  ["unknown-result-claim", (value) => { value.results.globally_clean = true; }, "unknown property"],
  ["payload-mutation", (value) => { value.report_payload_sha256 = "A".repeat(64); }, "payload hash", false]
];

const reportAttackResults = [];
for (const [name, mutate, expectedFragment, recompute = true] of reportAttacks) {
  const attacked = structuredClone(report);
  mutate(attacked);
  if (recompute) finalizePayload(attacked);
  const schemaIssues = validateSchema(reportSchema, attacked, `attack:${name}`);
  const semantic = await validateBootstrapScanReport({
    projectRoot,
    report: attacked,
    manifestBytes,
    includedFiles: files,
    scannedFiles: files
  });
  const combined = [...schemaIssues, ...semantic.violations];
  reportAttackResults.push({
    name,
    structural_invalid: combined.length > 0,
    expected_fragment_observed: combined.some((item) => item.includes(expectedFragment)),
    schema_issue_count: schemaIssues.length,
    semantic_violation_count: semantic.violations.length,
    violations: combined
  });
}

async function runCandidateGeneratorCase(name, document) {
  const inputRef = `.codex/tasks/GOV-PHASE1-L3-REVIEW-A7/reviewer-temp/security/${name}-report.json`;
  const outputRef = `.codex/tasks/GOV-PHASE1-L3-REVIEW-A7/reviewer-temp/security/${name}-candidate.json`;
  const inputPath = path.join(projectRoot, ...inputRef.split("/"));
  const outputPath = path.join(projectRoot, ...outputRef.split("/"));
  await rm(inputPath, { force: true });
  await rm(outputPath, { force: true });
  await writeFile(inputPath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
  const child = spawnSync(process.execPath, [
    path.join(projectRoot, ".codex/scripts/generate-bootstrap-candidate.mjs"),
    "GOV-A7-SEC-PROBE",
    "2026-07-19T12:30:00Z",
    inputRef,
    outputRef
  ], { cwd: projectRoot, encoding: "utf8", windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
  const output = `${child.stdout ?? ""}\n${child.stderr ?? ""}`;
  await rm(inputPath, { force: true });
  await rm(outputPath, { force: true });
  return { name, exit_code: child.status, rejected: child.status !== 0, output_tail: output.slice(-700) };
}

const generatorCases = [];
generatorCases.push(await runCandidateGeneratorCase("control-clean", structuredClone(report)));
for (const [name, mutate, _expected, recompute = true] of reportAttacks) {
  const attacked = structuredClone(report);
  mutate(attacked);
  if (recompute) finalizePayload(attacked);
  generatorCases.push(await runCandidateGeneratorCase(name, attacked));
}
const consistentFindingReport = structuredClone(report);
consistentFindingReport.results.findings = [{ finding_class: "PRIVATE_KEY", ref: "probe.md", transformations: ["raw-text"], location: null }];
consistentFindingReport.results.finding_count = 1;
consistentFindingReport.results.result = "FAIL";
consistentFindingReport.results.no_findings_within_declared_contract = false;
finalizePayload(consistentFindingReport);
generatorCases.push(await runCandidateGeneratorCase("consistent-nonzero-finding", consistentFindingReport));

const contractDrifts = [];
const evaluateContractDrift = (name, overrides) => {
  const documents = {
    findingRegistry: structuredClone(bundle.findingRegistry),
    canonicalizationConfig: structuredClone(bundle.canonicalizationConfig),
    binaryOracle: structuredClone(bundle.binaryOracle),
    implementationMatrix: structuredClone(bundle.implementationMatrix),
    productionCaseManifest: structuredClone(bundle.productionCaseManifest),
    ...overrides
  };
  const violations = validateDeclaredScanContract(structuredClone(bundle.contract), documents);
  contractDrifts.push({ name, rejected: violations.length > 0, violations });
};
const registryMissing = structuredClone(bundle.findingRegistry);
registryMissing.finding_classes = registryMissing.finding_classes.slice(1);
evaluateContractDrift("registry-class-removed", { findingRegistry: registryMissing });
const entropyDrift = structuredClone(bundle.canonicalizationConfig);
entropyDrift.entropy.minimum_length += 1;
evaluateContractDrift("entropy-bound-changed", { canonicalizationConfig: entropyDrift });
const binaryMagicDrift = structuredClone(bundle.binaryOracle);
binaryMagicDrift.known_magic_signatures = binaryMagicDrift.known_magic_signatures.filter((item) => item.id !== "JPEG");
evaluateContractDrift("binary-oracle-jpeg-removed", { binaryOracle: binaryMagicDrift });
const matrixDrift = structuredClone(bundle.implementationMatrix);
matrixDrift.finding_classes[0][2] = "MISSING-POSITIVE";
evaluateContractDrift("matrix-positive-removed", { implementationMatrix: matrixDrift });
for (const signature of bundle.binaryOracle.known_magic_signatures) {
  const productionCases = structuredClone(bundle.productionCaseManifest);
  productionCases.cases = productionCases.cases.filter((item) => !item[0].startsWith(`SCAN-MAGIC-${signature.id}-`));
  evaluateContractDrift(`production-${signature.id}-pair-removed`, { productionCaseManifest: productionCases });
}

const reducedRoot = path.join(reviewerTemp, "reduced-jpeg-oracle");
await rm(reducedRoot, { recursive: true, force: true });
await mkdir(reducedRoot, { recursive: true });
for (const ref of [".codex/scripts", ".codex/governance", ".codex/tests"]) {
  const target = path.join(reducedRoot, ...ref.split("/"));
  await mkdir(path.dirname(target), { recursive: true });
  await cp(path.join(projectRoot, ...ref.split("/")), target, { recursive: true });
}
const reducedManifestPath = path.join(reducedRoot, ".codex/tests/scanner-production-case-manifest.json");
const reducedManifest = JSON.parse(await readFile(reducedManifestPath, "utf8"));
reducedManifest.cases = reducedManifest.cases.filter((item) => !item[0].startsWith("SCAN-MAGIC-JPEG-"));
await writeFile(reducedManifestPath, `${JSON.stringify(reducedManifest, null, 2)}\n`, "utf8");
const reducedFixture = spawnSync(process.execPath, [path.join(reducedRoot, ".codex/tests/run-governance-fixtures.mjs")], { cwd: reducedRoot, encoding: "utf8", windowsHide: true, maxBuffer: 32 * 1024 * 1024 });
const reducedProduction = spawnSync(process.execPath, [path.join(reducedRoot, ".codex/tests/run-bootstrap-scanner-production.mjs")], { cwd: reducedRoot, encoding: "utf8", windowsHide: true, maxBuffer: 32 * 1024 * 1024 });
const reducedOracle = {
  removed_cases: 2,
  remaining_cases: reducedManifest.cases.length,
  fixture_exit_code: reducedFixture.status,
  fixture_case_54_passed: `${reducedFixture.stdout ?? ""}`.includes("PASS CASE-54"),
  scanner_production_exit_code: reducedProduction.status,
  scanner_production_reported_70_of_70: `${reducedProduction.stdout ?? ""}`.includes('"total":70') && `${reducedProduction.stdout ?? ""}`.includes('"passed":70')
};
await rm(reducedRoot, { recursive: true, force: true });

const candidatePayload = { ...candidate };
delete candidatePayload.record_payload_sha256;
const reportPayload = { ...report };
delete reportPayload.report_payload_sha256;
const result = {
  current: {
    manifest_sha256: sha256(manifestBytes),
    manifest_file_count: manifest.artifacts.length,
    manifest_hash_mismatches: manifestChecks.filter((item) => !item.match).length,
    included_file_set_sha256: canonicalSha256(files),
    report_sha256: sha256(reportBytes),
    report_payload_sha256_recomputed: canonicalSha256(reportPayload),
    report_payload_match: report.report_payload_sha256 === canonicalSha256(reportPayload),
    candidate_payload_sha256_recomputed: canonicalSha256(candidatePayload),
    candidate_payload_match: candidate.record_payload_sha256 === canonicalSha256(candidatePayload),
    schema_issue_count: currentSchemaIssues.length,
    semantic_violation_count: currentSemantic.violations.length,
    bundle_violation_count: bundle.violations.length,
    report_result: report.results.result,
    report_finding_count: report.results.finding_count
  },
  report_attacks: reportAttackResults,
  candidate_generator_cases: generatorCases,
  contract_drifts: contractDrifts,
  reduced_magic_oracle: reducedOracle,
  all_report_attacks_structural_invalid: reportAttackResults.every((item) => item.structural_invalid && item.expected_fragment_observed),
  all_forged_generator_cases_rejected: generatorCases.filter((item) => item.name !== "control-clean").every((item) => item.rejected),
  clean_control_generator_accepted: generatorCases.find((item) => item.name === "control-clean")?.exit_code === 0
};
console.log(`A7_SECURITY_PROBES ${JSON.stringify(result)}`);
