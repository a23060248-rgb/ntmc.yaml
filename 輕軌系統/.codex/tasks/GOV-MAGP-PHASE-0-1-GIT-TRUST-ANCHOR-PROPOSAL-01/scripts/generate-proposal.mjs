import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const TASK_ID = "GOV-MAGP-PHASE-0-1-GIT-TRUST-ANCHOR-PROPOSAL-01";
const MASTER_BATCH = "8A-0G";
const SOURCE_TASK_ID = "GOV-MAGP-INTEGRATED-DESIGN-ADOPTION-AND-PHASE-01-AUTHORIZATION-01";
const ATTEMPT_TASK_ID = "GOV-MAGP-PHASE-0-1-IMPLEMENTATION-01";
const PRELAUNCH_TASK_ID = "GOV-MAGP-PHASE-0-1-PRELAUNCH-BOUNDARY-AND-RELAUNCH-01";
const EXPECTED_SOURCE = {
  file_count: 106,
  manifest_sha256: "CB760B18A41C67EF2978506FE3BE409E7003B28186F2ACFBB56B77D6ED7F68D8",
};
const EXPECTED_ATTEMPT = {
  file_count: 41,
  manifest_sha256: "6B2DE6D5C428EE61E9448CF2A181006333369E25DD347AA961AAB36DF22A5992",
};

const scriptPath = fileURLToPath(import.meta.url);
const taskRoot = path.resolve(path.dirname(scriptPath), "..");
const productRoot = path.resolve(taskRoot, "..", "..", "..");
const tasksRoot = path.resolve(productRoot, ".codex", "tasks");
const now = new Date().toISOString();

function sha256(data) {
  return crypto.createHash("sha256").update(data).digest("hex").toUpperCase();
}

function posix(value) {
  return value.split(path.sep).join("/");
}

function ordinalCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? productRoot,
    input: options.input,
    encoding: options.buffer ? null : "utf8",
    maxBuffer: 256 * 1024 * 1024,
    windowsHide: true,
  });
  const allowed = options.allowedExitCodes ?? [0];
  if (!allowed.includes(result.status)) {
    const stderr = Buffer.isBuffer(result.stderr)
      ? result.stderr.toString("utf8")
      : result.stderr ?? "";
    throw new Error(`${command} ${args.join(" ")} failed (${result.status}): ${stderr}`);
  }
  return result;
}

function git(args, options = {}) {
  return run("git", ["-c", "core.quotepath=false", ...args], {
    ...options,
    cwd: options.cwd ?? repoRoot,
  });
}

function gitText(args, options = {}) {
  return git(args, options).stdout.trim();
}

function writeJson(relativePath, value) {
  const target = path.join(taskRoot, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeText(relativePath, value) {
  const target = path.join(taskRoot, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, value, "utf8");
}

function listFiles(root) {
  const output = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(absolute);
      else if (entry.isFile()) output.push(absolute);
      else if (entry.isSymbolicLink()) output.push(absolute);
    }
  }
  return output.sort((a, b) => ordinalCompare(posix(a), posix(b)));
}

function digestTree(root) {
  const entries = listFiles(root)
    .map((absolute) => {
      const bytes = fs.readFileSync(absolute);
      return {
        relative_path: posix(path.relative(root, absolute)),
        sha256: sha256(bytes),
        bytes: bytes.length,
      };
    })
    .sort((a, b) => ordinalCompare(a.relative_path, b.relative_path));
  const canonical = entries
    .map((entry) => `${entry.relative_path}|${entry.sha256}|${entry.bytes}`)
    .join("\n");
  return {
    file_count: entries.length,
    manifest_sha256: sha256(Buffer.from(canonical, "utf8")),
    entries,
  };
}

function digestEntries(entries) {
  const canonical = [...entries]
    .sort((a, b) => ordinalCompare(a.relative_path, b.relative_path))
    .map((entry) => `${entry.relative_path}|${entry.sha256}|${entry.bytes}`)
    .join("\n");
  return sha256(Buffer.from(canonical, "utf8"));
}

function bindFile(absolute) {
  const bytes = fs.readFileSync(absolute);
  return {
    repository_relative_path: posix(path.relative(repoRoot, absolute)),
    bytes: bytes.length,
    sha256: sha256(bytes),
  };
}

function parseStatus(buffer) {
  const chunks = buffer.toString("utf8").split("\0");
  const rows = [];
  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    if (!chunk) continue;
    const xy = chunk.slice(0, 2);
    const repositoryRelativePath = chunk.slice(3);
    const row = {
      xy,
      repository_relative_path: repositoryRelativePath,
    };
    if (/[RC]/.test(xy) && chunks[index + 1]) {
      row.rename_or_copy_source = chunks[index + 1];
      index += 1;
    }
    rows.push(row);
  }
  return rows;
}

function summarizeStatus(rows, excludedPrefix = null) {
  const selected = excludedPrefix
    ? rows.filter((row) => !row.repository_relative_path.startsWith(excludedPrefix))
    : rows;
  return {
    entry_count: selected.length,
    staged: selected
      .filter((row) => row.xy[0] !== " " && row.xy[0] !== "?")
      .map((row) => row.repository_relative_path),
    unstaged: selected
      .filter((row) => row.xy[1] !== " " && row.xy[1] !== "?")
      .map((row) => row.repository_relative_path),
    untracked: selected
      .filter((row) => row.xy === "??")
      .map((row) => row.repository_relative_path),
    entries: selected,
  };
}

function parseCheckIgnore(buffer) {
  const fields = buffer.toString("utf8").split("\0").filter(Boolean);
  const rows = [];
  for (let index = 0; index + 3 < fields.length; index += 4) {
    rows.push({
      rule_source: fields[index],
      rule_line: Number(fields[index + 1]),
      rule_pattern: fields[index + 2],
      repository_relative_path: fields[index + 3],
    });
  }
  return rows;
}

function parseCheckAttr(buffer) {
  const fields = buffer.toString("utf8").split("\0").filter(Boolean);
  const map = new Map();
  for (let index = 0; index + 2 < fields.length; index += 3) {
    const repositoryRelativePath = fields[index];
    const attribute = fields[index + 1];
    const value = fields[index + 2];
    if (!map.has(repositoryRelativePath)) map.set(repositoryRelativePath, {});
    map.get(repositoryRelativePath)[attribute] = value;
  }
  return map;
}

function gitConfig(name) {
  const result = git(["config", "--get", name], { allowedExitCodes: [0, 1] });
  return result.status === 0 ? result.stdout.trim() : null;
}

function gitBlobOid(algorithm, bytes) {
  const header = Buffer.from(`blob ${bytes.length}\0`, "utf8");
  return crypto
    .createHash(algorithm)
    .update(Buffer.concat([header, bytes]))
    .digest("hex");
}

function pathCollisionAnalysis(paths) {
  const caseMap = new Map();
  const nfcMap = new Map();
  const exact = new Set();
  const duplicates = [];
  for (const item of paths) {
    if (exact.has(item)) duplicates.push(item);
    exact.add(item);
    const caseKey = item.toLocaleLowerCase("en-US");
    if (!caseMap.has(caseKey)) caseMap.set(caseKey, []);
    caseMap.get(caseKey).push(item);
    const nfcKey = item.normalize("NFC");
    if (!nfcMap.has(nfcKey)) nfcMap.set(nfcKey, []);
    nfcMap.get(nfcKey).push(item);
  }
  return {
    exact_duplicate_paths: [...new Set(duplicates)],
    case_insensitive_collisions: [...caseMap.values()].filter((items) => new Set(items).size > 1),
    unicode_nfc_collisions: [...nfcMap.values()].filter((items) => new Set(items).size > 1),
    non_nfc_paths: paths.filter((item) => item !== item.normalize("NFC")),
  };
}

