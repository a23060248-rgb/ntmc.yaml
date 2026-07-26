import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  TASK_ID,
  EXPECTED_HEAD,
  EXPECTED_BRANCH,
  EXPECTED_TREE,
  taskRoot,
  gitRoot,
  taskRepoPrefix,
  ensureRoots,
  need,
  posix,
  sha256,
  jcsSha256,
  secureRead,
  secureJson,
  writeJson,
  writeText,
  gitText,
  predecessorBaseline,
  openingGitBindings,
  verifySubjectManifest,
  ValidationError,
} from "./lib.mjs";
import {
  writeTaskManifest,
  verifyTaskManifest,
} from "./generate-task-manifest.mjs";

const runner = path.join(taskRoot, "scripts", "run-43-case-matrix.mjs");
const validator = path.join(taskRoot, "scripts", "validate-production.mjs");

function spawnNode(script, args = []) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: taskRoot,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 1024,
  });
  let parsed = null;
  try {
    parsed = JSON.parse(String(result.stdout ?? "").trim());
  } catch {
    parsed = null;
  }
  return {
    exit_code: result.status,
    stdout: String(result.stdout ?? "").trim(),
    stderr: String(result.stderr ?? "").trim(),
    parsed,
  };
}

function scopedTaskStatus() {
  const repoPath = `輕軌系統/.codex/tasks/${TASK_ID}`;
  const status = gitText([
    "status",
    "--porcelain=v1",
    "--untracked-files=all",
    "--",
    repoPath,
  ]);
  const cached = gitText([
    "diff",
    "--cached",
    "--name-only",
    "--",
    repoPath,
  ]);
  return {
    pathspec: repoPath,
    status_lines: status.stdout.split(/\r?\n/u).filter(Boolean),
    status_stderr: status.stderr,
    staged_lines: cached.stdout.split(/\r?\n/u).filter(Boolean),
    staged_stderr: cached.stderr,
  };
}

function fileHash(relative) {
  const read = secureRead(path.join(taskRoot, relative), taskRoot, "STAGE_B_FILE");
  return { bytes: read.bytes.length, sha256: sha256(read.bytes) };
}

ensureRoots();
need(!fs.existsSync(path.join(taskRoot, "production-rejection-matrix-results.json")),
  "STAGE_B_ALREADY_STARTED");
need(!fs.existsSync(path.join(taskRoot, "task-artifact-manifest.json")),
  "FINAL_MANIFEST_ALREADY_EXISTS");

const subjectBefore = verifySubjectManifest();
const predecessorBefore = predecessorBaseline();
const openingBindings = openingGitBindings();
const taskStatusBefore = scopedTaskStatus();
need(taskStatusBefore.staged_lines.length === 0, "TASK_PATH_STAGED_BEFORE_STAGE_B");

const matrixRun = spawnNode(runner);
need(Boolean(matrixRun.parsed), "MATRIX_OUTPUT_NOT_JSON");
writeJson("production-rejection-matrix-results.json", {
  schema_version: 1,
  task_id: TASK_ID,
  verification_subject_manifest_hash: subjectBefore.internal_hash,
  runner_exit_code: matrixRun.exit_code,
  runner_stdout: matrixRun.parsed,
  runner_stderr: matrixRun.stderr || null,
  evidence_authority: "CANDIDATE_INTERNAL_CONSISTENCY_ONLY",
});
const matrixFile = fileHash("production-rejection-matrix-results.json");
const counts = {
  total_cases: matrixRun.parsed.total_cases,
  expected_rejection_confirmed:
    matrixRun.parsed.expected_rejection_confirmed,
  unexpected_acceptance: matrixRun.parsed.unexpected_acceptance,
  execution_error: matrixRun.parsed.execution_error,
  not_verified: matrixRun.parsed.not_verified,
};

const productionRun = spawnNode(validator);
need(Boolean(productionRun.parsed), "PRODUCTION_OUTPUT_NOT_JSON");
const closingBindingsForObservation = openingGitBindings();
const taskStatusAfterObservation = scopedTaskStatus();
need(taskStatusAfterObservation.staged_lines.length === 0,
  "TASK_PATH_STAGED_DURING_STAGE_B");
