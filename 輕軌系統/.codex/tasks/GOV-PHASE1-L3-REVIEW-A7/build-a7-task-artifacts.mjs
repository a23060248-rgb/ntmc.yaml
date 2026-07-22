import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  classifyOperationalContent,
  scanText
} from "../../scripts/lib/secret-scanner.mjs";

const taskId = "GOV-PHASE1-L3-REVIEW-A7";
const taskDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(taskDir, "../../..");
const relTask = ".codex/tasks/GOV-PHASE1-L3-REVIEW-A7";
const sha256 = (value) => createHash("sha256").update(value).digest("hex").toUpperCase();

const evidence = [
  ["ART-A7-CODE", "formal-code-review", "code-review.json"],
  ["ART-A7-SECURITY", "formal-security-review", "security-review.json"],
  ["ART-A7-DOMAIN", "formal-railway-domain-review", "railway-domain-review.json"],
  ["ART-A7-CLOSURE", "finding-closure-matrix", "a6-finding-closure-matrix.yaml"],
  ["ART-A7-A5-SECURITY", "finding-closure-record", "a5-security-closure.yaml"],
  ["ART-A7-BASELINE", "integrity-comparison", "baseline-comparison.json"],
  ["ART-A7-RERUN", "authoritative-rerun-summary", "authoritative-rerun-summary.json"],
  ["ART-A7-SCANNER", "scanner-binding-verification", "scanner-report-binding-verification.json"],
  ["ART-A7-M320", "migration-integrity-verification", "migration-320-integrity.json"]
];

const artifacts = [];
for (const [artifact_id, type, name] of evidence) {
  const relativePath = `${relTask}/${name}`;
  const bytes = await readFile(path.join(projectRoot, relativePath));
  const text = bytes.toString("utf8");
  const credentialFindings = scanText(text, relativePath);
  if (credentialFindings.length) {
    throw new Error(`${artifact_id} contains scanner findings: ${credentialFindings.join("; ")}`);
  }
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

const manifest = {
  schema_version: 1,
  task_id: taskId,
  artifacts,
  product_changes: [],
  secrets_present: false
};
await writeFile(path.join(taskDir, "artifact-manifest.yaml"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

const remediationSecurity = JSON.parse(await readFile(path.join(projectRoot, ".codex/tasks/GOV-PHASE1-REMEDIATION-7/security-evidence.yaml"), "utf8"));
const securityEvidence = {
  ...remediationSecurity,
  task_id: taskId,
  claims: {
    ...remediationSecurity.claims,
    trusted_producer_identity_verified: false,
    os_runtime_isolation_verified: false
  },
  limitations: [
    "The scanner covers only the exact 92-file bootstrap candidate and the declared contract v5 classes.",
    "A7 independently recomputed the current scanner bindings, but the formal Security Reviewer found that the mandatory binary-oracle coverage contract is incomplete.",
    "The scanner report and validator remain mutable bootstrap workspace artifacts with internal-consistency assurance only.",
    "External Migration 320 evidence was hash-verified but was not globally rescanned or reinterpreted.",
    "No operating-system isolation, repository-global scanning, Git index, remote control, or global sensitive-data absence claim is made."
  ]
};
await writeFile(path.join(taskDir, "security-evidence.yaml"), `${JSON.stringify(securityEvidence, null, 2)}\n`, "utf8");

console.log(`A7_TASK_ARTIFACTS artifacts=${artifacts.length} operational=${artifacts.filter((item) => item.contains_operational_paths).length}`);