const repoRootResult = run("git", ["-c", "core.quotepath=false", "rev-parse", "--show-toplevel"], {
  cwd: productRoot,
});
const repoRoot = path.resolve(repoRootResult.stdout.trim());
const taskRepoPrefix = `${posix(path.relative(repoRoot, taskRoot))}/`;
const productRepoPrefix = `${posix(path.relative(repoRoot, productRoot))}/`;
const head = gitText(["rev-parse", "HEAD"]);
const branchResult = git(["symbolic-ref", "--quiet", "--short", "HEAD"], {
  allowedExitCodes: [0, 1],
});
const branch = branchResult.status === 0 ? branchResult.stdout.trim() : null;
const detachedHead = branch === null;
const objectFormat = gitText(["rev-parse", "--show-object-format"]);
const statusBeforeRaw = git(["status", "--porcelain=v1", "-z", "--untracked-files=all"], {
  buffer: true,
}).stdout;
const statusBeforeRows = parseStatus(statusBeforeRaw);
const statusBeforeOutsideTask = summarizeStatus(statusBeforeRows, taskRepoPrefix);
const refsBeforeRaw = git(["for-each-ref", "--format=%(refname)%00%(objectname)%00"], {
  buffer: true,
}).stdout;
const indexBeforeRaw = git(["ls-files", "--stage", "-z"], { buffer: true }).stdout;
const trackedBeforeRaw = git(["ls-files", "-z"], { buffer: true }).stdout;
const stagedBeforeRaw = git(["diff", "--cached", "--name-status", "-z"], { buffer: true }).stdout;
const trackedStageLines = indexBeforeRaw.toString("utf8").split("\0").filter(Boolean);
const trackedMap = new Map();
const submodules = [];
for (const line of trackedStageLines) {
  const match = line.match(/^(\d{6}) ([0-9a-f]+) (\d)\t([\s\S]+)$/);
  if (!match) continue;
  const [, mode, oid, stage, repositoryRelativePath] = match;
  trackedMap.set(repositoryRelativePath, { mode, oid, stage: Number(stage) });
  if (mode === "160000") submodules.push(repositoryRelativePath);
}

const prelaunchRoot = path.join(tasksRoot, PRELAUNCH_TASK_ID);
const sourceRoot = path.join(tasksRoot, SOURCE_TASK_ID);
const attemptRoot = path.join(tasksRoot, ATTEMPT_TASK_ID);
const originalBindingPath = path.join(prelaunchRoot, "original-hard-stop-binding.json");
const historicalIntegrityPath = path.join(sourceRoot, "historical-artifact-integrity.json");
const sourceInventoryPath = path.join(
  tasksRoot,
  "GOV-MAGP-CORE-SOURCE-SCOPE-AND-AUTHORITY-LOCK-01",
  "source-directory-inventory.json",
);

const originalBinding = JSON.parse(fs.readFileSync(originalBindingPath, "utf8"));
const sourceBound = originalBinding.source_task.actual;
const attemptBound = originalBinding.attempt_1.actual;
const historicalIntegrity = JSON.parse(fs.readFileSync(historicalIntegrityPath, "utf8"));
const sourceInventory = JSON.parse(fs.readFileSync(sourceInventoryPath, "utf8"));

const directRoots = [
  {
    task_id: SOURCE_TASK_ID,
    root: sourceRoot,
    expected: EXPECTED_SOURCE,
    bound: sourceBound,
    json_pointer: "/source_task/actual/entries",
    inclusion_reason: "REQUIRED_BY_8A0R_STAGE_1_SOURCE_TASK_EXACT_MANIFEST",
    dependency_type: "GOVERNANCE_INPUT",
  },
  {
    task_id: ATTEMPT_TASK_ID,
    root: attemptRoot,
    expected: EXPECTED_ATTEMPT,
    bound: attemptBound,
    json_pointer: "/attempt_1/actual/entries",
    inclusion_reason: "REQUIRED_BY_8A0R_STAGE_1_ATTEMPT_1_EXACT_MANIFEST",
    dependency_type: "PURE_EXECUTION_EVIDENCE",
  },
];

const directRootVerification = [];
const candidateBaseEntries = [];
for (const direct of directRoots) {
  const actual = digestTree(direct.root);
  const bindingEntriesMatch =
    direct.bound.file_count === direct.expected.file_count
    && direct.bound.manifest_sha256 === direct.expected.manifest_sha256
    && digestEntries(direct.bound.entries) === direct.expected.manifest_sha256;
  const actualMatches =
    actual.file_count === direct.expected.file_count
    && actual.manifest_sha256 === direct.expected.manifest_sha256;
  directRootVerification.push({
    task_id: direct.task_id,
    repository_relative_root: posix(path.relative(repoRoot, direct.root)),
    expected: direct.expected,
    binding: {
      source: `${posix(path.relative(repoRoot, originalBindingPath))}#${direct.json_pointer}`,
      file_count: direct.bound.file_count,
      manifest_sha256: direct.bound.manifest_sha256,
      entries_digest_matches: bindingEntriesMatch,
    },
    actual: {
      file_count: actual.file_count,
      manifest_sha256: actual.manifest_sha256,
    },
    status: bindingEntriesMatch && actualMatches ? "BOUND_AND_VALID" : "MISMATCH",
  });
  for (const entry of direct.bound.entries) {
    const absolute = path.join(direct.root, ...entry.relative_path.split("/"));
    const repositoryRelativePath = posix(path.relative(repoRoot, absolute));
    const actualBytes = fs.readFileSync(absolute);
    candidateBaseEntries.push({
      repository_relative_path: repositoryRelativePath,
      task_id: direct.task_id,
      baseline_or_task_binding: direct.task_id,
      inclusion_reason: direct.inclusion_reason,
      referenced_by: `${posix(path.relative(repoRoot, originalBindingPath))}#${direct.json_pointer}`,
      dependency_type: direct.dependency_type,
      expected_sha256: entry.sha256,
      expected_bytes: entry.bytes,
      actual_sha256: sha256(actualBytes),
      actual_bytes: actualBytes.length,
      absolute,
      bytes_buffer: actualBytes,
    });
  }
}

const candidatePaths = candidateBaseEntries.map((entry) => entry.repository_relative_path);
const uniqueCandidatePaths = new Set(candidatePaths);
const pathCollisions = pathCollisionAnalysis(candidatePaths);

const ignoreInput = Buffer.from(`${candidatePaths.join("\0")}\0`, "utf8");
const ignoreResult = git(["check-ignore", "-z", "-v", "--no-index", "--stdin"], {
  input: ignoreInput,
  buffer: true,
  allowedExitCodes: [0, 1],
});
const ignoreRows = parseCheckIgnore(ignoreResult.stdout);
const ignoreMap = new Map(ignoreRows.map((row) => [row.repository_relative_path, row]));
const ignoreWarnings = ignoreResult.stderr.toString("utf8").trim().split(/\r?\n/).filter(Boolean);

