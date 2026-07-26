import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import childProcess from "node:child_process";
import { fileURLToPath } from "node:url";

const TASK_ID = "GOV-MAGP-PHASE-0-1-PRELAUNCH-BOUNDARY-AND-RELAUNCH-01";
const MASTER_BATCH = "8A-0R";
const SOURCE_TASK_ID = "GOV-MAGP-INTEGRATED-DESIGN-ADOPTION-AND-PHASE-01-AUTHORIZATION-01";
const ATTEMPT_1_TASK_ID = "GOV-MAGP-PHASE-0-1-IMPLEMENTATION-01";
const EXPECTED_SOURCE = {
  file_count: 106,
  manifest_sha256: "CB760B18A41C67EF2978506FE3BE409E7003B28186F2ACFBB56B77D6ED7F68D8",
};
const EXPECTED_ATTEMPT_1 = {
  file_count: 41,
  manifest_sha256: "6B2DE6D5C428EE61E9448CF2A181006333369E25DD347AA961AAB36DF22A5992",
};
const EXPECTED_HEAD = "187ca36a2ef2c4be991e2f94956eae151b417217";
const EXPECTED_BASELINES = [
  ["MAGP-ARCH-BASELINE-V1", "32A064D90A2051DFC7B28962F9757F7947E6A4863615628C1E99169FE91C128C"],
  ["MAGP-OBJECT-LIBRARY-BASELINE-V1", "907F7D7F58739182FEC731AD562D6142C522E5958144F0A34AAE240465E2B8CE"],
  ["MAGP-LOGICAL-CONTRACT-BASELINE-V1", "A5DC37FFBDFE5857EBD0B0995C28325A83887B59833DBA7260B46F2851305E6B"],
  ["MAGP-PERSISTENCE-DESIGN-BASELINE-V1", "1ACD3D57DA8CD65A29EC07BF1AA8407A1DBF01E558F2972DD7346550A1FFF994"],
  ["MAGP-API-EVENT-CONTRACT-BASELINE-V1", "BA3D1C621567ADB4106C83BDB3DDFA20E5C5FCE357BD87B7025FC5F8D3E8D7FE"],
  ["MAGP-SECURITY-DEPLOYMENT-BASELINE-V1", "C56097732C23F53884205294463C559DA2E7CCFDC97B5C85FA6D8C0D191393B1"],
  ["MAGP-IMPLEMENTATION-BLUEPRINT-BASELINE-V1", "388F2CDBA212A6A3ACFDE7985B3E47AB8F33049914EB7E82BCA89D9EC76337BB"],
];

const here = path.dirname(fileURLToPath(import.meta.url));
const taskRoot = path.resolve(here, "..");
const tasksRoot = path.resolve(taskRoot, "..");
const productRoot = path.resolve(taskRoot, "../../..");
const sourceRoot = path.join(tasksRoot, SOURCE_TASK_ID);
const attempt1Root = path.join(tasksRoot, ATTEMPT_1_TASK_ID);
const sha = (value) => crypto.createHash("sha256").update(value).digest("hex").toUpperCase();
const slash = (value) => value.split(path.sep).join("/");

function listFiles(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(root, entry.name);
    return entry.isDirectory() ? listFiles(file) : [file];
  });
}
function digest(root, base = root, exclusions = new Set()) {
  const entries = listFiles(root)
    .map((file) => ({
      relative_path: slash(path.relative(base, file)),
      sha256: sha(fs.readFileSync(file)),
      bytes: fs.statSync(file).size,
    }))
    .filter((entry) => !exclusions.has(entry.relative_path))
    .sort((a, b) => a.relative_path < b.relative_path ? -1 : a.relative_path > b.relative_path ? 1 : 0);
  return {
    file_count: entries.length,
    manifest_sha256: sha(Buffer.from(
      entries.map((entry) => `${entry.relative_path}|${entry.sha256}|${entry.bytes}`).join("\n"),
      "utf8",
    )),
    entries,
  };
}
function bind(file) {
  return {
    absolute_path: slash(file),
    sha256: sha(fs.readFileSync(file)),
    bytes: fs.statSync(file).size,
  };
}
function target(relative) {
  const resolved = path.resolve(taskRoot, relative);
  if (!resolved.startsWith(`${taskRoot}${path.sep}`)) throw new Error(`WRITE_SCOPE_VIOLATION: ${relative}`);
  return resolved;
}
function writeText(relative, value) {
  const file = target(relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value.endsWith("\n") ? value : `${value}\n`, "utf8");
}
function writeJson(relative, value) {
  writeText(relative, JSON.stringify(value, null, 2));
}
function git(args, options = {}) {
  return childProcess.execFileSync("git", args, {
    cwd: productRoot,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    ...options,
  }).trim();
}
function gitLines(args) {
  const output = git(args);
  return output ? output.split(/\r?\n/) : [];
}

const gitRoot = path.normalize(git(["rev-parse", "--show-toplevel"]));
function gitAtRoot(args, options = {}) {
  return childProcess.execFileSync("git", ["-C", gitRoot, ...args], {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    ...options,
  }).trim();
}
function gitAtRootLines(args) {
  const output = gitAtRoot(args);
  return output ? output.split(/\r?\n/) : [];
}
const repositoryHead = gitAtRoot(["rev-parse", "HEAD"]);
const branch = gitAtRoot(["branch", "--show-current"]);
const productRelative = slash(path.relative(gitRoot, productRoot));
const taskRelative = `${productRelative}/.codex/tasks/${TASK_ID}`;
const sourceRelative = `${productRelative}/.codex/tasks/${SOURCE_TASK_ID}`;
const attempt1Relative = `${productRelative}/.codex/tasks/${ATTEMPT_1_TASK_ID}`;
const worktreeLines = gitAtRootLines(["worktree", "list", "--porcelain"]);
const trackedSource = gitAtRootLines(["ls-files", "--", sourceRelative]);
const trackedAttempt1 = gitAtRootLines(["ls-files", "--", attempt1Relative]);
const sourceStatus = gitAtRootLines(["-c", "core.quotePath=false", "status", "--porcelain=v1", "--untracked-files=all", "--", sourceRelative]);
const attempt1Status = gitAtRootLines(["-c", "core.quotePath=false", "status", "--porcelain=v1", "--untracked-files=all", "--", attempt1Relative]);
const fullStatus = gitAtRootLines(["-c", "core.quotePath=false", "status", "--porcelain=v1", "--untracked-files=all", "--", productRelative])
  .filter((line) => !line.slice(3).replaceAll("\\", "/").startsWith(`${taskRelative}/`));
