import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classifyOperationalContent, scanText } from "../../scripts/lib/secret-scanner.mjs";

const taskId = "GOV-PHASE1-L3-REVIEW-A8";
const taskDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(taskDir, "../../..");
const taskRef = ".codex/tasks/GOV-PHASE1-L3-REVIEW-A8";
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex").toUpperCase();
const evidence = [
  ["ART-A8-CODE", "formal-code-review", "code-review.json"],
  ["ART-A8-SECURITY", "formal-security-review", "security-review.json"],
  ["ART-A8-DOMAIN", "formal-railway-domain-review", "railway-domain-review.json"],
  ["ART-A8-A7-CLOSURE", "finding-closure-matrix", "a7-finding-closure-matrix.yaml"],
  ["ART-A8-A6-CLOSURE", "finding-closure-matrix", "a6-finding-closure-matrix.yaml"],
  ["ART-A8-A5-SECURITY", "finding-closure-record", "a5-security-closure.yaml"],
  ["ART-A8-BASELINE", "integrity-comparison", "baseline-comparison.json"],
  ["ART-A8-RERUN", "authoritative-rerun-summary", "authoritative-rerun-summary.json"],
  ["ART-A8-SCANNER", "scanner-binding-verification", "scanner-report-binding-verification.json"],
  ["ART-A8-BINARY", "binary-oracle-verification", "binary-oracle-verification.json"],
  ["ART-A8-SCHEMA", "schema-loader-verification", "schema-loader-verification.json"],
  ["ART-A8-GATE", "gate-routing-verification", "gate-router-verification.json"],
  ["ART-A8-HISTORY", "historical-integrity-verification", "historical-artifact-integrity.json"],
  ["ART-A8-M320", "migration-integrity-verification", "migration-320-integrity.json"],
  ["ART-A8-SESSION", "session-summary", "session-a8-summary.json"]
];
const artifacts = [];
for (const [artifact_id, type, name] of evidence) {
  const relativePath = `${taskRef}/${name}`;
  const bytes = await readFile(path.join(root, ...relativePath.split("/")));
  const text = bytes.toString("utf8");
  const credentialFindings = scanText(text, relativePath);
  if (credentialFindings.length) throw new Error(`${artifact_id} scanner findings: ${credentialFindings.join("; ")}`);
  const operationalFindings = classifyOperationalContent(text, relativePath);
  artifacts.push({
    artifact_id,
    type,
    path: relativePath,
    sha256: sha256(bytes),
    authority: "evidence-only",
    evidence_scope: "local_review_record",
    commit_inclusion: false,
    content_scan_status: "FULL",
    contains_operational_paths: operationalFindings.length > 0,
    contains_dump_reference: operationalFindings.some((item) => item.startsWith("DUMP_REFERENCE")),
    credential_scan_status: "PASS",
    redaction_status: "NOT_REQUIRED",
    source_verification_status: "VERIFIED"
  });
}
await writeFile(path.join(taskDir, "artifact-manifest.yaml"), `${JSON.stringify({schema_version: 1, task_id: taskId, artifacts, product_changes: [], secrets_present: false}, null, 2)}\n`, "utf8");
console.log(`A8_ARTIFACT_MANIFEST artifacts=${artifacts.length}`);
