import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { safeExistingPath } from "../../scripts/lib/path-safety.mjs";
import { canonicalSha256, sha256 } from "../../scripts/lib/governance/typed-proof.mjs";

const taskId = "GOV-PHASE1-SESSION-B3-COMPATIBILITY-REVIEW";
const taskRel = `.codex/tasks/${taskId}`;
const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dir, "../../..");
const readBytes = async (ref) => readFile(await safeExistingPath(root, ref));
const readJson = async (ref) => JSON.parse((await readBytes(ref)).toString("utf8"));
async function writeJson(name, value) {
  const target = path.join(dir, ...name.split("/"));
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
}
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const before = await readJson(`${taskRel}/review-baseline-before.json`);
const preflight = await readJson(`${taskRel}/reviewer-capacity-preflight-runtime.json`);
const preManifestBytes = await readBytes(`${taskRel}/pre-review-input-manifest.json`);
const freeze = await readJson(`${taskRel}/pre-review-freeze.json`);
assert(preflight.preflight_status === "B3_PRECHECK_BLOCKER", "PREFLIGHT_NOT_BLOCKED");
assert(preflight.dispatch_probe.reviewer_thread_started === false, "REVIEWER_UNEXPECTEDLY_STARTED");
assert(sha256(preManifestBytes) === freeze.input_manifest_sha256, "PREFLIGHT_REFREEZE_MANIFEST_MISMATCH");
for (const item of freeze.frozen_files) {
  const current = await readBytes(item.path);
  assert(sha256(current) === item.sha256 && current.length === item.byte_size, `PREFLIGHT_REFREEZE_INPUT_MISMATCH:${item.path}`);
}

const manifestBytes = await readBytes(before.candidate.manifest_path);
const manifest = JSON.parse(manifestBytes);
const included = manifest.artifacts.filter((item) => item.commit_inclusion === true);
const currentCandidate = [];
for (const item of included) {
  const body = await readBytes(item.path);
  currentCandidate.push({ path: item.path, sha256: sha256(body), byte_size: body.length });
}
currentCandidate.sort((a, b) => a.path.localeCompare(b.path));
const candidateSetSha = canonicalSha256(currentCandidate.map(({ path: p, sha256: h }) => ({ path: p, sha256: h })));
const candidateMismatch = currentCandidate.filter((item, index) => {
  const expected = before.candidate.files[index];
  return !expected || item.path !== expected.path || item.sha256 !== expected.sha256 || item.byte_size !== expected.byte_size;
});
assert(sha256(manifestBytes) === before.candidate.manifest_sha256, "AFTER_MANIFEST_MISMATCH");
assert(currentCandidate.length === 103 && candidateMismatch.length === 0, "AFTER_CANDIDATE_MISMATCH");
assert(candidateSetSha === before.candidate.included_file_set_sha256, "AFTER_FILE_SET_MISMATCH");

const inheritedBytes = await readBytes(before.inherited_protected_snapshot.source_path);
const r11ManifestBytes = await readBytes(before.remediation_11_snapshot.artifact_manifest_path);
const inheritedRecordUnchanged = sha256(inheritedBytes) === before.inherited_protected_snapshot.source_sha256;
const r11ManifestUnchanged = sha256(r11ManifestBytes) === before.remediation_11_snapshot.artifact_manifest_sha256;
assert(inheritedRecordUnchanged && r11ManifestUnchanged, "FROZEN_HISTORY_RECORD_CHANGED");

await writeJson("reviewer-dispatch-failure.json", {
  schema_version: 1,
  task_id: taskId,
  phase: "PRE_WAVE_1_CAPACITY_PREFLIGHT",
  requested_reviewer_role: "code-reviewer",
  requested_reviewer_run_id: "B3-CODE-RUN-61D36D0F-3B37-48FD-926A-7360AC1CFB28",
  requested_session_id: "B3-CODE-SESSION-98C4D5B6-267C-43B6-87E8-0E2D10B7A29F",
  result: "REJECTED",
  exact_error: "collab spawn failed: agent thread limit reached",
  reviewer_thread_started: false,
  wave_1_started: false,
  additional_reviewer_dispatch_attempted: false,
  qa_capacity_proven: false,
  required_disposition: "B3_PRECHECK_BLOCKER",
  root_did_not_substitute_for_reviewer: true
});