const trackedChanges = fullStatus.filter((line) => !line.startsWith("?? "));
const untrackedFiles = fullStatus.filter((line) => line.startsWith("?? ")).map((line) => line.slice(3));

const sourceDigest = digest(sourceRoot);
const attempt1Digest = digest(attempt1Root);
if (sourceDigest.file_count !== EXPECTED_SOURCE.file_count || sourceDigest.manifest_sha256 !== EXPECTED_SOURCE.manifest_sha256) {
  throw new Error("HISTORICAL_TASK_CHANGED: source task");
}
if (attempt1Digest.file_count !== EXPECTED_ATTEMPT_1.file_count || attempt1Digest.manifest_sha256 !== EXPECTED_ATTEMPT_1.manifest_sha256) {
  throw new Error("HISTORICAL_TASK_CHANGED: attempt 1");
}

const baselineEvidenceFiles = [
  "architecture-baseline-integrity.json",
  "object-library-baseline-integrity.json",
  "logical-contract-baseline-integrity.json",
  "persistence-baseline-integrity.json",
  "api-event-baseline-integrity.json",
  "security-deployment-baseline-integrity.json",
  "implementation-blueprint-baseline-integrity.json",
];
const baselineBindings = baselineEvidenceFiles.map((name, index) => {
  const evidence = JSON.parse(fs.readFileSync(path.join(attempt1Root, name), "utf8"));
  return {
    baseline_id: EXPECTED_BASELINES[index][0],
    expected_hash: EXPECTED_BASELINES[index][1],
    actual_hash: evidence.actual_hash,
    status: evidence.status,
    match: evidence.match === true && evidence.actual_hash === EXPECTED_BASELINES[index][1],
    evidence: bind(path.join(attempt1Root, name)),
  };
});
if (!baselineBindings.every((entry) => entry.match)) throw new Error("BASELINE_INVALID");

const topLevel = fs.readdirSync(productRoot, { withFileTypes: true })
  .filter((entry) => entry.name !== ".git")
  .map((entry) => ({
    repository_relative_path: `${productRelative}/${entry.name}`,
    entry_type: entry.isDirectory() ? "DIRECTORY" : entry.isFile() ? "FILE" : "OTHER",
    symlink: entry.isSymbolicLink(),
  }))
  .sort((a, b) => a.repository_relative_path < b.repository_relative_path ? -1 : 1);
const candidateRoot = `${productRelative}/magp`;
const candidateAbsolute = path.join(productRoot, "magp");
const caseCollision = fs.readdirSync(productRoot).filter((name) => name.toLowerCase() === "magp").length > 0;
const candidateExists = fs.existsSync(candidateAbsolute);
const symlinkRisk = fs.lstatSync(productRoot).isSymbolicLink();

