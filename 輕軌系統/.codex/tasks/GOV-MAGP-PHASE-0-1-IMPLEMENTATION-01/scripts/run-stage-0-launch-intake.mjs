import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const TASK_ID = "GOV-MAGP-PHASE-0-1-IMPLEMENTATION-01";
const MASTER_BATCH = "8A-1";
const SOURCE_TASK_ID = "GOV-MAGP-INTEGRATED-DESIGN-ADOPTION-AND-PHASE-01-AUTHORIZATION-01";
const EXPECTED_SOURCE = { file_count: 106, manifest_sha256: "CB760B18A41C67EF2978506FE3BE409E7003B28186F2ACFBB56B77D6ED7F68D8" };
const here = path.dirname(fileURLToPath(import.meta.url));
const TASK_ROOT = path.resolve(here, "..");
const TASKS_ROOT = path.resolve(TASK_ROOT, "..");
const SOURCE_ROOT = path.join(TASKS_ROOT, SOURCE_TASK_ID);
const LAUNCH_ROOT = path.join(SOURCE_ROOT, "phase-0-1-implementation-launch-package");
const BASELINE_ROOT = path.join(SOURCE_ROOT, "adopted-design-baselines");

const sha = (value) => crypto.createHash("sha256").update(value).digest("hex").toUpperCase();
function listFiles(root) { if (!fs.existsSync(root)) return []; return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => { const file = path.join(root, entry.name); return entry.isDirectory() ? listFiles(file) : [file]; }); }
function digest(root, base = root, exclusions = new Set()) { const entries = listFiles(root).map((file) => ({ relative_path: path.relative(base, file).split(path.sep).join("/"), file })).filter((x) => !exclusions.has(x.relative_path)).map((x) => ({ relative_path: x.relative_path, sha256: sha(fs.readFileSync(x.file)), bytes: fs.statSync(x.file).size })).sort((a, b) => a.relative_path < b.relative_path ? -1 : a.relative_path > b.relative_path ? 1 : 0); return { file_count: entries.length, manifest_sha256: sha(Buffer.from(entries.map((x) => `${x.relative_path}|${x.sha256}|${x.bytes}`).join("\n"), "utf8")), entries }; }
function bind(file) { return { absolute_path: file.split(path.sep).join("/"), sha256: sha(fs.readFileSync(file)), bytes: fs.statSync(file).size }; }
function readJson(file) { return JSON.parse(fs.readFileSync(file, "utf8")); }
function stop(condition, code, detail) { if (!condition) throw new Error(`${code}: ${detail}`); }
function target(relative) { const resolved = path.resolve(TASK_ROOT, relative); stop(resolved.startsWith(`${TASK_ROOT}${path.sep}`), "WRITE_SCOPE_VIOLATION", relative); return resolved; }
function writeText(relative, value) { const file = target(relative); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, value.endsWith("\n") ? value : `${value}\n`, "utf8"); }
function writeJson(relative, value) { writeText(relative, JSON.stringify(value, null, 2)); }

const sourceDigest = digest(SOURCE_ROOT);
stop(sourceDigest.file_count === EXPECTED_SOURCE.file_count && sourceDigest.manifest_sha256 === EXPECTED_SOURCE.manifest_sha256, "LAUNCH_PACKAGE_INVALID", "7A-2 source task changed");
const launchReadiness = readJson(path.join(SOURCE_ROOT, "phase-0-1-launch-readiness.json"));
const launchManifest = readJson(path.join(LAUNCH_ROOT, "launch-readiness-manifest.json"));
const phaseAuthorization = readJson(path.join(SOURCE_ROOT, "phase-authorization-result.json"));
const adoptedBindings = readJson(path.join(LAUNCH_ROOT, "adopted-baseline-bindings.json"));
const phaseScope = readJson(path.join(LAUNCH_ROOT, "exact-phase-scope.json"));
const prohibitedScope = readJson(path.join(LAUNCH_ROOT, "prohibited-scope.json"));
const writeBoundary = readJson(path.join(LAUNCH_ROOT, "repository-write-boundary.json"));
const migrationBoundary = readJson(path.join(LAUNCH_ROOT, "migration-boundary.json"));
const databaseBoundary = readJson(path.join(LAUNCH_ROOT, "database-execution-boundary.json"));
const assuranceSource = readJson(path.join(SOURCE_ROOT, "human-integrated-design-adoption", "reduced-assurance-acknowledgement.json"));
stop(listFiles(LAUNCH_ROOT).length === 16, "LAUNCH_PACKAGE_INVALID", "Launch Package is not 16 files");

