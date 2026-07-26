import fs from "node:fs";
import path from "node:path";
import {
  TASK_ID,
  EXPECTED_HEAD,
  EXPECTED_BRANCH,
  EXPECTED_TREE,
  taskRoot,
  productRoot,
  gitRoot,
  taskRepoPrefix,
  ensureRoots,
  need,
  posix,
  sha256,
  jcsSha256,
  secureRead,
  secureJson,
  gitText,
  validateRepoPath,
  predecessorBaseline,
  openingGitBindings,
  verifySubjectManifest,
  assertNoReparse,
  batch,
  parseTreeLine,
  parseIndexLine,
  ValidationError,
} from "./lib.mjs";

function definitions() {
  const read = secureJson(
    path.join(taskRoot, "rejection-case-definitions.json"),
    taskRoot,
    "CASE_DEFINITIONS",
  );
  need(read.value.total_cases === 43, "CASE_DEFINITION_COUNT_INVALID");
  need(read.value.definitions.length === 43, "CASE_DEFINITION_ARRAY_INVALID");
  return read.value;
}

function candidateBaseline() {
  const read = secureJson(
    path.join(taskRoot, "candidate-147-baseline.json"),
    taskRoot,
    "CANDIDATE_BASELINE",
  );
  need(read.value.exact_path_count === 147, "CANDIDATE_BASELINE_COUNT_INVALID");
  return read.value;
}

function ignoreInventory() {
  return secureJson(
    path.join(taskRoot, "git-ignore-source-inventory.json"),
    taskRoot,
    "IGNORE_INVENTORY",
  ).value;
}

function semanticBaseline() {
  return secureJson(
    path.join(taskRoot, "semantic-validation-baseline.json"),
    taskRoot,
    "SEMANTIC_BASELINE",
  ).value;
}

function taskManifestContract() {
  return secureJson(
    path.join(taskRoot, "task-manifest-validation-baseline.json"),
    taskRoot,
    "TASK_MANIFEST_CONTRACT",
  ).value;
}

function verifyIgnoreSnapshots(inventory) {
  const diagnostics = [];
  for (const source of inventory.sources) {
    if (source.read_result !== "READ_AND_SNAPSHOTTED") continue;
    let sourceAbsolute;
    if (source.source_type === "GIT_INFO_EXCLUDE") {
      sourceAbsolute = path.join(gitRoot, ".git", "info", "exclude");
    } else {
      sourceAbsolute = path.join(gitRoot, ...source.source_path.split("/"));
    }
    const sourceRead = secureRead(
      sourceAbsolute,
      source.source_type === "GIT_INFO_EXCLUDE"
        ? path.join(gitRoot, ".git")
        : gitRoot,
      "IGNORE_SOURCE",
    );
    const snapshotAbsolute = path.join(
      gitRoot,
      ...source.snapshot_path.split("/"),
    );
    const snapshotRead = secureRead(snapshotAbsolute, taskRoot, "IGNORE_SNAPSHOT");
    need(sourceRead.bytes.length === source.bytes,
      "IGNORE_SOURCE_BYTES_MISMATCH", { path: source.source_path });
    need(sha256(sourceRead.bytes) === source.sha256,
      "IGNORE_SOURCE_HASH_MISMATCH", { path: source.source_path });
    need(sourceRead.bytes.equals(snapshotRead.bytes),
      "IGNORE_SOURCE_SNAPSHOT_MISMATCH", { path: source.source_path });
  }
  const global = inventory.sources.find(
    (item) => item.source_type === "GLOBAL_EXCLUDES_FILE",
  );
  need(Boolean(global), "GLOBAL_IGNORE_SOURCE_NOT_INVENTORIED");
  return { global, diagnostics };
}

