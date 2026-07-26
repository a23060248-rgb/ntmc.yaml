import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const taskRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const productRoot = path.resolve(taskRoot, "..", "..", "..");
const repoRoot = path.resolve(productRoot, "..");
const safeDirectory = "safe.directory=C:/Users/a2306/Desktop/code/ntmc.yaml";
const EXPECTED_HEAD = "22baa18784a081dd8c0d8a3ce177ba00363251de";
const EXPECTED_BRANCH = "codex/precheck-template-maintenance";

function sha256(data) {
  return crypto.createHash("sha256").update(data).digest("hex").toUpperCase();
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(taskRoot, relativePath), "utf8"));
}

function need(condition, message) {
  if (!condition) throw new Error(message);
}

function git(args) {
  const result = spawnSync("git", ["-c", safeDirectory, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
    windowsHide: true,
  });
  need(result.status === 0, `Read-only Git command failed: ${args.join(" ")}`);
  return result.stdout.trim();
}

const exact = readJson("exact-commit-paths.json");
const closure = readJson("dependency-closure.json");
const collision = readJson("change-collision-analysis.json");
const attributes = readJson("git-attribute-and-ignore-analysis.json");
const plan = readJson("trust-anchor-commit-plan.json");
const human = readJson("human-decision-binding.json");
const history = readJson("historical-integrity-verification.json");
const stage0 = readJson("stage-0-result.json");
const stage1 = readJson("stage-1-result.json");
const validation = readJson("validation-results.json");
const manifest = readJson("task-artifact-manifest.json");