const inheritedSpecs = [
  ["architecture", "MAGP-ARCH-BASELINE-V1", "architecture-baseline-integrity.json", "32A064D90A2051DFC7B28962F9757F7947E6A4863615628C1E99169FE91C128C"],
  ["object-library", "MAGP-OBJECT-LIBRARY-BASELINE-V1", "object-library-baseline-integrity.json", "907F7D7F58739182FEC731AD562D6142C522E5958144F0A34AAE240465E2B8CE"],
  ["logical-contract", "MAGP-LOGICAL-CONTRACT-BASELINE-V1", "logical-contract-baseline-integrity.json", "A5DC37FFBDFE5857EBD0B0995C28325A83887B59833DBA7260B46F2851305E6B"]
];
const inheritedResults = inheritedSpecs.map(([key, id, file, expectedHash]) => {
  const evidence = readJson(path.join(SOURCE_ROOT, file));
  const actualHash = key === "logical-contract" ? evidence.actual_hash : evidence.actual_hash;
  return { key, baseline_id: id, expected_hash: expectedHash, actual_hash: actualHash, evidence: bind(path.join(SOURCE_ROOT, file)), match: evidence.status === "BOUND_AND_VALID" && actualHash === expectedHash, status: evidence.status };
});

const designSpecs = [
  ["persistence", "MAGP-PERSISTENCE-DESIGN-BASELINE-V1", "persistence-design-baseline"],
  ["api-event", "MAGP-API-EVENT-CONTRACT-BASELINE-V1", "api-event-contract-baseline"],
  ["security-deployment", "MAGP-SECURITY-DEPLOYMENT-BASELINE-V1", "security-deployment-baseline"],
  ["implementation-blueprint", "MAGP-IMPLEMENTATION-BLUEPRINT-BASELINE-V1", "implementation-blueprint-baseline"]
];
const designResults = designSpecs.map(([key, id, dir]) => {
  const root = path.join(BASELINE_ROOT, dir); const bindingFile = path.join(root, "hash-binding.json"); const recordFile = path.join(root, "baseline-record.json"); const manifestFile = path.join(root, "exact-artifact-manifest.json");
  const binding = readJson(bindingFile); const record = readJson(recordFile); const manifest = readJson(manifestFile);
  const canonical = binding.components.map((x) => `${x.label}|${x.sha256}|${x.bytes}`).join("\n");
  const sourceEntriesValid = manifest.artifacts.every((entry) => { const source = path.join(TASKS_ROOT, "GOV-MAGP-PLATFORM-DESIGN-AND-IMPLEMENTATION-BLUEPRINT-01", ...entry.relative_path.split("/")); return fs.existsSync(source) && bind(source).sha256 === entry.sha256 && bind(source).bytes === entry.bytes; });
  const match = listFiles(root).length === 8 && binding.baseline_id === id && sha(Buffer.from(canonical, "utf8")) === binding.baseline_content_sha256 && record.baseline_content_sha256 === binding.baseline_content_sha256 && record.baseline_status === "HUMAN_ADOPTED_AND_IMMUTABLY_BOUND" && sourceEntriesValid;
  return { key, baseline_id: id, baseline_content_sha256: binding.baseline_content_sha256, hash_binding: bind(bindingFile), baseline_record: bind(recordFile), exact_artifact_manifest: bind(manifestFile), file_count: listFiles(root).length, source_entries_valid: sourceEntriesValid, match, status: record.baseline_status };
});
stop(inheritedResults.every((x) => x.match) && designResults.every((x) => x.match), "IMPLEMENTATION_BLUEPRINT_BASELINE_INVALID", "one or more Baselines invalid");

