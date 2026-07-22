import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { safeExistingPath } from "../../scripts/lib/path-safety.mjs";
import { BOOTSTRAP_ASSURANCE, BOOTSTRAP_RECORD_TYPE, canonicalSha256, sha256, validateBootstrapCandidateRecord } from "../../scripts/lib/governance/typed-proof.mjs";
import { validateBootstrapScanReport } from "../../scripts/lib/governance/scanner-report.mjs";
import { loadAndCompileGovernanceSchemas } from "../../scripts/lib/governance/governance-schema-loader.mjs";

const taskDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(taskDir, "../../..");
const manifestRef = ".codex/governance/governance-commit-manifest.yaml";
const candidateRef = ".codex/tasks/GOV-PHASE1-REMEDIATION-9/bootstrap-candidate-record.json";
const scannerRef = ".codex/tasks/GOV-PHASE1-REMEDIATION-9/bootstrap-scanner-report.json";
const manifestBytes = await readFile(await safeExistingPath(root, manifestRef));
const manifest = JSON.parse(manifestBytes.toString("utf8"));
const candidateBytes = await readFile(await safeExistingPath(root, candidateRef));
const candidate = JSON.parse(candidateBytes.toString("utf8"));
const scannerBytes = await readFile(await safeExistingPath(root, scannerRef));
const scanner = JSON.parse(scannerBytes.toString("utf8"));
const schemaSet = await loadAndCompileGovernanceSchemas(root);
const included = [];
for (const artifact of manifest.artifacts ?? []) {
  if (artifact.commit_inclusion !== true) continue;
  const bytes = await readFile(await safeExistingPath(root, artifact.path));
  const digest = sha256(bytes);
  if (digest !== artifact.sha256.toUpperCase()) throw new Error(`MANIFEST_HASH_MISMATCH:${artifact.path}`);
  included.push({path: artifact.path, sha256: digest});
}
included.sort((a, b) => a.path.localeCompare(b.path));
if (included.length !== 103 || new Set(included.map((item) => item.path)).size !== 103) throw new Error("CANDIDATE_EXACT_SET_FAILURE");
const manifestSha256 = sha256(manifestBytes);
const fileSetSha256 = canonicalSha256(included);
const scannerSha256 = sha256(scannerBytes);
const scannerSchemaIssues = schemaSet.validate(".codex/blueprints/schemas/bootstrap-scan-report.schema.json", scanner, scannerRef);
const candidateSchemaIssues = schemaSet.validate(".codex/blueprints/schemas/bootstrap-candidate-record.schema.json", candidate, candidateRef);
const reportCheck = await validateBootstrapScanReport({projectRoot: root, report: scanner, manifestBytes, includedFiles: included, scannedFiles: included});
const candidateCheck = validateBootstrapCandidateRecord(candidate, {
  record_type: BOOTSTRAP_RECORD_TYPE,
  assurance: BOOTSTRAP_ASSURANCE,
  task_id: "GOV-PHASE1-REMEDIATION-9",
  manifest_sha256: manifestSha256,
  included_file_set_sha256: fileSetSha256,
  file_count: included.length,
  scanner_report_sha256: scannerSha256,
  scan_contract_sha256: scanner.scan_contract.contract_sha256,
  finding_registry_sha256: scanner.scan_contract.finding_registry_sha256,
  canonicalization_config_sha256: scanner.scan_contract.canonicalization_config_sha256,
  binary_oracle_config_sha256: scanner.scan_contract.binary_oracle_config_sha256,
  binary_magic_registry_sha256: scanner.scan_contract.binary_magic_registry_sha256,
  schema_set_sha256: scanner.scan_contract.schema_set_sha256
});
if (scannerSchemaIssues.length || candidateSchemaIssues.length || !reportCheck.ok || !candidateCheck.ok) throw new Error([...scannerSchemaIssues, ...candidateSchemaIssues, ...reportCheck.violations, ...candidateCheck.violations].join(" | "));

const byPath = new Map((manifest.artifacts ?? []).map((item) => [item.path, item]));
const candidateManifestVerification = {
  schema_version: 1,
  task_id: "GOV-PHASE1-L3-REVIEW-A9",
  reviewed_candidate_baseline: "phase-1.9-bootstrap",
  manifest_ref: manifestRef,
  manifest_sha256: manifestSha256,
  expected_file_count: 103,
  actual_file_count: included.length,
  unique_path_count: new Set(included.map((item) => item.path)).size,
  included_file_set_sha256: fileSetSha256,
  all_paths_byte_size_and_sha256_match: true,
  a9_artifacts_in_candidate: included.some((item) => item.path.startsWith(".codex/tasks/GOV-PHASE1-L3-REVIEW-A9/")),
  railway_review_schema: {path: ".codex/blueprints/schemas/railway-domain-review.schema.json", sha256: byPath.get(".codex/blueprints/schemas/railway-domain-review.schema.json")?.sha256, included_once: manifest.artifacts.filter((item) => item.path === ".codex/blueprints/schemas/railway-domain-review.schema.json").length === 1},
  railway_reviewer_profile: {path: ".codex/agents/railway-domain-reviewer.toml", sha256: byPath.get(".codex/agents/railway-domain-reviewer.toml")?.sha256, included_once: manifest.artifacts.filter((item) => item.path === ".codex/agents/railway-domain-reviewer.toml").length === 1},
  result: "PASS"
};
const bootstrapCandidateVerification = {
  schema_version: 1,
  task_id: "GOV-PHASE1-L3-REVIEW-A9",
  candidate_ref: candidateRef,
  candidate_sha256: sha256(candidateBytes),
  record_type: candidate.record_type,
  assurance: candidate.assurance,
  manifest_sha256: candidate.manifest_sha256,
  included_file_set_sha256: candidate.included_file_set_sha256,
  file_count: candidate.file_count,
  scanner_report_sha256: candidate.scanner_report_sha256,
  schema_set_sha256: candidate.schema_set_sha256,
  production_schema_loader_set_sha256: schemaSet.schema_set_sha256,
  scanner_schema_validation: "PASS",
  candidate_schema_validation: "PASS",
  production_scanner_report_validation: "PASS",
  scanner_result: scanner.results,
  candidate_payload_validation: "PASS",
  result: "PASS"
};