const findingRows = [
  ["B2-CODE-FORBIDDEN-READ-001", "BLOCKER", "code-reviewer"],
  ["B2-COMPAT-OFFICIAL-SECURITY-EVIDENCE-SCHEMA-001", "BLOCKER", "compatibility-reviewer"],
  ["B2-COMPAT-SECURITY-ALLOWLIST-FORBIDDEN-READ-001", "BLOCKER", "compatibility-reviewer"],
  ["B2-QA-THREAD-LIMIT-001", "BLOCKER", "qa-engineer"]
].map(([finding_id, original_severity, closure_owner]) => ({
  finding_id,
  original_severity,
  closure_owner,
  closure_status: "NOT_CLOSED",
  evidence: ["No designated fresh formal Reviewer outcome exists because live reviewer dispatch failed before Wave 1."],
  production_or_procedural_retest: "NOT_RUN_PRECHECK_BLOCKER",
  access_scope_result: "NO_REVIEWER_ACCESS_OCCURRED",
  remaining_risk: "The historical blocker remains open pending a separately authorized run with demonstrably available fresh Reviewer capacity.",
  blocks_b3_compatibility_gate: true
}));
await writeJson("b2-finding-closure-matrix.yaml", {
  schema_version: 1,
  task_id: taskId,
  findings: findingRows,
  root_declared_closures: [],
  closed_count: 0,
  not_closed_count: 4,
  result: "BLOCKER"
});

const reruns = [
  ["syntax-rerun.json", "Syntax", "18/18"],
  ["fixture-rerun.json", "Governance fixtures", "68/68"],
  ["concurrency-regression.json", "Concurrency", "PASS"],
  ["production-scanner-rerun.json", "Production scanner", "72/72"],
  ["production-integration-rerun.json", "Production integration", "48/48"],
  ["production-mutation-rerun.json", "Production mutations", "31/31 killed"],
  ["reviewer-binding-rerun.json", "Reviewer binding", "14/14"],
  ["official-schema-loader-rerun.json", "Official loader integration", "11/11"],
  ["schema-loader-mutation-rerun.json", "Schema-loader mutations", "6/6 killed"],
  ["binary-magic-mutation-rerun.json", "Binary mutations", "45/45 killed"],
  ["remediation-10-chain-rerun.json", "Remediation 10 chain", "20/20"],
  ["remediation-11-preparation-rerun.json", "R11 preparation tests", "30/30"]
];
for (const [name, suite, requiredResult] of reruns) {
  await writeJson(name, {
    schema_version: 1,
    task_id: taskId,
    suite,
    required_result: requiredResult,
    execution_status: "NOT_RUN",
    reason: "B3_PRECHECK_BLOCKER requires termination before Wave 1 and before fresh deterministic reruns.",
    result: "NOT_VERIFIED"
  });
}

await writeJson("migration-320-compatibility.json", {
  schema_version: 1,
  task_id: taskId,
  domain_decision: "NEEDS_HUMAN_DECISION",
  execution_gate: "NO-GO",
  compatibility_review_executed: false,
  candidate_gate_affected: false,
  actual_maintenance_rule_approved: false,
  implementation_handoff_read: false,
  implementation_plan_read: false,
  result: "PRESERVED_NO_GO"
});
await writeJson("historical-artifact-integrity.json", {
  schema_version: 1,
  task_id: taskId,
  candidate_file_count: 103,
  candidate_manifest_unchanged: true,
  candidate_file_set_unchanged: true,
  inherited_protected_snapshot_file_count: before.inherited_protected_snapshot.file_count,
  inherited_protected_snapshot_record_unchanged: inheritedRecordUnchanged,
  remediation_11_artifact_manifest_unchanged: r11ManifestUnchanged,
  migration_320_task_artifact_count: before.inherited_protected_snapshot.counts["migration-320-task"],
  migration_320_external_evidence_count: before.inherited_protected_snapshot.counts["migration-320-external-evidence"],
  b3_writes_limited_to_task_directory: true,
  git_commands_run: false,
  git_state_not_inspected_due_explicit_prohibition: true,
  assurance: "INTERNAL_CONSISTENCY_ONLY",
  result: "PASS"
});
await writeJson("review-baseline-after.json", {
  schema_version: 1,
  task_id: taskId,
  baseline_role: "after_precheck_blocker",
  captured_at: new Date().toISOString(),
  git_used: false,
  candidate: {
    manifest_path: before.candidate.manifest_path,
    manifest_sha256: sha256(manifestBytes),
    file_count: currentCandidate.length,
    included_file_set_sha256: candidateSetSha,
    all_file_hashes_match: candidateMismatch.length === 0,
    files: currentCandidate
  },
  inherited_protected_snapshot: {
    source_path: before.inherited_protected_snapshot.source_path,
    source_sha256: sha256(inheritedBytes),
    file_count: before.inherited_protected_snapshot.file_count,
    unchanged: inheritedRecordUnchanged
  },
  remediation_11_snapshot: {
    artifact_manifest_path: before.remediation_11_snapshot.artifact_manifest_path,
    artifact_manifest_sha256: sha256(r11ManifestBytes),
    manifest_artifact_count: before.remediation_11_snapshot.manifest_artifact_count,
    unchanged: r11ManifestUnchanged
  },
  result: "PASS"
});
await writeJson("baseline-comparison.json", {
  schema_version: 1,
  task_id: taskId,
  candidate_before_count: before.candidate.file_count,
  candidate_after_count: currentCandidate.length,
  candidate_manifest_unchanged: true,
  candidate_file_set_unchanged: true,
  candidate_hash_mismatches: candidateMismatch,
  inherited_protected_snapshot_record_unchanged: inheritedRecordUnchanged,
  remediation_11_artifact_manifest_unchanged: r11ManifestUnchanged,
  historical_outcomes_modified: false,
  b3_only_task_local_artifacts_added: true,
  git_mutation_performed: false,
  result: "PASS"
});

