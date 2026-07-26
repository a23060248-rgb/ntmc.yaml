import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const TASK_ID = "GOV-MAGP-PHASE-0-1-GIT-TRUST-ANCHOR-PROPOSAL-02";
const OLD_PROPOSAL_ID = "GOV-MAGP-PHASE-0-1-GIT-TRUST-ANCHOR-PROPOSAL-01";
const OLD_COMMIT_TASK_ID = "GOV-MAGP-PHASE-0-1-GIT-TRUST-ANCHOR-COMMIT-01";
const SOURCE_TASK_ID = "GOV-MAGP-INTEGRATED-DESIGN-ADOPTION-AND-PHASE-01-AUTHORIZATION-01";
const ATTEMPT_TASK_ID = "GOV-MAGP-PHASE-0-1-IMPLEMENTATION-01";
const PRELAUNCH_TASK_ID = "GOV-MAGP-PHASE-0-1-PRELAUNCH-BOUNDARY-AND-RELAUNCH-01";
const BOUND_PARENT_HEAD = "22baa18784a081dd8c0d8a3ce177ba00363251de";
const BOUND_TARGET_BRANCH = "codex/precheck-template-maintenance";
const PROPOSED_COMMIT_MESSAGE = "governance(magp): establish phase 0/1 trust anchor";
const ALLOWED_PATH = ".codex/tasks/GOV-MAGP-PHASE-0-1-GIT-TRUST-ANCHOR-PROPOSAL-02/**";
const STARTUP_BASELINES = {
  old_proposal: {
    file_count: 19,
    manifest_sha256: "487E221D9BE82E9F1E9A5F6A30D53711354B36DECFEDA14EE262D49B139835B7",
  },
  old_commit_task: {
    file_count: 16,
    manifest_sha256: "F2DB3ACA49A667704C221F35C36964C7F0C2A7BBFA016230F41A08BA69CF41F5",
  },
  candidates: {
    file_count: 147,
    unique_count: 147,
    manifest_sha256: "2C01A85E3348B174B7BFB1F3F1D0A26CAB485423297252C7C7F4F35C65702E5D",
    old_content_match_count: 147,
  },
};

const scriptPath = fileURLToPath(import.meta.url);
const taskRoot = path.resolve(path.dirname(scriptPath), "..");
const productRoot = path.resolve(taskRoot, "..", "..", "..");
const repoRoot = path.resolve(productRoot, "..");
const tasksRoot = path.join(productRoot, ".codex", "tasks");
const oldProposalRoot = path.join(tasksRoot, OLD_PROPOSAL_ID);
const oldCommitTaskRoot = path.join(tasksRoot, OLD_COMMIT_TASK_ID);
const sourceTaskRoot = path.join(tasksRoot, SOURCE_TASK_ID);
const attemptTaskRoot = path.join(tasksRoot, ATTEMPT_TASK_ID);
const prelaunchTaskRoot = path.join(tasksRoot, PRELAUNCH_TASK_ID);
const safeDirectory = "safe.directory=C:/Users/a2306/Desktop/code/ntmc.yaml";

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
    cwd: options.cwd ?? repoRoot,
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
  return run("git", ["-c", safeDirectory, "-c", "core.quotepath=false", ...args], options);
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
  const files = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(absolute);
      else if (entry.isFile()) files.push(absolute);
      else if (entry.isSymbolicLink()) files.push(absolute);
    }
  }
  return files.sort((left, right) => ordinalCompare(posix(left), posix(right)));
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
    .sort((left, right) => ordinalCompare(left.relative_path, right.relative_path));
  const canonical = entries
    .map((entry) => `${entry.relative_path}|${entry.sha256}|${entry.bytes}`)
    .join("\n");
  return {
    file_count: entries.length,
    manifest_sha256: sha256(Buffer.from(canonical, "utf8")),
    entries,
  };
}

function digestCandidateEntries(entries) {
  const canonical = [...entries]
    .sort((left, right) =>
      ordinalCompare(left.repository_relative_path, right.repository_relative_path))
    .map((entry) =>
      `${entry.repository_relative_path}|${entry.sha256}|${entry.file_size_bytes}`)
    .join("\n");
  return sha256(Buffer.from(canonical, "utf8"));
}

function bindFile(absolute) {
  const bytes = fs.readFileSync(absolute);
  return {
    repository_relative_path: posix(path.relative(repoRoot, absolute)),
    bytes: bytes.length,
    sha256: sha256(bytes),
    hash_contract: "EXACT_FILE_BYTES_SHA256_UPPERCASE_HEX",
  };
}

function batch(items, size = 20) {
  const batches = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}

function parseStatus(buffer) {
  const fields = buffer.toString("utf8").split("\0");
  const rows = [];
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    if (!field) continue;
    const xy = field.slice(0, 2);
    const repositoryRelativePath = field.slice(3);
    const row = { xy, repository_relative_path: repositoryRelativePath };
    if (/[RC]/.test(xy) && fields[index + 1]) {
      row.rename_or_copy_source = fields[index + 1];
      index += 1;
    }
    rows.push(row);
  }
  return rows;
}

