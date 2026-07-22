import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scanText, classifyOperationalContent, scanBinaryContent } from "../../scripts/lib/governance/scanner-pipeline.mjs";

const taskDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(taskDir, "../../..");
const taskBase = ".codex/tasks/GOV-PHASE1-REMEDIATION-5";
const definitions = [
  ["ART-R5-A4-MATRIX", "finding-matrix", "a4-finding-remediation-matrix.json"],
  ["ART-R5-CONTRACTS", "authority-contracts", "six-core-contracts.json"],
  ["ART-R5-FIXTURES", "fixture-result", "fixture-results.json"],
  ["ART-R5-MUTATION-PROPERTY", "mutation-result", "mutation-results.json"],
  ["ART-R5-PRODUCTION-INTEGRATION", "production-integration", "production-integration-results.json"],
  ["ART-R5-CREATE-TASK-DRAFT", "production-integration", "create-task-draft-verification.json"],
  ["ART-R5-HISTORY", "integrity-comparison", "baseline-comparison.json"],
  ["ART-R5-CANDIDATE", "workspace-candidate-proof", "candidate-snapshot.json"],
  ["ART-R5-M320", "migration-gate-wrapper", "migration-320-verification.json"],
  ["ART-R5-PATHSPEC", "git-pathspec-inventory", "governance-pathspec-status.json"],
  ["ART-R5-CONCURRENCY", "concurrency-result", "concurrency-results.json"],
  ["ART-R5-SCAN-CONTRACT", "scanner-contract-result", "scan-contract-verification.json"],
  ["ART-R5-DOMAIN", "domain-authority-result", "domain-rule-verification.json"],
  ["ART-R5-LIFECYCLE", "lifecycle-result", "lifecycle-verification.json"],
  ["ART-R5-MANIFEST-VERIFY", "candidate-manifest-result", "candidate-manifest-verification.json"],
  ["ART-R5-BASELINE-BEFORE", "source-baseline", "baseline-before.json"],
  ["ART-R5-BASELINE-AFTER", "source-baseline", "baseline-after.json"],
  ["ART-R5-MINIMUM-CAPABILITIES", "capability-boundary", "minimum-phase1-capabilities.json"],
  ["ART-R5-REMOVED-CAPABILITIES", "capability-boundary", "removed-phase1-capabilities.json"],
  ["ART-R5-GATE-STATUS", "gate-status", "gate-status.json"],
  ["ART-R5-RESIDUAL-RISKS", "residual-risk", "residual-risks.json"],
  ["ART-R5-REPORT", "remediation-report", "remediation-report.md"],
  ["ART-R5-HANDOFF", "handoff", "HANDOFF.md"]
];

const artifacts = [];
for (const [artifact_id, type, name] of definitions) {
  const ref = `${taskBase}/${name}`;
  const bytes = await readFile(path.join(root, ref));
  const text = bytes.toString("utf8");
  const credentialFindings = scanText(text, ref);
  const binaryFindings = scanBinaryContent(bytes, ref);
  if (credentialFindings.length || binaryFindings.length) throw new Error(`Artifact scan failed for ${ref}.`);
  const operational = classifyOperationalContent(text, ref);
  artifacts.push({
    artifact_id,
    type,
    path: ref,
    sha256: createHash("sha256").update(bytes).digest("hex").toUpperCase(),
    authority: "evidence-only",
    evidence_scope: "local_review_record",
    commit_inclusion: false,
    content_scan_status: "FULL",
    contains_operational_paths: operational.length > 0,
    contains_dump_reference: operational.some((item) => item.startsWith("DUMP_REFERENCE")),
    credential_scan_status: "PASS",
    redaction_status: "NOT_REQUIRED",
    source_verification_status: "VERIFIED"
  });
}
const manifest = { schema_version: 1, task_id: "GOV-PHASE1-REMEDIATION-5", artifacts, product_changes: [], secrets_present: false };
await writeFile(path.join(taskDir, "artifact-manifest.yaml"), `${JSON.stringify(manifest, null, 2)}\n`, { encoding: "utf8", flag: "w" });
console.log(`TASK_ARTIFACT_MANIFEST artifacts=${artifacts.length} operational=${artifacts.filter((item) => item.contains_operational_paths).length}`);