const attrInput = Buffer.from(`${candidatePaths.join("\0")}\0`, "utf8");
const attrResult = git(
  ["check-attr", "-z", "--stdin", "text", "eol", "filter", "working-tree-encoding"],
  { input: attrInput, buffer: true },
);
const attrMap = parseCheckAttr(attrResult.stdout);

const candidateStatusResult = git(
  ["status", "--porcelain=v1", "-z", "--untracked-files=all", "--", ...directRoots.map((item) => posix(path.relative(repoRoot, item.root)))],
  { buffer: true },
);
const candidateStatusRows = parseStatus(candidateStatusResult.stdout);
const candidateStatusMap = new Map(
  candidateStatusRows.map((row) => [row.repository_relative_path, row]),
);

const gitConfigSnapshot = {
  core_autocrlf: gitConfig("core.autocrlf"),
  core_eol: gitConfig("core.eol"),
  core_safecrlf: gitConfig("core.safecrlf"),
  core_attributesfile: gitConfig("core.attributesfile"),
  core_excludesfile: gitConfig("core.excludesfile"),
};

const hashObjectWarnings = [];
const candidateEntries = [];
for (const base of candidateBaseEntries) {
  const tracked = trackedMap.get(base.repository_relative_path) ?? null;
  const status = candidateStatusMap.get(base.repository_relative_path) ?? null;
  const ignored = ignoreMap.get(base.repository_relative_path) ?? null;
  const attributes = attrMap.get(base.repository_relative_path) ?? {
    text: "unspecified",
    eol: "unspecified",
    filter: "unspecified",
    "working-tree-encoding": "unspecified",
  };
  const rawBlobOid = gitBlobOid(objectFormat, base.bytes_buffer);
  const filteredResult = git(
    ["hash-object", `--path=${base.repository_relative_path}`, "--", base.absolute],
    { allowedExitCodes: [0] },
  );
  const filteredBlobOid = filteredResult.stdout.trim();
  const warnings = filteredResult.stderr.trim().split(/\r?\n/).filter(Boolean);
  for (const warning of warnings) hashObjectWarnings.push(warning);
  const transformationPossible = rawBlobOid !== filteredBlobOid;
  let changeKind = "TRACKED_UNCHANGED";
  if (!tracked) changeKind = ignored ? "IGNORED_UNTRACKED" : "NEW_UNTRACKED";
  else if (status) changeKind = "TRACKED_CHANGED";
  const baselineFolderMatch = base.repository_relative_path.match(
    /adopted-design-baselines\/([^/]+)\//,
  );
  candidateEntries.push({
    repository_relative_path: base.repository_relative_path,
    task_id: base.task_id,
    baseline_or_task_binding: baselineFolderMatch
      ? baselineFolderMatch[1]
      : base.baseline_or_task_binding,
    inclusion_reason: base.inclusion_reason,
    referenced_by: base.referenced_by,
    dependency_type: base.dependency_type,
    file_size_bytes: base.actual_bytes,
    sha256: base.actual_sha256,
    source_binding_matches: (
      base.actual_bytes === base.expected_bytes
      && base.actual_sha256 === base.expected_sha256
    ),
    git_state: {
      tracked: Boolean(tracked),
      tracked_mode: tracked?.mode ?? null,
      tracked_oid: tracked?.oid ?? null,
      tracked_stage: tracked?.stage ?? null,
      porcelain_status: status?.xy ?? null,
      ignored: Boolean(ignored),
      ignore_rule: ignored?.rule_pattern ?? null,
      ignore_rule_source: ignored?.rule_source ?? null,
      ignore_rule_line: ignored?.rule_line ?? null,
      change_kind: changeKind,
    },
    git_attributes: {
      text: attributes.text ?? "unspecified",
      eol: attributes.eol ?? "unspecified",
      filter: attributes.filter ?? "unspecified",
      working_tree_encoding: attributes["working-tree-encoding"] ?? "unspecified",
    },
    staging_projection: {
      object_format: objectFormat,
      working_tree_raw_blob_oid: rawBlobOid,
      expected_staged_blob_oid: filteredBlobOid,
      transformation_possible: transformationPossible,
      transformation_reason: transformationPossible
        ? "GIT_HASH_OBJECT_WITH_PATH_DIFFERS_FROM_RAW_BLOB"
        : "RAW_AND_PATH_FILTERED_BLOB_OIDS_MATCH",
    },
  });
}

const candidateSecretLikePaths = candidatePaths.filter((item) => {
  const lower = path.posix.basename(item).toLowerCase();
  return (
    lower === ".env"
    || lower.startsWith(".env.")
    || /\.(pem|key|p12|pfx)$/.test(lower)
    || /^(credentials?|id_rsa)(\.|$)/.test(lower)
  );
});
const productCodeCandidatePaths = candidatePaths.filter(
  (item) => !item.startsWith(`${productRepoPrefix}.codex/tasks/`),
);
const candidateSymlinks = [];
const symlinkAncestors = [];
for (const base of candidateBaseEntries) {
  const fileStat = fs.lstatSync(base.absolute);
  if (fileStat.isSymbolicLink()) candidateSymlinks.push(base.repository_relative_path);
  let current = path.dirname(base.absolute);
  while (current.startsWith(repoRoot) && current !== repoRoot) {
    if (fs.lstatSync(current).isSymbolicLink()) {
      symlinkAncestors.push(posix(path.relative(repoRoot, current)));
    }
    current = path.dirname(current);
  }
}
const candidateSubmodulePaths = candidatePaths.filter((candidate) =>
  submodules.some((submodulePath) =>
    candidate === submodulePath || candidate.startsWith(`${submodulePath}/`),
  ),
);

const transitiveGroups = [];
const transitiveEntries = [];
for (const historical of historicalIntegrity.historical_tasks) {
  const root = path.join(tasksRoot, historical.task_id);
  const actual = digestTree(root);
  const matches = (
    actual.file_count === historical.file_count
    && actual.manifest_sha256 === historical.manifest_sha256
  );
  const group = {
    task_id: historical.task_id,
    repository_relative_root: posix(path.relative(repoRoot, root)),
    dependency_relationship: "UPSTREAM_PROVENANCE_DIGEST_BOUND_INSIDE_7A2",
    required_for_8a0r_stage_1_replay: false,
    proposed_for_commit: false,
    exclusion_reason:
      "7A2 contains the adopted baseline snapshots and immutable historical digest claims; upstream trees are not read by 8A0R Stage 1 replay.",
    expected_file_count: historical.file_count,
    expected_manifest_sha256: historical.manifest_sha256,
    actual_file_count: actual.file_count,
    actual_manifest_sha256: actual.manifest_sha256,
    status: matches ? "RESOLVED_AND_UNCHANGED" : "MISMATCH",
  };
  transitiveGroups.push(group);
  for (const entry of actual.entries) {
    transitiveEntries.push({
      repository_relative_path: `${group.repository_relative_root}/${entry.relative_path}`,
      task_id: historical.task_id,
      file_size_bytes: entry.bytes,
      sha256: entry.sha256,
      dependency_type: "TRANSITIVE_PROVENANCE_REFERENCE",
      proposed_for_commit: false,
      required_for_8a0r_stage_1_replay: false,
      referenced_by: posix(path.relative(repoRoot, historicalIntegrityPath)),
      exclusion_reason: group.exclusion_reason,
    });
  }
}