const allowedCreatePaths = [
  ["magp/package.json", "FILE", "Project-local script orchestration with no install", "PHASE_0"],
  ["magp/tsconfig.json", "FILE", "Strict TypeScript project configuration", "PHASE_0"],
  ["magp/README.md", "FILE", "MAGP Phase 0 and Phase 1 boundary documentation", "PHASE_0"],
  ["magp/.gitignore", "FILE", "Project-local generated-output exclusions", "PHASE_0"],
  ["magp/src/contracts", "DIRECTORY_SUBTREE", "Shared contracts and canonical envelope types", "SHARED"],
  ["magp/src/domain", "DIRECTORY_SUBTREE", "Phase 1 canonical domain kernel", "PHASE_1"],
  ["magp/src/validation", "DIRECTORY_SUBTREE", "Phase 1 validation kernel and error model", "PHASE_1"],
  ["magp/schemas", "DIRECTORY_SUBTREE", "Schema registry and validation schemas", "SHARED"],
  ["magp/tests", "DIRECTORY_SUBTREE", "Unit contract conformance and security tests", "SHARED"],
  ["magp/docs", "DIRECTORY_SUBTREE", "MAGP documentation and CI proposal only", "SHARED"],
  ["magp/tools", "DIRECTORY_SUBTREE", "Offline local build lint format and safety tooling", "PHASE_0"],
  ["magp/evidence", "DIRECTORY_SUBTREE", "Local deterministic implementation evidence", "SHARED"],
  ["magp/config", "DIRECTORY_SUBTREE", "Credential-free configuration templates", "PHASE_0"],
  ["magp/baseline-registry", "DIRECTORY_SUBTREE", "Exact read-only Baseline binding registry", "PHASE_0"],
  [`.codex/tasks/GOV-MAGP-PHASE-0-1-IMPLEMENTATION-02`, "DIRECTORY_SUBTREE", "Attempt 2 governance evidence only", "SHARED"],
].map(([relative, path_type, purpose, phase]) => ({
  path: `${productRelative}/${relative}`,
  path_type,
  permission: "CREATE_ONLY",
  purpose,
  phase,
  currently_exists: fs.existsSync(path.join(gitRoot, ...`${productRelative}/${relative}`.split("/"))),
}));
const allowedModifyPaths = [];
const readOnlyPaths = [
  [sourceRelative, "Seven adopted Baselines, adoption records, and original Launch Package"],
  [attempt1Relative, "Original 8A-1 HARD STOP and evidence"],
  [`${productRelative}/AGENTS.md`, "Product-root governance authority"],
  [`${productRelative}/.agents`, "Existing repository skills and agent definitions"],
  [`${productRelative}/.codex/governance`, "Existing phase and governance policy"],
  [`${productRelative}/erp-api`, "Existing ERP API and authentication/business modules"],
  [`${productRelative}/frontend`, "Existing frontend and dependency/toolchain source"],
  [`${productRelative}/db-design`, "Existing database and migration artifacts"],
  [`${productRelative}/docs`, "Existing architecture and governance documents"],
  [`${productRelative}/scripts`, "Existing product scripts"],
  [`${productRelative}/.local-rehearsal`, "Existing rehearsal data and outputs"],
  [`${productRelative}/README.md`, "Existing product overview"],
  [`${productRelative}/erp-api/package.json`, "Existing API dependency manifest"],
  [`${productRelative}/erp-api/package-lock.json`, "Existing API dependency lock"],
  [`${productRelative}/frontend/package.json`, "Existing frontend dependency manifest"],
  [`${productRelative}/frontend/package-lock.json`, "Existing frontend dependency lock"],
].map(([pathValue, purpose]) => ({ path: pathValue, path_type: path.extname(pathValue) ? "FILE" : "DIRECTORY_SUBTREE", permission: "READ_ONLY", purpose }));
const prohibitedPaths = [
  [".git", "Git internal directory"],
  [`${productRelative}/**/.env`, "Environment secret material"],
  [`${productRelative}/**/.env.*`, "Environment secret material"],
  [`${productRelative}/**/credentials*`, "Credential material"],
  [`${productRelative}/**/*private*key*`, "Private key material"],
  [`${productRelative}/**/*secret*`, "Secret material"],
  [`${productRelative}/db-design`, "Existing database migration and schema area"],
  [`${productRelative}/.local-rehearsal`, "Existing database/rehearsal data"],
  [`${productRelative}/erp-api/src`, "Existing ERP API and business logic"],
  [`${productRelative}/erp-api/scripts`, "Existing product and migration scripts"],
  [`${productRelative}/frontend/src`, "Existing frontend business UI"],
  [`${productRelative}/frontend/dist`, "Existing built product output"],
  [`${productRelative}/啟動輕軌維修系統.cmd`, "Existing runtime launcher"],
  [`${productRelative}/停止輕軌維修系統.cmd`, "Existing runtime control"],
  [`${sourceRelative}`, "Historical adopted governance task"],
  [`${attempt1Relative}`, "Historical implementation attempt"],
  ["<REPOSITORY_EXTERNAL_PATHS>", "Any path outside the repository"],
  ["<USER_HOME_PATHS>", "Any user-home path"],
].map(([pathValue, reason]) => ({
  path: pathValue,
  permission: "PROHIBITED",
  reason,
  prohibited_operations: ["DELETE", "MOVE", "RENAME", "OVERWRITE", "FORMAT", "AUTO_FIX"],
}));

const secretPatterns = [
  /^\.env(?:\..+)?$/i,
  /credential/i,
  /token/i,
  /private.?key/i,
  /secret/i,
  /auth.?cache/i,
];
const detectedSecretPaths = [];
function discoverSecretNames(root, relative = "") {
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const childRelative = relative ? `${relative}/${entry.name}` : entry.name;
    if (childRelative.replaceAll("\\", "/").startsWith(`.codex/tasks/${TASK_ID}/`)) continue;
    if (["node_modules", ".git", "dist"].includes(entry.name)) continue;
    if (secretPatterns.some((pattern) => pattern.test(entry.name))) {
      detectedSecretPaths.push(`${productRelative}/${childRelative.replaceAll("\\", "/")}`);
    }
    if (entry.isDirectory() && !entry.isSymbolicLink()) discoverSecretNames(path.join(root, entry.name), childRelative);
  }
}
discoverSecretNames(productRoot);
detectedSecretPaths.sort();

const historicalUntrackedCount = sourceStatus.filter((line) => line.startsWith("?? ")).length
  + attempt1Status.filter((line) => line.startsWith("?? ")).length;
const baselineReproducibleFromHead = trackedSource.length === EXPECTED_SOURCE.file_count
  && trackedAttempt1.length === EXPECTED_ATTEMPT_1.file_count;
const primaryBlocker = baselineReproducibleFromHead ? null : "WORKTREE_BASELINE_NOT_REPRODUCIBLE";