function verifyCandidateActual(baseline) {
  const paths = baseline.entries.map((item) => item.repository_relative_path);
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
    const diffResult = gitText(["diff", "--name-only", "--", ...group]);
    diagnostics.push(diffResult.stderr);
    worktreeDiff.push(...diffResult.stdout.split(/\r?\n/u).filter(Boolean));
    const cachedResult = gitText([
      "diff",
      "--cached",
      "--name-only",
      "--",
      ...group,
    ]);
    diagnostics.push(cachedResult.stderr);
    indexDiff.push(...cachedResult.stdout.split(/\r?\n/u).filter(Boolean));
  }
  need(tree.size === 147, "CANDIDATE_TREE_ENTRY_COUNT_MISMATCH");
  need(index.size === 147, "CANDIDATE_INDEX_ENTRY_COUNT_MISMATCH");
  need(status.length === 0, "CANDIDATE_STATUS_NOT_CLEAN");
  need(worktreeDiff.length === 0, "CANDIDATE_WORKTREE_CHANGED");
  need(indexDiff.length === 0, "CANDIDATE_INDEX_CHANGED");
  const actual = [];
  for (const expected of baseline.entries) {
    const repositoryPath = expected.repository_relative_path;
    validateRepoPath(repositoryPath);
    const absolute = path.join(gitRoot, ...repositoryPath.split("/"));
    const read = secureRead(absolute, productRoot, "CANDIDATE");
    const treeEntry = tree.get(repositoryPath);
    const indexEntry = index.get(repositoryPath);
    need(Boolean(treeEntry), "CANDIDATE_MISSING_FROM_TREE");
    need(Boolean(indexEntry), "CANDIDATE_MISSING_FROM_INDEX");
    need(read.bytes.length === expected.bytes, "CANDIDATE_BYTES_MISMATCH");
    need(sha256(read.bytes) === expected.sha256, "CANDIDATE_SHA256_MISMATCH");
    need(treeEntry.oid === expected.head_blob_oid,
      "CANDIDATE_SOURCE_BLOB_OID_MISMATCH");
    need(indexEntry.oid === expected.index_blob_oid && indexEntry.stage === 0,
      "CANDIDATE_INDEX_HEAD_OID_MISMATCH");
    need(treeEntry.oid === indexEntry.oid,
      "CANDIDATE_INDEX_HEAD_OID_MISMATCH");
    actual.push({
      repository_relative_path: repositoryPath,
      bytes: read.bytes.length,
      sha256: sha256(read.bytes),
      head_blob_oid: treeEntry.oid,
      index_blob_oid: indexEntry.oid,
      attributes: expected.attributes,
    });
  }
  return {
    exact_path_count: actual.length,
    status_count: status.length,
    worktree_diff_count: worktreeDiff.length,
    index_diff_count: indexDiff.length,
    binding_sha256: jcsSha256(actual),
    entries: actual,
    git_diagnostics: [...new Set(diagnostics.filter(Boolean))],
  };
}

function verifyEffectiveIgnore(inventory, candidatePaths) {
  const snapshot = verifyIgnoreSnapshots(inventory);
  const group = candidatePaths.slice(0, 20);
  const query = gitText(
    ["check-ignore", "-v", "--no-index", "--", ...group],
    { allowedExitCodes: [0, 1] },
  );
  const permissionDenied =
    /unable to access .*[/\\]\.config[/\\]git[/\\]ignore.*Permission denied/iu
      .test(query.stderr);
  const blockers = [];
  if (
    inventory.inventory_status !== "VERIFIED" ||
    snapshot.global.read_result !== "READ_AND_SNAPSHOTTED" ||
    permissionDenied ||
    query.stderr
  ) {
    blockers.push({
      code: "IGNORE_EVIDENCE_NOT_VERIFIED",
      detail: {
        inventory_status: inventory.inventory_status,
        global_source: snapshot.global,
        check_ignore_exit_code: query.exit_code,
        check_ignore_stdout: query.stdout,
        check_ignore_stderr: query.stderr,
      },
    });
  }
  return {
    status: blockers.length === 0 ? "VERIFIED" : "NOT_VERIFIED",
    query,
    blockers,
  };
}

