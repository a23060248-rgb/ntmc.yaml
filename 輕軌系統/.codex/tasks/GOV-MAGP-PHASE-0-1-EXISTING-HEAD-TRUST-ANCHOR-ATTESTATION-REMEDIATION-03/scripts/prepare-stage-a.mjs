import fs from "node:fs";
import path from "node:path";
import {
  TASK_ID,
  PREDECESSOR_ID,
  EXPECTED_HEAD,
  EXPECTED_BRANCH,
  EXPECTED_TREE,
  EXPECTED_PREDECESSOR_MATRIX_SHA256,
  EXPECTED_AUTHORIZATION_ATTACHMENT_SHA256,
  taskRoot,
  productRoot,
  gitRoot,
  predecessorRoot,
  taskRepoPrefix,
  subjectManifestRepoPath,
  ensureRoots,
  need,
  posix,
  sha256,
  jcsSha256,
  compareCodePoints,
  secureRead,
  secureJson,
  listFilesStrict,
  writeJson,
  writeText,
  git,
  gitText,
  validateRepoPath,
  predecessorBaseline,
  openingGitBindings,
  verificationSubjectHash,
  verifySubjectManifest,
  detectEncoding,
  batch,
  parseTreeLine,
  parseIndexLine,
} from "./lib.mjs";

function readPredecessorMatrix() {
  const absolute = path.join(
    predecessorRoot,
    "production-rejection-matrix-results.json",
  );
  const read = secureJson(absolute, predecessorRoot, "PREDECESSOR_MATRIX");
  need(sha256(read.bytes) === EXPECTED_PREDECESSOR_MATRIX_SHA256,
    "PREDECESSOR_MATRIX_HASH_MISMATCH");
  const matrix = read.value.observed_stdout;
  need(matrix?.case_count === 43, "PREDECESSOR_CASE_COUNT_MISMATCH");
  need(Array.isArray(matrix.cases) && matrix.cases.length === 43,
    "PREDECESSOR_CASE_ARRAY_INVALID");
  const seen = new Set();
  for (const item of matrix.cases) {
    need(typeof item.case_id === "string" && !seen.has(item.case_id),
      "PREDECESSOR_CASE_ID_INVALID");
    seen.add(item.case_id);
  }
  return { read, matrix };
}

function readCandidateEvidence() {
  const absolute = path.join(predecessorRoot, "production-entry-observation.json");
  const read = secureJson(absolute, predecessorRoot, "PREDECESSOR_OBSERVATION");
  const entries = read.value.observed_stdout?.opening_evidence?.candidate_entries;
  need(Array.isArray(entries) && entries.length === 147,
    "CANDIDATE_EVIDENCE_COUNT_INVALID");
  return { read, entries };
}