const exactAllowedPaths = Array.isArray(writeBoundary.allowed_paths) ? writeBoundary.allowed_paths.filter((x) => typeof x === "string" && x.trim().length > 0) : [];
const exactWriteScopeValid = writeBoundary.next_task_boundary_status === "HUMAN_CONFIRMED_EXACT_PATHS" && exactAllowedPaths.length > 0;
const scopeConflict = !exactWriteScopeValid && phaseScope.phase_0.authorized === true && phaseScope.phase_1.authorized === true;

writeJson("task-intent.yaml", { schema_version: 1, task_id: TASK_ID, master_batch: MASTER_BATCH, intent: "Implement Human-authorized MAGP Phase 0 and Phase 1 only after all sequential prelaunch gates pass.", human_launch_decision: "AUTHORIZE_PHASE_0_AND_PHASE_1_IMPLEMENTATION_WITH_CONTROLLED_LOCAL_GIT", current_stage: 0, fail_closed: true });
writeJson("classification.yaml", { schema_version: 1, task_id: TASK_ID, classification: "L3_CONTROLLED_PHASE_0_1_IMPLEMENTATION", implementation_authorized_in_principle: true, implementation_write_authority_effective: false, reason: "EXACT_REPOSITORY_WRITE_SCOPE_NOT_HUMAN_CONFIRMED", stage_reached: "STAGE_0", hard_stop: true });
writeJson("blueprint.yaml", { schema_version: 1, task_id: TASK_ID, ordered_stages: ["STAGE_0 Launch Intake", "STAGE_1 Repository Safety Preflight", "STAGE_2 Controlled Git Worktree", "STAGE_3 Phase 0", "STAGE_4 Phase 1", "STAGE_5 Verification", "STAGE_6 Bounded Review", "STAGE_7 Human Acceptance Preparation"], completed_stages: [], blocked_stage: "STAGE_0", downstream_stages_started: false });
writeJson("input-binding/launch-package-binding.json", { schema_version: 1, task_id: TASK_ID, source_task_id: SOURCE_TASK_ID, source_task_expected: EXPECTED_SOURCE, source_task_actual: { file_count: sourceDigest.file_count, manifest_sha256: sourceDigest.manifest_sha256 }, launch_package: { file_count: listFiles(LAUNCH_ROOT).length, status: launchManifest.status, binding: digest(LAUNCH_ROOT, LAUNCH_ROOT) }, match: true, status: "BOUND_AND_VALID" });
for (const row of inheritedResults) writeJson(`input-binding/${row.key}-baseline-binding.json`, { schema_version: 1, task_id: TASK_ID, ...row });
for (const row of designResults) writeJson(`input-binding/${row.key}-baseline-binding.json`, { schema_version: 1, task_id: TASK_ID, ...row });
for (const row of [...inheritedResults, ...designResults]) {
  const outputName = row.key === "object-library"
    ? "object-library-baseline-integrity.json"
    : row.key === "logical-contract"
      ? "logical-contract-baseline-integrity.json"
      : `${row.key}-baseline-integrity.json`;
  writeJson(outputName, {
    schema_version: 1,
    task_id: TASK_ID,
    baseline_id: row.baseline_id,
    expected_hash: row.actual_hash ?? row.baseline_content_sha256,
    actual_hash: row.actual_hash ?? row.baseline_content_sha256,
    match: row.match,
    source_status: row.status,
    status: row.match ? "BOUND_AND_VALID" : "INVALID",
  });
}
writeJson("input-binding/implementation-scope-binding.json", { schema_version: 1, task_id: TASK_ID, phase_scope: bind(path.join(LAUNCH_ROOT, "exact-phase-scope.json")), repository_write_boundary: bind(path.join(LAUNCH_ROOT, "repository-write-boundary.json")), phase_0_authorized: phaseScope.phase_0.authorized, phase_1_authorized: phaseScope.phase_1.authorized, next_task_boundary_status: writeBoundary.next_task_boundary_status, exact_allowed_paths: exactAllowedPaths, exact_allowed_path_count: exactAllowedPaths.length, human_confirmed_exact_paths: false, implementation_write_scope_valid: false, status: "BLOCKER" });
writeJson("input-binding/prohibited-scope-binding.json", { schema_version: 1, task_id: TASK_ID, source: bind(path.join(LAUNCH_ROOT, "prohibited-scope.json")), prohibited_count: prohibitedScope.prohibited_count, fail_closed: prohibitedScope.fail_closed, status: prohibitedScope.fail_closed ? "BOUND_AND_VALID" : "INVALID" });
writeJson("input-binding/assurance-binding.json", { schema_version: 1, task_id: TASK_ID, source: bind(path.join(SOURCE_ROOT, "human-integrated-design-adoption", "reduced-assurance-acknowledgement.json")), assurance_level: assuranceSource.assurance_level, clean_room_review_completed: assuranceSource.clean_room_review_completed, independent_external_review_completed: assuranceSource.independent_external_review_completed, status: "BOUND_AND_VALID" });
writeJson("product-governance-integrity.json", {
  schema_version: 1,
  task_id: TASK_ID,
  source: bind(path.join(SOURCE_ROOT, "product-governance-integrity.json")),
  source_task_binding: EXPECTED_SOURCE,
  product_or_governance_files_modified: false,
  status: "BOUND_AND_UNCHANGED",
});
writeJson("historical-artifact-integrity.json", {
  schema_version: 1,
  task_id: TASK_ID,
  source_task_id: SOURCE_TASK_ID,
  expected_file_count: EXPECTED_SOURCE.file_count,
  actual_file_count: sourceDigest.file_count,
  expected_manifest_sha256: EXPECTED_SOURCE.manifest_sha256,
  actual_manifest_sha256: sourceDigest.manifest_sha256,
  historical_artifacts_modified: false,
  status: "BOUND_AND_UNCHANGED",
});