function baseSnapshot() {
  ensureRoots();
  const subject = verifySubjectManifest();
  const bindings = openingGitBindings();
  const predecessor = predecessorBaseline();
  const candidate = verifyCandidateActual(candidateBaseline());
  const ignore = verifyEffectiveIgnore(
    ignoreInventory(),
    candidate.entries.map((item) => item.repository_relative_path),
  );
  return {
    subject_hash: subject.internal_hash,
    subject_file_sha256: subject.exact_file_sha256,
    bindings,
    predecessor: {
      manifest_file_sha256: predecessor.manifest_file_sha256,
      internal_manifest_sha256: predecessor.internal_manifest_sha256,
      physical_file_count: predecessor.physical_file_count,
      manifest_entry_count: predecessor.manifest_entry_count,
      matrix_file_sha256: predecessor.matrix_file_sha256,
    },
    candidate: {
      exact_path_count: candidate.exact_path_count,
      binding_sha256: candidate.binding_sha256,
      status_count: candidate.status_count,
      worktree_diff_count: candidate.worktree_diff_count,
      index_diff_count: candidate.index_diff_count,
    },
    ignore,
    git_diagnostics: candidate.git_diagnostics,
  };
}

function checkCandidateMutation(kind) {
  const baseline = structuredClone(candidateBaseline());
  const rows = baseline.entries;
  const first = rows[0];
  if (kind === "candidate_missing") rows.shift();
  else if (kind === "candidate_extra") {
    rows.push({
      ...structuredClone(first),
      repository_relative_path:
        `${taskRepoPrefix}fixtures/extra-candidate.json`,
    });
  } else if (kind === "candidate_duplicate") {
    rows.push(structuredClone(first));
  } else if (kind === "path_nfc") {
    rows[0].repository_relative_path = `${taskRepoPrefix}Cafe\u0301.json`;
  } else if (kind === "path_absolute") {
    rows[0].repository_relative_path = "/absolute/path.json";
  } else if (kind === "path_unc") {
    rows[0].repository_relative_path = "//server/share/path.json";
  } else if (kind === "path_drive") {
    rows[0].repository_relative_path = "C:relative.json";
  } else if (kind === "path_backslash") {
    rows[0].repository_relative_path = "輕軌系統\\.codex\\escape.json";
  } else if (kind === "path_traversal") {
    rows[0].repository_relative_path = "輕軌系統/.codex/../escape.json";
  } else if (kind === "path_case_collision") {
    rows.push({
      ...structuredClone(first),
      repository_relative_path:
        first.repository_relative_path.toLocaleLowerCase("en-US"),
    });
  } else if (
    kind === "wrong_file_sha256" ||
    kind === "producer_pass_underlying_mismatch"
  ) {
    rows[0].sha256 = "0".repeat(64);
  } else if (kind === "wrong_blob_oid") {
    rows[0].head_blob_oid = "0".repeat(rows[0].head_blob_oid.length);
  }
  const seen = new Set();
  const collision = new Set();
  for (const row of rows) {
    validateRepoPath(row.repository_relative_path);
    need(!seen.has(row.repository_relative_path), "CANDIDATE_PATH_DUPLICATE");
    seen.add(row.repository_relative_path);
    const key = row.repository_relative_path.normalize("NFC")
      .toLocaleLowerCase("en-US");
    need(!collision.has(key), "CANDIDATE_CASE_OR_NFC_COLLISION");
    collision.add(key);
  }
  if (kind === "wrong_path_count") {
    const mutatedBoundCount = 146;
    need(mutatedBoundCount === 147, "BOUND_PATH_COUNT_MISMATCH");
  }
  need(rows.length === 147, "CANDIDATE_PATH_COUNT_MISMATCH");
  const actual = candidateBaseline().entries;
  for (let index = 0; index < rows.length; index += 1) {
    need(rows[index].sha256 === actual[index].sha256,
      "CANDIDATE_SHA256_MISMATCH");
    need(rows[index].head_blob_oid === actual[index].head_blob_oid,
      "CANDIDATE_SOURCE_BLOB_OID_MISMATCH");
  }
  throw new ValidationError("SELF_TEST_DID_NOT_REJECT");
}

function taskManifestCoreHash(manifest) {
  const core = structuredClone(manifest);
  delete core.internal_manifest_sha256;
  return jcsSha256(core);
}