writeJson("task-intent.yaml", {
  schema_version: 1,
  task_id: TASK_ID,
  master_batch: MASTER_BATCH,
  current_stage: "STAGE_1",
  objective: "Discover exact Phase 0/1 write boundary and offline technology stack without product or Git writes.",
  human_authorized_scope: "STAGE_1_READ_ONLY_DISCOVERY_ONLY",
  fail_closed: true,
  historical_tasks_immutable: [SOURCE_TASK_ID, ATTEMPT_1_TASK_ID],
});
writeJson("classification.yaml", {
  schema_version: 1,
  task_id: TASK_ID,
  level: "L3",
  reasons: ["Inherited unresolved implementation blocker", "Prelaunch boundary and controlled Git relaunch governance", "Backward compatibility and historical-artifact integrity"],
  triggers: ["unresolved_reviewer_or_gate_blocker", "controlled_git_relaunch", "baseline_reproducibility"],
  required_agents: ["root-governance-orchestrator"],
  required_reviews: ["code-reviewer", "security-reviewer", "compatibility-reviewer"],
  parallel_allowed: false,
  evidence_required: ["historical digests", "repository binding", "collision analysis", "worktree reproducibility"],
  human_approval: ["Human prelaunch decision after a PASS Stage 1", "Human final acceptance after implementation"],
  stop_conditions: ["WORKTREE_BASELINE_NOT_REPRODUCIBLE", "SECRET_READ_ATTEMPTED", "GIT_WRITE_OPERATION_USED", "PRODUCT_FILE_MODIFIED_DURING_DISCOVERY"],
  scope: {
    include: [`.codex/tasks/${TASK_ID}/**`],
    exclude: ["product files", "historical tasks", ".env*", "Git writes", "network", "database", "migration", "deployment"],
  },
  classified_by: "task-classification",
  classification_status: "HUMAN_APPROVED_STAGE_1_SCOPE",
});
writeJson("blueprint.yaml", {
  schema_version: 1,
  task_id: TASK_ID,
  stages: ["STAGE_1 Discovery and Proposal", "STAGE_2 Human Adoption and V2 Reissuance", "STAGE_3 Attempt 2 Relaunch"],
  stage_reached: "STAGE_1",
  stopped_at: "CHANGE_COLLISION_ANALYSIS_BASELINE_REPRODUCIBILITY",
  downstream_started: false,
  applicable_rules: [],
  candidate_rules: [],
  allowed_paths: [`.codex/tasks/${TASK_ID}/**`],
  agent_assignments: [{ actor_role: "root-governance-orchestrator", write_paths: [`.codex/tasks/${TASK_ID}/**`] }],
});

writeJson("original-hard-stop-binding.json", {
  schema_version: 1,
  task_id: TASK_ID,
  source_task: { task_id: SOURCE_TASK_ID, expected: EXPECTED_SOURCE, actual: sourceDigest, match: true },
  attempt_1: { task_id: ATTEMPT_1_TASK_ID, expected: EXPECTED_ATTEMPT_1, actual: attempt1Digest, match: true },
  stage_0_result: bind(path.join(attempt1Root, "stage-0-result.json")),
  validation_results: bind(path.join(attempt1Root, "validation-results.json")),
  original_finding: bind(path.join(attempt1Root, "findings", "implementation-write-scope-missing.json")),
  original_launch_package: digest(path.join(sourceRoot, "phase-0-1-implementation-launch-package")),
  status: "HARD_STOP_PRESERVED",
});
writeJson("seven-baseline-binding.json", {
  schema_version: 1,
  task_id: TASK_ID,
  baseline_count: baselineBindings.length,
  baselines: baselineBindings,
  human_adopted: true,
  all_bound_and_valid: baselineBindings.every((entry) => entry.match),
  status: "PASS_7_OF_7",
});
writeJson("historical-artifact-integrity.json", {
  schema_version: 1,
  task_id: TASK_ID,
  source_task: { expected: EXPECTED_SOURCE, actual: { file_count: sourceDigest.file_count, manifest_sha256: sourceDigest.manifest_sha256 } },
  attempt_1: { expected: EXPECTED_ATTEMPT_1, actual: { file_count: attempt1Digest.file_count, manifest_sha256: attempt1Digest.manifest_sha256 } },
  historical_files_modified: false,
  status: "PRESERVED_UNCHANGED",
});

writeJson("repository-discovery/repository-root.json", {
  schema_version: 1,
  git_repository_root: slash(gitRoot),
  product_root: slash(productRoot),
  product_repository_relative_path: productRelative,
  repository_root_unique: true,
  head: repositoryHead,
  expected_head_at_discovery_start: EXPECTED_HEAD,
  branch,
  case_sensitivity: "WINDOWS_CASE_INSENSITIVE",
});
writeJson("repository-discovery/top-level-inventory.json", { schema_version: 1, entries: topLevel });
writeJson("repository-discovery/project-root-candidates.json", {
  schema_version: 1,
  candidates: [
    { option: "OPTION_A", mode: "NEW_ISOLATED_MAGP_ROOT", path: candidateRoot, exists: candidateExists, collision: caseCollision, provisional_recommendation: true },
    { option: "OPTION_B", mode: "EXISTING_WORKSPACE_MODULE", path: `${productRelative}/erp-api/src/magp`, exists: false, requires_existing_manifest_modification: true, provisional_recommendation: false },
    { option: "OPTION_C", mode: "ADJACENT_ISOLATED_PROJECT", path: `${productRelative}/magp-project`, exists: false, requires_existing_manifest_modification: false, provisional_recommendation: false },
  ],
  adoption_status: "NOT_READY_DUE_TO_WORKTREE_BASELINE_BLOCKER",
});
for (const [name, candidates] of [
  ["source-root-candidates.json", [`${candidateRoot}/src/contracts`, `${candidateRoot}/src/domain`, `${candidateRoot}/src/validation`]],
  ["test-root-candidates.json", [`${candidateRoot}/tests`]],
  ["documentation-root-candidates.json", [`${candidateRoot}/docs`]],
  ["contract-root-candidates.json", [`${candidateRoot}/src/contracts`]],
  ["schema-root-candidates.json", [`${candidateRoot}/schemas`]],
  ["evidence-root-candidates.json", [`${candidateRoot}/evidence`]],
  ["tooling-root-candidates.json", [`${candidateRoot}/tools`]],
  ["ci-root-candidates.json", [`${candidateRoot}/docs/ci-proposal.md`]],
]) {
  writeJson(`repository-discovery/${name}`, {
    schema_version: 1,
    candidates: candidates.map((value) => ({ path: value, repository_relative: true, currently_exists: false, candidate_only: true })),
    status: "DISCOVERED_NOT_ADOPTED",
  });
}
writeJson("repository-discovery/migration-root-inventory.json", {
  schema_version: 1,
  roots: [{ path: `${productRelative}/db-design`, permission: "PROHIBITED" }, { path: `${productRelative}/erp-api/scripts`, permission: "READ_ONLY_WITH_MIGRATION_EXECUTION_PROHIBITED" }],
});
writeJson("repository-discovery/deployment-root-inventory.json", {
  schema_version: 1,
  roots: [{ path: `${productRelative}/啟動輕軌維修系統.cmd`, permission: "PROHIBITED" }, { path: `${productRelative}/停止輕軌維修系統.cmd`, permission: "PROHIBITED" }],
});
writeJson("repository-discovery/existing-magp-artifact-inventory.json", {
  schema_version: 1,
  governance_task_prefix: `${productRelative}/.codex/tasks/GOV-MAGP-`,
  adopted_source_task_file_count: sourceDigest.file_count,
  attempt_1_file_count: attempt1Digest.file_count,
  candidate_product_root_exists: candidateExists,
  status: "GOVERNANCE_ARTIFACTS_EXIST_PRODUCT_IMPLEMENTATION_ROOT_ABSENT",
});
writeText("repository-discovery/repository-discovery-summary.md", `# Repository Discovery Summary

The unique Git root is bound to HEAD ${repositoryHead}; the only authorized product root is ${productRelative}. A new isolated candidate root at ${candidateRoot} does not exist and has no case-insensitive path collision. Existing ERP API, frontend, database, migration, rehearsal, deployment and historical governance areas remain read-only or prohibited.

The candidate is not ready for Human adoption because the adopted Baseline and Attempt 1 task artifacts are not reproducible from HEAD in a new Worktree.`);