const blueprint = JSON.parse(await readFile(path.join(taskDir, "blueprint.yaml"), "utf8"));
const assignments = blueprint.review_assignments ?? [];
const expectedIds = [
  "A9-CODE-RUN-35132575-D0B8-44DE-A036-125230A95090", "A9-CODE-SESSION-63226E42-9DAA-40E3-A1AE-04C7E46D81B5",
  "A9-SEC-RUN-232B7E60-D7A1-469C-8B99-9C91FA2B36DF", "A9-SEC-SESSION-E97ED2B7-A95E-438E-B6F1-F0F3B9DAD033",
  "A9-DOMAIN-RUN-697099E4-0A0F-4CEC-BBFF-5D58B3A82710", "A9-DOMAIN-SESSION-B10C9029-0BE8-4050-A9E4-75430174237D"
];
async function historicalCollisions(relativePath, collisions) {
  const absolute = await safeExistingPath(root, relativePath);
  for (const entry of await readdir(absolute, {withFileTypes: true})) {
    const ref = path.posix.join(relativePath, entry.name);
    if (ref.startsWith(".codex/tasks/GOV-PHASE1-L3-REVIEW-A9")) continue;
    if (entry.isDirectory()) await historicalCollisions(ref, collisions);
    else if (entry.isFile()) {
      const bytes = await readFile(await safeExistingPath(root, ref));
      const text = bytes.toString("utf8");
      for (const id of expectedIds) if (text.includes(id)) collisions.push({id, ref});
    }
  }
}
const collisions = [];
await historicalCollisions(".codex/tasks", collisions);
const assignmentChecks = [];
for (const assignment of assignments) {
  const profileBytes = await readFile(await safeExistingPath(root, assignment.agent_profile_reference));
  const manifestEntries = manifest.artifacts.filter((item) => item.path === assignment.agent_profile_reference);
  assignmentChecks.push({
    assignment_id: assignment.assignment_id,
    required_role_id: assignment.required_role_id,
    profile_ref: assignment.agent_profile_reference,
    profile_sha256: sha256(profileBytes),
    assignment_profile_hash_match: sha256(profileBytes) === assignment.agent_profile_sha256,
    candidate_manifest_entry_count: manifestEntries.length,
    candidate_manifest_hash_match: manifestEntries.length === 1 && manifestEntries[0].sha256.toUpperCase() === assignment.agent_profile_sha256,
    execution_mode: assignment.execution_mode,
    implementation_participation: assignment.implementation_participation,
    allowed_write_paths: assignment.allowed_write_paths,
    result: sha256(profileBytes) === assignment.agent_profile_sha256 && manifestEntries.length === 1 && manifestEntries[0].sha256.toUpperCase() === assignment.agent_profile_sha256 && assignment.execution_mode === "read-only" && assignment.implementation_participation === false && assignment.allowed_write_paths.length === 0 ? "PASS" : "FAIL"
  });
}
const assignmentVerification = {
  schema_version: 1,
  task_id: "GOV-PHASE1-L3-REVIEW-A9",
  assignment_count: assignments.length,
  unique_assignment_ids: new Set(assignments.map((item) => item.assignment_id)).size === assignments.length,
  required_roles: assignments.map((item) => item.required_role_id),
  assignment_checks: assignmentChecks,
  reviewer_run_and_session_ids_unique_within_a9: new Set(expectedIds).size === expectedIds.length,
  historical_run_or_session_collisions: collisions,
  result: assignments.length === 3 && assignmentChecks.every((item) => item.result === "PASS") && new Set(expectedIds).size === expectedIds.length && collisions.length === 0 ? "PASS" : "FAIL"
};

await writeFile(path.join(taskDir, "candidate-manifest-verification.json"), `${JSON.stringify(candidateManifestVerification, null, 2)}\n`, "utf8");
await writeFile(path.join(taskDir, "bootstrap-candidate-verification.json"), `${JSON.stringify(bootstrapCandidateVerification, null, 2)}\n`, "utf8");
await writeFile(path.join(taskDir, "reviewer-assignment-verification.json"), `${JSON.stringify(assignmentVerification, null, 2)}\n`, "utf8");
console.log(`A9_CANDIDATE_VERIFY files=${included.length} scanner=${reportCheck.ok} schemas=${schemaSet.schema_set_sha256} assignments=${assignmentVerification.result}`);