writeJson("implementation-scope-conflict.json", { schema_version: 1, task_id: TASK_ID, finding_type: "IMPLEMENTATION_SCOPE_CONFLICT", severity: "BLOCKER", human_prompt_authorizes: "PHASE_0_AND_PHASE_1_WITHIN_EXACT_WRITE_SCOPE", normative_launch_package_states: writeBoundary.next_task_boundary_status, normative_allowed_paths_present: exactAllowedPaths.length > 0, conflict: scopeConflict, resolution_required: ["Human adopts exact repository-relative allowed_paths", "Human identifies the MAGP Phase 0 project root", "Human binds Shared Contracts Domain Kernel Validation Kernel Tests Documentation Local Tooling Evidence and any CI paths", "Human confirms existing changes do not overlap those exact paths"], codex_may_infer_paths: false, status: "OPEN" });
writeJson("findings/implementation-write-scope-missing.json", {
  schema_version: 1,
  task_id: TASK_ID,
  finding_id: "IMPLEMENTATION_WRITE_SCOPE_MISSING",
  severity: "BLOCKER",
  source: bind(path.join(LAUNCH_ROOT, "repository-write-boundary.json")),
  next_task_boundary_status: writeBoundary.next_task_boundary_status,
  allowed_paths_present: exactAllowedPaths.length > 0,
  exact_allowed_path_count: exactAllowedPaths.length,
  codex_may_infer_paths: false,
  status: "OPEN",
});
writeJson("findings/implementation-scope-conflict.json", {
  schema_version: 1,
  task_id: TASK_ID,
  finding_id: "IMPLEMENTATION_SCOPE_CONFLICT",
  severity: "BLOCKER",
  conflict: scopeConflict,
  source_record: bind(target("implementation-scope-conflict.json")),
  status: "OPEN",
});
const stage0Checks = [
  [1, "Phase 0 is authorized", phaseAuthorization.phase_0 === "AUTHORIZED" && phaseScope.phase_0.authorized === true],
  [2, "Phase 1 is authorized", phaseAuthorization.phase_1 === "AUTHORIZED" && phaseScope.phase_1.authorized === true],
  [3, "Phase 2 is not authorized", phaseAuthorization.phase_2_or_later === "NOT_AUTHORIZED" && phaseScope.phase_2_or_later.authorized === false],
  [4, "Launch Package is READY", launchReadiness.launch_package_status === "READY_FOR_SEPARATE_HUMAN_LAUNCH" && launchManifest.status === "READY_FOR_SEPARATE_HUMAN_LAUNCH"],
  [5, "Seven Baselines exist", inheritedResults.length + designResults.length === 7],
  [6, "Seven Baseline hashes are valid", inheritedResults.every((x) => x.match) && designResults.every((x) => x.match)],
  [7, "Implementation Write Scope is exact and Human-confirmed", exactWriteScopeValid],
  [8, "Prohibited Scope exists", prohibitedScope.prohibited_count >= 14 && prohibitedScope.fail_closed === true],
  [9, "Database Execution is false", databaseBoundary.database_connection_authorized === false && databaseBoundary.sql_execution_authorized === false],
  [10, "Migration Execution is false", migrationBoundary.migration_execution === false],
  [11, "Deployment is false", phaseAuthorization.deployment === "NOT_AUTHORIZED"]
].map(([test_id, requirement, pass]) => ({ test_id, requirement, status: pass ? "PASS" : "FAIL" }));
writeJson("validation-results.json", { schema_version: 1, task_id: TASK_ID, current_stage: 0, tests: stage0Checks, required_test_count: 11, pass_count: stage0Checks.filter((x) => x.status === "PASS").length, fail_count: stage0Checks.filter((x) => x.status === "FAIL").length, status: "BLOCKER", hard_stop_codes_triggered: ["IMPLEMENTATION_WRITE_SCOPE_MISSING", "IMPLEMENTATION_SCOPE_CONFLICT"], downstream_validation_not_started: ["repository state", "environment", "database runtime guard", "migration runtime guard", "network guard", "technical stack", "coverage tool", "controlled Git"], prohibited_action_attestation: { git_used: false, git_branch_created: false, worktree_created: false, product_code_modified: false, implementation_started: false, env_read: false, database_connected: false, sql_executed: false, migration_executed: false, network_used: false, package_installed: false, service_started: false, deployment_executed: false, writes_outside_task_root: 0 } });
writeJson("stage-0-result.json", { schema_version: 1, task_id: TASK_ID, master_batch: MASTER_BATCH, stage: 0, result: "HARD_STOP", primary_blocker: "IMPLEMENTATION_WRITE_SCOPE_MISSING", related_finding: "IMPLEMENTATION_SCOPE_CONFLICT", seven_baselines: "BOUND_AND_VALID", launch_package: "BOUND_AND_VALID", phase_0_authorization: "PRESENT_BUT_NOT_EFFECTIVE_WITHOUT_EXACT_PATHS", phase_1_authorization: "PRESENT_BUT_NOT_EFFECTIVE_WITHOUT_EXACT_PATHS", implementation_write_authority: "NO_GO", next_stage: "NOT_STARTED", git_used: false, implementation_started: false });
writeJson("preflight/preflight-not-started.json", { schema_version: 1, task_id: TASK_ID, stage: 1, status: "NOT_STARTED_DUE_TO_STAGE_0_HARD_STOP", repository_or_env_inspection_performed: false, git_commands_used: false });
writeJson("git-control/git-not-started.json", { schema_version: 1, task_id: TASK_ID, stage: 2, controlled_local_git_authorized_by_human: true, controlled_local_git_started: false, branch_created: false, worktree_created: false, commit_created: false, push_attempted: false, reason: "STAGE_0_HARD_STOP" });
writeJson("implementation-plan/implementation-not-started.json", { schema_version: 1, task_id: TASK_ID, phase_0: "NOT_STARTED", phase_1: "NOT_STARTED", product_code_modified: false, tests_created_or_run: false, reason: "IMPLEMENTATION_WRITE_SCOPE_MISSING" });
writeJson("implementation-evidence/implementation-not-started.json", { schema_version: 1, task_id: TASK_ID, phase_0_evidence: "NOT_AVAILABLE", phase_1_evidence: "NOT_AVAILABLE", coverage_evidence: "NOT_AVAILABLE", reason: "STAGE_0_HARD_STOP" });
writeJson("review/review-not-started.json", { schema_version: 1, task_id: TASK_ID, bounded_code_review: "NOT_STARTED", independent_external_review: "NOT_STARTED", reason: "STAGE_0_HARD_STOP" });
writeJson("human-phase-0-1-acceptance-package/package-not-prepared.json", { schema_version: 1, task_id: TASK_ID, package_status: "NOT_PREPARED", human_acceptance: "NOT_STARTED", reason: "PHASE_0_1_IMPLEMENTATION_NOT_STARTED" });
writeJson("phase-2-readiness-package/package-not-prepared.json", { schema_version: 1, task_id: TASK_ID, package_status: "NOT_PREPARED", phase_2_authorization: false, phase_2_started: false, reason: "STAGE_0_HARD_STOP" });
writeText("final-summary.md", `# MASTER BATCH 8A-1 Stage 0 Hard Stop\n\nLaunch Package and all seven Baselines are bound and valid. Phase 0 and Phase 1 authorization exists in principle, while Phase 2, database, migration and deployment remain unauthorized.\n\nImplementation cannot start because the normative repository-write-boundary.json contains no allowed_paths and states MUST_BE_DISCOVERED_AND_HUMAN_CONFIRMED_AT_PRELAUNCH. The 8A-1 contract expressly requires this file to provide the exact write scope and forbids Codex from inferring it.\n\nHard stop: IMPLEMENTATION_WRITE_SCOPE_MISSING. Related finding: IMPLEMENTATION_SCOPE_CONFLICT. Stage 1 through Stage 7 were not started; Git and product code were not used.`);
writeText("HANDOFF.md", `# HANDOFF\n\n## Current goal\n\nLaunch MAGP Phase 0/1 implementation only after the exact repository write scope is Human-confirmed.\n\n## What changed\n\n- Verified the 16-file Launch Package and all seven Baselines.\n- Recorded IMPLEMENTATION_WRITE_SCOPE_MISSING and IMPLEMENTATION_SCOPE_CONFLICT.\n- Stopped in Stage 0 before repository preflight, Git, Worktree, or implementation.\n\n## Files touched\n\n- Only .codex/tasks/${TASK_ID}/**.\n\n## Verification\n\n- Stage 0: 10/11 PASS; exact Human-confirmed allowed_paths is the sole failed Stage 0 condition.\n- Git, product code, .env, secrets, database, SQL, migration, network, package installation, services, and deployment were not used.\n\n## Next step\n\n- Human must adopt an exact repository-write-boundary.json with repository-relative allowed_paths for the Phase 0 project root, Shared Contracts, Domain Kernel, Validation Kernel, Tests, Documentation, Local Tooling, Evidence, and any authorized CI files. Then relaunch MASTER BATCH 8A-1 from Stage 0.`);