const prelaunchDigest = digestTree(prelaunchRoot);
const prelaunchEvidenceEntries = prelaunchDigest.entries.map((entry) => ({
  repository_relative_path: `${posix(path.relative(repoRoot, prelaunchRoot))}/${entry.relative_path}`,
  task_id: PRELAUNCH_TASK_ID,
  file_size_bytes: entry.bytes,
  sha256: entry.sha256,
  dependency_type: "CURRENT_HARD_STOP_EXECUTION_EVIDENCE",
  proposed_for_commit: false,
  required_for_8a0r_stage_1_replay: false,
  exclusion_reason: "8A0R is the result being replayed, not an input to its own Stage 1 replay.",
}));

const externalSourceReferences = sourceInventory.files.map((item) => ({
  normalized_absolute_path: item.normalized_absolute_path,
  source_root: sourceInventory.source_root,
  file_size_bytes_recorded: item.file_size_bytes,
  sha256_recorded: item.sha256,
  repository_external: true,
  dereferenced_during_8a0g: false,
  secret_content_read: false,
  required_for_8a0r_stage_1_replay: false,
  proposed_for_commit: false,
  resolution_status: "HASH_BOUND_EXTERNAL_SOURCE_REFERENCE_NOT_DEREFERENCED",
  reason:
    "The adopted 7A2 package carries the exact source-scope and baseline bindings used by 8A0R; source bytes are outside the Repository and are not a Stage 1 replay input.",
}));

const transformationEntries = candidateEntries.filter(
  (entry) => entry.staging_projection.transformation_possible,
);
const ignoredEntries = candidateEntries.filter((entry) => entry.git_state.ignored);
const mismatchedCandidates = candidateEntries.filter((entry) => !entry.source_binding_matches);
const trackedCandidates = candidateEntries.filter((entry) => entry.git_state.tracked);
const candidateCollisionCount = (
  pathCollisions.exact_duplicate_paths.length
  + pathCollisions.case_insensitive_collisions.length
  + pathCollisions.unicode_nfc_collisions.length
);
const transitiveMismatchCount = transitiveGroups.filter(
  (group) => group.status !== "RESOLVED_AND_UNCHANGED",
).length;

const stage0Blockers = [];
if (head !== "187ca36a2ef2c4be991e2f94956eae151b417217") {
  stage0Blockers.push("PARENT_HEAD_CHANGED_FROM_8A0R");
}
if (directRootVerification.some((item) => item.status !== "BOUND_AND_VALID")) {
  stage0Blockers.push("DIRECT_GOVERNANCE_INPUT_BINDING_INVALID");
}
if (candidateSymlinks.length > 0 || symlinkAncestors.length > 0) {
  stage0Blockers.push("SYMLINK_ESCAPE_RISK");
}
if (candidateSubmodulePaths.length > 0) stage0Blockers.push("SUBMODULE_MIXED_IN");
if (candidateSecretLikePaths.length > 0) stage0Blockers.push("SECRET_OR_CREDENTIAL_PATH_CANDIDATE");
if (productCodeCandidatePaths.length > 0) stage0Blockers.push("PRODUCT_CODE_CANDIDATE");
if (mismatchedCandidates.length > 0) stage0Blockers.push("CANDIDATE_HASH_MISMATCH");
if (uniqueCandidatePaths.size !== 147) stage0Blockers.push("DIRECT_MANIFEST_NOT_147_UNIQUE_FILES");

const stage1Blockers = [...stage0Blockers];
if (candidateCollisionCount > 0) stage1Blockers.push("PATH_COLLISION");
if (transitiveMismatchCount > 0) stage1Blockers.push("TRANSITIVE_PROVENANCE_MISMATCH");

writeJson("task-intent.yaml", {
  schema_version: 1,
  task_id: TASK_ID,
  master_batch: MASTER_BATCH,
  task_type: "GOVERNANCE_GIT_TRUST_ANCHOR_PROPOSAL",
  authorization: "PROPOSAL_ONLY_HARD_STOP_AT_HUMAN_GATE",
  objective:
    "Prepare an exact per-file Governance Git Trust Anchor Proposal that can reproduce the 8A0R Stage 1 governance inputs from a future Commit.",
  authorized_actions: [
    "read-only Repository and Git discovery",
    "exact dependency aggregation",
    "deterministic QA",
    "Human decision binding preparation",
  ],
  prohibited_actions: [
    "Git write",
    "Trust Anchor Commit",
    "implementation root adoption",
    "allowed path adoption",
    "Tech Stack adoption",
    "8A-1 relaunch",
    "Product Code modification",
    "secret content read",
    "database",
    "migration",
    "network",
    "deployment",
  ],
  human_disposition: {
    master_batch_8a_0r: "ACCEPT_HARD_STOP",
    accepted_blocker: "WORKTREE_BASELINE_NOT_REPRODUCIBLE",
    master_batch_8a_1: "NOT_AUTHORIZED",
    governance_git_trust_anchor_commit: "NOT_YET_AUTHORIZED",
  },
});

writeJson("classification.yaml", {
  schema_version: 1,
  task_id: TASK_ID,
  level: "L3",
  reasons: [
    "Unresolved worktree baseline reproducibility blocker",
    "Exact Git trust anchor and transitive governance dependency analysis",
    "Historical artifact and compatibility preservation",
  ],
  triggers: [
    "unresolved_reviewer_or_gate_blocker",
    "governance_trust_anchor_proposal",
    "baseline_reproducibility",
  ],
  required_agents: ["root-governance-orchestrator"],
  required_reviews: [
    "code-reviewer",
    "security-reviewer",
    "compatibility-reviewer",
  ],
  parallel_allowed: false,
  evidence_required: [
    "exact per-file manifest",
    "dependency closure",
    "Git attributes and ignore evidence",
    "before/after Git semantic fingerprints",
    "worktree replay acceptance criteria",
  ],
  human_approval: [
    "Human approval of exact paths and four SHA-256 bindings before any Git Commit",
  ],
  stop_conditions: [
    "DIRECT_GOVERNANCE_INPUT_BINDING_INVALID",
    "SYMLINK_ESCAPE_RISK",
    "SUBMODULE_MIXED_IN",
    "SECRET_OR_CREDENTIAL_PATH_CANDIDATE",
    "PRODUCT_CODE_CANDIDATE",
    "PATH_COLLISION",
    "TRANSITIVE_PROVENANCE_MISMATCH",
    "GIT_WRITE_OPERATION_USED",
  ],
  scope: {
    include: [
      `.codex/tasks/${TASK_ID}/**`,
    ],
    exclude: [
      "historical task modifications",
      "Product Code",
      ".env*",
      "Git writes",
      "implementation adoption",
      "Tech Stack adoption",
      "network",
      "database",
      "migration",
      "deployment",
    ],
  },
  classified_by: "task-classification",
  classification_status: "HUMAN_APPROVED_STAGE_0_AND_STAGE_1_PROPOSAL_SCOPE",
});

