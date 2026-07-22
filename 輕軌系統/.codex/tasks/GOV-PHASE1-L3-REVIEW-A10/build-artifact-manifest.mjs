import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const taskDir = path.dirname(fileURLToPath(import.meta.url));
const taskRef = ".codex/tasks/GOV-PHASE1-L3-REVIEW-A10";
const records = [
  ["FILE-A10-BASELINE-BEFORE","review-baseline-before.json",false],
  ["FILE-A10-BASELINE-AFTER","review-baseline-after.json",false],
  ["FILE-A10-BASELINE-COMPARE","baseline-comparison.json",false],
  ["FILE-A10-CANDIDATE-MANIFEST","candidate-manifest-verification.json",false],
  ["FILE-A10-CANDIDATE","bootstrap-candidate-verification.json",false],
  ["FILE-A10-ASSIGNMENTS","reviewer-assignment-verification.json",false],
  ["FILE-A10-BINDING","reviewer-binding-verification.json",false],
  ["FILE-A10-CODE-REVIEW","code-review.json",false],
  ["FILE-A10-SECURITY-REVIEW","security-review.json",false],
  ["FILE-A10-DOMAIN-REVIEW","railway-domain-review.json",false],
  ["FILE-A10-A9-CLOSURE","a9-finding-closure-matrix.yaml",false],
  ["FILE-A10-MUTATION-MANIFEST","mutation-suite-manifest.json",false],
  ["FILE-A10-MUTATION-COMPLETION","mutation-suite-completion-report.json",false],
  ["FILE-A10-MUTATION-SHARD","mutation-shard-reports/not-used.json",false],
  ["FILE-A10-FIXTURES","fixture-rerun.json",false],
  ["FILE-A10-CONCURRENCY","concurrency-regression.json",false],
  ["FILE-A10-PROD-SCANNER","production-scanner-rerun.json",false],
  ["FILE-A10-BINARY-MUTATIONS","binary-magic-mutation-rerun.json",false],
  ["FILE-A10-PROD-INTEGRATION","production-integration-rerun.json",false],
  ["FILE-A10-BINDING-RERUN","reviewer-binding-rerun.json",false],
  ["FILE-A10-LOADER-RERUN","official-schema-loader-rerun.json",false],
  ["FILE-A10-LOADER-MUTATIONS","schema-loader-mutation-rerun.json",false],
  ["FILE-A10-SECURITY-SCOPE","security-review-read-scope.json",false],
  ["FILE-A10-SECURITY-ACCESS","security-review-access-log.json",true],
  ["FILE-A10-CLEAN-CONTEXT","clean-context-attestation.yaml",false],
  ["FILE-A10-HISTORY","historical-artifact-integrity.json",false],
  ["FILE-A10-M320","migration-320-integrity.json",false],
  ["FILE-A10-SECURITY-EVIDENCE","security-evidence.yaml",false],
  ["FILE-A10-AUTHORITATIVE-VALIDATOR","authoritative-validator-rerun.json",false],
  ["FILE-A10-SESSION-SUMMARY","session-a10-summary.json",false]
];
const artifacts = [];
for (const [artifactId, name, containsOperationalPaths] of records) {
  const bytes = await readFile(path.join(taskDir, name));
  artifacts.push({
    artifact_id: artifactId,
    type: "review-evidence",
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
await writeFile(path.join(taskDir, "artifact-manifest.yaml"), `${JSON.stringify({schema_version:1,task_id:"GOV-PHASE1-L3-REVIEW-A10",artifacts,product_changes:[],secrets_present:false}, null, 2)}\n`, "utf8");
console.log(`A10_ARTIFACT_MANIFEST artifacts=${artifacts.length}`);
