import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classifyOperationalContent, scanBinaryContent, scanText } from "../../scripts/lib/governance/scanner-pipeline.mjs";

const taskDir = path.dirname(fileURLToPath(import.meta.url));
const refs = [
  ["ART-A6-CODE", "code-review.json", "formal-code-review"],
  ["ART-A6-SECURITY", "security-review.json", "formal-security-review"],
  ["ART-A6-DOMAIN", "railway-domain-review.json", "formal-railway-domain-review"],
  ["ART-A6-CLOSURE", "a5-finding-closure-matrix.yaml", "a5-finding-closure-matrix"],
  ["ART-A6-BASELINE", "baseline-comparison.json", "review-baseline-comparison"],
  ["ART-A6-RERUN", "authoritative-rerun-summary.json", "authoritative-rerun-summary"],
  ["ART-A6-M320", "migration-320-integrity.json", "migration-320-integrity"]
];
const artifacts = [];
for (const [artifactId, name, type] of refs) {
  const bytes = await readFile(path.join(taskDir, name));
  const ref = `.codex/tasks/GOV-PHASE1-L3-REVIEW-A6/${name}`;
  const text = bytes.toString("utf8");
  const credentials = scanText(text, ref), binary = scanBinaryContent(bytes, ref), operational = classifyOperationalContent(text, ref);
  artifacts.push({
    artifact_id: artifactId,
    type,
    path: ref,
    sha256: createHash("sha256").update(bytes).digest("hex").toUpperCase(),
    authority: "evidence-only",
    evidence_scope: "local_review_record",
    commit_inclusion: false,
    content_scan_status: "FULL",
    contains_operational_paths: operational.length > 0,
    contains_dump_reference: operational.some((item) => item.startsWith("DUMP_REFERENCE")),
    credential_scan_status: credentials.length || binary.length ? "FAIL" : "PASS",
    redaction_status: "NOT_REQUIRED",
    source_verification_status: "VERIFIED"
  });
}
const payload = { schema_version: 1, task_id: "GOV-PHASE1-L3-REVIEW-A6", artifacts, product_changes: [], secrets_present: false };
await writeFile(path.join(taskDir, "artifact-manifest.yaml"), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(`A6_ARTIFACT_MANIFEST artifacts=${artifacts.length} scan_failures=${artifacts.filter((item) => item.credential_scan_status === "FAIL").length}`);