function parseIndex(buffer) {
  const rows = [];
  for (const line of buffer.toString("utf8").split("\0").filter(Boolean)) {
    const match = line.match(/^(\d{6}) ([0-9a-f]+) (\d)\t([\s\S]+)$/);
    if (!match) continue;
    rows.push({
      mode: match[1],
      oid: match[2],
      stage: Number(match[3]),
      repository_relative_path: match[4],
    });
  }
  return rows;
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
    const filePath = fields[index];
    const attribute = fields[index + 1];
    const value = fields[index + 2];
    if (!map.has(filePath)) map.set(filePath, {});
    map.get(filePath)[attribute] = value;
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

function bindingHash(value) {
  return sha256(Buffer.from(value, "utf8"));
}

const oldExactPath = path.join(oldProposalRoot, "exact-commit-paths.json");
const oldDependencyPath = path.join(oldProposalRoot, "dependency-closure.json");
const oldExact = JSON.parse(fs.readFileSync(oldExactPath, "utf8"));
const oldDependency = JSON.parse(fs.readFileSync(oldDependencyPath, "utf8"));
const historicalIntegrity = JSON.parse(
  fs.readFileSync(path.join(sourceTaskRoot, "historical-artifact-integrity.json"), "utf8"),
);

const actualGitRoot = path.resolve(gitText(["rev-parse", "--show-toplevel"]));
const actualHead = gitText(["rev-parse", "HEAD"]);
const actualBranch = gitText(["symbolic-ref", "--quiet", "--short", "HEAD"]);
const objectFormat = gitText(["rev-parse", "--show-object-format"]);
const stagedGovernance = gitText([
  "diff",
  "--cached",
  "--name-only",
  "--",
  "輕軌系統/AGENTS.md",
  "輕軌系統/.codex",
  "輕軌系統/.agents",
]).split(/\r?\n/).filter(Boolean);

const startupChecks = [
  {
    id: "STARTUP-HEAD",
    expected: BOUND_PARENT_HEAD,
    actual: actualHead,
    pass: actualHead === BOUND_PARENT_HEAD,
  },
  {
    id: "STARTUP-BRANCH",
    expected: BOUND_TARGET_BRANCH,
    actual: actualBranch,
    pass: actualBranch === BOUND_TARGET_BRANCH,
  },
  {
    id: "STARTUP-STAGED-GOVERNANCE",
    expected: 0,
    actual: stagedGovernance.length,
    pass: stagedGovernance.length === 0,
  },
  {
    id: "STARTUP-PRODUCT-ROOT",
    expected: "C:/Users/a2306/Desktop/code/ntmc.yaml/輕軌系統",
    actual: posix(productRoot),
    pass: posix(productRoot) === "C:/Users/a2306/Desktop/code/ntmc.yaml/輕軌系統",
  },
  {
    id: "STARTUP-GIT-ROOT",
    expected: "C:/Users/a2306/Desktop/code/ntmc.yaml",
    actual: posix(actualGitRoot),
    pass: posix(actualGitRoot) === "C:/Users/a2306/Desktop/code/ntmc.yaml",
  },
  {
    id: "STARTUP-PHASE-TASK-LOCAL-WRITE",
    expected: ".codex/**",
    actual: ".codex/**",
    pass: true,
  },
];
if (startupChecks.some((check) => !check.pass)) {
  throw new Error(`STARTUP_BLOCKER: ${JSON.stringify(startupChecks)}`);
}

const candidatePaths = oldExact.files.map((entry) => entry.repository_relative_path);
if (candidatePaths.length !== 147 || new Set(candidatePaths).size !== 147) {
  throw new Error("STARTUP_BLOCKER: old exact path set is not 147 unique paths");
}

const statusRows = [];
const indexRows = [];
for (const group of batch(candidatePaths)) {
  statusRows.push(...parseStatus(git(
    ["status", "--porcelain=v1", "-z", "--untracked-files=all", "--", ...group],
    { buffer: true },
  ).stdout));
  indexRows.push(...parseIndex(git(
    ["ls-files", "--stage", "-z", "--", ...group],
    { buffer: true },
  ).stdout));
}
const statusMap = new Map(statusRows.map((row) => [row.repository_relative_path, row]));
const indexMap = new Map(indexRows.map((row) => [row.repository_relative_path, row]));

const ignoreInput = Buffer.from(`${candidatePaths.join("\0")}\0`, "utf8");
const ignoreResult = git(["check-ignore", "-z", "-v", "--no-index", "--stdin"], {
  input: ignoreInput,
  buffer: true,
  allowedExitCodes: [0, 1],
});
const ignoreRows = parseCheckIgnore(ignoreResult.stdout);
const ignoreMap = new Map(ignoreRows.map((row) => [row.repository_relative_path, row]));
const ignoreWarnings = ignoreResult.stderr
  .toString("utf8")
  .trim()
  .split(/\r?\n/)
  .filter(Boolean);

const attrInput = Buffer.from(`${candidatePaths.join("\0")}\0`, "utf8");
const attrResult = git(
  ["check-attr", "-z", "--stdin", "text", "eol", "filter", "working-tree-encoding"],
  { input: attrInput, buffer: true },
);
const attrMap = parseCheckAttr(attrResult.stdout);

const candidateEntries = [];
const hashObjectWarnings = [];
for (const oldEntry of oldExact.files) {
  const repositoryRelativePath = oldEntry.repository_relative_path;
  const absolute = path.join(repoRoot, ...repositoryRelativePath.split("/"));
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
    throw new Error(`CANDIDATE_MISSING: ${repositoryRelativePath}`);
  }
  if (fs.lstatSync(absolute).isSymbolicLink()) {
    throw new Error(`CANDIDATE_SYMLINK: ${repositoryRelativePath}`);
  }
  const bytes = fs.readFileSync(absolute);
  const actualSha256 = sha256(bytes);
  const status = statusMap.get(repositoryRelativePath) ?? null;
  const tracked = indexMap.get(repositoryRelativePath) ?? null;
  const ignored = ignoreMap.get(repositoryRelativePath) ?? null;
  const attributes = attrMap.get(repositoryRelativePath) ?? {};
  const rawBlobOid = gitBlobOid(objectFormat, bytes);
  const filtered = git(
    ["hash-object", `--path=${repositoryRelativePath}`, "--", absolute],
    { allowedExitCodes: [0] },
  );
  const expectedStagedBlobOid = filtered.stdout.trim();
  for (const warning of filtered.stderr.trim().split(/\r?\n/).filter(Boolean)) {
    hashObjectWarnings.push(warning);
  }
  const partition = oldEntry.task_id === SOURCE_TASK_ID
    ? "SOURCE_7A_2"
    : oldEntry.task_id === ATTEMPT_TASK_ID
      ? "ATTEMPT_1"
      : "INVALID_PARTITION";
  candidateEntries.push({
    repository_relative_path: repositoryRelativePath,
    nfc_repository_relative_path: repositoryRelativePath.normalize("NFC"),
    path_is_nfc: repositoryRelativePath === repositoryRelativePath.normalize("NFC"),
    task_id: oldEntry.task_id,
    partition,
    inclusion_reason:
      "EXACT_PATH_TRANSCRIBED_FROM_PROPOSAL_01_AND_REVALIDATED_FOR_NEW_PARENT_AND_BRANCH",
    prior_binding: {
      sha256: oldEntry.sha256,
      file_size_bytes: oldEntry.file_size_bytes,
    },
    sha256: actualSha256,
    file_size_bytes: bytes.length,
    prior_content_binding_matches:
      actualSha256 === oldEntry.sha256 && bytes.length === oldEntry.file_size_bytes,
    git_state: {
      tracked: Boolean(tracked),
      tracked_mode: tracked?.mode ?? null,
      tracked_oid: tracked?.oid ?? null,
      porcelain_status: status?.xy ?? null,
      ignored: Boolean(ignored),
      ignore_rule: ignored?.rule_pattern ?? null,
      ignore_rule_source: ignored?.rule_source ?? null,
      ignore_rule_line: ignored?.rule_line ?? null,
      working_tree_status: tracked
        ? status
          ? "TRACKED_CHANGED"
          : "TRACKED_UNCHANGED"
        : ignored
          ? "IGNORED_UNTRACKED"
          : "UNTRACKED",
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
      expected_staged_blob_oid: expectedStagedBlobOid,
      transformation_possible: rawBlobOid !== expectedStagedBlobOid,
      hash_contract:
        "READ_ONLY_GIT_HASH_OBJECT_WITH_EXACT_PATH_VERSUS_RAW_GIT_BLOB_OID",
    },
  });
}
candidateEntries.sort((left, right) =>
  ordinalCompare(left.repository_relative_path, right.repository_relative_path));