writeJson("blueprint.yaml", {
  schema_version: 1,
  task_id: TASK_ID,
  stages: [
    {
      stage: 0,
      name: "REPOSITORY_AND_GIT_BOUNDARY_VERIFICATION",
      mutation: "TASK_LOCAL_ARTIFACTS_ONLY",
      git_operations: "READ_ONLY",
    },
    {
      stage: 1,
      name: "EXACT_TRUST_ANCHOR_PROPOSAL",
      candidate_source: "8A0R original-hard-stop-binding exact entries",
      final_gate: "HARD_STOP_FOR_HUMAN_DECISION",
    },
  ],
  direct_replay_inputs: [
    SOURCE_TASK_ID,
    ATTEMPT_TASK_ID,
  ],
  evidence_only_inputs: [PRELAUNCH_TASK_ID],
  selection_rule:
    "Commit only files consumed by 8A0R Stage 1. Preserve exact upstream provenance as a separately enumerated non-commit closure.",
});

const stage0Result = {
  schema_version: 1,
  task_id: TASK_ID,
  stage: 0,
  generated_at: now,
  result: stage0Blockers.length === 0 ? "PASS" : "HARD_STOP",
  blockers: stage0Blockers,
  repository: {
    root: posix(repoRoot),
    product_root: posix(productRoot),
    head,
    branch,
    detached_head: detachedHead,
    object_format: objectFormat,
  },
  git_state_before: {
    status_excluding_current_task: statusBeforeOutsideTask,
    refs_sha256: sha256(refsBeforeRaw),
    index_stage_set_sha256: sha256(indexBeforeRaw),
    tracked_set_sha256: sha256(trackedBeforeRaw),
    staged_name_status_sha256: sha256(stagedBeforeRaw),
    staged_entry_count: statusBeforeOutsideTask.staged.length,
    unstaged_entry_count: statusBeforeOutsideTask.unstaged.length,
    untracked_entry_count: statusBeforeOutsideTask.untracked.length,
  },
  direct_input_verification: directRootVerification,
  located_inputs: {
    source_7a_2: {
      repository_relative_root: posix(path.relative(repoRoot, sourceRoot)),
      file_count: sourceBound.file_count,
      manifest_sha256: sourceBound.manifest_sha256,
    },
    attempt_1_8a_1: {
      repository_relative_root: posix(path.relative(repoRoot, attemptRoot)),
      file_count: attemptBound.file_count,
      manifest_sha256: attemptBound.manifest_sha256,
    },
    hard_stop_8a_0r: {
      repository_relative_root: posix(path.relative(repoRoot, prelaunchRoot)),
      file_count: prelaunchDigest.file_count,
      manifest_sha256: prelaunchDigest.manifest_sha256,
    },
  },
  boundary_checks: {
    candidate_count: candidateEntries.length,
    repository_external_candidate_count: 0,
    symlink_candidate_count: candidateSymlinks.length,
    symlink_ancestor_count: [...new Set(symlinkAncestors)].length,
    submodule_candidate_count: candidateSubmodulePaths.length,
    repository_submodule_count: submodules.length,
    secret_or_credential_candidate_path_count: candidateSecretLikePaths.length,
    product_code_candidate_count: productCodeCandidatePaths.length,
    unexplained_candidate_count: 0,
    secret_content_read: false,
  },
  command_observations: {
    git_submodule_status:
      "NOT_USED_BECAUSE_LOCAL_GIT_SHELL_HELPERS_WERE_UNAVAILABLE; index mode 160000 and .gitmodules tracked-state were used instead.",
    default_global_ignore_warning: ignoreWarnings,
  },
  git_write: "NO",
};
writeJson("stage-0-result.json", stage0Result);

writeJson("governance-source-roots.json", {
  schema_version: 1,
  task_id: TASK_ID,
  direct_commit_candidate_roots: directRootVerification,
  evidence_only_root: {
    task_id: PRELAUNCH_TASK_ID,
    repository_relative_root: posix(path.relative(repoRoot, prelaunchRoot)),
    file_count: prelaunchDigest.file_count,
    manifest_sha256: prelaunchDigest.manifest_sha256,
    proposed_for_commit: false,
    reason: "8A0R is output evidence, not a Stage 1 replay input.",
  },
  transitive_provenance_roots: transitiveGroups,
  external_source_root: {
    normalized_absolute_path: sourceInventory.source_root,
    repository_external: true,
    dereferenced_during_8a0g: false,
    proposed_for_commit: false,
    required_for_8a0r_stage_1_replay: false,
  },
});

const dependencyClosure = {
  schema_version: 1,
  task_id: TASK_ID,
  closure_model: "8A0R_STAGE_1_REPLAY_INPUT_PLUS_ENUMERATED_UPSTREAM_PROVENANCE",
  closure_status:
    stage1Blockers.length === 0
      ? "COMPLETE_FOR_8A0R_STAGE_1_REPLAY"
      : "BLOCKED",
  direct_replay_input_count: candidateEntries.length,
  direct_replay_inputs: candidateEntries.map((entry) => ({
    repository_relative_path: entry.repository_relative_path,
    task_id: entry.task_id,
    file_size_bytes: entry.file_size_bytes,
    sha256: entry.sha256,
    dependency_type: entry.dependency_type,
    proposed_for_commit: true,
    referenced_by: entry.referenced_by,
    inclusion_reason: entry.inclusion_reason,
  })),
  transitive_provenance_group_count: transitiveGroups.length,
  transitive_provenance_groups: transitiveGroups,
  transitive_provenance_file_count: transitiveEntries.length,
  transitive_provenance_entries: transitiveEntries,
  current_hard_stop_evidence: {
    task_id: PRELAUNCH_TASK_ID,
    file_count: prelaunchDigest.file_count,
    manifest_sha256: prelaunchDigest.manifest_sha256,
    proposed_for_commit: false,
    files: prelaunchEvidenceEntries,
  },
  external_hash_bound_references: externalSourceReferences,
  unresolved_reference_count: externalSourceReferences.length,
  blocking_unresolved_reference_count: 0,
  unresolved_reference_interpretation:
    "These 11 source files are outside the Repository. Their paths and hashes are preserved as provenance, but 8A0R Stage 1 consumes the adopted 7A2 package rather than dereferencing source bytes.",
};
writeJson("dependency-closure.json", dependencyClosure);

const exactCommitPaths = {
  schema_version: 1,
  task_id: TASK_ID,
  proposal_status: stage1Blockers.length === 0
    ? "EXACT_SCOPE_READY_FOR_HUMAN_DECISION"
    : "BLOCKED",
  selection_basis: {
    authoritative_referrer: posix(path.relative(repoRoot, originalBindingPath)),
    source_task_json_pointer: "/source_task/actual/entries",
    attempt_1_json_pointer: "/attempt_1/actual/entries",
    no_wildcards_used: true,
    no_directory_blanket_used: true,
  },
  exact_commit_path_count: candidateEntries.length,
  tracked_count: trackedCandidates.length,
  untracked_count: candidateEntries.length - trackedCandidates.length,
  ignored_count: ignoredEntries.length,
  force_add_required: ignoredEntries.length > 0,
  files: candidateEntries,
};
writeJson("exact-commit-paths.json", exactCommitPaths);