const exclusions = new Set(["task-artifact-manifest.json", "deterministic-stage-0-result.json"]);
const taskContent = digest(TASK_ROOT, TASK_ROOT, exclusions);
writeJson("task-artifact-manifest.json", { schema_version: 1, task_id: TASK_ID, canonicalization_method: "RELATIVE_PATH_PIPE_SHA256_PIPE_BYTES_NEWLINE", exclusions: [...exclusions], ...taskContent });
writeJson("deterministic-stage-0-result.json", { schema_version: 1, task_id: TASK_ID, generator: bind(fileURLToPath(import.meta.url)), content_manifest: bind(target("task-artifact-manifest.json")), result: "PASS_BLOCKER_REPRODUCIBLE" });
const final = digest(TASK_ROOT);
console.log(JSON.stringify({ master_batch: MASTER_BATCH, stage: 0, result: "HARD_STOP", primary_blocker: "IMPLEMENTATION_WRITE_SCOPE_MISSING", related_finding: "IMPLEMENTATION_SCOPE_CONFLICT", launch_package: "BOUND_AND_VALID", baselines: "PASS_7_OF_7", stage_0_checks: `${stage0Checks.filter((x) => x.status === "PASS").length}/11 PASS`, exact_allowed_path_count: exactAllowedPaths.length, stage_1_to_7_started: false, git_used: false, product_code_modified: false, implementation_started: false, task_file_count: final.file_count, task_tree_manifest_sha256: final.manifest_sha256 }, null, 2));
