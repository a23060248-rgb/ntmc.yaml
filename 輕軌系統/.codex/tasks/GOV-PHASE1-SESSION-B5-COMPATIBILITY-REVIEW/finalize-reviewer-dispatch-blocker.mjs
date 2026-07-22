import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { safeExistingPath } from "../../scripts/lib/path-safety.mjs";
import { canonicalSha256, sha256 } from "../../scripts/lib/governance/typed-proof.mjs";

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dir, "../../..");
const taskId = "GOV-PHASE1-SESSION-B5-COMPATIBILITY-REVIEW";
const base = `.codex/tasks/${taskId}`;
const read = async (ref) => readFile(await safeExistingPath(root, ref));
const json = async (ref) => JSON.parse((await read(ref)).toString("utf8"));
const write = async (name, value) => {
  const ref = `${base}/${name}`;
  const target = path.join(root, ...ref.split("/"));
  await mkdir(path.dirname(target), { recursive: true });
  const body = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
  await writeFile(target, body, { flag: "wx" });
  return { path: ref, sha256: sha256(body), byte_size: body.length };
};

const before = await json(`${base}/review-baseline-before.json`);
const afterFiles = [];
const changes = [];
for (const entry of before.files) {
  const body = await read(entry.relative_path);
  const digest = sha256(body);
  afterFiles.push({ ...entry, byte_size: body.length, sha256: digest });
  if (digest !== entry.sha256 || body.length !== entry.byte_size) changes.push({ path: entry.relative_path, before_sha256: entry.sha256, after_sha256: digest });
}
const manifestBytes = await read(before.candidate.manifest_ref);
const manifest = JSON.parse(manifestBytes.toString("utf8"));
const included = [];
for (const item of manifest.artifacts.filter((entry) => entry.commit_inclusion === true)) {
  const body = await read(item.path);
  const digest = sha256(body);
  included.push({ path: item.path, sha256: digest });
  if (digest !== item.sha256.toUpperCase()) changes.push({ path: item.path, before_sha256: item.sha256.toUpperCase(), after_sha256: digest });
}
included.sort((a, b) => a.path.localeCompare(b.path));
const manifestSha = sha256(manifestBytes);
const fileSetSha = canonicalSha256(included);
const candidateUnchanged = included.length === 103 && manifestSha === before.candidate.manifest_sha256 && fileSetSha === before.candidate.included_file_set_sha256;
const baselineResult = candidateUnchanged && changes.length === 0 ? "PASS" : "FAIL";
await write("review-baseline-after.json", { ...before, baseline_role: "after", files: afterFiles, candidate: { ...before.candidate, manifest_sha256: manifestSha, included_file_set_sha256: fileSetSha, file_count: included.length }, result: baselineResult });
await write("baseline-comparison.json", {
  schema_version: 1, task_id: taskId, candidate_file_count_before: 103, candidate_file_count_after: included.length,
  candidate_manifest_before: before.candidate.manifest_sha256, candidate_manifest_after: manifestSha,
  included_file_set_before: before.candidate.included_file_set_sha256, included_file_set_after: fileSetSha,
  protected_file_count: afterFiles.length, changed_files: changes, candidate_unchanged: candidateUnchanged,
  prohibited_files_not_read: before.prohibited_files_not_read,
  git_used: false, result: baselineResult
});

await write("reviewer-allocation-ledger.json", {
  schema_version: 1, task_id: taskId, allocation_mode: "strict_sequential",
  entries: [{ sequence: 1, reviewer_role: "code-reviewer", assignment_id: "ASSIGN-B5-CODE-6C602EC0-59B9-4D80-A41C-9DD3B94FD501", reviewer_run_id: "RUN-B5-CODE-A10D07B8-5DA5-48E5-A851-96DCC8425501", session_id: "SESSION-B5-CODE-23E4517B-57C8-47B0-9591-90DB95F19501", allocation_started: true, formal_artifact_completed: false, thread_closed: true, thread_terminal_state: "interrupted", capacity_released: true, result: "REVIEWER_DISPATCH_BLOCKER" }],
  later_reviewers_dispatched: 0, result: "REVIEWER_DISPATCH_BLOCKER"
});
await write("reviewer-dispatch-blocker.json", {
  schema_version: 1, task_id: taskId, blocker_type: "REVIEWER_DISPATCH_BLOCKER",
  failed_sequence: 1, failed_reviewer_role: "code-reviewer",
  reason: "The allocated fresh Code Reviewer identified fail-closed scope defects but did not produce any required formal artifact, access log, clean-context attestation, or output manifest and did not terminate after repeated completion requests. The root interrupted the still-running thread; no formal Reviewer outcome exists.",
  informal_diagnostic_not_formal_outcome: ["The exact Code scope references a non-existent reviewer-capacity-preflight.json.", "The exact Code scope does not authorize direct reads of candidate manifest, candidate record, or scanner report required to recompute the binding chain."],
  reviewer_outputs_present: 0, expected_reviewer_outputs: 4, root_may_rewrite_reviewer_outcome: false,
  subsequent_reviewer_dispatch_prohibited: true, deterministic_qa_executed: false, result: "BLOCKER"
});