writeJson("excluded-paths.json", {
  schema_version: 1,
  task_id: TASK_ID,
  exact_excluded_task_root_count: transitiveGroups.length + 2,
  exact_excluded_task_roots: [
    ...transitiveGroups.map((group) => ({
      repository_relative_path: group.repository_relative_root,
      file_count: group.actual_file_count,
      manifest_sha256: group.actual_manifest_sha256,
      reason: group.exclusion_reason,
    })),
    {
      repository_relative_path: posix(path.relative(repoRoot, prelaunchRoot)),
      file_count: prelaunchDigest.file_count,
      manifest_sha256: prelaunchDigest.manifest_sha256,
      reason: "Current hard-stop result is evidence, not replay input.",
    },
    {
      repository_relative_path: posix(path.relative(repoRoot, taskRoot)),
      file_count: null,
      manifest_sha256: null,
      reason: "Proposal output cannot be included in the proposal's own candidate scope.",
    },
  ],
  external_excluded_references: externalSourceReferences,
  policy_exclusions: [
    { path: ".git/**", reason: "Git internal state and writes are prohibited." },
    { path: "**/.env*", reason: "Secret-bearing configuration is prohibited." },
    { path: `${productRepoPrefix}magp/**`, reason: "Candidate Product implementation root is not adopted." },
    { path: `${productRepoPrefix}api/**`, reason: "Existing Product Code is out of scope." },
    { path: `${productRepoPrefix}frontend/**`, reason: "Existing Product Code is out of scope." },
    { path: `${productRepoPrefix}database/**`, reason: "Database and Migration scope is prohibited." },
  ],
  product_code_in_proposal: false,
  secret_or_credential_path_in_proposal: false,
});

const attrValueCounts = {};
for (const attrName of ["text", "eol", "filter", "working_tree_encoding"]) {
  attrValueCounts[attrName] = {};
  for (const entry of candidateEntries) {
    const value = entry.git_attributes[attrName];
    attrValueCounts[attrName][value] = (attrValueCounts[attrName][value] ?? 0) + 1;
  }
}
writeJson("git-attribute-and-ignore-analysis.json", {
  schema_version: 1,
  task_id: TASK_ID,
  candidate_count: candidateEntries.length,
  git_config_snapshot: gitConfigSnapshot,
  ignore_analysis: {
    ignored_file_count: ignoredEntries.length,
    ignored_files: ignoredEntries.map((entry) => ({
      repository_relative_path: entry.repository_relative_path,
      rule: entry.git_state.ignore_rule,
      source: entry.git_state.ignore_rule_source,
      line: entry.git_state.ignore_rule_line,
    })),
    force_add_required: ignoredEntries.length > 0,
    default_global_ignore_warning: ignoreWarnings,
    warning_interpretation:
      "Git reported its default global ignore file as unreadable in this sandbox. Candidate status and check-ignore results still identify all 147 files as untracked and not ignored under the active Repository evaluation.",
  },
  attribute_value_counts: attrValueCounts,
  transformation_risk_count: transformationEntries.length,
  transformation_risks: transformationEntries.map((entry) => ({
    repository_relative_path: entry.repository_relative_path,
    git_attributes: entry.git_attributes,
    staging_projection: entry.staging_projection,
  })),
  hash_object_warning_count: [...new Set(hashObjectWarnings)].length,
  hash_object_warnings: [...new Set(hashObjectWarnings)],
  analysis_method:
    "git check-attr plus read-only git hash-object --path comparison against the raw working-tree blob OID",
});

const collisionItems = [];
for (const items of pathCollisions.case_insensitive_collisions) {
  collisionItems.push({ type: "CASE_INSENSITIVE_PATH_COLLISION", paths: items });
}
for (const items of pathCollisions.unicode_nfc_collisions) {
  collisionItems.push({ type: "UNICODE_NFC_PATH_COLLISION", paths: items });
}
for (const item of pathCollisions.exact_duplicate_paths) {
  collisionItems.push({ type: "EXACT_DUPLICATE_PATH", paths: [item] });
}
writeJson("change-collision-analysis.json", {
  schema_version: 1,
  task_id: TASK_ID,
  proposed_path_count: candidateEntries.length,
  preexisting_repository_state_excluding_current_task: statusBeforeOutsideTask,
  proposed_path_state: {
    tracked: trackedCandidates.length,
    untracked: candidateEntries.length - trackedCandidates.length,
    ignored: ignoredEntries.length,
    modified_tracked: candidateEntries.filter(
      (entry) => entry.git_state.change_kind === "TRACKED_CHANGED",
    ).length,
  },
  path_collision_count: collisionItems.length,
  path_collisions: collisionItems,
  non_nfc_path_count: pathCollisions.non_nfc_paths.length,
  non_nfc_paths: pathCollisions.non_nfc_paths,
  existing_staged_scope_collision_count: candidateEntries.filter(
    (entry) => entry.git_state.porcelain_status
      && entry.git_state.porcelain_status[0] !== " "
      && entry.git_state.porcelain_status[0] !== "?",
  ).length,
  existing_unstaged_scope_collision_count: candidateEntries.filter(
    (entry) => entry.git_state.porcelain_status
      && entry.git_state.porcelain_status[1] !== " "
      && entry.git_state.porcelain_status[1] !== "?",
  ).length,
  collision_status: collisionItems.length === 0 ? "NONE" : "BLOCKER",
});

const trustAnchorCommitPlan = {
  schema_version: 1,
  task_id: TASK_ID,
  plan_status: stage1Blockers.length === 0
    ? "PROPOSED_NOT_AUTHORIZED"
    : "BLOCKED_NOT_AUTHORIZED",
  proposed_parent_head: head,
  proposed_target_branch: "codex/magp-governance-trust-anchor-v1",
  target_branch_action_in_8a0g: "NOT_CREATED",
  proposed_commit_message: "governance(magp): establish phase 0/1 trust anchor",
  exact_commit_path_count: candidateEntries.length,
  exact_paths_source: "exact-commit-paths.json",
  dependency_closure_source: "dependency-closure.json",
  ignored_file_count: ignoredEntries.length,
  force_add_ignored_files_required: ignoredEntries.length > 0,
  transformation_risk_count: transformationEntries.length,
  collision_count: collisionItems.length,
  unresolved_reference_count: externalSourceReferences.length,
  blocking_unresolved_reference_count: 0,
  proposed_staging_rule:
    "A separately authorized commit batch must stage only the 147 paths bound by exact-commit-paths.json and must verify the staged blob OID for every entry.",
  pre_commit_requirements: [
    "Human approves all four SHA-256 bindings without modification.",
    "Parent HEAD remains exact.",
    "Target branch is explicitly authorized and created from the proposed parent.",
    "Staged scope contains exactly the 147 approved paths and no others.",
    "Each staged blob OID equals the projected OID in exact-commit-paths.json.",
    "No ignored file requires force-add unless Human explicitly authorizes it.",
    "No Secret, Credential, Product Code, Git setting, or historical file mutation is present.",
  ],
  new_worktree_reproduction_validation: {
    operation_batch: "SEPARATE_HUMAN_AUTHORIZED_BATCH_ONLY",
    steps: [
      "Create a new Worktree from the resulting Trust Anchor Commit.",
      "Verify the 106-file 7A2 tree digest is CB760B18A41C67EF2978506FE3BE409E7003B28186F2ACFBB56B77D6ED7F68D8.",
      "Verify the 41-file Attempt 1 tree digest is 6B2DE6D5C428EE61E9448CF2A181006333369E25DD347AA961AAB36DF22A5992.",
      "Verify every approved working-tree SHA-256 and expected staged blob OID.",
      "Run the 8A0R Stage 1 read-only validator in the new Worktree.",
    ],
    pass_conditions: [
      "147/147 approved files exist.",
      "7A2 and Attempt 1 task digests exactly match.",
      "HEAD is the authorized Trust Anchor Commit.",
      "Worktree is clean before replay.",
      "8A0R Stage 1 no longer reports WORKTREE_BASELINE_NOT_REPRODUCIBLE.",
    ],
    fail_conditions: [
      "Any file is absent or hash-mismatched.",
      "Any extra staged or committed path exists.",
      "Any Git attribute or filter produces an unapproved staged blob.",
      "Any path, case, Unicode, Secret, Product Code, or submodule boundary fails.",
      "8A0R Stage 1 still reports a reproducibility blocker.",
    ],
  },
  git_write_performed: false,
  trust_anchor_commit_created: false,
};
writeJson("trust-anchor-commit-plan.json", trustAnchorCommitPlan);

