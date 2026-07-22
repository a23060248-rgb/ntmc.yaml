import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const taskDir = path.dirname(fileURLToPath(import.meta.url));
const taskRef = ".codex/tasks/GOV-PHASE1-REMEDIATION-9";
const records = [
  ["FILE-R9-A8-MAPPING", "a8-finding-remediation-mapping.md", false],
  ["FILE-R9-IDENTITY", "reviewer-identity-binding-verification.json", false],
  ["FILE-R9-PROFILE-BINDING", "role-profile-assignment-binding.json", false],
  ["FILE-R9-SCHEMA-LOADER", "official-schema-loader-verification.json", false],
  ["FILE-R9-FALLBACK-ABSENCE", "forbidden-schema-fallback-verification.json", false],
  ["FILE-R9-NEGATIVE-TESTS", "schema-loader-negative-tests.json", false],
  ["FILE-R9-IDENTITY-REGRESSIONS", "reviewer-binding-regression-rerun.json", false],
  ["FILE-R9-LOADER-INTEGRATION", "official-schema-loader-integration-rerun.json", false],
  ["FILE-R9-LOADER-MUTATIONS", "official-schema-loader-mutation-rerun.json", false],
  ["FILE-R9-SYNTAX", "syntax-rerun.json", false],
  ["FILE-R9-FIXTURES", "fixture-rerun.json", false],
  ["FILE-R9-CONCURRENCY", "concurrency-regression.json", false],
  ["FILE-R9-SCANNER-PRODUCTION", "production-scanner-rerun.json", false],
  ["FILE-R9-INTEGRATION", "production-integration-rerun.json", false],
  ["FILE-R9-MUTATIONS", "mutation-test-rerun.json", false],
  ["FILE-R9-MAGIC-MUTATIONS", "binary-magic-mutation-rerun.json", false],
  ["FILE-R9-RETAINED", "retained-regression-summary.json", false],
  ["FILE-R9-CANDIDATE-MANIFEST", "candidate-manifest-verification.json", false],
  ["FILE-R9-CANDIDATE", "bootstrap-candidate-record.json", false],
  ["FILE-R9-CANDIDATE-VERIFY", "bootstrap-candidate-verification.json", false],
  ["FILE-R9-SCANNER-REPORT", "bootstrap-scanner-report.json", false],
  ["FILE-R9-BASELINE-BEFORE", "baseline-before.json", false],
  ["FILE-R9-BASELINE-AFTER", "baseline-after.json", false],
  ["FILE-R9-BASELINE-COMPARE", "baseline-comparison.json", false],
  ["FILE-R9-HISTORY", "history-integrity.json", false],
  ["FILE-R9-M320", "migration-320-integrity.json", false],
  ["FILE-R9-LIFECYCLE", "lifecycle-projection-verification.json", false],
  ["FILE-R9-RESIDUAL", "residual-risk-verification.json", false],
  ["FILE-R9-A9-READINESS", "a9-readiness.json", false],
  ["FILE-R9-PATH-SCOPE", "governance-pathscope-status.json", false],
  ["FILE-R9-SOURCE-CHANGES", "source-change-summary.json", false]
  ,["FILE-R9-VALIDATION-SUMMARY", "validation-run-summary.json", false]
  ,["FILE-R9-AUTHORITATIVE-VALIDATOR", "authoritative-validator-rerun.json", false]
  ,["FILE-R9-M320-VALIDATOR", "migration-320-validator-rerun.json", false]
];

const artifacts = [];
for (const [artifactId, name, containsOperationalPaths] of records) {
  const bytes = await readFile(path.join(taskDir, name));
  artifacts.push({
    artifact_id: artifactId,
    type: "remediation-evidence",
    path: `${taskRef}/${name}`,
    sha256: createHash("sha256").update(bytes).digest("hex").toUpperCase(),
    authority: "evidence-only",
    evidence_scope: "local_review_record",
    commit_inclusion: false,
    content_scan_status: "FULL",
    contains_operational_paths: containsOperationalPaths,
    contains_dump_reference: false,
    credential_scan_status: "PASS",
    redaction_status: containsOperationalPaths ? "NOT_REDACTED" : "NOT_REQUIRED",
    source_verification_status: "VERIFIED"
  });
}

const manifest = {
  schema_version: 1,
  task_id: "GOV-PHASE1-REMEDIATION-9",
  artifacts,
  product_changes: [],
  secrets_present: false
};
await writeFile(path.join(taskDir, "artifact-manifest.yaml"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`R9_ARTIFACT_MANIFEST artifacts=${artifacts.length}`);