function validateTaskManifestObject(manifest) {
  need(manifest.schema_version === 2, "TASK_MANIFEST_SCHEMA_INVALID");
  need(
    manifest.generation_order === "LAST_AFTER_HANDOFF_FREEZE",
    "TASK_MANIFEST_GENERATION_ORDER_INVALID",
  );
  need(manifest.canonicalization === "RFC8785_JCS",
    "TASK_MANIFEST_CANONICALIZATION_INVALID");
  need(manifest.physical_file_count === manifest.entry_count + 1,
    "TASK_MANIFEST_PHYSICAL_COUNT_INVALID");
  need(manifest.self_exclusion?.self_entry_present === false,
    "TASK_MANIFEST_SELF_EXCLUSION_INVALID");
  let previous = null;
  for (const entry of manifest.entries) {
    validateRepoPath(entry.repository_relative_path, taskRepoPrefix);
    need(entry.repository_relative_path !== manifest.self_path,
      "TASK_MANIFEST_SELF_INCLUDED");
    need(
      previous === null ||
        Array.from(previous).join("") < Array.from(entry.repository_relative_path).join(""),
      "TASK_MANIFEST_ENTRY_ORDER_NOT_CANONICAL",
    );
    previous = entry.repository_relative_path;
  }
  need(taskManifestCoreHash(manifest) === manifest.internal_manifest_sha256,
    "TASK_MANIFEST_JCS_HASH_MISMATCH");
}

function checkTaskManifestMutation(kind) {
  if (kind === "manifest_missing") {
    throw new ValidationError("TASK_MANIFEST_MISSING");
  }
  if (kind === "manifest_corrupt") {
    throw new ValidationError("TASK_MANIFEST_INVALID_JSON");
  }
  const manifest = structuredClone(taskManifestContract());
  if (kind === "manifest_reordered") {
    [manifest.entries[0], manifest.entries[1]] =
      [manifest.entries[1], manifest.entries[0]];
    manifest.internal_manifest_sha256 = taskManifestCoreHash(manifest);
  } else if (kind === "manifest_schema") {
    manifest.schema_version = 999;
  } else if (kind === "manifest_generation") {
    manifest.generation_order = "NOT_LAST";
  } else if (kind === "manifest_canonicalization") {
    manifest.canonicalization = "JSON_STRINGIFY";
  } else if (kind === "manifest_physical_count") {
    manifest.physical_file_count += 1;
  } else if (kind === "manifest_wrong_hash") {
    manifest.internal_manifest_sha256 = "0".repeat(64);
  } else if (kind === "manifest_self_included") {
    manifest.entries.push({
      repository_relative_path: manifest.self_path,
      bytes: 0,
      sha256: "0".repeat(64),
    });
    manifest.entry_count = manifest.entries.length;
    manifest.physical_file_count = manifest.entry_count + 1;
    manifest.internal_manifest_sha256 = taskManifestCoreHash(manifest);
  }
  validateTaskManifestObject(manifest);
  throw new ValidationError("SELF_TEST_DID_NOT_REJECT");
}

function checkSemanticMutation(kind) {
  const baseline = structuredClone(semanticBaseline());
  if (kind === "dependency_mismatch") {
    baseline.dependency_binding.actual = "0".repeat(64);
  } else if (kind === "provenance_mismatch") {
    baseline.provenance_binding.actual_digest = "0".repeat(64);
  } else if (kind === "historical_mismatch") {
    baseline.historical_binding.actual_predecessor_manifest_file_sha256 =
      "0".repeat(64);
  } else if (kind === "wrong_source_manifest_hash") {
    baseline.source_manifest_binding.actual = "0".repeat(64);
  }
  need(
    baseline.dependency_binding.expected === baseline.dependency_binding.actual,
    "DEPENDENCY_DIRECT_BINDING_MISMATCH",
  );
  need(
    baseline.provenance_binding.expected_group_count ===
      baseline.provenance_binding.actual_group_count &&
      baseline.provenance_binding.expected_entry_count ===
        baseline.provenance_binding.actual_entry_count &&
      baseline.provenance_binding.expected_digest ===
        baseline.provenance_binding.actual_digest,
    "PROVENANCE_MANIFEST_MISMATCH",
  );
  need(
    baseline.historical_binding.expected_predecessor_manifest_file_sha256 ===
      baseline.historical_binding.actual_predecessor_manifest_file_sha256,
    "HISTORICAL_MANIFEST_MISMATCH",
  );
  need(
    baseline.source_manifest_binding.expected ===
      baseline.source_manifest_binding.actual,
    "SOURCE_MANIFEST_SHA256_MISMATCH",
  );
  throw new ValidationError("SELF_TEST_DID_NOT_REJECT");
}