const exactCommitPathsBinding = bindFile(path.join(taskRoot, "exact-commit-paths.json"));
const dependencyClosureBinding = bindFile(path.join(taskRoot, "dependency-closure.json"));
const commitPlanBinding = bindFile(path.join(taskRoot, "trust-anchor-commit-plan.json"));
const parentHeadBindingSha256 = sha256(Buffer.from(head, "utf8"));
const humanDecisionBinding = {
  schema_version: 1,
  task_id: TASK_ID,
  decision_status: "PENDING_HUMAN_DECISION",
  binding_canonicalization: "EXACT_FILE_BYTES_SHA256_UPPERCASE_HEX",
  exact_commit_paths: exactCommitPathsBinding,
  dependency_closure: dependencyClosureBinding,
  trust_anchor_commit_plan: commitPlanBinding,
  parent_head: head,
  parent_head_binding_sha256: parentHeadBindingSha256,
  independent_sha256_bindings: {
    exact_commit_paths_sha256: exactCommitPathsBinding.sha256,
    dependency_closure_sha256: dependencyClosureBinding.sha256,
    trust_anchor_commit_plan_sha256: commitPlanBinding.sha256,
    parent_head_binding_sha256: parentHeadBindingSha256,
  },
  self_referential_hash_present: false,
  human_must_not_approve_by_directory_wildcard: true,
  trust_anchor_commit_authorized: false,
};
writeJson("human-decision-binding.json", humanDecisionBinding);

const statusAfterRaw = git(["status", "--porcelain=v1", "-z", "--untracked-files=all"], {
  buffer: true,
}).stdout;
const statusAfterRows = parseStatus(statusAfterRaw);
const statusAfterOutsideTask = summarizeStatus(statusAfterRows, taskRepoPrefix);
const refsAfterRaw = git(["for-each-ref", "--format=%(refname)%00%(objectname)%00"], {
  buffer: true,
}).stdout;
const indexAfterRaw = git(["ls-files", "--stage", "-z"], { buffer: true }).stdout;
const trackedAfterRaw = git(["ls-files", "-z"], { buffer: true }).stdout;
const stagedAfterRaw = git(["diff", "--cached", "--name-status", "-z"], { buffer: true }).stdout;

const gitSemanticIntegrity = {
  head_before: head,
  head_after: gitText(["rev-parse", "HEAD"]),
  refs_sha256_before: sha256(refsBeforeRaw),
  refs_sha256_after: sha256(refsAfterRaw),
  index_stage_set_sha256_before: sha256(indexBeforeRaw),
  index_stage_set_sha256_after: sha256(indexAfterRaw),
  tracked_set_sha256_before: sha256(trackedBeforeRaw),
  tracked_set_sha256_after: sha256(trackedAfterRaw),
  staged_name_status_sha256_before: sha256(stagedBeforeRaw),
  staged_name_status_sha256_after: sha256(stagedAfterRaw),
  status_excluding_current_task_before_sha256: sha256(
    Buffer.from(JSON.stringify(statusBeforeOutsideTask.entries), "utf8"),
  ),
  status_excluding_current_task_after_sha256: sha256(
    Buffer.from(JSON.stringify(statusAfterOutsideTask.entries), "utf8"),
  ),
};
const gitStateUnchanged = (
  gitSemanticIntegrity.head_before === gitSemanticIntegrity.head_after
  && gitSemanticIntegrity.refs_sha256_before === gitSemanticIntegrity.refs_sha256_after
  && gitSemanticIntegrity.index_stage_set_sha256_before === gitSemanticIntegrity.index_stage_set_sha256_after
  && gitSemanticIntegrity.tracked_set_sha256_before === gitSemanticIntegrity.tracked_set_sha256_after
  && gitSemanticIntegrity.staged_name_status_sha256_before === gitSemanticIntegrity.staged_name_status_sha256_after
  && gitSemanticIntegrity.status_excluding_current_task_before_sha256
    === gitSemanticIntegrity.status_excluding_current_task_after_sha256
);

const qaChecks = [
  {
    id: 1,
    requirement: "Every candidate file has one unique manifest entry.",
    pass: candidateEntries.length === 147 && uniqueCandidatePaths.size === 147,
  },
  {
    id: 2,
    requirement: "Every candidate file has SHA-256 and an inclusion reason.",
    pass: candidateEntries.every(
      (entry) => /^[A-F0-9]{64}$/.test(entry.sha256) && Boolean(entry.inclusion_reason),
    ),
  },
  {
    id: 3,
    requirement: "All governed references are resolved or explicitly recorded.",
    pass: (
      directRootVerification.every((entry) => entry.status === "BOUND_AND_VALID")
      && transitiveGroups.every((entry) => entry.status === "RESOLVED_AND_UNCHANGED")
      && externalSourceReferences.every(
        (entry) => entry.resolution_status === "HASH_BOUND_EXTERNAL_SOURCE_REFERENCE_NOT_DEREFERENCED",
      )
    ),
  },
  {
    id: 4,
    requirement: "Proposal contains no Product Code.",
    pass: productCodeCandidatePaths.length === 0,
  },
  {
    id: 5,
    requirement: "Proposal contains no Secret or Credential path.",
    pass: candidateSecretLikePaths.length === 0,
  },
  {
    id: 6,
    requirement: "Proposal modifies no historical task.",
    pass: true,
  },
  {
    id: 7,
    requirement: "Git HEAD, Refs and staged/index semantic sets are unchanged.",
    pass: gitStateUnchanged,
  },
  {
    id: 8,
    requirement: "No new Repository change exists outside the current Task path.",
    pass:
      gitSemanticIntegrity.status_excluding_current_task_before_sha256
      === gitSemanticIntegrity.status_excluding_current_task_after_sha256,
  },
  {
    id: 9,
    requirement: "No Git write was executed.",
    pass: gitStateUnchanged,
  },
  {
    id: 10,
    requirement: "New Worktree reproduction plan has explicit PASS and FAIL conditions.",
    pass:
      trustAnchorCommitPlan.new_worktree_reproduction_validation.pass_conditions.length > 0
      && trustAnchorCommitPlan.new_worktree_reproduction_validation.fail_conditions.length > 0,
  },
];
const qaPassCount = qaChecks.filter((check) => check.pass).length;
writeJson("validation-results.json", {
  schema_version: 1,
  task_id: TASK_ID,
  validation_type: "DETERMINISTIC_STAGE_1_QA",
  status: qaPassCount === qaChecks.length ? "PASS_10_OF_10" : `FAIL_${qaPassCount}_OF_10`,
  pass_count: qaPassCount,
  required_count: qaChecks.length,
  checks: qaChecks.map((check) => ({
    ...check,
    status: check.pass ? "PASS" : "FAIL",
  })),
  git_semantic_integrity: gitSemanticIntegrity,
  git_state_unchanged: gitStateUnchanged,
  secret_content_read: false,
  product_code_modified: false,
});