function verifyCandidate(entries) {
  const paths = entries.map((entry) => entry.repository_relative_path);
  const seen = new Set();
  const collision = new Set();
  for (const repositoryPath of paths) {
    validateRepoPath(repositoryPath);
    need(!seen.has(repositoryPath), "CANDIDATE_DUPLICATE_PATH");
    seen.add(repositoryPath);
    const collisionKey = repositoryPath.normalize("NFC").toLocaleLowerCase("en-US");
    need(!collision.has(collisionKey), "CANDIDATE_CASE_OR_NFC_COLLISION");
    collision.add(collisionKey);
  }
  need(entries.filter((item) => item.partition === "SOURCE_7A_2").length === 106,
    "CANDIDATE_SOURCE_PARTITION_MISMATCH");
  need(entries.filter((item) => item.partition === "ATTEMPT_1").length === 41,
    "CANDIDATE_ATTEMPT_PARTITION_MISMATCH");

  const tree = new Map();
  const index = new Map();
  const status = [];
  const worktreeDiff = [];
  const indexDiff = [];
  const diagnostics = [];
  for (const group of batch(paths)) {
    const treeResult = gitText([
      "-c",
      "core.quotePath=false",
      "ls-tree",
      `--format=%(objectmode)|%(objecttype)|%(objectname)|%(path)`,
      EXPECTED_HEAD,
      "--",
      ...group,
    ]);
    diagnostics.push(treeResult.stderr);
    for (const line of treeResult.stdout.split(/\r?\n/u).filter(Boolean)) {
      const parsed = parseTreeLine(line);
      tree.set(parsed.path, parsed);
    }
    const indexResult = gitText([
      "-c",
      "core.quotePath=false",
      "ls-files",
      "--stage",
      "--",
      ...group,
    ]);
    diagnostics.push(indexResult.stderr);
    for (const line of indexResult.stdout.split(/\r?\n/u).filter(Boolean)) {
      const parsed = parseIndexLine(line);
      index.set(parsed.path, parsed);
    }
    const statusResult = gitText([
      "status",
      "--porcelain=v1",
      "--untracked-files=all",
      "--",
      ...group,
    ]);
    diagnostics.push(statusResult.stderr);
    status.push(...statusResult.stdout.split(/\r?\n/u).filter(Boolean));
    const worktreeResult = gitText(["diff", "--name-only", "--", ...group]);
    diagnostics.push(worktreeResult.stderr);
    worktreeDiff.push(...worktreeResult.stdout.split(/\r?\n/u).filter(Boolean));
    const indexResultDiff = gitText([
      "diff",
      "--cached",
      "--name-only",
      "--",
      ...group,
    ]);
    diagnostics.push(indexResultDiff.stderr);
    indexDiff.push(...indexResultDiff.stdout.split(/\r?\n/u).filter(Boolean));
  }
  need(status.length === 0, "CANDIDATE_STATUS_NOT_CLEAN");
  need(worktreeDiff.length === 0, "CANDIDATE_WORKTREE_DIFF_EXISTS");
  need(indexDiff.length === 0, "CANDIDATE_INDEX_DIFF_EXISTS");
  need(tree.size === 147 && index.size === 147, "CANDIDATE_GIT_COUNT_MISMATCH");

  const verified = [];
  for (const expected of entries) {
    const repositoryPath = expected.repository_relative_path;
    const absolute = path.join(gitRoot, ...repositoryPath.split("/"));
    const read = secureRead(absolute, productRoot, "CANDIDATE_FILE");
    const treeEntry = tree.get(repositoryPath);
    const indexEntry = index.get(repositoryPath);
    need(Boolean(treeEntry) && Boolean(indexEntry),
      "CANDIDATE_GIT_ENTRY_MISSING", { path: repositoryPath });
    need(read.bytes.length === expected.bytes, "CANDIDATE_BYTES_MISMATCH", {
      path: repositoryPath,
    });
    need(sha256(read.bytes) === expected.sha256, "CANDIDATE_HASH_MISMATCH", {
      path: repositoryPath,
    });
    need(treeEntry.oid === expected.head_blob_oid,
      "CANDIDATE_HEAD_OID_MISMATCH", { path: repositoryPath });
    need(indexEntry.oid === expected.index_blob_oid && indexEntry.stage === 0,
      "CANDIDATE_INDEX_OID_MISMATCH", { path: repositoryPath });
    need(treeEntry.oid === indexEntry.oid, "CANDIDATE_HEAD_INDEX_MISMATCH", {
      path: repositoryPath,
    });
    verified.push({
      repository_relative_path: repositoryPath,
      partition: expected.partition,
      bytes: read.bytes.length,
      sha256: sha256(read.bytes),
      head_mode: treeEntry.mode,
      head_blob_oid: treeEntry.oid,
      index_mode: indexEntry.mode,
      index_blob_oid: indexEntry.oid,
      attributes: expected.attributes,
    });
  }
  return {
    exact_path_count: verified.length,
    source_7a_2_count: 106,
    attempt_1_count: 41,
    scoped_status_count: status.length,
    scoped_worktree_diff_count: worktreeDiff.length,
    scoped_index_diff_count: indexDiff.length,
    git_diagnostics: [...new Set(diagnostics.filter(Boolean))],
    entries: verified,
    binding_sha256: jcsSha256(verified),
  };
}