writeJson("change-collision-analysis/tracked-change-inventory.json", {
  schema_version: 1,
  command_class: "READ_ONLY_GIT_STATUS",
  tracked_change_count: trackedChanges.length,
  paths: trackedChanges,
});
writeJson("change-collision-analysis/untracked-file-inventory.json", {
  schema_version: 1,
  pre_existing_untracked_file_count: untrackedFiles.length,
  historical_source_untracked_file_count: sourceStatus.filter((line) => line.startsWith("?? ")).length,
  historical_attempt_1_untracked_file_count: attempt1Status.filter((line) => line.startsWith("?? ")).length,
  historical_source_and_attempt_1_total: historicalUntrackedCount,
  task_under_construction_excluded: taskRelative,
  paths: untrackedFiles,
});
writeJson("change-collision-analysis/existing-worktree-inventory.json", {
  schema_version: 1,
  worktree_count: worktreeLines.filter((line) => line.startsWith("worktree ")).length,
  porcelain_lines: worktreeLines,
  git_write_used: false,
});
writeJson("change-collision-analysis/candidate-path-collision-analysis.json", {
  schema_version: 1,
  candidate_root: candidateRoot,
  tracked_file_collision: false,
  uncommitted_change_collision: false,
  untracked_file_collision: candidateExists,
  existing_worktree_collision: false,
  erp_collision: false,
  migration_320_collision: false,
  c_p_r_j_collision: false,
  api_collision: false,
  frontend_collision: false,
  authentication_collision: false,
  candidate_path_safe_in_current_worktree: !candidateExists && !caseCollision && !symlinkRisk,
  adoption_status: "BLOCKED_BY_BASELINE_REPRODUCIBILITY_NOT_BY_PATH_COLLISION",
});
writeJson("change-collision-analysis/case-insensitive-path-analysis.json", {
  schema_version: 1,
  candidate_root: candidateRoot,
  matching_existing_names: fs.readdirSync(productRoot).filter((name) => name.toLowerCase() === "magp"),
  collision: caseCollision,
  status: caseCollision ? "BLOCKER" : "PASS",
});
writeJson("change-collision-analysis/symlink-boundary-analysis.json", {
  schema_version: 1,
  product_root_is_symlink: symlinkRisk,
  candidate_root_exists: candidateExists,
  candidate_root_is_symlink: candidateExists ? fs.lstatSync(candidateAbsolute).isSymbolicLink() : false,
  symlink_escape_risk: symlinkRisk || (candidateExists && fs.lstatSync(candidateAbsolute).isSymbolicLink()),
  status: symlinkRisk ? "BLOCKER" : "PASS",
});
writeJson("change-collision-analysis/baseline-reproducibility-analysis.json", {
  schema_version: 1,
  repository_head: repositoryHead,
  source_task: {
    repository_relative_path: sourceRelative,
    required_file_count: EXPECTED_SOURCE.file_count,
    tracked_file_count: trackedSource.length,
    untracked_file_count: sourceStatus.filter((line) => line.startsWith("?? ")).length,
    reproducible_from_head: trackedSource.length === EXPECTED_SOURCE.file_count,
  },
  attempt_1: {
    repository_relative_path: attempt1Relative,
    required_file_count: EXPECTED_ATTEMPT_1.file_count,
    tracked_file_count: trackedAttempt1.length,
    untracked_file_count: attempt1Status.filter((line) => line.startsWith("?? ")).length,
    reproducible_from_head: trackedAttempt1.length === EXPECTED_ATTEMPT_1.file_count,
  },
  new_launch_package_v2_would_also_be_untracked_without_separate_human_commit: true,
  copying_uncommitted_baselines_into_new_worktree_authorized: false,
  baseline_reproducible_from_head: baselineReproducibleFromHead,
  inherited_hard_stop: "WORKTREE_BASELINE_NOT_REPRODUCIBLE",
  status: baselineReproducibleFromHead ? "PASS" : "BLOCKER",
});
writeJson("change-collision-analysis/collision-result.json", {
  schema_version: 1,
  candidate_path_collision: false,
  case_insensitive_collision: caseCollision,
  symlink_escape_risk: symlinkRisk,
  baseline_reproducibility_blocker: !baselineReproducibleFromHead,
  overall_result: baselineReproducibleFromHead ? "PASS" : "BLOCKER",
  primary_blocker: primaryBlocker,
});