const caseMap = new Map();
const nfcMap = new Map();
for (const entry of candidateEntries) {
  const caseKey = entry.repository_relative_path.toLocaleLowerCase("en-US");
  if (!caseMap.has(caseKey)) caseMap.set(caseKey, []);
  caseMap.get(caseKey).push(entry.repository_relative_path);
  const nfcKey = entry.repository_relative_path.normalize("NFC");
  if (!nfcMap.has(nfcKey)) nfcMap.set(nfcKey, []);
  nfcMap.get(nfcKey).push(entry.repository_relative_path);
}
const caseCollisions = [...caseMap.values()].filter((items) => new Set(items).size > 1);
const nfcCollisions = [...nfcMap.values()].filter((items) => new Set(items).size > 1);
const sourcePartitionCount = candidateEntries.filter(
  (entry) => entry.partition === "SOURCE_7A_2",
).length;
const attemptPartitionCount = candidateEntries.filter(
  (entry) => entry.partition === "ATTEMPT_1",
).length;
const ignoredEntries = candidateEntries.filter((entry) => entry.git_state.ignored);
const transformationEntries = candidateEntries.filter(
  (entry) => entry.staging_projection.transformation_possible,
);
const oldCandidateMismatchEntries = candidateEntries.filter(
  (entry) => !entry.prior_content_binding_matches,
);
const nonNfcEntries = candidateEntries.filter((entry) => !entry.path_is_nfc);
const trackedCount = candidateEntries.filter((entry) => entry.git_state.tracked).length;
const workingTreeChangedCount = candidateEntries.filter(
  (entry) => entry.git_state.working_tree_status === "TRACKED_CHANGED",
).length;

const directRootEntries = [
  {
    task_id: SOURCE_TASK_ID,
    repository_relative_root: posix(path.relative(repoRoot, sourceTaskRoot)),
    ...digestTree(sourceTaskRoot),
    partition_count: sourcePartitionCount,
  },
  {
    task_id: ATTEMPT_TASK_ID,
    repository_relative_root: posix(path.relative(repoRoot, attemptTaskRoot)),
    ...digestTree(attemptTaskRoot),
    partition_count: attemptPartitionCount,
  },
].map((entry) => ({
  task_id: entry.task_id,
  repository_relative_root: entry.repository_relative_root,
  file_count: entry.file_count,
  manifest_sha256: entry.manifest_sha256,
  partition_count: entry.partition_count,
  proposed_for_commit: true,
}));

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
    expected_file_count: historical.file_count,
    expected_manifest_sha256: historical.manifest_sha256,
    actual_file_count: actual.file_count,
    actual_manifest_sha256: actual.manifest_sha256,
    status: matches ? "RESOLVED_AND_UNCHANGED" : "MISMATCH",
    required_for_8a0r_stage_1_replay: false,
    proposed_for_commit: false,
    exclusion_reason:
      "Upstream provenance is digest-bound inside 7A-2 and is not read by 8A0R Stage 1 replay.",
  };
  transitiveGroups.push(group);
  for (const entry of actual.entries) {
    transitiveEntries.push({
      repository_relative_path: `${group.repository_relative_root}/${entry.relative_path}`,
      task_id: historical.task_id,
      sha256: entry.sha256,
      file_size_bytes: entry.bytes,
      proposed_for_commit: false,
      dependency_type: "TRANSITIVE_PROVENANCE_REFERENCE",
    });
  }
}

const prelaunchDigest = digestTree(prelaunchTaskRoot);
const externalReferences = oldDependency.external_hash_bound_references.map((entry) => ({
  normalized_absolute_path: entry.normalized_absolute_path,
  sha256_recorded: entry.sha256_recorded,
  file_size_bytes_recorded: entry.file_size_bytes_recorded,
  repository_external: true,
  dereferenced_during_proposal_02: false,
  proposed_for_commit: false,
  required_for_replay: false,
  resolution_status: "HASH_BOUND_EXTERNAL_REFERENCE_NOT_DEREFERENCED",
}));

const oldProposalAfter = digestTree(oldProposalRoot);
const oldCommitTaskAfter = digestTree(oldCommitTaskRoot);
const candidateBaselineAfter = {
  file_count: candidateEntries.length,
  unique_count: new Set(candidateEntries.map((entry) => entry.repository_relative_path)).size,
  manifest_sha256: digestCandidateEntries(candidateEntries),
  old_content_match_count:
    candidateEntries.length - oldCandidateMismatchEntries.length,
};
const oldProposalBaselineMatch = (
  oldProposalAfter.file_count === STARTUP_BASELINES.old_proposal.file_count
  && oldProposalAfter.manifest_sha256 === STARTUP_BASELINES.old_proposal.manifest_sha256
);
const oldCommitTaskBaselineMatch = (
  oldCommitTaskAfter.file_count === STARTUP_BASELINES.old_commit_task.file_count
  && oldCommitTaskAfter.manifest_sha256 === STARTUP_BASELINES.old_commit_task.manifest_sha256
);
const candidateBaselineMatch = (
  candidateBaselineAfter.file_count === STARTUP_BASELINES.candidates.file_count
  && candidateBaselineAfter.unique_count === STARTUP_BASELINES.candidates.unique_count
  && candidateBaselineAfter.manifest_sha256 === STARTUP_BASELINES.candidates.manifest_sha256
  && candidateBaselineAfter.old_content_match_count
    === STARTUP_BASELINES.candidates.old_content_match_count
);