const ignoreInventoryFile = fileHash("git-ignore-source-inventory.json");
const predecessorAfterObservation = predecessorBaseline();
need(
  jcsSha256(predecessorBefore) === jcsSha256(predecessorAfterObservation),
  "PREDECESSOR_CHANGED_DURING_STAGE_B",
);
need(
  openingBindings.head === closingBindingsForObservation.head &&
    openingBindings.branch === closingBindingsForObservation.branch &&
    openingBindings.tree === closingBindingsForObservation.tree,
  "GIT_BINDING_DRIFT_DURING_STAGE_B",
);

const coherent43 =
  counts.total_cases === 43 &&
  counts.expected_rejection_confirmed === 43 &&
  counts.unexpected_acceptance === 0 &&
  counts.execution_error === 0 &&
  counts.not_verified === 0;
const productionBlockers = productionRun.parsed.blockers ?? [];
const observationVerdict =
  coherent43 &&
  productionRun.parsed.observation_verdict ===
    "READY_FOR_INDEPENDENT_WORK_VALIDATION" &&
  productionBlockers.length === 0
    ? "READY_FOR_INDEPENDENT_WORK_VALIDATION"
    : "BLOCKER";

writeJson("production-entry-observation.json", {
  schema_version: 1,
  task_id: TASK_ID,
  parent_head: EXPECTED_HEAD,
  observation_time: new Date().toISOString(),
  verification_subject_manifest_hash: subjectBefore.internal_hash,
  rejection_matrix_hash: matrixFile.sha256,
  rejection_matrix_bytes: matrixFile.bytes,
  ignore_source_snapshot_hash: ignoreInventoryFile.sha256,
  ignore_source_snapshot_bytes: ignoreInventoryFile.bytes,
  total_case_count: counts.total_cases,
  verified_case_count: counts.expected_rejection_confirmed,
  unexpected_acceptance_count: counts.unexpected_acceptance,
  execution_error_count: counts.execution_error,
  not_verified_count: counts.not_verified,
  git_mutation_check_before: {
    head: openingBindings.head,
    branch: openingBindings.branch,
    tree: openingBindings.tree,
    staged_task_path_count: taskStatusBefore.staged_lines.length,
  },
  git_mutation_check_after: {
    head: closingBindingsForObservation.head,
    branch: closingBindingsForObservation.branch,
    tree: closingBindingsForObservation.tree,
    staged_task_path_count:
      taskStatusAfterObservation.staged_lines.length,
  },
  exact_scoped_worktree_status_before: taskStatusBefore,
  exact_scoped_worktree_status_after: taskStatusAfterObservation,
  predecessor_byte_identity_status: "MATCH",
  predecessor_manifest_file_sha256:
    predecessorAfterObservation.manifest_file_sha256,
  trust_anchor_status: "PROPOSED_NOT_ADOPTED",
  production_validator_exit_code: productionRun.exit_code,
  production_validator_stdout: productionRun.parsed,
  production_validator_stderr: productionRun.stderr || null,
  observation_verdict: observationVerdict,
  git_mutation: "NO",
});
const observationFile = fileHash("production-entry-observation.json");

const blockers = [
  ...productionBlockers.map((item) => item.code),
  ...(!coherent43 ? ["FORTY_THREE_CASE_CONTRACT_NOT_CONFIRMED"] : []),
];
const uniqueBlockers = [...new Set(blockers)];
const candidateVerdict = uniqueBlockers.length === 0
  ? "READY_FOR_INDEPENDENT_WORK_VALIDATION"
  : "BLOCKER";