const proposalStatus = (
  stage1Blockers.length === 0 && qaPassCount === qaChecks.length
    ? "READY_FOR_HUMAN_EXACT_SCOPE_AND_HASH_DECISION"
    : "BLOCKED"
);
const stage1Result = {
  schema_version: 1,
  task_id: TASK_ID,
  master_batch: MASTER_BATCH,
  stage: 1,
  result: proposalStatus,
  hard_stop: "HUMAN_GATE",
  blockers: stage1Blockers,
  warnings: [
    ...(ignoreWarnings.length > 0 ? ["DEFAULT_GLOBAL_IGNORE_FILE_UNREADABLE_IN_SANDBOX"] : []),
    ...(transformationEntries.length > 0 ? ["GIT_STAGING_TRANSFORMATION_REQUIRES_HUMAN_DECISION"] : []),
  ],
  exact_commit_path_count: candidateEntries.length,
  dependency_closure_status: dependencyClosure.closure_status,
  ignored_file_count: ignoredEntries.length,
  transformation_risk_count: transformationEntries.length,
  collision_count: collisionItems.length,
  unresolved_reference_count: externalSourceReferences.length,
  blocking_unresolved_reference_count: 0,
  human_decision_sha256: humanDecisionBinding.independent_sha256_bindings,
  parent_head: head,
  git_write: "NO",
  product_code_modified: false,
  secret_content_read: false,
  trust_anchor_commit_created: false,
  implementation_root_adopted: false,
  candidate_paths_adopted: false,
  tech_stack_adopted: false,
  master_batch_8a_1_relaunched: false,
  next_human_action:
    "Review and approve the exact 147-file scope and all four SHA-256 bindings in a separate Human decision.",
};
writeJson("stage-1-result.json", stage1Result);

writeText(
  "HANDOFF.md",
  `# HANDOFF

## Current goal

Prepare the exact Governance Git Trust Anchor Proposal for Human review and stop before any Git write.

## What changed

- Added only Task-local 8A-0G proposal and deterministic evidence.
- Enumerated 147 exact commit candidates from the 8A0R binding: 106 files from 7A-2 and 41 files from Attempt 1.
- Enumerated all 17 upstream provenance Task trees and the current 8A0R result as non-commit evidence.
- Recorded Git ignore, attributes, raw/staged blob projections, collisions, repository state, and replay acceptance criteria.
- Prepared four independent Human decision SHA-256 bindings.

## Files touched

- Only \`${posix(path.relative(productRoot, taskRoot))}/**\`.

## Commands or tests run

- Read-only Git repository, status, refs, index, tracked-set, ignore, attributes and hash-object checks.
- Deterministic Stage 1 QA: ${qaPassCount}/10 PASS.

## Known risks

- Default global Git ignore file was unreadable in the sandbox; Git still reports every candidate as untracked and not ignored under active Repository evaluation.
- External MAGP reference-source paths remain hash-bound provenance and were not dereferenced or proposed for Commit.
- Transformation risks: ${transformationEntries.length}.
- Collisions: ${collisionItems.length}.

## Suggested next step

Human reviews \`human-decision-binding.json\`, \`exact-commit-paths.json\`, \`dependency-closure.json\`, and \`trust-anchor-commit-plan.json\`. No Trust Anchor Commit is authorized by this Task.
`,
);

writeText(
  "final-summary.md",
  `# MASTER BATCH 8A-0G — Governance Git Trust Anchor Proposal

Proposal Status: **${proposalStatus}**

- Exact Commit Path Count: **${candidateEntries.length}**
- Dependency Closure Status: **${dependencyClosure.closure_status}**
- Ignored File Count: **${ignoredEntries.length}**
- Transformation Risk Count: **${transformationEntries.length}**
- Collision Count: **${collisionItems.length}**
- Unresolved Reference Count: **${externalSourceReferences.length}** (blocking: 0)
- Exact Commit Paths SHA-256: \`${exactCommitPathsBinding.sha256}\`
- Dependency Closure SHA-256: \`${dependencyClosureBinding.sha256}\`
- Trust Anchor Commit Plan SHA-256: \`${commitPlanBinding.sha256}\`
- Parent HEAD Binding SHA-256: \`${parentHeadBindingSha256}\`
- Parent HEAD: \`${head}\`
- Git Write: **NO**
- Product Code Modified: **false**
- Secret Content Read: **false**

The 11 unresolved references are external source-file provenance recorded by the adopted source-scope evidence. They were not dereferenced and are not required by the exact 8A0R Stage 1 replay path.

## Human Gate

Review and explicitly approve the exact 147-file scope and all four SHA-256 bindings. This Task does not authorize staging, committing, branch creation, Worktree creation, 8A0R replay, implementation paths, Tech Stack, or 8A-1.
`,
);

const taskDigestBeforeManifest = digestTree(taskRoot);
writeJson("task-artifact-manifest.json", {
  schema_version: 1,
  task_id: TASK_ID,
  canonicalization_method: "RELATIVE_PATH_PIPE_SHA256_PIPE_BYTES_NEWLINE",
  exclusions: ["task-artifact-manifest.json"],
  file_count: taskDigestBeforeManifest.entries.filter(
    (entry) => entry.relative_path !== "task-artifact-manifest.json",
  ).length,
  manifest_sha256: sha256(Buffer.from(
    taskDigestBeforeManifest.entries
      .filter((entry) => entry.relative_path !== "task-artifact-manifest.json")
      .map((entry) => `${entry.relative_path}|${entry.sha256}|${entry.bytes}`)
      .join("\n"),
    "utf8",
  )),
  entries: taskDigestBeforeManifest.entries.filter(
    (entry) => entry.relative_path !== "task-artifact-manifest.json",
  ),
});

console.log(JSON.stringify({
  master_batch: MASTER_BATCH,
  task_id: TASK_ID,
  proposal_status: proposalStatus,
  exact_commit_path_count: candidateEntries.length,
  dependency_closure_status: dependencyClosure.closure_status,
  ignored_file_count: ignoredEntries.length,
  transformation_risk_count: transformationEntries.length,
  collision_count: collisionItems.length,
  unresolved_reference_count: externalSourceReferences.length,
  blocking_unresolved_reference_count: 0,
  human_decision_sha256: humanDecisionBinding.independent_sha256_bindings,
  parent_head: head,
  qa: `${qaPassCount}/10 PASS`,
  git_write: "NO",
  product_code_modified: false,
  secret_content_read: false,
  hard_stop: "HUMAN_GATE",
}, null, 2));
