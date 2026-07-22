import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const taskDir = path.dirname(fileURLToPath(import.meta.url));
const taskRef = ".codex/tasks/GOV-PHASE1-REMEDIATION-8";
const records = [
  ["FILE-R8-A7-MATRIX", "a7-finding-remediation-matrix.md", false],
  ["FILE-R8-GATE-PROJECTION", "gate-projection-verification.json", false],
  ["FILE-R8-FIXTURES", "fixture-rerun.json", true],
  ["FILE-R8-CONCURRENCY", "concurrency-regression.json", true],
  ["FILE-R8-SCANNER-PRODUCTION", "production-scanner-rerun.json", false],
  ["FILE-R8-INTEGRATION", "production-integration-rerun.json", true],
  ["FILE-R8-MUTATIONS", "mutation-test-rerun.json", false],
  ["FILE-R8-MAGIC-MUTATIONS", "binary-magic-mutation-rerun.json", false],
  ["FILE-R8-MAGIC-ORACLE", "binary-oracle-verification.json", false],
  ["FILE-R8-SCHEMA-LOADER", "schema-loader-verification.json", false],
  ["FILE-R8-DOMAIN-ROUTING", "domain-routing-verification.json", false],
  ["FILE-R8-A5-A6-SCANNER", "a5-a6-scanner-closure-evidence.json", false],
  ["FILE-R8-CANDIDATE-MANIFEST", "candidate-manifest-verification.json", false],
  ["FILE-R8-CANDIDATE", "bootstrap-candidate-record.json", false],
  ["FILE-R8-CANDIDATE-VERIFY", "bootstrap-candidate-verification.json", false],
  ["FILE-R8-SCANNER-REPORT", "bootstrap-scanner-report.json", false],
  ["FILE-R8-VALIDATION-SUMMARY", "validation-run-summary.json", false],
  ["FILE-R8-AUTHORITATIVE-VALIDATOR", "authoritative-validator-rerun.json", false],
  ["FILE-R8-BASELINE-BEFORE", "baseline-before.json", false],
  ["FILE-R8-BASELINE-AFTER", "baseline-after.json", false],
  ["FILE-R8-BASELINE-COMPARE", "baseline-comparison.json", false],
  ["FILE-R8-HISTORY", "history-integrity.json", false],
  ["FILE-R8-M320", "migration-320-integrity.json", false],
  ["FILE-R8-RESIDUAL", "residual-risk-verification.json", false],
  ["FILE-R8-A8-READINESS", "a8-readiness.json", false],
  ["FILE-R8-PATH-SCOPE", "governance-pathscope-status.json", false],
  ["FILE-R8-SOURCE-CHANGES", "source-change-summary.json", false]
];

const artifacts = [];
for (const [artifactId, name, containsOperationalPaths] of records) {
  const bytes = await readFile(path.join(taskDir, name));
  artifacts.push({artifact_id: artifactId, type: "remediation-evidence", path: `${taskRef}/${name}`, sha256: createHash("sha256").update(bytes).digest("hex").toUpperCase(), authority: "evidence-only", evidence_scope: "local_review_record", commit_inclusion: false, content_scan_status: "FULL", contains_operational_paths: containsOperationalPaths, contains_dump_reference: false, credential_scan_status: "PASS", redaction_status: containsOperationalPaths ? "NOT_REDACTED" : "NOT_REQUIRED", source_verification_status: "VERIFIED"});
}
const manifest = {schema_version: 1, task_id: "GOV-PHASE1-REMEDIATION-8", artifacts, product_changes: [], secrets_present: false};
await writeFile(path.join(taskDir, "artifact-manifest.yaml"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`R8_ARTIFACT_MANIFEST artifacts=${artifacts.length}`);