const matrix = {
  schema_version: 1, task_id: taskId,
  findings: [
    { finding_id: "B2-CODE-FORBIDDEN-READ-001", closure_owner: "Code Reviewer", closure_status: "NOT_CLOSED", evidence: ["reviewer-dispatch-blocker.json"], reviewer_outcome_reference: null, access_scope_result: "FORMAL_ACCESS_LOG_NOT_PRODUCED", remaining_risk: "Fresh formal Code Reviewer outcome is absent.", blocks_b5_compatibility_gate: true },
    { finding_id: "B2-COMPAT-OFFICIAL-SECURITY-EVIDENCE-SCHEMA-001", closure_owner: "Governance Compatibility Reviewer", closure_status: "NOT_CLOSED", evidence: [], reviewer_outcome_reference: null, access_scope_result: "REVIEWER_NOT_DISPATCHED", remaining_risk: "Compatibility Reviewer was not dispatched.", blocks_b5_compatibility_gate: true },
    { finding_id: "B2-COMPAT-SECURITY-ALLOWLIST-FORBIDDEN-READ-001", closure_owner: "Governance Compatibility Reviewer", closure_status: "NOT_CLOSED", evidence: [], reviewer_outcome_reference: null, access_scope_result: "REVIEWER_NOT_DISPATCHED", remaining_risk: "Compatibility Reviewer was not dispatched.", blocks_b5_compatibility_gate: true },
    { finding_id: "B2-QA-THREAD-LIMIT-001", closure_owner: "Governance Compatibility Reviewer + Deterministic QA Gate", closure_status: "NOT_CLOSED", evidence: [], reviewer_outcome_reference: null, access_scope_result: "COMPATIBILITY_REVIEW_AND_QA_NOT_EXECUTED", remaining_risk: "Replacement control was not formally reviewed or executed.", blocks_b5_compatibility_gate: true }
  ],
  closed_count: 0, replaced_count: 0, not_closed_count: 4, result: "BLOCKER"
};
await write("b2-finding-closure-matrix.yaml", matrix);
await write("review-findings.yaml", {
  schema_version: 1, task_id: taskId,
  review_context: "Session B5 stopped fail-closed after the first Reviewer allocation failed to complete formal outputs.",
  reviews: [
    { type: "code", reviewer: "fresh-code-reviewer-allocation-incomplete", formal: false, outcome: "BLOCKER", finding_refs: ["B5-CODE-REVIEWER-OUTPUTS-MISSING"], conditions: [], decisions_required: [] },
    { type: "security", reviewer: "not-dispatched", formal: false, outcome: "BLOCKER", finding_refs: ["B5-SEQUENTIAL-STOP"], conditions: [], decisions_required: [] },
    { type: "railway-domain", reviewer: "not-dispatched", formal: false, outcome: "BLOCKER", finding_refs: ["B5-SEQUENTIAL-STOP"], conditions: [], decisions_required: [] },
    { type: "compatibility", reviewer: "not-dispatched", formal: false, outcome: "BLOCKER", finding_refs: ["B5-SEQUENTIAL-STOP"], conditions: [], decisions_required: [] }
  ],
  deterministic_qa_gate: { executed: false, result: "NOT_EXECUTED", reason: "Four formal Reviewer outcomes were not completed and frozen." },
  calculated_gate: "NO-GO", overall_gate: "NO-GO", bootstrap_human_commit_gate: "NO-GO",
  steady_state_preparation_gate: "DISABLED", steady_state_execution_gate: "DISABLED", migration_320_execution_gate: "NO-GO",
  blockers: ["REVIEWER_DISPATCH_BLOCKER", "FOUR_FORMAL_REVIEWER_SET_INCOMPLETE", "DETERMINISTIC_QA_NOT_EXECUTED"]
});
await write("session-b5-summary.json", {
  schema_version: 1, task_id: taskId, session_status: "ARCHIVED / REVIEWER_DISPATCH_BLOCKER",
  session_b_compatibility_gate: "NO-GO", eligible_for_human_exact_manifest_confirmation: false,
  bootstrap_human_commit_gate: "NO-GO", archived_a10_bootstrap_candidate_review: "GO",
  formal_reviewer_outcomes_completed: 0, reviewer_allocations_attempted: 1, later_reviewers_dispatched: 0,
  deterministic_qa_gate: "NOT_EXECUTED", fresh_deterministic_rerun: "NOT_EXECUTED",
  b2_findings_closed: 0, b2_findings_not_closed: 4,
  human_approval_artifact_created: false, remediation_created: false, candidate_modified: !candidateUnchanged,
  git_mutation: false, steady_state: "DISABLED", migration_320: "NEEDS_HUMAN_DECISION / NO-GO",
  result: "BLOCKER"
});

console.log("SESSION_B5_ARCHIVED_REVIEWER_DISPATCH_BLOCKER");
console.log(`CANDIDATE_UNCHANGED=${candidateUnchanged}`);
console.log(`PROTECTED_CHANGED=${changes.length}`);
console.log("REVIEWERS_COMPLETED=0/4");
console.log("DETERMINISTIC_QA=NOT_EXECUTED");