function copyFixtureInputs(matrix) {
  const oldFixtureRoot = path.join(predecessorRoot, "test-fixtures");
  const fixtureById = new Map();
  for (const absolute of listFilesStrict(oldFixtureRoot, "OLD_FIXTURES")) {
    const read = secureJson(absolute, oldFixtureRoot, "OLD_FIXTURE");
    fixtureById.set(read.value.fixture_id, {
      absolute,
      bytes: read.bytes,
      value: read.value,
      name: path.basename(absolute),
    });
  }
  const definitionRows = [];
  for (let ordinal = 0; ordinal < matrix.cases.length; ordinal += 1) {
    const source = matrix.cases[ordinal];
    const fixture = fixtureById.get(source.case_id);
    let inputPath = null;
    let inputExistence = "NOT_APPLICABLE";
    if (fixture) {
      const relative = path.join("fixtures", "predecessor", fixture.name);
      const absolute = path.join(taskRoot, relative);
      fs.mkdirSync(path.dirname(absolute), { recursive: true });
      fs.writeFileSync(absolute, fixture.bytes);
      inputPath = `${taskRepoPrefix}${posix(relative)}`;
      inputExistence = "PRESENT_AND_HASH_BOUND";
    }
    if (source.case_id === "fixture-reparse-scope-escape") {
      const relative = path.join("fixtures", "reparse-target", "fixture.json");
      writeJson(relative, {
        fixture_id: source.case_id,
        mutation: { kind: "wrong_head" },
        expected_error_code: source.expected_error_code,
      });
      inputPath = `${taskRepoPrefix}${posix(relative)}`;
      inputExistence = "PRESENT_TARGET_FOR_EPHEMERAL_REPARSE_LINK";
    }
    const expectedError = source.expected_error_code ??
      source.observed_error_code ??
      "CLI_USAGE_ERROR";
    definitionRows.push({
      ordinal: ordinal + 1,
      case_id: source.case_id,
      purpose:
        `Reproduce the frozen predecessor meaning by requiring ${expectedError} ` +
        `for ${source.test_type}.`,
      source_matrix_sha256: EXPECTED_PREDECESSOR_MATRIX_SHA256,
      predecessor_test_type: source.test_type,
      predecessor_mutation: source.mutation ?? null,
      predecessor_args: source.args ?? null,
      predecessor_expected_error_code: expectedError,
      predecessor_actual_result: source.result,
      input_path: inputPath,
      input_path_existence_state: inputExistence,
      expected_result: "EXPECTED_REJECTION_CONFIRMED",
      required_exit_code: 2,
      definition_weakening_allowed: false,
    });
  }
  return definitionRows;
}

function collectGitignoreCandidates(candidatePaths) {
  const values = new Set([
    path.join(gitRoot, ".gitignore"),
    path.join(productRoot, ".gitignore"),
  ]);
  for (const repositoryPath of candidatePaths) {
    const parts = repositoryPath.split("/");
    for (let index = 1; index < parts.length; index += 1) {
      values.add(
        path.join(gitRoot, ...parts.slice(0, index), ".gitignore"),
      );
    }
  }
  return [...values].sort(compareCodePoints);
}