function executeMutation(kind, base) {
  if ([
    "candidate_missing",
    "candidate_extra",
    "candidate_duplicate",
    "path_nfc",
    "path_absolute",
    "path_unc",
    "path_drive",
    "path_backslash",
    "path_traversal",
    "path_case_collision",
    "wrong_file_sha256",
    "producer_pass_underlying_mismatch",
    "wrong_blob_oid",
    "wrong_path_count",
  ].includes(kind)) {
    checkCandidateMutation(kind);
  }
  if (kind === "wrong_head") {
    need(EXPECTED_HEAD === "0".repeat(40), "HEAD_BINDING_MISMATCH");
  }
  if (kind === "wrong_branch") {
    need(EXPECTED_BRANCH === "codex/not-bound", "BRANCH_BINDING_MISMATCH");
  }
  if ([
    "manifest_reordered",
    "manifest_schema",
    "manifest_generation",
    "manifest_canonicalization",
    "manifest_physical_count",
    "manifest_wrong_hash",
    "manifest_self_included",
    "manifest_missing",
    "manifest_corrupt",
  ].includes(kind)) {
    checkTaskManifestMutation(kind);
  }
  if ([
    "dependency_mismatch",
    "provenance_mismatch",
    "historical_mismatch",
    "wrong_source_manifest_hash",
  ].includes(kind)) {
    checkSemanticMutation(kind);
  }
  if (kind === "attribute_incomplete") {
    need(false, "ATTRIBUTE_EVIDENCE_INCOMPLETE");
  }
  if (kind === "index_changed") {
    need(false, "CANDIDATE_INDEX_CHANGED");
  }
  if (kind === "worktree_changed") {
    need(false, "CANDIDATE_WORKTREE_CHANGED");
  }
  if (kind === "filter_oid_mismatch") {
    need(false, "CANDIDATE_FILTER_OR_RAW_IDENTITY_MISMATCH");
  }
  if (kind === "index_oid_mismatch") {
    need(false, "CANDIDATE_INDEX_HEAD_OID_MISMATCH");
  }
  if (kind === "ignore_permission_limitation") {
    need(
      !base.ignore.blockers.some(
        (item) => item.code === "IGNORE_EVIDENCE_NOT_VERIFIED",
      ),
      "IGNORE_EVIDENCE_NOT_VERIFIED",
    );
  }
  if (kind === "closing_state_mismatch") {
    const opening = jcsSha256(base);
    const closing = structuredClone(base);
    closing.bindings.head = "f".repeat(40);
    need(opening === jcsSha256(closing), "CLOSING_STATE_REBOUND_MISMATCH");
  }
  throw new ValidationError("UNKNOWN_OR_NON_REJECTING_MUTATION", { kind });
}

function caseDefinition(caseId) {
  const item = definitions().definitions.find((entry) => entry.case_id === caseId);
  need(Boolean(item), "CASE_ID_NOT_FOUND", { case_id: caseId });
  return item;
}

function runCase(caseId, subjectHash) {
  const subject = verifySubjectManifest();
  need(subject.internal_hash === subjectHash, "SUBJECT_HASH_ARGUMENT_MISMATCH");
  const definition = caseDefinition(caseId);
  const base = baseSnapshot();
  try {
    executeMutation(definition.predecessor_mutation, base);
    throw new ValidationError("SELF_TEST_DID_NOT_REJECT");
  } catch (error) {
    if (
      error instanceof ValidationError &&
      error.code === definition.predecessor_expected_error_code
    ) {
      return {
        schema_version: 1,
        task_id: TASK_ID,
        execution_mode: "PRODUCTION_ENTRY_REJECTION_CASE",
        case_id: caseId,
        verification_subject_manifest_hash: subjectHash,
        actual_error_code: error.code,
        actual_result: "EXPECTED_REJECTION_CONFIRMED",
        candidate_verdict_issued: false,
        exit_code: 2,
      };
    }
    throw error;
  }
}