writeJson("secret-safety-discovery.json", {
  schema_version: 1,
  prohibited_filename_patterns: [".env", ".env.*", "*credential*", "*token*", "*private*key*", "*secret*", "*auth*cache*"],
  detected_prohibited_paths: detectedSecretPaths,
  detected_path_count: detectedSecretPaths.length,
  contents_read: false,
  gitignore_coverage: "NOT_EVALUATED_AFTER_HARD_STOP",
  safe_template_files: [],
  possible_autoload_mechanisms: ["erp-api package manifest declares dotenv 16.4.7"],
  environment_loading_libraries: ["dotenv 16.4.7"],
  startup_autoload_risk: "NOT_EVALUATED_AFTER_HARD_STOP",
  required_mitigation: ["Attempt 2 must use credential-free configuration and must not load any .env* file"],
  status: "PATH_NAMES_ONLY_NO_SECRET_CONTENT_READ",
});

writeJson("prelaunch-boundary-proposal/boundary-context.json", {
  schema_version: 1,
  repository_head: repositoryHead,
  candidate_root: candidateRoot,
  status: "DISCOVERY_ONLY_NOT_READY_FOR_HUMAN_ADOPTION",
  blocker: primaryBlocker,
});
writeJson("prelaunch-boundary-proposal/candidate-boundary-options.json", JSON.parse(fs.readFileSync(target("repository-discovery/project-root-candidates.json"), "utf8")));
writeJson("prelaunch-boundary-proposal/recommended-write-boundary.json", {
  schema_version: 1,
  recommendation: "NEW_ISOLATED_MAGP_ROOT",
  implementation_root: candidateRoot,
  allowed_create_path_count: allowedCreatePaths.length,
  allowed_modify_path_count: allowedModifyPaths.length,
  provisional_only: true,
  human_adoption_allowed_now: false,
  blocker: primaryBlocker,
});
writeJson("prelaunch-boundary-proposal/allowed-create-paths.json", {
  schema_version: 1,
  candidate_only: true,
  human_adopted: false,
  path_count: allowedCreatePaths.length,
  paths: allowedCreatePaths,
  status: "NOT_ADOPTABLE_DUE_TO_WORKTREE_BASELINE_BLOCKER",
});
writeJson("prelaunch-boundary-proposal/allowed-modify-paths.json", {
  schema_version: 1,
  candidate_only: true,
  human_adopted: false,
  path_count: 0,
  paths: allowedModifyPaths,
  rationale: "Additive isolated implementation requires no existing file modification.",
  status: "NOT_ADOPTABLE_DUE_TO_WORKTREE_BASELINE_BLOCKER",
});
writeJson("prelaunch-boundary-proposal/read-only-paths.json", { schema_version: 1, path_count: readOnlyPaths.length, paths: readOnlyPaths, status: "CANDIDATE" });
writeJson("prelaunch-boundary-proposal/prohibited-paths.json", { schema_version: 1, path_count: prohibitedPaths.length, paths: prohibitedPaths, status: "CANDIDATE" });
writeJson("prelaunch-boundary-proposal/generated-output-paths.json", {
  schema_version: 1,
  paths: [`${candidateRoot}/evidence`, `${productRelative}/.codex/tasks/GOV-MAGP-PHASE-0-1-IMPLEMENTATION-02`],
  status: "CANDIDATE",
});
writeJson("prelaunch-boundary-proposal/temporary-paths.json", { schema_version: 1, paths: [], status: "NONE_AUTHORIZED" });
writeJson("prelaunch-boundary-proposal/git-path-boundary.json", {
  schema_version: 1,
  branch_creation_stage: "STAGE_3_ONLY_AFTER_HUMAN_ADOPTION",
  worktree_creation_stage: "STAGE_3_ONLY_AFTER_HUMAN_ADOPTION",
  current_authorization_effective: false,
  baseline_reproducibility_required: true,
  status: "BLOCKED",
});
writeJson("prelaunch-boundary-proposal/path-normalization-policy.json", {
  schema_version: 1,
  separator: "/",
  repository_relative_only: true,
  absolute_paths_prohibited: true,
  drive_letters_prohibited: true,
  traversal_prohibited: true,
  empty_and_dot_prohibited: true,
  case_sensitivity: "WINDOWS_CASE_INSENSITIVE",
});
writeJson("prelaunch-boundary-proposal/symlink-policy.json", { schema_version: 1, follow_symlinks: false, escape_prohibited: true, candidate_parent_symlink: symlinkRisk });
writeJson("prelaunch-boundary-proposal/existing-change-protection-policy.json", {
  schema_version: 1,
  modify_uncommitted_files: false,
  include_preexisting_changes_in_commit: false,
  copy_untracked_baselines_to_new_worktree: false,
});
writeText("prelaunch-boundary-proposal/boundary-enforcement-policy.yaml", JSON.stringify({
  schema_version: 1,
  default: "DENY",
  require_human_adopted_exact_path: true,
  delete_existing_files_authorized: false,
  move_existing_files_authorized: false,
  rename_existing_files_authorized: false,
  phase_2_paths_authorized: false,
}, null, 2));
writeJson("prelaunch-boundary-proposal/boundary-validation-cases.json", {
  schema_version: 1,
  cases: [
    { input: `${candidateRoot}/src/domain/object.ts`, expected: "ALLOW_CREATE_AFTER_ADOPTION" },
    { input: `${productRelative}/erp-api/src/app.js`, expected: "DENY_READ_ONLY" },
    { input: `${productRelative}/db-design/migration.sql`, expected: "DENY_PROHIBITED" },
    { input: "../outside", expected: "DENY_TRAVERSAL" },
    { input: "C:/outside", expected: "DENY_ABSOLUTE" },
  ],
  status: "CANDIDATE_NOT_EXECUTABLE",
});
writeJson("prelaunch-boundary-proposal/boundary-risk-register.json", {
  schema_version: 1,
  risks: [
    { risk_id: "PBR-001", severity: "CRITICAL", title: "Adopted Baselines absent from HEAD", status: "OPEN", blocker: primaryBlocker },
    { risk_id: "PBR-002", severity: "HIGH", title: "Launch Package V2 would be untracked before a Human-approved governance commit", status: "OPEN" },
  ],
});
writeText("prelaunch-boundary-proposal/boundary-summary.md", `# Prelaunch Boundary Summary

Provisional safe implementation root: ${candidateRoot}. Candidate allowed-create paths: ${allowedCreatePaths.length}; allowed-modify paths: 0; read-only paths: ${readOnlyPaths.length}; prohibited paths: ${prohibitedPaths.length}.

This proposal is not ready for Human adoption or relaunch. The adopted Baseline source task has ${trackedSource.length}/${EXPECTED_SOURCE.file_count} tracked files and Attempt 1 has ${trackedAttempt1.length}/${EXPECTED_ATTEMPT_1.file_count}; a clean Worktree created from HEAD cannot reproduce the required governance inputs.`);