function snapshotIgnoreSources(candidatePaths) {
  const sources = [];
  const checkedGitignores = collectGitignoreCandidates(candidatePaths);
  let nestedExistingCount = 0;
  for (const absolute of checkedGitignores) {
    const exists = fs.existsSync(absolute) && fs.lstatSync(absolute).isFile();
    const repositoryRelative = posix(path.relative(gitRoot, absolute));
    const sourceType = absolute === path.join(gitRoot, ".gitignore")
      ? "REPOSITORY_ROOT_GITIGNORE"
      : absolute === path.join(productRoot, ".gitignore")
        ? "PRODUCT_ROOT_GITIGNORE"
        : "NESTED_GITIGNORE";
    if (!exists) {
      sources.push({
        source_type: sourceType,
        source_path: repositoryRelative,
        exists: false,
        sha256: null,
        bytes: null,
        encoding: null,
        config_origin: null,
        applicable_scope: "ANCESTOR_SCOPE_FOR_BOUND_147_PATHS",
        read_result: "ABSENT",
        snapshot_path: null,
      });
      continue;
    }
    if (sourceType === "NESTED_GITIGNORE") nestedExistingCount += 1;
    const read = secureRead(absolute, gitRoot, "GITIGNORE_SOURCE");
    const snapshotName = sourceType === "REPOSITORY_ROOT_GITIGNORE"
      ? "repository-root.gitignore.snapshot"
      : sourceType === "PRODUCT_ROOT_GITIGNORE"
        ? "product-root.gitignore.snapshot"
        : `nested-${sha256(Buffer.from(repositoryRelative, "utf8")).slice(0, 16)}.snapshot`;
    const snapshotRelative = path.join("git-ignore-source-snapshots", snapshotName);
    const snapshotAbsolute = path.join(taskRoot, snapshotRelative);
    fs.mkdirSync(path.dirname(snapshotAbsolute), { recursive: true });
    fs.writeFileSync(snapshotAbsolute, read.bytes);
    sources.push({
      source_type: sourceType,
      source_path: repositoryRelative,
      exists: true,
      sha256: sha256(read.bytes),
      bytes: read.bytes.length,
      encoding: detectEncoding(read.bytes),
      config_origin: null,
      applicable_scope: "ANCESTOR_SCOPE_FOR_BOUND_147_PATHS",
      read_result: "READ_AND_SNAPSHOTTED",
      snapshot_path: `${taskRepoPrefix}${posix(snapshotRelative)}`,
    });
  }

  const excludeAbsolute = path.join(gitRoot, ".git", "info", "exclude");
  if (fs.existsSync(excludeAbsolute)) {
    const read = secureRead(excludeAbsolute, path.join(gitRoot, ".git"),
      "GIT_INFO_EXCLUDE");
    const snapshotRelative = path.join(
      "git-ignore-source-snapshots",
      "git-info-exclude.snapshot",
    );
    fs.writeFileSync(path.join(taskRoot, snapshotRelative), read.bytes);
    sources.push({
      source_type: "GIT_INFO_EXCLUDE",
      source_path: ".git/info/exclude",
      exists: true,
      sha256: sha256(read.bytes),
      bytes: read.bytes.length,
      encoding: detectEncoding(read.bytes),
      config_origin: "GIT_DIR_INFO_EXCLUDE",
      applicable_scope: "ENTIRE_REPOSITORY",
      read_result: "READ_AND_SNAPSHOTTED",
      snapshot_path: `${taskRepoPrefix}${posix(snapshotRelative)}`,
    });
  } else {
    sources.push({
      source_type: "GIT_INFO_EXCLUDE",
      source_path: ".git/info/exclude",
      exists: false,
      sha256: null,
      bytes: null,
      encoding: null,
      config_origin: "GIT_DIR_INFO_EXCLUDE",
      applicable_scope: "ENTIRE_REPOSITORY",
      read_result: "ABSENT",
      snapshot_path: null,
    });
  }

  const config = gitText(
    ["config", "--show-origin", "--get-all", "core.excludesfile"],
    { allowedExitCodes: [0, 1] },
  );
  const checkIgnoreRecords = [];
  const diagnostics = [];
  for (const group of batch(candidatePaths)) {
    const result = gitText(
      ["check-ignore", "-v", "--no-index", "--", ...group],
      { allowedExitCodes: [0, 1] },
    );
    checkIgnoreRecords.push({
      tested_paths: group,
      exit_code: result.exit_code,
      stdout: result.stdout,
      stderr: result.stderr,
    });
    if (result.stderr) diagnostics.push(result.stderr);
  }
  const diagnosticText = diagnostics.join("\n");
  const defaultGlobalMatch = diagnosticText.match(
    /unable to access ['"]([^'"]+[/\\]\.config[/\\]git[/\\]ignore)['"]:\s*Permission denied/iu,
  );
  const configuredRows = config.stdout.split(/\r?\n/u).filter(Boolean);
  if (configuredRows.length === 0) {
    sources.push({
      source_type: "GLOBAL_EXCLUDES_FILE",
      source_path: defaultGlobalMatch?.[1] ?? null,
      exists: null,
      sha256: null,
      bytes: null,
      encoding: null,
      config_origin: null,
      config_query_exit_code: config.exit_code,
      config_query_stdout: config.stdout,
      config_query_stderr: config.stderr,
      applicable_scope: "GIT_DEFAULT_XDG_GLOBAL_IGNORE",
      read_result: defaultGlobalMatch
        ? "NOT_VERIFIED_PERMISSION_DENIED_BY_GIT"
        : "NOT_VERIFIED_NO_CONFIG_AND_NO_READABLE_DEFAULT_EVIDENCE",
      snapshot_path: null,
    });
  } else {
    for (const row of configuredRows) {
      const firstTab = row.indexOf("\t");
      sources.push({
        source_type: "GLOBAL_EXCLUDES_FILE",
        source_path: firstTab >= 0 ? row.slice(firstTab + 1) : row,
        exists: null,
        sha256: null,
        bytes: null,
        encoding: null,
        config_origin: firstTab >= 0 ? row.slice(0, firstTab) : "UNKNOWN",
        config_query_exit_code: config.exit_code,
        applicable_scope: "GLOBAL",
        read_result: "NOT_VERIFIED_REQUIRES_EXACT_RESOLVED_READ",
        snapshot_path: null,
      });
    }
  }
  const inaccessible = sources.filter((item) =>
    String(item.read_result).startsWith("NOT_VERIFIED"));
  return {
    schema_version: 1,
    task_id: TASK_ID,
    inventory_status: inaccessible.length === 0 ? "VERIFIED" : "NOT_VERIFIED",
    source_count: sources.length,
    checked_gitignore_candidate_count: checkedGitignores.length,
    nested_gitignore_existing_count: nestedExistingCount,
    sources,
    core_excludesfile_query: {
      command: "git config --show-origin --get-all core.excludesfile",
      exact_arguments: [
        "-c",
        "safe.directory=C:/Users/a2306/Desktop/code/ntmc.yaml",
        "-C",
        "C:/Users/a2306/Desktop/code/ntmc.yaml",
        "config",
        "--show-origin",
        "--get-all",
        "core.excludesfile",
      ],
      exit_code: config.exit_code,
      stdout: config.stdout,
      stderr: config.stderr,
    },
    check_ignore_queries: checkIgnoreRecords,
    inaccessible_source_count: inaccessible.length,
    blocker_codes: inaccessible.length > 0
      ? ["IGNORE_EVIDENCE_NOT_VERIFIED"]
      : [],
  };
}

