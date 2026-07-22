import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalSha256, ruleCoreSha256, sha256, validateDomainApprovalRecord } from "../../scripts/lib/governance-controls.mjs";
import { scanBinaryContent, scanContract, scanText } from "../../scripts/lib/secret-scanner.mjs";
import { projectPhaseStatus } from "../../scripts/lib/lifecycle-projection.mjs";

const a4Dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(a4Dir, "..", "..", "..");
const readJson = async (ref) => JSON.parse(await readFile(path.join(root, ref), "utf8"));
const writeJson = async (name, value) => writeFile(path.join(a4Dir, name), `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
const manifestRef = ".codex/governance/governance-commit-manifest.yaml";
const snapshotRef = ".codex/tasks/GOV-PHASE1-REMEDIATION-4/candidate-snapshot.json";
const manifestBytes = await readFile(path.join(root, manifestRef));
const manifest = JSON.parse(manifestBytes.toString("utf8"));
const snapshot = await readJson(snapshotRef);
const included = manifest.artifacts.filter((item) => item.commit_inclusion === true);
const files = [];
const hashMismatches = [];
const scanFindings = [];
for (const item of included) {
  const bytes = await readFile(path.join(root, item.path));
  const hash = sha256(bytes);
  files.push({ path: item.path, sha256: hash });
  if (hash !== item.sha256) hashMismatches.push(item.path);
  if (item.scan_required) {
    scanFindings.push(...scanText(bytes.toString("utf8"), item.path), ...scanBinaryContent(bytes, item.path));
  }
}
const manifestSha256 = sha256(manifestBytes);
const fileSetSha256 = canonicalSha256(files);
const uniquePaths = new Set(included.map((item) => item.path)).size;
const manifestVerification = { schema_version: 1, task_id: "GOV-PHASE1-L3-REVIEW-A4", expected_count: 103, actual_count: included.length, unique_path_count: uniquePaths, hash_mismatches: hashMismatches, manifest_sha256: manifestSha256, included_file_set_sha256: fileSetSha256, a4_artifacts_included: included.filter((item) => item.path.startsWith(".codex/tasks/GOV-PHASE1-L3-REVIEW-A4/")), scan_required_count: included.filter((item) => item.scan_required).length, result: included.length === 103 && uniquePaths === 103 && !hashMismatches.length ? "PASS" : "FAIL" };
await writeJson("commit-manifest-verification.json", manifestVerification);
await writeJson("candidate-snapshot-verification.json", { schema_version: 1, task_id: "GOV-PHASE1-L3-REVIEW-A4", snapshot_id: snapshot.snapshot_id, validation_type: snapshot.validation_type, expected_manifest_sha256: manifestSha256, actual_manifest_sha256: snapshot.manifest_sha256, expected_file_set_sha256: fileSetSha256, actual_file_set_sha256: snapshot.included_file_set_sha256, expected_file_count: included.length, actual_file_count: snapshot.file_count, staged_candidate_present: false, result: snapshot.validation_type === "WORKSPACE_CANDIDATE" && snapshot.manifest_sha256 === manifestSha256 && snapshot.included_file_set_sha256 === fileSetSha256 && snapshot.file_count === included.length ? "PASS" : "FAIL" });

const uriSchemes = ["postgres", "postgresql", "mysql", "mongodb", "mongodb+srv", "redis", "rediss", "amqp", "amqps"];
const uriPositive = Object.fromEntries(uriSchemes.map((scheme) => [scheme, scanText(`${scheme}://reviewer:ExamplePass123@host/db`, `${scheme}.txt`).some((item) => item.startsWith("CREDENTIAL_URI"))]));
const uriNegative = Object.fromEntries(uriSchemes.map((scheme) => [scheme, scanText(`${scheme}://host/db`, `${scheme}-safe.txt`).length === 0]));
const textProbes = {
  percent_encoded_uri: scanText("postgres%3A%2F%2Freviewer%3AExamplePass123%40host%2Fdb", "encoded.txt").some((item) => item.startsWith("CREDENTIAL_URI")),
  json_escaped_uri: scanText("postgres:\\/\\/reviewer:ExamplePass123@host\\/db", "escaped.json").some((item) => item.startsWith("CREDENTIAL_URI")),
  cookie: scanText("Cookie: sessionid=abcdefghijklmnop;", "cookie.txt").some((item) => item.startsWith("COOKIE_HEADER")),
  set_cookie: scanText("Set-Cookie: sessionid=abcdefghijklmnop;", "cookie.txt").some((item) => item.startsWith("COOKIE_HEADER")),
  authorization_bearer: scanText("Authorization: Bearer abcdefghijklmnopqrstuvwxyz", "auth.txt").some((item) => item.startsWith("BEARER_TOKEN")),
  session_names: ["session", "sessionid", "connect.sid", "jwt", "access_token", "refresh_token"].every((name) => scanText(`${name}=abcdefghijklmnop`, "session.txt").length > 0),
  pem_private_key: scanText("-----BEGIN PRIVATE KEY-----", "key.txt").some((item) => item.startsWith("PRIVATE_KEY")),
  jwt: scanText("eyJabcdefghijk.eyJabcdefghijk.abcdefghijklm", "jwt.txt").some((item) => item.startsWith("JWT")),
  known_service_token: scanText(`ghp_${"A".repeat(20)}`, "token.txt").some((item) => item.startsWith("KNOWN_TOKEN")),
  high_entropy: scanText("aB3dE5fG7hJ9kL2mN4pQ6rS8tU1vW3xY", "entropy.txt").some((item) => item.startsWith("HIGH_ENTROPY")),
  safe_cookie: scanText("Cookie: theme=light;", "safe.txt").length === 0,
  safe_bearer: scanText("Authorization: Bearer example", "safe.txt").length === 0,
  safe_labelled_values: scanText("token=redacted password=placeholder", "safe.txt").length === 0
};
const signatures = { MZ: [0x4d,0x5a], ELF: [0x7f,0x45,0x4c,0x46], ZIP: [0x50,0x4b,0x03,0x04], PDF: [...Buffer.from("%PDF-")], SQLITE: [...Buffer.from("SQLite format 3\0")], PGDMP: [...Buffer.from("PGDMP")], OLE: [0xd0,0xcf,0x11,0xe0], PNG: [0x89,0x50,0x4e,0x47], JPEG: [0xff,0xd8,0xff] };
const binaryPositive = Object.fromEntries(Object.entries(signatures).map(([name, bytes]) => [name, scanBinaryContent(Buffer.from(bytes), `${name}.txt`).some((item) => item.startsWith(name))]));
binaryPositive.NUL = scanBinaryContent(Buffer.from([0x41,0x00,0x42]), "nul.txt").some((item) => item.startsWith("NUL_BYTE"));
binaryPositive.binary_control_ratio = scanBinaryContent(Buffer.from([0x01,0x02,0x03,0x41]), "control.txt").some((item) => item.startsWith("BINARY_CONTROL_RATIO"));
const binarySafeNegative = Object.fromEntries(Object.keys(binaryPositive).map((name) => [name, scanBinaryContent(Buffer.from(`safe text for ${name}`), `${name}-safe.txt`).length === 0]));
await writeJson("scanner-contract-verification.json", { schema_version: 1, task_id: "GOV-PHASE1-L3-REVIEW-A4", scan_contract_id: scanContract.id, scan_contract_version: scanContract.version, max_url_decode_passes: scanContract.maxUrlDecodePasses, manifest_sha256: manifestSha256, scanned_file_count: included.filter((item) => item.scan_required).length, scanned_file_set_sha256: fileSetSha256, deterministic_pattern_scan_completed: true, no_findings_within_declared_contract: scanFindings.length === 0, manifest_scan_findings: scanFindings, uri_positive: uriPositive, uri_safe_negative: uriNegative, text_probes: textProbes, binary_positive: binaryPositive, binary_safe_negative: binarySafeNegative, claim_boundary: { global_secret_absence_verified: false, scanner_is_dlp: false, os_or_container_isolation_verified: false }, result: scanFindings.length === 0 && Object.values(uriPositive).every(Boolean) && Object.values(uriNegative).every(Boolean) && Object.values(textProbes).every(Boolean) && Object.values(binaryPositive).every(Boolean) && Object.values(binarySafeNegative).every(Boolean) ? "PASS" : "FAIL" });

const registry = await readJson(".codex/domain/index.yaml");
const validatorSource = await readFile(path.join(root, ".codex/scripts/validate-task.mjs"), "utf8");
const rolePolicy = await readJson(".codex/governance/agent-path-policy.yaml");
const sampleRule = { rule_id: "A4-SAMPLE", version: 1, statement: "A sample proposed rule for authority mechanism validation.", scope: ["fixture-only"], applies_when: ["fixture"], prohibited: ["production-use"], verification: { automated: [], manual: ["human review"] }, enforcement: { mechanisms: ["NO-GO"], residual_risk: "fixture only" } };
const validApproval = { artifact_type: "domain-rule-human-approval", producer_type: "human", human_identity_assurance: "procedural", rule: { rule_id: sampleRule.rule_id, rule_version: sampleRule.version, rule_content_sha256: ruleCoreSha256(sampleRule) }, source: { source_verified_at: "2026-07-17T00:00:00Z" }, approval: { approved_at: "2026-07-17T00:00:01Z", effective_from: "2026-07-17T00:00:01Z" } };
const currentConfirmed = registry.rules.filter((rule) => rule.status === "confirmed").length;
await writeJson("domain-authority-verification.json", { schema_version: 1, task_id: "GOV-PHASE1-L3-REVIEW-A4", registry_type: registry.registry_type, is_complete_domain_knowledge_base: registry.is_complete_domain_knowledge_base, declared_confirmed_rule_count: registry.confirmed_rule_count, calculated_confirmed_rule_count: currentConfirmed, all_current_rules_proposed: registry.rules.every((rule) => rule.status === "proposed"), procedural_human_approval_accepted: validateDomainApprovalRecord(sampleRule, validApproval).length === 0, agent_producer_rejected: validateDomainApprovalRecord(sampleRule, { ...validApproval, producer_type: "agent" }).length > 0, generic_artifact_rejected: validateDomainApprovalRecord(sampleRule, { ...validApproval, artifact_type: "evidence" }).length > 0, stale_content_hash_rejected: validateDomainApprovalRecord({ ...sampleRule, statement: "mutated" }, validApproval).length > 0, equal_verification_approval_rejected: validateDomainApprovalRecord(sampleRule, { ...validApproval, approval: { ...validApproval.approval, approved_at: validApproval.source.source_verified_at } }).length > 0, reversed_chronology_rejected: validateDomainApprovalRecord(sampleRule, { ...validApproval, approval: { ...validApproval.approval, approved_at: "2026-07-16T23:59:59Z" } }).length > 0, validator_requires_unique_authoritative_artifact: validatorSource.includes("artifacts.length !== 1") && validatorSource.includes('artifact.authority !== "authoritative"') && validatorSource.includes('artifact.type !== "domain-rule-human-approval"'), railway_reviewer_write_paths: rolePolicy.roles?.["railway-domain-reviewer"]?.allowed_write_paths ?? null, actual_rule_approval_performed: false, result: registry.registry_type === "proposed_rule_registry" && registry.is_complete_domain_knowledge_base === false && registry.confirmed_rule_count === 0 && currentConfirmed === 0 && registry.rules.every((rule) => rule.status === "proposed") ? "PASS" : "FAIL" });

const actualPhase = await readJson(".codex/governance/phase-status.json");
const projectedPhase = await projectPhaseStatus(root, actualPhase.generated_at);
await writeJson("phase-lifecycle-verification.json", { schema_version: 1, task_id: "GOV-PHASE1-L3-REVIEW-A4", deterministic_projection_match: JSON.stringify(actualPhase) === JSON.stringify(projectedPhase), lifecycle_source_artifacts: actualPhase.lifecycle_source_artifacts, lifecycle_source_hashes: actualPhase.lifecycle_source_hashes, last_completed_remediation: actualPhase.last_completed_remediation, last_completed_review: actualPhase.last_completed_review, last_review_outcome: actualPhase.last_review_outcome, a4_started_recorded: actualPhase.a4_started, session_b_authorized: actualPhase.session_b_authorized, governance_gates: { candidate_review: actualPhase.candidate_governance_review_gate, commit_preparation: actualPhase.governance_commit_preparation_gate, commit_execution: actualPhase.governance_commit_execution_gate, migration_320_execution: actualPhase.migration_320_execution_gate }, result: JSON.stringify(actualPhase) === JSON.stringify(projectedPhase) ? "PASS" : "FAIL" });

const frozenBaseline = await readJson(".codex/tasks/GOV-PHASE1-REMEDIATION-4/baseline-before.json");
const frozenChanged = [];
for (const item of frozenBaseline.frozen_artifacts) {
  const bytes = await readFile(path.join(root, item.relative_path));
  if (bytes.length !== item.byte_size || sha256(bytes) !== item.sha256) frozenChanged.push(item.relative_path);
}
await writeJson("historical-artifact-integrity.json", { schema_version: 1, task_id: "GOV-PHASE1-L3-REVIEW-A4", expected_count: 100, actual_count: frozenBaseline.frozen_artifacts.length, changed: frozenChanged, result: frozenBaseline.frozen_artifacts.length === 100 && !frozenChanged.length ? "PASS" : "FAIL" });

const m320Prior = await readJson(".codex/tasks/GOV-PHASE1-REMEDIATION-4/migration-320-verification.json");
const m320Hashes = {};
const m320Changed = [];
for (const [ref, expected] of Object.entries(m320Prior.external_evidence_hashes)) {
  const actual = sha256(await readFile(path.join(root, ref)));
  m320Hashes[ref] = actual;
  if (actual !== expected) m320Changed.push(ref);
}
const m320Blueprint = await readJson(".codex/tasks/GOV-M320-DRYRUN/blueprint.yaml");
await writeJson("migration-320-integrity.json", { schema_version: 1, task_id: "GOV-PHASE1-L3-REVIEW-A4", external_evidence_hashes: m320Hashes, changed_external_evidence: m320Changed, candidate_rules: m320Blueprint.candidate_rules, candidate_rules_remain_proposed: m320Blueprint.candidate_rules.length > 0 && m320Blueprint.candidate_rules.every((id) => registry.rules.find((rule) => rule.rule_id === id)?.status === "proposed"), expected_wrapper_result: { structural: "VALID", calculated_gate: "NO-GO", exit: 2 }, actual_rule_confirmation_performed: false, result: !m320Changed.length ? "PASS" : "FAIL" });

console.log(`A4_VERIFICATIONS_WRITTEN manifest=${manifestVerification.result} scanner_findings=${scanFindings.length} confirmed_rules=${currentConfirmed} frozen_changed=${frozenChanged.length} m320_changed=${m320Changed.length}`);
