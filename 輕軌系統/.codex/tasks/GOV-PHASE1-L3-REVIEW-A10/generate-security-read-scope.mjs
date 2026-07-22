import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalSha256 } from "../../scripts/lib/governance/typed-proof.mjs";

const taskDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(taskDir, "../../..");
const manifest = JSON.parse(await readFile(path.join(root, ".codex/governance/governance-commit-manifest.yaml"), "utf8"));
const candidateFiles = manifest.artifacts.filter((item) => item.commit_inclusion === true).map((item) => item.path).sort();
if (candidateFiles.length !== 103 || new Set(candidateFiles).size !== 103) throw new Error("SECURITY_SCOPE_CANDIDATE_SET_INVALID");
const supportingFiles = [
  ".codex/tasks/GOV-PHASE1-REMEDIATION-9/bootstrap-candidate-record.json",
  ".codex/tasks/GOV-PHASE1-REMEDIATION-9/bootstrap-scanner-report.json",
  ".codex/tasks/GOV-PHASE1-REMEDIATION-9/candidate-manifest-verification.json",
  ".codex/tasks/GOV-PHASE1-REMEDIATION-9/bootstrap-candidate-verification.json",
  ".codex/tasks/GOV-PHASE1-REMEDIATION-9/authoritative-validator-rerun.json",
  ".codex/tasks/GOV-PHASE1-REMEDIATION-9/validation-run-summary.json",
  ".codex/tasks/GOV-PHASE1-REMEDIATION-9/fixture-rerun.json",
  ".codex/tasks/GOV-PHASE1-REMEDIATION-9/production-integration-rerun.json",
  ".codex/tasks/GOV-PHASE1-REMEDIATION-9/reviewer-binding-regression-rerun.json",
  ".codex/tasks/GOV-PHASE1-REMEDIATION-9/official-schema-loader-integration-rerun.json",
  ".codex/tasks/GOV-PHASE1-REMEDIATION-9/official-schema-loader-mutation-rerun.json",
  ".codex/tasks/GOV-PHASE1-REMEDIATION-9/production-scanner-rerun.json",
  ".codex/tasks/GOV-PHASE1-REMEDIATION-9/binary-magic-mutation-rerun.json",
  ".codex/tasks/GOV-PHASE1-REMEDIATION-9/concurrency-regression.json",
  ".codex/tasks/GOV-PHASE1-REMEDIATION-9/security-evidence.yaml",
  ".codex/tasks/GOV-PHASE1-REMEDIATION-9/migration-320-integrity.json",
  ".codex/tasks/GOV-PHASE1-L3-REVIEW-A9/security-review.json",
  ".codex/tasks/GOV-M320-DRYRUN/artifact-manifest.yaml",
  ".codex/tasks/GOV-M320-DRYRUN/review-findings.yaml",
  ".codex/tasks/GOV-M320-DRYRUN/security-evidence.yaml",
  ".codex/tasks/GOV-M320-DRYRUN/human-approval.yaml",
  ".codex/tasks/GOV-M320-DRYRUN/final-summary.md"
];
const a10Files = [
  ".codex/tasks/GOV-PHASE1-L3-REVIEW-A10/security-review-read-scope.json",
  ".codex/tasks/GOV-PHASE1-L3-REVIEW-A10/blueprint.yaml",
  ".codex/tasks/GOV-PHASE1-L3-REVIEW-A10/candidate-manifest-verification.json",
  ".codex/tasks/GOV-PHASE1-L3-REVIEW-A10/production-scanner-rerun.json",
  ".codex/tasks/GOV-PHASE1-L3-REVIEW-A10/binary-magic-mutation-rerun.json",
  ".codex/tasks/GOV-PHASE1-L3-REVIEW-A10/security-review-access-log.json",
  ".codex/tasks/GOV-PHASE1-L3-REVIEW-A10/clean-context-attestation.yaml",
  ".codex/tasks/GOV-PHASE1-L3-REVIEW-A10/security-review.json"
];
const allowedFiles = [...new Set([...candidateFiles, ...supportingFiles, ...a10Files])].sort();
const payload = {
  schema_version: 1,
  task_id: "GOV-PHASE1-L3-REVIEW-A10",
  scope_type: "procedural-security-review-read-allowlist",
  allowed_roots: ["${PRODUCT_ROOT}"],
  allowed_files: allowedFiles,
  candidate_manifest_file_count: candidateFiles.length,
  forbidden_roots: [".env*", "frontend/**", "erp-api/**", "db-design/**", "migration/**", "collab/**", "collab/HANDOFF.md", "${PRODUCT_ROOT}/..", "sibling directories"],
  access_rule: "Only exact allowed_files may be opened; directory enumeration outside those files is prohibited.",
  assurance: "procedural"
};
const result = {...payload, review_scope_sha256: canonicalSha256(payload)};
await writeFile(path.join(taskDir, "security-review-read-scope.json"), `${JSON.stringify(result, null, 2)}\n`, {encoding:"utf8", flag:"wx"});
console.log(JSON.stringify({allowed_file_count:allowedFiles.length, candidate_file_count:candidateFiles.length, review_scope_sha256:result.review_scope_sha256}));