function subjectEntries() {
  return listFilesStrict(taskRoot, "SUBJECT_TREE")
    .filter((absolute) =>
      path.basename(absolute) !== "verification-subject-manifest.json")
    .map((absolute) => {
      const read = secureRead(absolute, taskRoot, "SUBJECT_FILE");
      return {
        repository_relative_path: posix(path.relative(gitRoot, absolute)),
        bytes: read.bytes.length,
        sha256: sha256(read.bytes),
      };
    })
    .sort((left, right) =>
      compareCodePoints(
        left.repository_relative_path,
        right.repository_relative_path,
      ));
}

ensureRoots();
const refreezeRequested =
  process.argv.length === 3 && process.argv[2] === "--complete-refreeze";
need(process.argv.length === 2 || refreezeRequested, "PREPARE_CLI_USAGE_ERROR");
const existingSubjectManifest = path.join(
  taskRoot,
  "verification-subject-manifest.json",
);
let freezeRevision = 1;
if (fs.existsSync(existingSubjectManifest)) {
  need(refreezeRequested, "STAGE_A_ALREADY_FROZEN");
  need(
    !fs.existsSync(
      path.join(taskRoot, "production-rejection-matrix-results.json"),
    ) &&
      !fs.existsSync(path.join(taskRoot, "production-entry-observation.json")) &&
      !fs.existsSync(path.join(taskRoot, "task-artifact-manifest.json")),
    "STAGE_B_ALREADY_STARTED_REFREEZE_FORBIDDEN",
  );
  const priorFreeze = JSON.parse(
    fs.readFileSync(existingSubjectManifest, "utf8"),
  );
  need(Number.isInteger(priorFreeze.freeze_revision),
    "PRIOR_FREEZE_REVISION_INVALID");
  freezeRevision = priorFreeze.freeze_revision + 1;
  fs.unlinkSync(existingSubjectManifest);
}
const opening = openingGitBindings();
const predecessor = predecessorBaseline();
const { read: matrixRead, matrix } = readPredecessorMatrix();
const { read: observationRead, entries } = readCandidateEvidence();
const candidate = verifyCandidate(entries);