writeJson("validation-results.json", {
  schema_version: 1,
  task_id: TASK_ID,
  verification_subject_manifest_hash: subjectBefore.internal_hash,
  rejection_matrix_hash: matrixFile.sha256,
  production_observation_hash: observationFile.sha256,
  counts,
  ignore_evidence_status: uniqueBlockers.includes(
    "IGNORE_EVIDENCE_NOT_VERIFIED",
  )
    ? "NOT_VERIFIED"
    : "VERIFIED",
  predecessor_byte_identity_status: "MATCH",
  trust_anchor_status: "PROPOSED_NOT_ADOPTED",
  candidate_verdict: candidateVerdict,
  blockers: uniqueBlockers,
  git_mutation: "NO",
  downstream_actions_authorized: false,
});

writeJson("finalization-plan.json", {
  schema_version: 1,
  task_id: TASK_ID,
  verification_subject_manifest_hash: subjectBefore.internal_hash,
  rejection_matrix_hash: matrixFile.sha256,
  production_observation_hash: observationFile.sha256,
  counts,
  candidate_verdict: candidateVerdict,
  stage_b_sequence: [
    "matrix_written_after_stage_a_freeze",
    "production_observation_bound_to_matrix",
    "validation_summary_and_handoff_bound_to_same_hashes",
    "task_artifact_manifest_generated_last",
    "post_freeze_checks_read_only",
  ],
  writes_after_final_manifest_allowed: false,
  human_gate:
    "INDEPENDENT_WORK_READ_ONLY_VALIDATION_BEFORE_ANY_FUTURE_HUMAN_DECISION",
});

writeText(
  "final-summary.md",
  `# ${TASK_ID}

VERIFICATION_SUBJECT_MANIFEST_HASH: ${subjectBefore.internal_hash}

REJECTION_MATRIX_HASH: ${matrixFile.sha256}

PRODUCTION_OBSERVATION_HASH: ${observationFile.sha256}

43-CASE COUNTS: total=${counts.total_cases}; confirmed=${counts.expected_rejection_confirmed}; unexpected=${counts.unexpected_acceptance}; execution_error=${counts.execution_error}; not_verified=${counts.not_verified}

IGNORE_EVIDENCE_STATUS: ${uniqueBlockers.includes("IGNORE_EVIDENCE_NOT_VERIFIED") ? "NOT_VERIFIED" : "VERIFIED"}

PREDECESSOR_BYTE_IDENTITY_STATUS: MATCH

TRUST_ANCHOR_STATUS: PROPOSED_NOT_ADOPTED

CANDIDATE_VERDICT: ${candidateVerdict}

本 Task 僅建立 INTERNAL_CONSISTENCY_ONLY 候選證據。未授權 Trust Anchor 採用、Git 寫入、8A-0GC、產品實作、migration 或資料庫操作。
`,
);

writeText(
  "HANDOFF.md",
  `# HANDOFF

TASK_ID: ${TASK_ID}

CANDIDATE_VERDICT: ${candidateVerdict}

BOUND_HEAD: ${EXPECTED_HEAD}

BOUND_BRANCH: ${EXPECTED_BRANCH}

BOUND_TREE: ${EXPECTED_TREE}

VERIFICATION_SUBJECT_MANIFEST_HASH: ${subjectBefore.internal_hash}

REJECTION_MATRIX_HASH: ${matrixFile.sha256}

PRODUCTION_OBSERVATION_HASH: ${observationFile.sha256}

TOTAL_CASES: ${counts.total_cases}

EXPECTED_REJECTION_CONFIRMED: ${counts.expected_rejection_confirmed}

UNEXPECTED_ACCEPTANCE: ${counts.unexpected_acceptance}

EXECUTION_ERROR: ${counts.execution_error}

NOT_VERIFIED: ${counts.not_verified}

IGNORE_EVIDENCE_STATUS: ${uniqueBlockers.includes("IGNORE_EVIDENCE_NOT_VERIFIED") ? "NOT_VERIFIED" : "VERIFIED"}

PREDECESSOR_BYTE_IDENTITY_STATUS: MATCH

TRUST_ANCHOR_STATUS: PROPOSED_NOT_ADOPTED

GIT_MUTATION: NO

BLOCKERS: ${uniqueBlockers.length > 0 ? uniqueBlockers.join(", ") : "NONE"}

HUMAN_GATE: Independent Work read-only validation. This candidate does not authorize adoption or any downstream execution.

PROHIBITED_NEXT_ACTIONS: adopt, stage, commit, push, branch mutation, 8A-0GC, Product Implementation, migration, database operations.
`,
);

