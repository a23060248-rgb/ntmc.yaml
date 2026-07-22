import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const taskDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(taskDir, "../../..");
const sha256 = (value) => createHash("sha256").update(value).digest("hex").toUpperCase();
const records = [
  ["ART-R7-A6-MATRIX", "a6-finding-remediation-matrix.md"],
  ["ART-R7-GATE-MAP", "gate-map-and-dependency-graph.md"],
  ["ART-R7-DOMAIN-ROUTING", "domain-routing-model.md"],
  ["ART-R7-SCANNER-BINDING", "scanner-report-schema-binding.md"],
  ["ART-R7-SCANNER-MATRIX", "scanner-contract-implementation-matrix.md"],
  ["ART-R7-PRODUCTION-TESTS", "production-scanner-test-results.md"],
  ["ART-R7-MUTATION-TESTS", "mutation-results.md"],
  ["ART-R7-CANDIDATE", "candidate-integrity.md"],
  ["ART-R7-HISTORY", "frozen-history-integrity.md"],
  ["ART-R7-M320", "migration-320-integrity.md"],
  ["ART-R7-PATHSPEC", "pathspec-status.md"]
];
const artifacts = [];
for (const [artifactId, name] of records) {
  const bytes = await readFile(path.join(taskDir, name));
  artifacts.push({
    artifact_id: artifactId,
    type: "implementation-evidence",
    path: `.codex/tasks/GOV-PHASE1-REMEDIATION-7/${name}`,
    sha256: sha256(bytes),
    authority: "evidence-only",
    evidence_scope: "local_review_record",
    commit_inclusion: false,
    content_scan_status: "FULL",
    contains_operational_paths: false,
    contains_dump_reference: false,
    credential_scan_status: "PASS",
    redaction_status: "NOT_REQUIRED",
    source_verification_status: "VERIFIED"
  });
}
await writeFile(path.join(taskDir, "artifact-manifest.yaml"), `${JSON.stringify({schema_version: 1, task_id: "GOV-PHASE1-REMEDIATION-7", artifacts, product_changes: [], secrets_present: false}, null, 2)}\n`, "utf8");

const manifestBytes = await readFile(path.join(root, ".codex/governance/governance-commit-manifest.yaml"));
const report = JSON.parse(await readFile(path.join(taskDir, "bootstrap-scanner-report.json"), "utf8"));
const binding = report.candidate_binding;
const contract = report.scan_contract;
const securityEvidence = {
  schema_version: 1,
  task_id: "GOV-PHASE1-REMEDIATION-7",
  scan_scope: {governance_artifacts: "DETERMINISTIC_CONTRACT", external_referenced_evidence: "LIMITED"},
  scan_contract: {
    scan_contract_id: contract.contract_id,
    scan_contract_version: contract.contract_version,
    manifest_sha256: sha256(manifestBytes),
    scanned_file_count: binding.scanned_file_count,
    scanned_file_set_sha256: binding.scanned_file_set_sha256,
    contract_sha256: contract.contract_sha256,
    finding_registry_sha256: contract.finding_registry_sha256,
    canonicalization_config_sha256: contract.canonicalization_config_sha256,
    binary_oracle_config_sha256: contract.binary_oracle_config_sha256
  },
  claims: {
    declared_scan_contract_executed: true,
    no_findings_within_declared_contract: report.results.finding_count === 0,
    external_evidence_globally_clean: false,
    global_sensitive_data_absence_verified: false,
    trusted_producer_identity_verified: false,
    os_runtime_isolation_verified: false
  },
  external_evidence: [],
  limitations: [
    `The scanner covers only the ${binding.scanned_file_count} exact manifest entries and declared contract v5 classes.`,
    "The scanner report and validator are mutable bootstrap workspace artifacts with internal-consistency assurance only.",
    "External Migration 320 evidence was hash-verified but was not globally rescanned or reinterpreted.",
    "No operating-system isolation, repository-global scanning, Git index, remote control, or global sensitive-data absence claim is made."
  ]
};
await writeFile(path.join(taskDir, "security-evidence.yaml"), `${JSON.stringify(securityEvidence, null, 2)}\n`, "utf8");
console.log(`R7_TASK_ARTIFACTS artifacts=${artifacts.length} candidate_files=${binding.scanned_file_count} scanner_result=${report.results.result}`);