writeJson("task-definition.json", {
  schema_version: 1,
  task_id: TASK_ID,
  classification: "L3",
  purpose:
    "Create fail-closed candidate evidence at coherent Stage A and Stage B freeze boundaries.",
  exact_product_root: posix(productRoot),
  exact_allowed_write_path: `.codex/tasks/${TASK_ID}/**`,
  bound_head: EXPECTED_HEAD,
  bound_branch: EXPECTED_BRANCH,
  bound_tree: EXPECTED_TREE,
  predecessor_task: PREDECESSOR_ID,
  predecessor_disposition: "CLOSED_AS_FAILED_AND_FROZEN",
  authoritative_43_case_source:
    `.codex/tasks/${PREDECESSOR_ID}/production-rejection-matrix-results.json`,
  authoritative_43_case_source_sha256: sha256(matrixRead.bytes),
  human_authorization_attachment_sha256:
    EXPECTED_AUTHORIZATION_ATTACHMENT_SHA256,
  human_authorization_attachment_bytes_available: false,
  human_authorization_binding_status:
    "TASK_LOCAL_TRANSCRIPTION_WITHOUT_CRYPTOGRAPHIC_HUMAN_IDENTITY_CLAIM",
  trust_anchor_status: "PROPOSED_NOT_ADOPTED",
  stage_a_freeze_revision: freezeRevision,
  git_write_authorized: false,
  human_exact_trust_anchor_adoption_authorized: false,
  downstream_8a_0gc_authorized: false,
  product_implementation_authorized: false,
});

writeJson("classification.yaml", {
  task_id: TASK_ID,
  level: "L3",
  reasons: [
    "Unresolved reviewer blocker",
    "Git Trust Anchor candidate gate",
    "Release-gate and exact hash binding",
  ],
  triggers: [
    "unresolved_reviewer_blocker",
    "release_gate",
    "unknown_ignore_source_provenance",
  ],
  required_agents: ["sole-writing-codex", "independent-work-reviewer"],
  required_reviews: ["independent_work_read_only_validation"],
  parallel_allowed: false,
  evidence_required: [
    "43_case_rejection_matrix",
    "effective_git_ignore_inventory",
    "predecessor_byte_identity",
    "stage_a_subject_manifest",
    "stage_b_task_manifest",
  ],
  human_approval: {
    scope_approval: "RECEIVED",
    execution_approval: "RECEIVED_FOR_TASK_LOCAL_EVIDENCE_ONLY",
    trust_anchor_adoption: "NOT_AUTHORIZED",
  },
  stop_conditions: [
    "binding_drift",
    "predecessor_mutation",
    "forbidden_write",
    "git_mutation",
    "subject_drift",
    "ignore_evidence_not_verified",
  ],
  scope: {
    include: [`.codex/tasks/${TASK_ID}/**`],
    exclude: ["all_other_paths", ".git/**", ".env*"],
  },
  classified_by: "task-classification",
  classification_status: "proposed",
});