const subjectClosing = verifySubjectManifest();
need(subjectClosing.internal_hash === subjectBefore.internal_hash,
  "SUBJECT_CHANGED_BEFORE_FINAL_MANIFEST");
const predecessorClosing = predecessorBaseline();
need(jcsSha256(predecessorClosing) === jcsSha256(predecessorBefore),
  "PREDECESSOR_CHANGED_BEFORE_FINAL_MANIFEST");
const gitClosing = openingGitBindings();
need(
  gitClosing.head === openingBindings.head &&
    gitClosing.branch === openingBindings.branch &&
    gitClosing.tree === openingBindings.tree,
  "GIT_BINDING_CHANGED_BEFORE_FINAL_MANIFEST",
);
const finalStatusBeforeManifest = scopedTaskStatus();
need(finalStatusBeforeManifest.staged_lines.length === 0,
  "TASK_PATH_STAGED_BEFORE_FINAL_MANIFEST");

writeTaskManifest();

const frozenManifestBytes = secureRead(
  path.join(taskRoot, "task-artifact-manifest.json"),
  taskRoot,
  "FROZEN_TASK_MANIFEST",
).bytes;
const finalVerification = verifyTaskManifest();
const postFreezeSubject = verifySubjectManifest();
const postFreezePredecessor = predecessorBaseline();
const postFreezeGit = openingGitBindings();
const postFreezeStatus = scopedTaskStatus();
need(
  secureRead(
    path.join(taskRoot, "task-artifact-manifest.json"),
    taskRoot,
    "FROZEN_TASK_MANIFEST_REBOUND",
  ).bytes.equals(frozenManifestBytes),
  "FINAL_MANIFEST_CHANGED_AFTER_FREEZE",
);
need(postFreezeSubject.internal_hash === subjectBefore.internal_hash,
  "SUBJECT_CHANGED_AFTER_FINAL_FREEZE");
need(jcsSha256(postFreezePredecessor) === jcsSha256(predecessorBefore),
  "PREDECESSOR_CHANGED_AFTER_FINAL_FREEZE");
need(
  postFreezeGit.head === openingBindings.head &&
    postFreezeGit.branch === openingBindings.branch &&
    postFreezeGit.tree === openingBindings.tree,
  "GIT_BINDING_CHANGED_AFTER_FINAL_FREEZE",
);
need(postFreezeStatus.staged_lines.length === 0,
  "TASK_PATH_STAGED_AFTER_FINAL_FREEZE");

process.stdout.write(
  `${JSON.stringify({
    task_id: TASK_ID,
    final_status: candidateVerdict,
    handoff_path: path.join(taskRoot, "HANDOFF.md"),
    bound_head: EXPECTED_HEAD,
    bound_branch: EXPECTED_BRANCH,
    bound_tree: EXPECTED_TREE,
    verification_subject_manifest_hash: subjectBefore.internal_hash,
    task_artifact_manifest_internal_hash:
      finalVerification.manifest.internal_manifest_sha256,
    task_artifact_manifest_external_file_sha256:
      finalVerification.external_file_sha256,
    physical_file_count: finalVerification.physical_file_count,
    manifest_entry_count: finalVerification.manifest.entry_count,
    case_counts: counts,
    ignore_evidence_status:
      uniqueBlockers.includes("IGNORE_EVIDENCE_NOT_VERIFIED")
        ? "NOT_VERIFIED"
        : "VERIFIED",
    predecessor_byte_identity_status: "MATCH",
    files_created: finalVerification.physical_file_count,
    files_modified: 0,
    git_mutation: "NO",
    unverified_items: uniqueBlockers,
    human_gate: "INDEPENDENT_WORK_READ_ONLY_VALIDATION",
    prohibited_next_actions:
      "adopt, stage, commit, push, branch mutation, 8A-0GC, Product Implementation, migration, database operations",
  }, null, 2)}\n`,
);
