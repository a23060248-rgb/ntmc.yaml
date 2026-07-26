import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const TASK_ID = "GOV-MAGP-PHASE-0-1-GIT-TRUST-ANCHOR-PROPOSAL-01";
const taskRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const productRoot = path.resolve(taskRoot, "..", "..", "..");

function sha256(data) {
  return crypto.createHash("sha256").update(data).digest("hex").toUpperCase();
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(taskRoot, relativePath), "utf8"));
}

function bind(relativePath) {
  const bytes = fs.readFileSync(path.join(taskRoot, relativePath));
  return { bytes: bytes.length, sha256: sha256(bytes) };
}

function need(condition, message) {
  if (!condition) throw new Error(message);
}

const repoRootResult = spawnSync("git", ["rev-parse", "--show-toplevel"], {
  cwd: productRoot,
  encoding: "utf8",
  windowsHide: true,
});
need(repoRootResult.status === 0, "Repository root unavailable");
const repoRoot = path.resolve(repoRootResult.stdout.trim());
const headResult = spawnSync("git", ["rev-parse", "HEAD"], {
  cwd: repoRoot,
  encoding: "utf8",
  windowsHide: true,
});
need(headResult.status === 0, "HEAD unavailable");
const currentHead = headResult.stdout.trim();

const stage0 = readJson("stage-0-result.json");
const exact = readJson("exact-commit-paths.json");
const closure = readJson("dependency-closure.json");
const attributes = readJson("git-attribute-and-ignore-analysis.json");
const collisions = readJson("change-collision-analysis.json");
const plan = readJson("trust-anchor-commit-plan.json");
const human = readJson("human-decision-binding.json");
const qa = readJson("validation-results.json");
const result = readJson("stage-1-result.json");
const manifest = readJson("task-artifact-manifest.json");

need(stage0.task_id === TASK_ID && stage0.result === "PASS", "Stage 0 did not PASS");
need(exact.exact_commit_path_count === 147, "Exact commit path count is not 147");
need(exact.files.length === 147, "Exact file entries are not 147");
need(new Set(exact.files.map((item) => item.repository_relative_path)).size === 147, "Duplicate exact path");
need(exact.files.every((item) => item.source_binding_matches), "Candidate source binding mismatch");
need(exact.files.every((item) => {
  const absolute = path.join(repoRoot, ...item.repository_relative_path.split("/"));
  if (!fs.existsSync(absolute)) return false;
  return sha256(fs.readFileSync(absolute)) === item.sha256;
}), "Candidate working-tree hash mismatch");
need(closure.closure_status === "COMPLETE_FOR_8A0R_STAGE_1_REPLAY", "Dependency closure incomplete");
need(closure.direct_replay_input_count === 147, "Direct replay input count mismatch");
need(closure.transitive_provenance_group_count === 17, "Transitive provenance group count mismatch");
need(closure.transitive_provenance_groups.every((item) => item.status === "RESOLVED_AND_UNCHANGED"), "Transitive provenance mismatch");
need(closure.blocking_unresolved_reference_count === 0, "Blocking unresolved reference exists");
need(attributes.ignore_analysis.ignored_file_count === 0, "Ignored file exists");
need(collisions.path_collision_count === 0, "Path collision exists");
need(plan.proposed_parent_head === currentHead, "Parent HEAD changed");
need(plan.git_write_performed === false && plan.trust_anchor_commit_created === false, "Git write or commit claimed");
need(human.decision_status === "PENDING_HUMAN_DECISION", "Human decision was impersonated");
need(human.trust_anchor_commit_authorized === false, "Trust Anchor Commit marked authorized");
need(bind("exact-commit-paths.json").sha256 === human.exact_commit_paths.sha256, "Exact paths binding invalid");
need(bind("dependency-closure.json").sha256 === human.dependency_closure.sha256, "Dependency closure binding invalid");
need(bind("trust-anchor-commit-plan.json").sha256 === human.trust_anchor_commit_plan.sha256, "Commit plan binding invalid");
need(sha256(Buffer.from(currentHead, "utf8")) === human.parent_head_binding_sha256, "Parent HEAD SHA-256 binding invalid");
need(qa.status === "PASS_10_OF_10" && qa.pass_count === 10, "Stage 1 QA did not pass 10/10");
need(qa.git_state_unchanged === true, "Git semantic state changed");
need(result.result === "READY_FOR_HUMAN_EXACT_SCOPE_AND_HASH_DECISION", "Proposal not ready for Human Gate");
need(result.git_write === "NO", "Git write reported");
need(result.product_code_modified === false, "Product Code modification reported");
need(result.secret_content_read === false, "Secret content read reported");
need(result.trust_anchor_commit_created === false, "Trust Anchor Commit created");
need(result.master_batch_8a_1_relaunched === false, "8A-1 relaunched");

const manifestEntries = manifest.entries;
need(manifest.file_count === manifestEntries.length, "Task manifest count mismatch");
for (const entry of manifestEntries) {
  const absolute = path.join(taskRoot, ...entry.relative_path.split("/"));
  need(fs.existsSync(absolute), `Task artifact absent: ${entry.relative_path}`);
  const bytes = fs.readFileSync(absolute);
  need(bytes.length === entry.bytes && sha256(bytes) === entry.sha256, `Task artifact changed: ${entry.relative_path}`);
}
const canonical = manifestEntries
  .map((entry) => `${entry.relative_path}|${entry.sha256}|${entry.bytes}`)
  .join("\n");
need(sha256(Buffer.from(canonical, "utf8")) === manifest.manifest_sha256, "Task manifest digest invalid");

console.log(JSON.stringify({
  task_id: TASK_ID,
  validation: "PASS",
  stage_0: stage0.result,
  exact_commit_paths: "147/147",
  dependency_closure: closure.closure_status,
  upstream_provenance: "17/17 RESOLVED_AND_UNCHANGED",
  ignored_files: attributes.ignore_analysis.ignored_file_count,
  transformation_risks: attributes.transformation_risk_count,
  collisions: collisions.path_collision_count,
  unresolved_references: closure.unresolved_reference_count,
  blocking_unresolved_references: closure.blocking_unresolved_reference_count,
  human_decision: human.decision_status,
  qa: qa.status,
  git_write: "NO",
  hard_stop: "HUMAN_GATE",
}, null, 2));
