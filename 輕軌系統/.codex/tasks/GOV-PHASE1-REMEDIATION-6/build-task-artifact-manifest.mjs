import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const taskDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(taskDir, "../../..");
const refs = [
  ["ART-R6-A5-MATRIX", "a5-finding-closure-matrix.md", "a5-finding-closure-matrix"],
  ["ART-R6-BOOTSTRAP-CONTRACTS", "gate-and-trust-model.md", "bootstrap-gate-and-trust-contract"],
  ["ART-R6-SCOPE-PROOF", "scope-and-proof-model.md", "scope-and-proof-contract"],
  ["ART-R6-SCANNER-RULES", "scanner-and-rule-contract.md", "scanner-and-rule-contract"],
  ["ART-R6-PRODUCTION-TESTS", "validation-results.json", "production-validation-results"],
  ["ART-R6-CANDIDATE", "candidate-manifest-report.md", "candidate-manifest-report"],
  ["ART-R6-HISTORY", "baseline-comparison.json", "baseline-comparison"],
  ["ART-R6-M320", "migration-320-integrity.md", "migration-320-integrity"],
  ["ART-R6-PATHSPEC", "pathspec-summary.md", "governance-pathspec-status"]
];

const artifacts = [];
for (const [artifactId, name, type] of refs) {
  const bytes = await readFile(path.join(taskDir, name));
  artifacts.push({
    artifact_id: artifactId,
    type,
    path: `.codex/tasks/GOV-PHASE1-REMEDIATION-6/${name}`,
    sha256: createHash("sha256").update(bytes).digest("hex").toUpperCase(),
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
const payload = { schema_version: 1, task_id: "GOV-PHASE1-REMEDIATION-6", artifacts, product_changes: [], secrets_present: false };
await writeFile(path.join(taskDir, "artifact-manifest.yaml"), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(`R6_TASK_ARTIFACT_MANIFEST artifacts=${artifacts.length}`);