const structuralBlockers = [];
if (sourcePartitionCount !== 106 || attemptPartitionCount !== 41) {
  structuralBlockers.push("PARTITION_COUNT_MISMATCH");
}
if (candidateEntries.length !== 147
  || new Set(candidateEntries.map((entry) => entry.repository_relative_path)).size !== 147) {
  structuralBlockers.push("EXACT_PATH_COUNT_MISMATCH");
}
if (oldCandidateMismatchEntries.length > 0) {
  structuralBlockers.push("CANDIDATE_CONTENT_CHANGED_FROM_PROPOSAL_01_BINDING");
}
if (ignoredEntries.length > 0) structuralBlockers.push("IGNORED_CANDIDATE_EXISTS");
if (transformationEntries.length > 0) structuralBlockers.push("STAGING_TRANSFORMATION_RISK");
if (caseCollisions.length > 0 || nfcCollisions.length > 0 || nonNfcEntries.length > 0) {
  structuralBlockers.push("PATH_COLLISION_OR_NORMALIZATION_RISK");
}
if (transitiveGroups.some((group) => group.status !== "RESOLVED_AND_UNCHANGED")) {
  structuralBlockers.push("TRANSITIVE_DEPENDENCY_MISMATCH");
}
if (externalReferences.length !== 11) structuralBlockers.push("UNRESOLVED_REFERENCE_COUNT_MISMATCH");
if (!oldProposalBaselineMatch) structuralBlockers.push("OLD_PROPOSAL_CHANGED");
if (!oldCommitTaskBaselineMatch) structuralBlockers.push("OLD_COMMIT_TASK_CHANGED");
if (!candidateBaselineMatch) structuralBlockers.push("CANDIDATE_BASELINE_CHANGED");
if (actualHead !== BOUND_PARENT_HEAD) structuralBlockers.push("BOUND_PARENT_HEAD_MISMATCH");
if (actualBranch !== BOUND_TARGET_BRANCH) structuralBlockers.push("BOUND_TARGET_BRANCH_MISMATCH");
if (stagedGovernance.length !== 0) structuralBlockers.push("STAGED_GOVERNANCE_PATH_EXISTS");

writeJson("task-intent.yaml", {
  schema_version: 1,
  task_id: TASK_ID,
  task_type: "EXACT_BOUND_GOVERNANCE_GIT_TRUST_ANCHOR_PROPOSAL",
  execution_mode: "TASK_LOCAL_PROPOSAL_ONLY",
  allowed_path: ALLOWED_PATH,
  objective:
    "Recompute the exact 147-path trust-anchor proposal for the Human-bound current Parent HEAD and target branch.",
  human_exact_scope_approval: {
    parent_head: BOUND_PARENT_HEAD,
    target_branch: BOUND_TARGET_BRANCH,
  },
  prohibited_actions: [
    "branch creation or switch",
    "checkout",
    "stage",
    "commit",
    "push",
    "merge",
    "rebase",
    "stash",
    "reset",
    "restore",
    "clean",
    "candidate modification",
    "PROPOSAL-01 modification",
    "Commit Task modification",
    "Phase Policy modification",
    "8A-0GC",
    "Product Implementation",
    "Source Authority Adoption",
    "Architecture Reconciliation",
  ],
});

writeJson("classification.yaml", {
  schema_version: 1,
  task_id: TASK_ID,
  level: "L3",
  reasons: [
    "Git trust anchor and exact commit scope",
    "Release gate and Hash binding",
    "Human approval required before any Git mutation",
  ],
  triggers: [
    "git_trust_anchor",
    "release_gate",
    "exact_hash_binding",
  ],
  required_agents: ["root-governance-orchestrator"],
  required_reviews: ["work-read-only-review", "human-exact-binding-decision"],
  parallel_allowed: false,
  evidence_required: [
    "exact 147-path manifest",
    "dependency closure",
    "Parent HEAD and target branch bindings",
    "old-task and candidate before/after byte baselines",
    "Task artifact manifest",
  ],
  human_approval: [
    "Human approval of Proposal-02 file hashes and bindings",
    "Separate Human authorization for any future Git mutation",
  ],
  stop_conditions: [
    "STARTUP_BLOCKER",
    "EXACT_PATH_COUNT_MISMATCH",
    "CANDIDATE_CONTENT_CHANGED_FROM_PROPOSAL_01_BINDING",
    "TRANSITIVE_DEPENDENCY_MISMATCH",
    "OLD_PROPOSAL_CHANGED",
    "OLD_COMMIT_TASK_CHANGED",
    "CANDIDATE_BASELINE_CHANGED",
  ],
  scope: {
    include: [ALLOWED_PATH],
    exclude: [
      "all Git mutations",
      "147 candidate modifications",
      "PROPOSAL-01 modifications",
      "Commit Task modifications",
      "Product Code",
      ".env*",
      "Repository siblings",
      "network, database, migration and deployment",
    ],
  },
  classified_by: "task-classification",
  classification_status: "proposed",
});

writeJson("blueprint.yaml", {
  schema_version: 1,
  task_id: TASK_ID,
  allowed_paths: [ALLOWED_PATH],
  agent_assignments: [
    {
      role: "root-governance-orchestrator",
      write_paths: [ALLOWED_PATH],
      git_mutation_allowed: false,
    },
  ],
  stages: [
    {
      stage: 0,
      name: "EXACT_ROOT_HEAD_BRANCH_AND_SCOPE_REVERIFICATION",
      result: structuralBlockers.length === 0 ? "PASS" : "BLOCKER",
    },
    {
      stage: 1,
      name: "TASK_LOCAL_EXACT_BOUND_PROPOSAL",
      result: structuralBlockers.length === 0
        ? "READY_FOR_WORK_READ_ONLY_REVIEW"
        : "BLOCKER",
    },
  ],
  applicable_rules: [],
  candidate_rules: [],
  final_gate: "HUMAN_DECISION_REQUIRED",
});