await writeJson("review-findings.yaml", {
  schema_version: 1,
  task_id: taskId,
  review_context: "Session B3 terminated before Wave 1 because fresh Reviewer capacity was unavailable.",
  reviews: [{
    type: "qa-readback",
    reviewer: "capacity-preflight",
    formal: false,
    outcome: "BLOCKER",
    finding_refs: ["B3-PRECHECK-THREAD-CAPACITY-001"],
    conditions: [],
    decisions_required: []
  }],
  calculated_gate: "NO-GO",
  overall_gate: "NO-GO",
  bootstrap_candidate_review_gate: "GO",
  eligible_to_start_session_b: false,
  bootstrap_human_commit_gate: "NO-GO",
  steady_state_preparation_gate: "DISABLED",
  steady_state_execution_gate: "DISABLED",
  migration_320_execution_gate: "NO-GO",
  blockers: [
    "B3-PRECHECK-THREAD-CAPACITY-001: no fresh Reviewer slot was available and fifth-reviewer QA capacity could not be proven.",
    "All four Session B2 findings remain NOT_CLOSED because no designated B3 formal Reviewer executed."
  ],
  conditions: []
});
await writeJson("test-evidence.yaml", {
  schema_version: 1,
  task_id: taskId,
  evidence_mode: "precheck_blocker_read_only_governance_evidence",
  commands: [
    "node --check .codex/tasks/GOV-PHASE1-SESSION-B3-COMPATIBILITY-REVIEW/prepare-session-b3.mjs",
    "node .codex/tasks/GOV-PHASE1-SESSION-B3-COMPATIBILITY-REVIEW/prepare-session-b3.mjs",
    "collaboration spawn_agent for fresh B3 Code Reviewer"
  ],
  checks: [
    { check_id: "B3-PRECHECK-INPUTS", requirement_id: "B3-R11-PACKAGE", result: "PASS", note: "R11 source package 15/15 and B3 materialized pre-review freeze were hash verified." },
    { check_id: "B3-PRECHECK-CANDIDATE", requirement_id: "B3-CANDIDATE-BASELINE", result: "PASS", note: "The exact 103-file candidate and manifest/file-set hashes were recomputed." },
    { check_id: "B3-PRECHECK-SECURITY", requirement_id: "B3-SECURITY-SCHEMA", result: "PASS", note: "Registered production schema validation returned zero issues and the 124-entry allowlist contained zero prohibited M320 paths." },
    { check_id: "B3-PRECHECK-CAPACITY", requirement_id: "B3-EXACT-SCOPES", result: "FAIL", note: "The first fresh Reviewer spawn was rejected with agent thread limit reached; QA capacity is therefore not proven." },
    { check_id: "B3-FRESH-RERUN", requirement_id: "B3-FRESH-RERUN", result: "NOT_VERIFIED", note: "Fresh deterministic suites were not run because the explicit precheck stop condition fired before Wave 1." }
  ],
  product_tests_run: false,
  database_operations_run: false,
  limitations: ["No formal B3 Reviewer executed.", "No deterministic fresh rerun executed after the precheck blocker.", "Git state was not inspected because all Git operations were prohibited."]
});
await writeJson("traceability.yaml", {
  schema_version: 1,
  task_id: taskId,
  edges: [
    { from: "R11_PRE_REVIEW_PACKAGE", to: "B3_PRE_REVIEW_FREEZE", evidence: `${taskRel}/r11-source-package-verification.json`, result: "PASS" },
    { from: "B3_PRE_REVIEW_FREEZE", to: "B3_LIVE_CAPACITY", evidence: `${taskRel}/reviewer-capacity-preflight-runtime.json`, result: "BLOCKER" },
    { from: "B3_LIVE_CAPACITY", to: "WAVE_1", evidence: `${taskRel}/reviewer-dispatch-failure.json`, result: "NOT_STARTED" },
    { from: "WAVE_1", to: "B2_FINDING_CLOSURE", evidence: `${taskRel}/b2-finding-closure-matrix.yaml`, result: "NOT_CLOSED" },
    { from: "B3_PRECHECK_BLOCKER", to: "SESSION_B_COMPATIBILITY_GATE", evidence: `${taskRel}/review-findings.yaml`, result: "NO-GO" }
  ]
});
await writeJson("validation-results.json", {
  schema_version: 1,
  task_id: taskId,
  pre_review_source_package: "15/15 PASS",
  materialized_pre_review_freeze: "PASS",
  candidate_integrity: "103/103 PASS",
  security_registered_schema: "PASS",
  security_allowlist_forbidden_paths: 0,
  live_reviewer_capacity: "B3_PRECHECK_BLOCKER",
  formal_reviewer_count: 0,
  b2_findings_closed: 0,
  deterministic_fresh_rerun: "NOT_RUN",
  baseline_comparison: "PASS",
  result: "BLOCKER"
});
await writeJson("session-b3-summary.json", {
  schema_version: 1,
  task_id: taskId,
  session_status: "ARCHIVED",
  outcome: "BLOCKER",
  blocker_code: "B3_PRECHECK_BLOCKER",
  wave_1_started: false,
  formal_reviewer_count: 0,
  session_b_compatibility_gate: "NO-GO",
  archived_a10_bootstrap_candidate_review: "GO",
  eligible_for_human_exact_manifest_confirmation: false,
  human_exact_manifest_confirmation: "NOT_ELIGIBLE",
  human_approval_artifact_created: false,
  bootstrap_human_commit_gate: "NO-GO",
  steady_state_preparation_gate: "DISABLED",
  steady_state_execution_gate: "DISABLED",
  migration_320_domain_decision: "NEEDS_HUMAN_DECISION",
  migration_320_execution_gate: "NO-GO",
  git_mutation_performed: false,
  next_required_action: "Use a separately authorized fresh root task with five fresh Reviewer slots demonstrably available before Wave 1.",
  result: "BLOCKER"
});