writeJson("blueprint.yaml", {
  task_id: TASK_ID,
  level: "L3",
  blueprint_status: "proposed",
  allowed_paths: [`.codex/tasks/${TASK_ID}/**`],
  applicable_rules: [],
  candidate_rules: [],
  agent_assignments: [
    {
      actor_role: "sole-writing-codex",
      mode: "write",
      allowed_paths: [`.codex/tasks/${TASK_ID}/**`],
    },
    {
      actor_role: "independent-work-reviewer",
      mode: "read_only",
      allowed_paths: [],
    },
  ],
  stages: [
    "NO_WRITE_REBOUND",
    "STAGE_A_VERIFICATION_SUBJECT_FREEZE",
    "FORTY_THREE_CASE_EXECUTION",
    "PRODUCTION_OBSERVATION",
    "STAGE_B_FINAL_PACKAGE_FREEZE",
    "INDEPENDENT_WORK_READ_ONLY_VALIDATION",
  ],
  assurance: "INTERNAL_CONSISTENCY_ONLY",
  maximum_candidate_verdict: "READY_FOR_INDEPENDENT_WORK_VALIDATION",
  prohibited_outcomes: [
    "any_claim_of_completed_trust_anchor_adoption",
    "any_claim_of_human_final_approval",
    "any_claim_of_downstream_8a_0gc_readiness",
    "any_claim_of_product_implementation_authority",
    "any_claim_of_git_write_authority",
  ],
});

writeJson("predecessor-frozen-baseline.json", {
  schema_version: 1,
  task_id: TASK_ID,
  baseline_stage: "NO_WRITE_REBOUND",
  predecessor,
  baseline_binding_sha256: jcsSha256(predecessor),
});

writeJson("candidate-147-baseline.json", {
  schema_version: 1,
  task_id: TASK_ID,
  baseline_stage: "NO_WRITE_REBOUND",
  bound_head: EXPECTED_HEAD,
  bound_branch: EXPECTED_BRANCH,
  bound_tree: EXPECTED_TREE,
  ...candidate,
});

const definitions = copyFixtureInputs(matrix);
writeJson("rejection-case-definitions.json", {
  schema_version: 1,
  task_id: TASK_ID,
  source_task_id: PREDECESSOR_ID,
  source_matrix_sha256: sha256(matrixRead.bytes),
  ordered_case_contract: true,
  total_cases: definitions.length,
  definitions,
  definition_set_sha256: jcsSha256(definitions),
});

const ignoreInventory = snapshotIgnoreSources(
  candidate.entries.map((item) => item.repository_relative_path),
);
writeJson("git-ignore-source-inventory.json", ignoreInventory);

writeJson("baseline-observation.json", {
  schema_version: 1,
  task_id: TASK_ID,
  observation_stage: "NO_WRITE_REBOUND_BEFORE_STAGE_A_FREEZE",
  stage_a_freeze_revision: freezeRevision,
  opening_git_bindings: opening,
  predecessor_binding_sha256: jcsSha256(predecessor),
  candidate_binding_sha256: candidate.binding_sha256,
  predecessor_observation_file_sha256: sha256(observationRead.bytes),
  authoritative_matrix_file_sha256: sha256(matrixRead.bytes),
  case_count: definitions.length,
  scoped_candidate_status_count: candidate.scoped_status_count,
  scoped_candidate_worktree_diff_count: candidate.scoped_worktree_diff_count,
  scoped_candidate_index_diff_count: candidate.scoped_index_diff_count,
  ignore_evidence_status: ignoreInventory.inventory_status,
  ignore_blockers: ignoreInventory.blocker_codes,
  git_mutation: "NO",
});

writeJson("stage-a-freeze-contract.json", {
  schema_version: 1,
  task_id: TASK_ID,
  freeze_stage: "STAGE_A_VERIFICATION_SUBJECT_FREEZE",
  freeze_revision: freezeRevision,
  subject_files_may_change_after_freeze: false,
  matrix_must_bind_subject_hash: true,
  observation_must_bind_subject_hash: true,
  complete_cycle_required_after_subject_change: true,
  final_task_manifest_is_stage_b_and_not_a_subject_input: true,
});

const taskManifestContractEntries = [
  {
    repository_relative_path: `${taskRepoPrefix}HANDOFF.md`,
    bytes: 1,
    sha256: "A".repeat(64),
  },
  {
    repository_relative_path: `${taskRepoPrefix}final-summary.md`,
    bytes: 1,
    sha256: "B".repeat(64),
  },
];
const taskManifestContract = {
  schema_version: 2,
  task_id: TASK_ID,
  generation_order: "LAST_AFTER_HANDOFF_FREEZE",
  canonicalization: "RFC8785_JCS",
  self_path: `${taskRepoPrefix}task-artifact-manifest.json`,
  self_exclusion: {
    excluded_path: `${taskRepoPrefix}task-artifact-manifest.json`,
    self_entry_present: false,
  },
  entry_count: taskManifestContractEntries.length,
  physical_file_count: taskManifestContractEntries.length + 1,
  entries: taskManifestContractEntries,
};
taskManifestContract.internal_manifest_sha256 =
  jcsSha256(taskManifestContract);
