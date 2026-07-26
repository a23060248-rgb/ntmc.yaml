import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const taskRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const productRoot = path.resolve(taskRoot, "..", "..", "..");
const repoRoot = path.resolve(productRoot, "..");
const proposalRoot = path.join(
  productRoot,
  ".codex",
  "tasks",
  "GOV-MAGP-PHASE-0-1-GIT-TRUST-ANCHOR-PROPOSAL-01",
);
const safeDirectory = "safe.directory=C:/Users/a2306/Desktop/code/ntmc.yaml";

function sha256(data) {
  return crypto.createHash("sha256").update(data).digest("hex").toUpperCase();
}

function readJson(root, relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function need(condition, message) {
  if (!condition) throw new Error(message);
}

function git(args) {
  const result = spawnSync("git", ["-c", safeDirectory, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    windowsHide: true,
  });
  need(result.status === 0, `Read-only Git command failed: ${args.join(" ")}`);
  return result.stdout.trim();
}

const receipt = readJson(taskRoot, "human-decision-receipt.json");
const stage0 = readJson(taskRoot, "stage-0-result.json");
const staged = readJson(taskRoot, "exact-staged-set-verification.json");
const commit = readJson(taskRoot, "commit-result.json");
const post = readJson(taskRoot, "post-commit-git-state.json");
const stage3 = readJson(taskRoot, "stage-3-result.json");
const qa = readJson(taskRoot, "final-qa-result.json");
const manifest = readJson(taskRoot, "task-artifact-manifest.json");

need(stage0.result === "HARD_STOP", "Stage 0 result is not HARD_STOP");
need(stage0.primary_blocker === "HUMAN_DECISION_BINDING_MISMATCH", "Primary blocker changed");
need(receipt.matching_binding_count === 3, "Unexpected matching binding count");
need(receipt.binding_results.parent_head_binding === "MISMATCH", "Parent binding must mismatch");
need(staged.result === "NOT_STARTED" && staged.git_add_executed === false, "Staging occurred");
need(commit.commit_status === "NOT_STARTED" && commit.git_commit_executed === false, "Commit occurred");
need(stage3.result === "NOT_STARTED", "Stage 3 unexpectedly started");
need(qa.result === "BLOCKED_AT_STAGE_0", "Final QA state changed");
need(post.product_code_modified === false, "Product Code modification claimed");
need(post.secret_content_read === false, "Secret content read claimed");
need(post.network_used === false, "Network use claimed");

const expectedHashes = {
  "exact-commit-paths.json": "E8A5650A85D0DDADA08483493D866BF9A815F4EBAF1BE07987E8EBB7885E8FC3",
  "dependency-closure.json": "23FD1B0236CC19E69147B0ACF49DD617B55DCFC679241919237B5E2953684A71",
  "trust-anchor-commit-plan.json": "A768CBF9D8AEF7736DDEB4FE617D53BF18FCD3C027A8BD857E683490AF3F19A2",
};
for (const [relativePath, expected] of Object.entries(expectedHashes)) {
  need(
    sha256(fs.readFileSync(path.join(proposalRoot, relativePath))) === expected,
    `Approved proposal hash changed: ${relativePath}`,
  );
}

const actualHead = git(["rev-parse", "HEAD"]);
const actualBranch = git(["symbolic-ref", "--quiet", "--short", "HEAD"]);
const stagedPaths = git(["diff", "--cached", "--name-only"]);
need(actualHead === "22baa18784a081dd8c0d8a3ce177ba00363251de", "Actual HEAD changed during evidence generation");
need(actualBranch === "codex/precheck-template-maintenance", "Actual branch changed during evidence generation");
need(stagedPaths === "", "Index is not empty");
need(
  sha256(Buffer.from(actualHead, "utf8"))
    === "529AE67219F970C5B3AFDD694D51384F5DC4290E3D13B36B3416946D25C2977D",
  "Actual HEAD binding changed",
);

need(manifest.file_count === manifest.entries.length, "Task manifest count mismatch");
for (const entry of manifest.entries) {
  const bytes = fs.readFileSync(path.join(taskRoot, ...entry.relative_path.split("/")));
  need(bytes.length === entry.bytes, `Task artifact size changed: ${entry.relative_path}`);
  need(sha256(bytes) === entry.sha256, `Task artifact hash changed: ${entry.relative_path}`);
}
const canonical = manifest.entries
  .map((entry) => `${entry.relative_path}|${entry.sha256}|${entry.bytes}`)
  .join("\n");
need(sha256(Buffer.from(canonical, "utf8")) === manifest.manifest_sha256, "Task manifest digest invalid");

console.log(JSON.stringify({
  validation: "PASS",
  disposition: "HARD_STOP_AT_STAGE_0",
  primary_blocker: stage0.primary_blocker,
  proposal_file_bindings: "3/3 MATCH",
  current_parent_binding: "MISMATCH",
  head: actualHead,
  branch: actualBranch,
  staged_files: 0,
  git_add: "NOT_EXECUTED",
  git_commit: "NOT_EXECUTED",
  git_write: "NO",
}, null, 2));