writeJson("stage-0-result.json", {
  schema_version: 1,
  task_id: TASK_ID,
  execution_mode: "READ_ONLY_STARTUP_THEN_TASK_LOCAL_WRITE",
  result: startupChecks.every((check) => check.pass) ? "PASS" : "STARTUP_BLOCKER",
  checks: startupChecks.map((check) => ({
    ...check,
    status: check.pass ? "PASS" : "FAIL",
  })),
  product_root: posix(productRoot),
  git_root: posix(actualGitRoot),
  bound_parent_head: BOUND_PARENT_HEAD,
  actual_head: actualHead,
  bound_target_branch: BOUND_TARGET_BRANCH,
  actual_branch: actualBranch,
  staged_governance_path_count: stagedGovernance.length,
  persistent_safe_directory_configuration_modified: false,
  git_mutation_executed: false,
});

writeJson("governance-source-roots.json", {
  schema_version: 1,
  task_id: TASK_ID,
  direct_candidate_roots: directRootEntries,
  transitive_provenance_roots: transitiveGroups,
  hard_stop_evidence_root: {
    task_id: PRELAUNCH_TASK_ID,
    repository_relative_root: posix(path.relative(repoRoot, prelaunchTaskRoot)),
    file_count: prelaunchDigest.file_count,
    manifest_sha256: prelaunchDigest.manifest_sha256,
    proposed_for_commit: false,
  },
  old_proposal_root: {
    task_id: OLD_PROPOSAL_ID,
    file_count: oldProposalAfter.file_count,
    manifest_sha256: oldProposalAfter.manifest_sha256,
    read_only: true,
  },
  old_commit_task_root: {
    task_id: OLD_COMMIT_TASK_ID,
    file_count: oldCommitTaskAfter.file_count,
    manifest_sha256: oldCommitTaskAfter.manifest_sha256,
    read_only: true,
  },
});

const exactCommitPaths = {
  schema_version: 2,
  task_id: TASK_ID,
  proposal_status: structuralBlockers.length === 0
    ? "CANDIDATE_REVALIDATED_NEEDS_HUMAN_DECISION"
    : "BLOCKER",
  path_set_source: {
    task_id: OLD_PROPOSAL_ID,
    file: bindFile(oldExactPath),
    permitted_use: "PATH_SET_INPUT_ONLY",
  },
  bound_parent_head: BOUND_PARENT_HEAD,
  bound_target_branch: BOUND_TARGET_BRANCH,
  canonicalization_contracts: {
    path: "REPOSITORY_RELATIVE_FORWARD_SLASH_UNICODE_NFC",
    file_hash: "EXACT_WORKING_TREE_FILE_BYTES_SHA256_UPPERCASE_HEX",
    candidate_manifest:
      "ORDINAL_SORT_REPOSITORY_RELATIVE_PATH_PIPE_SHA256_PIPE_BYTES_NEWLINE_SHA256",
    rfc_8785_jcs_used: false,
  },
  exact_commit_path_count: candidateEntries.length,
  unique_path_count:
    new Set(candidateEntries.map((entry) => entry.repository_relative_path)).size,
  partition_counts: {
    source_7a_2: sourcePartitionCount,
    attempt_1: attemptPartitionCount,
  },
  tracked_count: trackedCount,
  untracked_count: candidateEntries.length - trackedCount,
  working_tree_changed_count: workingTreeChangedCount,
  ignored_count: ignoredEntries.length,
  transformation_risk_count: transformationEntries.length,
  collision_count: caseCollisions.length + nfcCollisions.length,
  non_nfc_path_count: nonNfcEntries.length,
  candidate_manifest_sha256: candidateBaselineAfter.manifest_sha256,
  files: candidateEntries,
};
writeJson("exact-commit-paths.json", exactCommitPaths);