await writeFile(path.join(dir, "HANDOFF.md"), `# GOV-PHASE1-SESSION-B3-COMPATIBILITY-REVIEW Handoff

## Result

ARCHIVED / BLOCKER — B3_PRECHECK_BLOCKER.

## Evidence

- Candidate 103/103 and fixed manifest/file-set hashes remained unchanged.
- R11 source package 15/15 and registered Security schema checks passed.
- The first fresh Code Reviewer spawn was rejected with \`agent thread limit reached\`; no Reviewer thread started.
- All four B2 findings remain NOT_CLOSED.

## Gates

Archived A10 Candidate Review remains GO. Session B Compatibility and Bootstrap Human Commit remain NO-GO. Steady-State remains DISABLED. Migration 320 remains NEEDS_HUMAN_DECISION / NO-GO.

## Next step

Human may separately authorize a fresh root B3 run after ensuring five fresh Reviewer sessions can be dispatched. No Git or downstream approval is authorized.
`, { encoding: "utf8", flag: "wx" });

console.log(JSON.stringify({
  result: "BLOCKER",
  blocker_code: "B3_PRECHECK_BLOCKER",
  candidate_files: currentCandidate.length,
  candidate_mismatches: candidateMismatch.length,
  protected_snapshot_unchanged: inheritedRecordUnchanged,
  r11_manifest_unchanged: r11ManifestUnchanged,
  formal_reviewers_started: 0,
  b2_findings_closed: 0
}));