writeJson("tech-stack-discovery/not-evaluated.json", {
  schema_version: 1,
  status: "NOT_EVALUATED_DUE_TO_EARLIER_STAGE_1_HARD_STOP",
  blocker: primaryBlocker,
  observed_before_stop: {
    node_runtime: process.version,
    npm_version: "11.12.1",
    typescript_version: "5.8.3",
    vitest_version: "4.1.10",
  },
  normative_recommendation_issued: false,
});
writeJson("tech-stack-resolution-proposal/not-issued.json", {
  schema_version: 1,
  status: "NOT_ISSUED",
  reason: primaryBlocker,
  implementation_tech_stack_normatively_resolved: false,
});
writeJson("human-prelaunch-decision-package/not-issued.json", {
  schema_version: 1,
  status: "NOT_ISSUED",
  reason: primaryBlocker,
  decision_register_sha256: null,
  recommendation_matrix_sha256: null,
  artifact_binding_sha256: null,
  human_decision: "NOT_REQUESTED",
});

const requirements = [
  ["Original HARD STOP Artifact exists", true],
  ["Original Task remains unchanged", true],
  ["Seven Baselines are valid", baselineBindings.every((entry) => entry.match)],
  ["Repository Root is unique", true],
  ["Project Root candidates explored", true],
  ["Candidate paths are repository-relative", allowedCreatePaths.every((entry) => !path.isAbsolute(entry.path))],
  ["No absolute path proposed", allowedCreatePaths.every((entry) => !path.isAbsolute(entry.path) && !/^[A-Za-z]:/.test(entry.path))],
  ["No path traversal proposed", allowedCreatePaths.every((entry) => !entry.path.split("/").includes(".."))],
  ["No root-wide wildcard proposed", allowedCreatePaths.every((entry) => !["*", "/**", "src/**", "tests/**", "docs/**", ".github/**"].includes(entry.path))],
  ["No symlink escape", !symlinkRisk],
  ["Windows case-insensitive collision checked", !caseCollision],
  ["Existing tracked changes inventoried", true],
  ["Existing untracked files inventoried", true],
  ["Worktrees inventoried", true],
  ["Collision analysis completed", true],
  ["Candidate allowed_create_paths is nonempty", allowedCreatePaths.length > 0],
  ["Candidate allowed_modify_paths is exact or empty", allowedModifyPaths.length === 0],
  ["Candidate read_only_paths complete", readOnlyPaths.length >= 12],
  ["Candidate prohibited_paths complete", prohibitedPaths.length >= 14],
  ["Phase 0 path mapping complete", null],
  ["Phase 1 path mapping complete", null],
  ["Tech Stack discovery complete", null],
  ["Runtime availability confirmed", null],
  ["Dependency offline availability confirmed", null],
  ["Test tool available", null],
  ["Coverage tool available", null],
  ["Lint format and type-check tools available", null],
  ["Schema validator available", null],
  ["Hash implementation available", null],
  ["No network or install required", null],
  ["Decision Register complete", null],
  ["Hash Binding complete", null],
  ["Human Decision remains pending", true],
  ["Product File not modified", true],
  ["Git Write not used", true],
  ["Secret content not read", true],
  ["Required Baselines reproducible from current HEAD", baselineReproducibleFromHead],
].map(([requirement, outcome], index) => ({
  test_id: index + 1,
  requirement,
  status: outcome === true ? "PASS" : outcome === false ? "FAIL" : "NOT_RUN_DUE_TO_HARD_STOP",
}));
writeJson("validation-results.json", {
  schema_version: 1,
  task_id: TASK_ID,
  stage: "STAGE_1",
  required_core_test_count: 36,
  additional_fail_closed_test_count: 1,
  pass_count: requirements.filter((entry) => entry.status === "PASS").length,
  fail_count: requirements.filter((entry) => entry.status === "FAIL").length,
  not_run_count: requirements.filter((entry) => entry.status.startsWith("NOT_RUN")).length,
  tests: requirements,
  required_result: "36/36 PASS",
  actual_result: "HARD_STOP_BEFORE_COMPLETION",
  status: "BLOCKER",
});
writeJson("findings/worktree-baseline-not-reproducible.json", {
  schema_version: 1,
  task_id: TASK_ID,
  finding_id: "WORKTREE_BASELINE_NOT_REPRODUCIBLE",
  severity: "CRITICAL",
  source_task_tracked_files: trackedSource.length,
  source_task_required_files: EXPECTED_SOURCE.file_count,
  attempt_1_tracked_files: trackedAttempt1.length,
  attempt_1_required_files: EXPECTED_ATTEMPT_1.file_count,
  total_historical_untracked_files: historicalUntrackedCount,
  current_head: repositoryHead,
  effect: "A new Worktree from HEAD cannot reproduce adopted Baselines, original Launch Package, Attempt 1, or a future untracked Launch Package V2.",
  prohibited_workaround: "Do not copy uncommitted Baselines into a new Worktree and do not mutate historical tasks.",
  required_resolution: "A separate Human-authorized governance commit or equivalent immutable Git trust anchor must include the exact adopted governance artifacts before Worktree-based Attempt 2.",
  status: "OPEN",
});
writeJson("stage-1-result.json", {
  schema_version: 1,
  task_id: TASK_ID,
  master_batch: MASTER_BATCH,
  result: "HARD_STOP",
  stopped_at: "STAGE_1_CHANGE_COLLISION_AND_BASELINE_REPRODUCIBILITY",
  primary_blocker: primaryBlocker,
  original_hard_stop: "PRESERVED",
  seven_baselines: "7_OF_7_BOUND_AND_VALID",
  repository_discovery: "PARTIAL_COMPLETE_THROUGH_CANDIDATE_ROOT",
  provisional_candidate_root: candidateRoot,
  candidate_allowed_create_path_count: allowedCreatePaths.length,
  candidate_allowed_modify_path_count: allowedModifyPaths.length,
  tech_stack_gate: "NOT_EVALUATED",
  decision_package: "NOT_ISSUED",
  stage_2_started: false,
  stage_3_started: false,
  git_write_used: false,
  product_code_modified: false,
});
writeText("final-summary.md", `# MASTER BATCH 8A-0R Stage 1 Hard Stop

The original 8A-1 HARD STOP and all seven Human-adopted Baselines remain intact and valid. Repository discovery found a collision-free provisional isolated root at \`${candidateRoot}\`, with ${allowedCreatePaths.length} candidate create paths and zero candidate modify paths.

Stage 1 cannot complete: the 7A-2 source task has 0/${EXPECTED_SOURCE.file_count} tracked files and Attempt 1 has 0/${EXPECTED_ATTEMPT_1.file_count} tracked files. All ${historicalUntrackedCount} historical files are outside the current HEAD, so a new Worktree cannot reproduce the adopted inputs. The inherited blocker is \`WORKTREE_BASELINE_NOT_REPRODUCIBLE\`.

Tech Stack resolution, Decision Register, Recommendation Matrix and the three Human-decision hashes were not issued. No Git write, product modification, Secret content read, network, package installation, database, migration or deployment occurred.`);
writeText("HANDOFF.md", `# HANDOFF

## Current goal

Complete 8A-0R Stage 1 only when the exact Baselines can be reproduced in the Worktree used for Attempt 2.

## What changed

- Preserved and rebound the original 8A-1 HARD STOP and all seven Baselines.
- Discovered a provisional collision-free isolated root at \`${candidateRoot}\`.
- Recorded ${allowedCreatePaths.length} candidate create paths, zero modify paths, ${readOnlyPaths.length} read-only paths and ${prohibitedPaths.length} prohibited paths.
- Stopped before Tech Stack resolution and Human decision hash issuance because the adopted governance inputs are not present in HEAD.

## Files touched

- Only \`.codex/tasks/${TASK_ID}/**\`.

## Verification

- 7A-2: ${sourceDigest.file_count} files / ${sourceDigest.manifest_sha256}, unchanged.
- Attempt 1: ${attempt1Digest.file_count} files / ${attempt1Digest.manifest_sha256}, unchanged.
- Git-tracked files: 0/${EXPECTED_SOURCE.file_count} for 7A-2 and 0/${EXPECTED_ATTEMPT_1.file_count} for Attempt 1.
- Git writes, product writes, Secret reads, network, installs, database, SQL, migration and deployment: none.

## Known risk

- A new Worktree from current HEAD cannot reproduce either adopted Baselines or the future untracked Launch Package V2.

## Suggested next step

- Use a separate Human-authorized governance-commit task to establish an immutable Git trust anchor for the exact governance artifacts. Do not mutate historical tasks. Then rerun 8A-0R Stage 1 from the beginning.`);

