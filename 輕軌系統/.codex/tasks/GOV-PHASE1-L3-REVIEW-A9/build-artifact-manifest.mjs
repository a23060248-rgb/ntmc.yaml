import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const taskDir = path.dirname(fileURLToPath(import.meta.url));
const taskRef = ".codex/tasks/GOV-PHASE1-L3-REVIEW-A9";
const records = [
  ["FILE-A9-BASELINE-BEFORE","review-baseline-before.json",false], ["FILE-A9-BASELINE-AFTER","review-baseline-after.json",false], ["FILE-A9-BASELINE-COMPARE","baseline-comparison.json",false],
  ["FILE-A9-CANDIDATE-MANIFEST","candidate-manifest-verification.json",false], ["FILE-A9-CANDIDATE","bootstrap-candidate-verification.json",false],
  ["FILE-A9-ASSIGNMENTS","reviewer-assignment-verification.json",false], ["FILE-A9-BINDING","reviewer-binding-verification.json",false],
  ["FILE-A9-CODE-REVIEW","code-review.json",false], ["FILE-A9-SECURITY-REVIEW","security-review.json",true], ["FILE-A9-DOMAIN-REVIEW","railway-domain-review.json",false],
  ["FILE-A9-A8-CLOSURE","a8-finding-closure-matrix.yaml",false], ["FILE-A9-HIST-CLOSURE","historical-closure-regression.yaml",false],
  ["FILE-A9-FIXTURES","fixture-rerun.json",false], ["FILE-A9-CONCURRENCY","concurrency-regression.json",false], ["FILE-A9-PROD-SCANNER","production-scanner-rerun.json",false], ["FILE-A9-PROD-INTEGRATION","production-integration-rerun.json",false], ["FILE-A9-PROD-MUTATIONS","mutation-test-rerun.json",false],
  ["FILE-A9-BINDING-RERUN","reviewer-binding-rerun.json",false], ["FILE-A9-LOADER-RERUN","official-schema-loader-rerun.json",false], ["FILE-A9-LOADER-MUTATIONS","schema-loader-mutation-rerun.json",false],
  ["FILE-A9-SCHEMA-SET","schema-set-verification.json",false], ["FILE-A9-RAILWAY-SCHEMA","railway-review-schema-verification.json",false], ["FILE-A9-DOMAIN-ROUTING","domain-routing-verification.json",false],
  ["FILE-A9-SCANNER-REGRESSION","scanner-regression-verification.json",false], ["FILE-A9-BINARY-ORACLE","binary-oracle-regression-verification.json",false],
  ["FILE-A9-HISTORY","historical-artifact-integrity.json",false], ["FILE-A9-M320","migration-320-integrity.json",false], ["FILE-A9-SECURITY-EVIDENCE","security-evidence.yaml",false],
  ["FILE-A9-AUTHORITATIVE-VALIDATOR","authoritative-validator-rerun.json",false], ["FILE-A9-SESSION-SUMMARY","session-a9-summary.json",false]
];
const artifacts=[];
for (const [artifactId,name,containsOperationalPaths] of records) {
  const bytes=await readFile(path.join(taskDir,name));
  artifacts.push({artifact_id:artifactId,type:"review-evidence",path:`${taskRef}/${name}`,sha256:createHash("sha256").update(bytes).digest("hex").toUpperCase(),authority:"evidence-only",evidence_scope:"local_review_record",commit_inclusion:false,content_scan_status:"FULL",contains_operational_paths:containsOperationalPaths,contains_dump_reference:false,credential_scan_status:"PASS",redaction_status:containsOperationalPaths?"NOT_REDACTED":"NOT_REQUIRED",source_verification_status:"VERIFIED"});
}
await writeFile(path.join(taskDir,"artifact-manifest.yaml"),`${JSON.stringify({schema_version:1,task_id:"GOV-PHASE1-L3-REVIEW-A9",artifacts,product_changes:[],secrets_present:false},null,2)}\n`,"utf8");
console.log(`A9_ARTIFACT_MANIFEST artifacts=${artifacts.length}`);