const actualHead = git(["rev-parse", "HEAD"]);
const actualBranch = git(["symbolic-ref", "--quiet", "--short", "HEAD"]);
need(actualHead === EXPECTED_HEAD, "HEAD binding mismatch");
need(actualBranch === EXPECTED_BRANCH, "Target branch binding mismatch");
need(stage0.result === "PASS", "Stage 0 did not PASS");
need(exact.exact_commit_path_count === 147, "Exact path count is not 147");
need(exact.unique_path_count === 147, "Unique path count is not 147");
need(exact.files.length === 147, "Exact file array is not 147");
need(new Set(exact.files.map((entry) => entry.repository_relative_path)).size === 147, "Duplicate candidate path");
need(exact.partition_counts.source_7a_2 === 106, "7A-2 partition is not 106");
need(exact.partition_counts.attempt_1 === 41, "Attempt 1 partition is not 41");
need(exact.files.every((entry) => entry.path_is_nfc), "Non-NFC candidate path");
need(exact.files.every((entry) => entry.prior_content_binding_matches), "Candidate content binding mismatch");
for (const entry of exact.files) {
  const absolute = path.join(repoRoot, ...entry.repository_relative_path.split("/"));
  need(fs.existsSync(absolute), `Candidate missing: ${entry.repository_relative_path}`);
  const bytes = fs.readFileSync(absolute);
  need(bytes.length === entry.file_size_bytes, `Candidate size changed: ${entry.repository_relative_path}`);
  need(sha256(bytes) === entry.sha256, `Candidate hash changed: ${entry.repository_relative_path}`);
}
need(exact.ignored_count === 0, "Ignored candidate exists");
need(exact.transformation_risk_count === 0, "Transformation risk exists");
need(exact.collision_count === 0 && exact.non_nfc_path_count === 0, "Path collision or normalization risk");
need(closure.closure_status === "COMPLETE_FOR_WORK_READ_ONLY_REVIEW", "Dependency closure incomplete");
need(closure.direct_replay_input_count === 147, "Direct dependency count mismatch");
need(closure.transitive_provenance_group_count === 17, "Transitive group count mismatch");
need(closure.transitive_provenance_groups.every((group) => group.status === "RESOLVED_AND_UNCHANGED"), "Transitive dependency mismatch");
need(closure.unresolved_reference_count === 11, "Unresolved reference count mismatch");
need(closure.blocking_unresolved_reference_count === 0, "Blocking unresolved reference exists");
need(closure.external_content_read === false, "External content read claimed");
need(collision.status === "PASS", "Collision analysis did not PASS");
need(attributes.ignored_file_count === 0, "Ignored analysis mismatch");
need(attributes.transformation_risk_count === 0, "Transformation analysis mismatch");
need(plan.parent_head === EXPECTED_HEAD, "Plan Parent HEAD mismatch");
need(plan.target_branch === EXPECTED_BRANCH, "Plan target branch mismatch");
need(plan.plan_status === "NEEDS_HUMAN_DECISION", "Plan must require Human decision");
need(plan.git_mutation_authorized_by_this_task === false, "Plan authorized Git mutation");
need(human.task_id === "GOV-MAGP-PHASE-0-1-GIT-TRUST-ANCHOR-PROPOSAL-02", "Human binding task ID mismatch");
need(human.allowed_path === ".codex/tasks/GOV-MAGP-PHASE-0-1-GIT-TRUST-ANCHOR-PROPOSAL-02/**", "Allowed path mismatch");
need(human.parent_head === EXPECTED_HEAD, "Human Parent HEAD mismatch");
need(human.target_branch === EXPECTED_BRANCH, "Human target branch mismatch");
need(human.parent_head_binding_sha256 === sha256(Buffer.from(EXPECTED_HEAD, "utf8")), "Parent binding hash invalid");
need(human.target_branch_binding_sha256 === sha256(Buffer.from(EXPECTED_BRANCH, "utf8")), "Branch binding hash invalid");
need(human.cryptographic_human_identity_claimed === false, "Cryptographic Human identity was claimed");
need(human.stage_authorized === false && human.commit_authorized === false, "Git mutation authorization claimed");
for (const [relativePath, binding] of [
  ["exact-commit-paths.json", human.proposal_file_bindings.exact_commit_paths],
  ["dependency-closure.json", human.proposal_file_bindings.dependency_closure],
  ["trust-anchor-commit-plan.json", human.proposal_file_bindings.trust_anchor_commit_plan],
]) {
  const bytes = fs.readFileSync(path.join(taskRoot, relativePath));
  need(bytes.length === binding.bytes, `Proposal binding size invalid: ${relativePath}`);
  need(sha256(bytes) === binding.sha256, `Proposal binding hash invalid: ${relativePath}`);
}
need(history.old_proposal_baseline_match === true, "Old Proposal baseline mismatch");
need(history.old_commit_task_baseline_match === true, "Old Commit Task baseline mismatch");
need(history.candidate_baseline_match === true, "Candidate baseline mismatch");
need(validation.status === "PASS_18_OF_18", "Deterministic validation did not pass 18/18");
need(stage1.result === "READY_FOR_WORK_READ_ONLY_REVIEW", "Verdict exceeds or misses allowed result");
need(stage1.git_mutation_executed === false, "Git mutation claimed");

need(manifest.file_count === manifest.entries.length, "Task manifest count mismatch");
for (const entry of manifest.entries) {
  const absolute = path.join(taskRoot, ...entry.relative_path.split("/"));
  need(fs.existsSync(absolute), `Task artifact missing: ${entry.relative_path}`);
  const bytes = fs.readFileSync(absolute);
  need(bytes.length === entry.bytes, `Task artifact size changed: ${entry.relative_path}`);
  need(sha256(bytes) === entry.sha256, `Task artifact hash changed: ${entry.relative_path}`);
}
const canonical = manifest.entries
  .map((entry) => `${entry.relative_path}|${entry.sha256}|${entry.bytes}`)
  .join("\n");
need(sha256(Buffer.from(canonical, "utf8")) === manifest.manifest_sha256, "Task manifest hash invalid");

console.log(JSON.stringify({
  validation: "PASS",
  verdict: stage1.result,
  parent_head: actualHead,
  target_branch: actualBranch,
  exact_paths: "147/147",
  partition_counts: "106+41",
  dependency_closure: closure.closure_status,
  old_proposal_baseline: "MATCH",
  old_commit_task_baseline: "MATCH",
  candidate_baseline: "MATCH",
  task_artifact_count: manifest.file_count,
  task_manifest_hash: manifest.manifest_sha256,
  git_mutation: "NO",
}, null, 2));