writeJson("task-manifest-validation-baseline.json", taskManifestContract);

writeJson("semantic-validation-baseline.json", {
  schema_version: 1,
  task_id: TASK_ID,
  dependency_binding: {
    expected:
      "B320CEC8FAC46723D6BFD2D9726357A959DA14D1E8C06FD01D27037928F619E6",
    actual:
      "B320CEC8FAC46723D6BFD2D9726357A959DA14D1E8C06FD01D27037928F619E6",
  },
  provenance_binding: {
    expected_group_count: 17,
    actual_group_count: 17,
    expected_entry_count: 1190,
    actual_entry_count: 1190,
    expected_digest:
      "C5A3EBF0240948E39460BC78621622C9FC8F2F970AFF0303976A9384D1B344E9",
    actual_digest:
      "C5A3EBF0240948E39460BC78621622C9FC8F2F970AFF0303976A9384D1B344E9",
  },
  historical_binding: {
    expected_predecessor_manifest_file_sha256:
      predecessor.manifest_file_sha256,
    actual_predecessor_manifest_file_sha256:
      predecessor.manifest_file_sha256,
  },
  source_manifest_binding: {
    expected:
      "5CE80FC02491E66701D9D5573DB3123561FE41C74BABE7C0D0F5496404207685",
    actual:
      "5CE80FC02491E66701D9D5573DB3123561FE41C74BABE7C0D0F5496404207685",
  },
});

const entriesForSubject = subjectEntries();
const subjectManifest = {
  schema_version: 1,
  task_id: TASK_ID,
  freeze_stage: "STAGE_A_VERIFICATION_SUBJECT_FREEZE",
  freeze_revision: freezeRevision,
  approved_bindings: {
    head: EXPECTED_HEAD,
    branch: EXPECTED_BRANCH,
    tree: EXPECTED_TREE,
    trust_anchor_status: "PROPOSED_NOT_ADOPTED",
  },
  case_contract: {
    authoritative_source_sha256: EXPECTED_PREDECESSOR_MATRIX_SHA256,
    exact_ordered_case_count: 43,
    definition_set_sha256: jcsSha256(definitions),
  },
  self_exclusion: {
    excluded_path: subjectManifestRepoPath,
    reason: "SELF_REFERENCE_AVOIDANCE",
  },
  path_scope: "REPOSITORY_RELATIVE_WITHIN_EXACT_TASK_ROOT",
  path_sort: "UNICODE_NFC_ORDINAL_CODE_POINT",
  canonicalization: "RFC8785_JCS",
  hash_contract:
    "SHA256_OF_RFC8785_JCS_CORE_OMITTING_VERIFICATION_SUBJECT_MANIFEST_HASH",
  entry_count: entriesForSubject.length,
  physical_file_count_at_stage_a: entriesForSubject.length + 1,
  entries: entriesForSubject,
};
subjectManifest.verification_subject_manifest_hash =
  verificationSubjectHash(subjectManifest);
writeJson("verification-subject-manifest.json", subjectManifest);

const readBack = verifySubjectManifest();
process.stdout.write(
  `${JSON.stringify({
    task_id: TASK_ID,
    stage_a_status: "FROZEN",
    freeze_revision: freezeRevision,
    verification_subject_manifest_hash: readBack.internal_hash,
    verification_subject_manifest_file_sha256: readBack.exact_file_sha256,
    subject_entry_count: readBack.manifest.entry_count,
    authoritative_case_count: definitions.length,
    predecessor_byte_identity_status: "MATCH",
    candidate_147_binding_status: "MATCH",
    ignore_evidence_status: ignoreInventory.inventory_status,
    blockers: ignoreInventory.blocker_codes,
    git_mutation: "NO",
  }, null, 2)}\n`,
);