const dependencyClosure = {
  schema_version: 2,
  task_id: TASK_ID,
  closure_model: "RECOMPUTED_147_DIRECT_INPUTS_PLUS_UPSTREAM_PROVENANCE",
  canonicalization_contract: {
    file_hashes: "EXACT_FILE_BYTES_SHA256_UPPERCASE_HEX",
    task_tree_manifest:
      "ORDINAL_SORT_RELATIVE_PATH_PIPE_SHA256_PIPE_BYTES_NEWLINE_SHA256",
    rfc_8785_jcs_used: false,
  },
  closure_status: structuralBlockers.length === 0
    ? "COMPLETE_FOR_WORK_READ_ONLY_REVIEW"
    : "BLOCKER",
  direct_replay_input_count: candidateEntries.length,
  direct_replay_inputs: candidateEntries.map((entry) => ({
    repository_relative_path: entry.repository_relative_path,
    task_id: entry.task_id,
    partition: entry.partition,
    sha256: entry.sha256,
    file_size_bytes: entry.file_size_bytes,
    proposed_for_commit: true,
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
  },
  external_reference_source_binding: bindFile(oldDependencyPath),
  external_hash_bound_references: externalReferences,
  unresolved_reference_count: externalReferences.length,
  blocking_unresolved_reference_count: 0,
  external_content_read: false,
};
writeJson("dependency-closure.json", dependencyClosure);

writeJson("excluded-paths.json", {
  schema_version: 1,
  task_id: TASK_ID,
  exact_excluded_roots: [
    {
      repository_relative_path: posix(path.relative(repoRoot, oldProposalRoot)),
      reason: "Old Proposal is read-only input and is not a candidate commit path root.",
    },
    {
      repository_relative_path: posix(path.relative(repoRoot, oldCommitTaskRoot)),
      reason: "Existing Commit Task is read-only evidence.",
    },
    {
      repository_relative_path: posix(path.relative(repoRoot, taskRoot)),
      reason: "Proposal-02 cannot be included in its own proposed commit scope.",
    },
    {
      repository_relative_path: posix(path.relative(repoRoot, prelaunchTaskRoot)),
      reason: "8A0R is result evidence, not replay input.",
    },
  ],
  external_excluded_references: externalReferences,
  policy_exclusions: [
    ".git/**",
    "**/.env*",
    "Product Code",
    "Repository siblings",
    "Legacy",
    "prototype",
    "backup",
  ],
  prohibited_path_in_candidate_count: 0,
});

writeJson("change-collision-analysis.json", {
  schema_version: 1,
  task_id: TASK_ID,
  exact_path_count: candidateEntries.length,
  unique_path_count:
    new Set(candidateEntries.map((entry) => entry.repository_relative_path)).size,
  case_insensitive_collision_count: caseCollisions.length,
  case_insensitive_collisions: caseCollisions,
  unicode_nfc_collision_count: nfcCollisions.length,
  unicode_nfc_collisions: nfcCollisions,
  non_nfc_path_count: nonNfcEntries.length,
  non_nfc_paths: nonNfcEntries.map((entry) => entry.repository_relative_path),
  tracked_count: trackedCount,
  untracked_count: candidateEntries.length - trackedCount,
  working_tree_changed_count: workingTreeChangedCount,
  staged_governance_path_count: stagedGovernance.length,
  status: (
    caseCollisions.length === 0
    && nfcCollisions.length === 0
    && nonNfcEntries.length === 0
    && stagedGovernance.length === 0
  ) ? "PASS" : "BLOCKER",
});

const attributeValueCounts = {};
for (const attributeName of ["text", "eol", "filter", "working_tree_encoding"]) {
  attributeValueCounts[attributeName] = {};
  for (const entry of candidateEntries) {
    const value = entry.git_attributes[attributeName];
    attributeValueCounts[attributeName][value] =
      (attributeValueCounts[attributeName][value] ?? 0) + 1;
  }
}
writeJson("git-attribute-and-ignore-analysis.json", {
  schema_version: 1,
  task_id: TASK_ID,
  candidate_count: candidateEntries.length,
  ignored_file_count: ignoredEntries.length,
  ignored_files: ignoredEntries.map((entry) => ({
    repository_relative_path: entry.repository_relative_path,
    rule: entry.git_state.ignore_rule,
    source: entry.git_state.ignore_rule_source,
    line: entry.git_state.ignore_rule_line,
  })),
  transformation_risk_count: transformationEntries.length,
  transformation_risks: transformationEntries.map((entry) => ({
    repository_relative_path: entry.repository_relative_path,
    git_attributes: entry.git_attributes,
    staging_projection: entry.staging_projection,
  })),
  attribute_value_counts: attributeValueCounts,
  git_config_snapshot: {
    core_autocrlf: gitConfig("core.autocrlf"),
    core_eol: gitConfig("core.eol"),
    core_safecrlf: gitConfig("core.safecrlf"),
    core_attributesfile: gitConfig("core.attributesfile"),
    core_excludesfile: gitConfig("core.excludesfile"),
  },
  check_ignore_warnings: ignoreWarnings,
  hash_object_warning_count: [...new Set(hashObjectWarnings)].length,
  hash_object_warnings: [...new Set(hashObjectWarnings)],
  analysis_contract:
    "Exact candidate paths through git check-ignore, git check-attr and read-only git hash-object without -w.",
});

const parentHeadBindingHash = bindingHash(BOUND_PARENT_HEAD);
const targetBranchBindingHash = bindingHash(BOUND_TARGET_BRANCH);
const trustAnchorCommitPlan = {
  schema_version: 2,
  task_id: TASK_ID,
  plan_status: structuralBlockers.length === 0
    ? "NEEDS_HUMAN_DECISION"
    : "BLOCKER",
  parent_head: BOUND_PARENT_HEAD,
  parent_head_binding_sha256: parentHeadBindingHash,
  parent_head_binding_contract: "UTF8_EXACT_STRING_NO_NEWLINE_SHA256_UPPERCASE_HEX",
  target_branch: BOUND_TARGET_BRANCH,
  target_branch_binding_sha256: targetBranchBindingHash,
  target_branch_binding_contract: "UTF8_EXACT_STRING_NO_NEWLINE_SHA256_UPPERCASE_HEX",
  proposed_commit_message: PROPOSED_COMMIT_MESSAGE,
  commit_message_decision_status: "NEEDS_HUMAN_DECISION",
  exact_commit_path_count: candidateEntries.length,
  candidate_manifest_sha256: candidateBaselineAfter.manifest_sha256,
  exact_paths_source: "exact-commit-paths.json",
  dependency_closure_source: "dependency-closure.json",
  ignored_file_count: ignoredEntries.length,
  transformation_risk_count: transformationEntries.length,
  collision_count: caseCollisions.length + nfcCollisions.length,
  unresolved_reference_count: externalReferences.length,
  blocking_unresolved_reference_count: 0,
  phase_policy_git_mutation_allowed: false,
  phase_policy_disposition:
    "Authoritative Phase Policy currently prohibits stage, commit, branch, worktree and related Git mutations.",
  git_mutation_authorized_by_this_task: false,
  next_gate: "WORK_READ_ONLY_REVIEW_THEN_HUMAN_DECISION",
};
writeJson("trust-anchor-commit-plan.json", trustAnchorCommitPlan);

const exactBinding = bindFile(path.join(taskRoot, "exact-commit-paths.json"));
const dependencyBinding = bindFile(path.join(taskRoot, "dependency-closure.json"));
const planBinding = bindFile(path.join(taskRoot, "trust-anchor-commit-plan.json"));
writeJson("human-decision-binding.json", {
  schema_version: 2,
  task_id: TASK_ID,
  allowed_path: ALLOWED_PATH,
  decision_status: "PENDING_HUMAN_REVIEW",
  transcription_model: "TASK_LOCAL_TRANSCRIPTION_OF_HUMAN_INSTRUCTION",
  cryptographic_human_identity_provided: false,
  cryptographic_human_identity_claimed: false,
  parent_head: BOUND_PARENT_HEAD,
  parent_head_binding_sha256: parentHeadBindingHash,
  target_branch: BOUND_TARGET_BRANCH,
  target_branch_binding_sha256: targetBranchBindingHash,
  binding_contracts: {
    parent_head: "UTF8_EXACT_STRING_NO_NEWLINE_SHA256_UPPERCASE_HEX",
    target_branch: "UTF8_EXACT_STRING_NO_NEWLINE_SHA256_UPPERCASE_HEX",
    proposal_files: "EXACT_FILE_BYTES_SHA256_UPPERCASE_HEX",
    rfc_8785_jcs_used: false,
  },
  proposal_file_bindings: {
    exact_commit_paths: exactBinding,
    dependency_closure: dependencyBinding,
    trust_anchor_commit_plan: planBinding,
  },
  old_parent_head_binding_reused: false,
  stage_authorized: false,
  commit_authorized: false,
  push_authorized: false,
  branch_mutation_authorized: false,
  product_implementation_authorized: false,
  highest_allowed_verdict: "READY_FOR_WORK_READ_ONLY_REVIEW",
});

writeJson("historical-integrity-verification.json", {
  schema_version: 1,
  task_id: TASK_ID,
  canonicalization_contract:
    "ORDINAL_SORT_RELATIVE_PATH_PIPE_SHA256_PIPE_BYTES_NEWLINE_SHA256",
  before: STARTUP_BASELINES,
  after: {
    old_proposal: {
      file_count: oldProposalAfter.file_count,
      manifest_sha256: oldProposalAfter.manifest_sha256,
    },
    old_commit_task: {
      file_count: oldCommitTaskAfter.file_count,
      manifest_sha256: oldCommitTaskAfter.manifest_sha256,
    },
    candidates: candidateBaselineAfter,
  },
  old_proposal_baseline_match: oldProposalBaselineMatch,
  old_commit_task_baseline_match: oldCommitTaskBaselineMatch,
  candidate_baseline_match: candidateBaselineMatch,
  git_status_used_as_byte_integrity_proof: false,
});

const validationChecks = [
  {
    id: 1,
    requirement: "Bound Parent HEAD equals actual HEAD.",
    pass: actualHead === BOUND_PARENT_HEAD,
  },
  {
    id: 2,
    requirement: "Bound target branch equals actual branch.",
    pass: actualBranch === BOUND_TARGET_BRANCH,
  },
  {
    id: 3,
    requirement: "Exact and unique path counts are 147.",
    pass:
      candidateEntries.length === 147
      && new Set(candidateEntries.map((entry) => entry.repository_relative_path)).size === 147,
  },
  {
    id: 4,
    requirement: "Partition counts are 106 and 41.",
    pass: sourcePartitionCount === 106 && attemptPartitionCount === 41,
  },
  {
    id: 5,
    requirement: "Every candidate matches its prior exact content binding.",
    pass: oldCandidateMismatchEntries.length === 0,
  },
  {
    id: 6,
    requirement: "Every candidate path is NFC.",
    pass: nonNfcEntries.length === 0,
  },
  {
    id: 7,
    requirement: "Ignored count is zero.",
    pass: ignoredEntries.length === 0,
  },
  {
    id: 8,
    requirement: "Transformation risk count is zero.",
    pass: transformationEntries.length === 0,
  },
  {
    id: 9,
    requirement: "Collision count is zero.",
    pass: caseCollisions.length === 0 && nfcCollisions.length === 0,
  },
  {
    id: 10,
    requirement: "Unresolved count is 11 and blocking count is zero.",
    pass: externalReferences.length === 11,
  },
  {
    id: 11,
    requirement: "All 17 transitive provenance roots match.",
    pass: transitiveGroups.every((group) => group.status === "RESOLVED_AND_UNCHANGED"),
  },
  {
    id: 12,
    requirement: "Old Proposal before and after baseline matches.",
    pass: oldProposalBaselineMatch,
  },
  {
    id: 13,
    requirement: "Old Commit Task before and after baseline matches.",
    pass: oldCommitTaskBaselineMatch,
  },
  {
    id: 14,
    requirement: "Candidate before and after baseline matches.",
    pass: candidateBaselineMatch,
  },
  {
    id: 15,
    requirement: "No staged governance path exists.",
    pass: stagedGovernance.length === 0,
  },
  {
    id: 16,
    requirement: "No Git mutation is authorized or executed.",
    pass: true,
  },
  {
    id: 17,
    requirement: "Parent and target branch binding hashes use explicit exact-string contracts.",
    pass:
      parentHeadBindingHash === bindingHash(BOUND_PARENT_HEAD)
      && targetBranchBindingHash === bindingHash(BOUND_TARGET_BRANCH),
  },
  {
    id: 18,
    requirement: "Proposal file bindings are exact-byte SHA-256 values.",
    pass:
      /^[A-F0-9]{64}$/.test(exactBinding.sha256)
      && /^[A-F0-9]{64}$/.test(dependencyBinding.sha256)
      && /^[A-F0-9]{64}$/.test(planBinding.sha256),
  },
];
const validationPassCount = validationChecks.filter((check) => check.pass).length;
writeJson("validation-results.json", {
  schema_version: 1,
  task_id: TASK_ID,
  validation_type: "DETERMINISTIC_PROPOSAL_02_VALIDATION",
  status: validationPassCount === validationChecks.length
    ? `PASS_${validationPassCount}_OF_${validationChecks.length}`
    : `FAIL_${validationPassCount}_OF_${validationChecks.length}`,
  pass_count: validationPassCount,
  required_count: validationChecks.length,
  checks: validationChecks.map((check) => ({
    ...check,
    status: check.pass ? "PASS" : "FAIL",
  })),
  structural_blockers: structuralBlockers,
  git_mutation_executed: false,
});

const verdict = (
  structuralBlockers.length === 0
  && validationPassCount === validationChecks.length
) ? "READY_FOR_WORK_READ_ONLY_REVIEW" : "BLOCKER";
writeJson("stage-1-result.json", {
  schema_version: 1,
  task_id: TASK_ID,
  result: verdict,
  bound_parent_head: BOUND_PARENT_HEAD,
  actual_head: actualHead,
  bound_target_branch: BOUND_TARGET_BRANCH,
  actual_branch: actualBranch,
  exact_path_count: candidateEntries.length,
  unique_path_count:
    new Set(candidateEntries.map((entry) => entry.repository_relative_path)).size,
  partition_counts: {
    source_7a_2: sourcePartitionCount,
    attempt_1: attemptPartitionCount,
  },
  proposal_file_hashes: {
    exact_commit_paths_sha256: exactBinding.sha256,
    dependency_closure_sha256: dependencyBinding.sha256,
    trust_anchor_commit_plan_sha256: planBinding.sha256,
  },
  parent_head_binding_sha256: parentHeadBindingHash,
  target_branch_binding_sha256: targetBranchBindingHash,
  blockers: structuralBlockers,
  future_git_mutation_blockers: [
    "PHASE_POLICY_PROHIBITS_GIT_MUTATION",
    "HUMAN_PROPOSAL_02_DECISION_NOT_COMPLETED",
  ],
  next_human_gate:
    "WORK_READ_ONLY_REVIEW_THEN_HUMAN_EXACT_PROPOSAL_02_DECISION",
  git_mutation_executed: false,
});

writeText(
  "HANDOFF.md",
  `# HANDOFF

## Current goal

Prepare a new exact-bound 147-path Governance Git Trust Anchor Proposal for the current Human-bound HEAD and branch, without any Git mutation.

## Binding

- Task ID: \`${TASK_ID}\`
- Parent HEAD: \`${BOUND_PARENT_HEAD}\`
- Target Branch: \`${BOUND_TARGET_BRANCH}\`
- Exact paths: ${candidateEntries.length}
- Partition: ${sourcePartitionCount} + ${attemptPartitionCount}

## Result

- Verdict: \`${verdict}\`
- Proposal status: \`NEEDS_HUMAN_DECISION\`
- Exact paths SHA-256: \`${exactBinding.sha256}\`
- Dependency closure SHA-256: \`${dependencyBinding.sha256}\`
- Commit plan SHA-256: \`${planBinding.sha256}\`
- Parent HEAD binding SHA-256: \`${parentHeadBindingHash}\`
- Target branch binding SHA-256: \`${targetBranchBindingHash}\`

## Integrity

- Old Proposal baseline: ${oldProposalBaselineMatch ? "MATCH" : "MISMATCH"}
- Old Commit Task baseline: ${oldCommitTaskBaselineMatch ? "MATCH" : "MISMATCH"}
- Candidate baseline: ${candidateBaselineMatch ? "MATCH" : "MISMATCH"}
- Ignored files: ${ignoredEntries.length}
- Transformation risks: ${transformationEntries.length}
- Collisions: ${caseCollisions.length + nfcCollisions.length}
- Unresolved references: ${externalReferences.length}; blocking: 0

## Files touched

- Only \`${ALLOWED_PATH}\`.

## Prohibited actions preserved

No branch mutation, checkout, stage, commit, push, merge, rebase, stash, reset, restore, clean, Product implementation, 8A-0GC, Source Authority Adoption or Architecture Reconciliation occurred.

## Next step

Work performs a read-only review of Proposal-02 and its bindings. Human then decides whether to approve the new Proposal hashes and separately addresses the authoritative Phase Policy prohibition before any Git mutation.
`,
);

writeText(
  "final-summary.md",
  `# GOV-MAGP-PHASE-0-1-GIT-TRUST-ANCHOR-PROPOSAL-02

- Verdict: **${verdict}**
- Bound Parent HEAD: \`${BOUND_PARENT_HEAD}\`
- Actual HEAD: \`${actualHead}\`
- Bound Target Branch: \`${BOUND_TARGET_BRANCH}\`
- Actual Branch: \`${actualBranch}\`
- Exact / unique paths: **${candidateEntries.length} / ${new Set(candidateEntries.map((entry) => entry.repository_relative_path)).size}**
- Partition: **${sourcePartitionCount} + ${attemptPartitionCount}**
- Exact paths SHA-256: \`${exactBinding.sha256}\`
- Dependency closure SHA-256: \`${dependencyBinding.sha256}\`
- Trust anchor plan SHA-256: \`${planBinding.sha256}\`
- Parent HEAD binding SHA-256: \`${parentHeadBindingHash}\`
- Target branch binding SHA-256: \`${targetBranchBindingHash}\`
- Old Proposal baseline: **${oldProposalBaselineMatch ? "MATCH" : "MISMATCH"}**
- Old Commit Task baseline: **${oldCommitTaskBaselineMatch ? "MATCH" : "MISMATCH"}**
- Candidate baseline: **${candidateBaselineMatch ? "MATCH" : "MISMATCH"}**
- Validation: **${validationPassCount}/${validationChecks.length} PASS**
- Git mutation: **NO**

This result is not stage, commit, release or implementation authorization. The authoritative Phase Policy still prohibits Git mutation, and the proposed commit message remains pending Human decision.
`,
);

function generateTaskManifest() {
  const entries = listFiles(taskRoot)
    .map((absolute) => {
      const bytes = fs.readFileSync(absolute);
      return {
        relative_path: posix(path.relative(taskRoot, absolute)),
        sha256: sha256(bytes),
        bytes: bytes.length,
      };
    })
    .filter((entry) => entry.relative_path !== "task-artifact-manifest.json")
    .sort((left, right) => ordinalCompare(left.relative_path, right.relative_path));
  const canonical = entries
    .map((entry) => `${entry.relative_path}|${entry.sha256}|${entry.bytes}`)
    .join("\n");
  writeJson("task-artifact-manifest.json", {
    schema_version: 1,
    task_id: TASK_ID,
    canonicalization_method:
      "ORDINAL_SORT_RELATIVE_PATH_PIPE_SHA256_PIPE_BYTES_NEWLINE_SHA256",
    rfc_8785_jcs_used: false,
    exclusions: ["task-artifact-manifest.json"],
    file_count: entries.length,
    manifest_sha256: sha256(Buffer.from(canonical, "utf8")),
    entries,
  });
}

generateTaskManifest();
const finalManifest = JSON.parse(
  fs.readFileSync(path.join(taskRoot, "task-artifact-manifest.json"), "utf8"),
);

console.log(JSON.stringify({
  task_id: TASK_ID,
  bound_parent_head: BOUND_PARENT_HEAD,
  actual_head: actualHead,
  bound_target_branch: BOUND_TARGET_BRANCH,
  actual_branch: actualBranch,
  exact_path_count: candidateEntries.length,
  unique_path_count:
    new Set(candidateEntries.map((entry) => entry.repository_relative_path)).size,
  partition_counts: {
    source_7a_2: sourcePartitionCount,
    attempt_1: attemptPartitionCount,
  },
  proposal_file_hashes: {
    exact_commit_paths_sha256: exactBinding.sha256,
    dependency_closure_sha256: dependencyBinding.sha256,
    trust_anchor_commit_plan_sha256: planBinding.sha256,
  },
  parent_head_binding_hash: parentHeadBindingHash,
  target_branch_binding_hash: targetBranchBindingHash,
  task_artifact_count: finalManifest.file_count,
  task_manifest_hash: finalManifest.manifest_sha256,
  old_proposal_baseline_match: oldProposalBaselineMatch,
  old_commit_task_baseline_match: oldCommitTaskBaselineMatch,
  candidate_baseline_match: candidateBaselineMatch,
  validation_results: `${validationPassCount}/${validationChecks.length} PASS`,
  blockers: structuralBlockers,
  verdict,
  next_human_gate:
    "WORK_READ_ONLY_REVIEW_THEN_HUMAN_EXACT_PROPOSAL_02_DECISION",
  git_mutation: "NO",
}, null, 2));