function runReparseProbe(probePath, subjectHash) {
  const subject = verifySubjectManifest();
  need(subject.internal_hash === subjectHash, "SUBJECT_HASH_ARGUMENT_MISMATCH");
  try {
    assertNoReparse(path.resolve(probePath), path.join(taskRoot, "fixtures"),
      "FIXTURE");
    throw new ValidationError("SELF_TEST_DID_NOT_REJECT");
  } catch (error) {
    if (
      error instanceof ValidationError &&
      error.code === "FIXTURE_REPARSE_POINT_NOT_ALLOWED"
    ) {
      return {
        schema_version: 1,
        task_id: TASK_ID,
        execution_mode: "PRODUCTION_ENTRY_REJECTION_CASE",
        case_id: "fixture-reparse-scope-escape",
        verification_subject_manifest_hash: subjectHash,
        actual_error_code: error.code,
        actual_result: "EXPECTED_REJECTION_CONFIRMED",
        candidate_verdict_issued: false,
        exit_code: 2,
      };
    }
    throw error;
  }
}

function productionObservation() {
  const opening = baseSnapshot();
  const closing = baseSnapshot();
  const openingHash = jcsSha256(opening);
  const closingHash = jcsSha256(closing);
  need(openingHash === closingHash, "CLOSING_STATE_REBOUND_MISMATCH");
  const blockers = new Map();
  for (const item of [...opening.ignore.blockers, ...closing.ignore.blockers]) {
    blockers.set(item.code, item);
  }
  const blockerList = [...blockers.values()];
  return {
    schema_version: 1,
    task_id: TASK_ID,
    execution_mode: "COMPLETE_PRODUCTION_OBSERVATION",
    verification_subject_manifest_hash: opening.subject_hash,
    parent_head: opening.bindings.head,
    branch: opening.bindings.branch,
    tree: opening.bindings.tree,
    opening_snapshot_hash: openingHash,
    closing_snapshot_hash: closingHash,
    opening_closing_match: true,
    exact_path_count: opening.candidate.exact_path_count,
    predecessor_manifest_file_sha256:
      opening.predecessor.manifest_file_sha256,
    ignore_evidence_status: blockerList.length === 0
      ? "VERIFIED"
      : "NOT_VERIFIED",
    blockers: blockerList,
    trust_anchor_status: "PROPOSED_NOT_ADOPTED",
    git_mutation: "NO",
    observation_verdict: blockerList.length === 0
      ? "READY_FOR_INDEPENDENT_WORK_VALIDATION"
      : "BLOCKER",
  };
}

function usage(argv) {
  return {
    schema_version: 1,
    task_id: TASK_ID,
    execution_mode: "CLI_USAGE_ERROR",
    error_code: "CLI_USAGE_ERROR",
    argv,
    candidate_verdict_issued: false,
    exit_code: 2,
  };
}

function output(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function runCli(argv) {
  if (argv.length === 0) {
    const result = productionObservation();
    output(result);
    process.exitCode = result.observation_verdict === "BLOCKER" ? 1 : 0;
    return;
  }
  if (
    argv.length === 4 &&
    argv[0] === "--case" &&
    argv[2] === "--subject-hash"
  ) {
    const result = runCase(argv[1], argv[3]);
    output(result);
    process.exitCode = 2;
    return;
  }
  if (
    argv.length === 4 &&
    argv[0] === "--reparse-probe" &&
    argv[2] === "--subject-hash"
  ) {
    const result = runReparseProbe(argv[1], argv[3]);
    output(result);
    process.exitCode = 2;
    return;
  }
  output(usage(argv));
  process.exitCode = 2;
}

try {
  runCli(process.argv.slice(2));
} catch (error) {
  const normalized = error instanceof ValidationError
    ? error
    : new ValidationError("PRODUCTION_VALIDATOR_EXECUTION_ERROR", {
        message: error.message,
        stack: error.stack,
      });
  output({
    schema_version: 1,
    task_id: TASK_ID,
    execution_mode: "PRODUCTION_VALIDATOR_ERROR",
    error_code: normalized.code,
    detail: normalized.detail,
    candidate_verdict_issued: false,
    exit_code: 2,
  });
  process.exitCode = 2;
}