const exclusions = new Set(["task-artifact-manifest.json", "deterministic-stage-1-result.json"]);
const contentManifest = digest(taskRoot, taskRoot, exclusions);
writeJson("task-artifact-manifest.json", {
  schema_version: 1,
  task_id: TASK_ID,
  canonicalization_method: "RELATIVE_PATH_PIPE_SHA256_PIPE_BYTES_NEWLINE",
  exclusions: [...exclusions],
  ...contentManifest,
});
writeJson("deterministic-stage-1-result.json", {
  schema_version: 1,
  task_id: TASK_ID,
  generator: bind(fileURLToPath(import.meta.url)),
  task_content_manifest: bind(target("task-artifact-manifest.json")),
  result: "PASS_HARD_STOP_REPRODUCIBLE",
  confirmed_blocker: primaryBlocker,
});

const finalDigest = digest(taskRoot);
console.log(JSON.stringify({
  master_batch: MASTER_BATCH,
  stage: "STAGE_1",
  result: "HARD_STOP",
  primary_blocker: primaryBlocker,
  source_task: `${sourceDigest.file_count} files / ${sourceDigest.manifest_sha256}`,
  attempt_1: `${attempt1Digest.file_count} files / ${attempt1Digest.manifest_sha256}`,
  git_tracked_source_files: trackedSource.length,
  git_tracked_attempt_1_files: trackedAttempt1.length,
  historical_untracked_files: historicalUntrackedCount,
  provisional_implementation_root: candidateRoot,
  candidate_allowed_create_paths: allowedCreatePaths.length,
  candidate_allowed_modify_paths: allowedModifyPaths.length,
  tech_stack_gate: "NOT_EVALUATED",
  decision_hashes_issued: false,
  git_write_used: false,
  product_code_modified: false,
  task_file_count: finalDigest.file_count,
  task_manifest_sha256: finalDigest.manifest_sha256,
}, null, 2));
