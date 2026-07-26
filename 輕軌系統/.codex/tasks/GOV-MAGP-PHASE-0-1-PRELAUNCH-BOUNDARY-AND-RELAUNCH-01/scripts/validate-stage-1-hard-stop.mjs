import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const TASK_ID = "GOV-MAGP-PHASE-0-1-PRELAUNCH-BOUNDARY-AND-RELAUNCH-01";
const here = path.dirname(fileURLToPath(import.meta.url));
const taskRoot = path.resolve(here, "..");
const sha = (value) => crypto.createHash("sha256").update(value).digest("hex").toUpperCase();
const read = (relative) => JSON.parse(fs.readFileSync(path.join(taskRoot, ...relative.split("/")), "utf8"));
function listFiles(root) {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(root, entry.name);
    return entry.isDirectory() ? listFiles(file) : [file];
  });
}
function digest(exclusions = new Set()) {
  const entries = listFiles(taskRoot)
    .map((file) => ({
      relative_path: path.relative(taskRoot, file).split(path.sep).join("/"),
      sha256: sha(fs.readFileSync(file)),
      bytes: fs.statSync(file).size,
    }))
    .filter((entry) => !exclusions.has(entry.relative_path))
    .sort((a, b) => a.relative_path < b.relative_path ? -1 : a.relative_path > b.relative_path ? 1 : 0);
  return {
    file_count: entries.length,
    manifest_sha256: sha(Buffer.from(entries.map((entry) => `${entry.relative_path}|${entry.sha256}|${entry.bytes}`).join("\n"), "utf8")),
    entries,
  };
}

const checks = [];
function check(requirement, condition, evidence) {
  checks.push({ requirement, status: condition ? "PASS" : "FAIL", evidence });
}
const result = read("stage-1-result.json");
const reproducibility = read("change-collision-analysis/baseline-reproducibility-analysis.json");
const sourceBinding = read("original-hard-stop-binding.json");
const baselines = read("seven-baseline-binding.json");
const finding = read("findings/worktree-baseline-not-reproducible.json");
const decision = read("human-prelaunch-decision-package/not-issued.json");
const tech = read("tech-stack-discovery/not-evaluated.json");
const validation = read("validation-results.json");
const manifest = read("task-artifact-manifest.json");
const actualContent = digest(new Set(["task-artifact-manifest.json", "deterministic-stage-1-result.json"]));

check("Source task exact digest", sourceBinding.source_task.match === true
  && sourceBinding.source_task.actual.file_count === 106
  && sourceBinding.source_task.actual.manifest_sha256 === "CB760B18A41C67EF2978506FE3BE409E7003B28186F2ACFBB56B77D6ED7F68D8", sourceBinding.source_task.actual);
check("Attempt 1 exact digest", sourceBinding.attempt_1.match === true
  && sourceBinding.attempt_1.actual.file_count === 41
  && sourceBinding.attempt_1.actual.manifest_sha256 === "6B2DE6D5C428EE61E9448CF2A181006333369E25DD347AA961AAB36DF22A5992", sourceBinding.attempt_1.actual);
check("Seven Baselines valid", baselines.baseline_count === 7 && baselines.all_bound_and_valid === true, baselines.status);
check("Source Baselines absent from HEAD", reproducibility.source_task.tracked_file_count === 0
  && reproducibility.source_task.required_file_count === 106
  && reproducibility.source_task.reproducible_from_head === false, reproducibility.source_task);
check("Attempt 1 absent from HEAD", reproducibility.attempt_1.tracked_file_count === 0
  && reproducibility.attempt_1.required_file_count === 41
  && reproducibility.attempt_1.reproducible_from_head === false, reproducibility.attempt_1);
check("Inherited Worktree blocker asserted", reproducibility.inherited_hard_stop === "WORKTREE_BASELINE_NOT_REPRODUCIBLE"
  && reproducibility.status === "BLOCKER", reproducibility.status);
check("Finding remains open", finding.finding_id === "WORKTREE_BASELINE_NOT_REPRODUCIBLE"
  && finding.severity === "CRITICAL"
  && finding.status === "OPEN", finding);
check("Stage 1 stopped before downstream work", result.result === "HARD_STOP"
  && result.primary_blocker === "WORKTREE_BASELINE_NOT_REPRODUCIBLE"
  && result.stage_2_started === false
  && result.stage_3_started === false, result);
check("Decision hashes not issued", decision.status === "NOT_ISSUED"
  && decision.decision_register_sha256 === null
  && decision.recommendation_matrix_sha256 === null
  && decision.artifact_binding_sha256 === null, decision);
check("Tech Stack not falsely resolved", tech.normative_recommendation_issued === false
  && tech.status === "NOT_EVALUATED_DUE_TO_EARLIER_STAGE_1_HARD_STOP", tech);
check("36/36 not falsely claimed", validation.actual_result === "HARD_STOP_BEFORE_COMPLETION"
  && validation.status === "BLOCKER"
  && validation.fail_count >= 1, {
  pass_count: validation.pass_count,
  fail_count: validation.fail_count,
  not_run_count: validation.not_run_count,
});
check("No prohibited action asserted", result.git_write_used === false && result.product_code_modified === false, {
  git_write_used: result.git_write_used,
  product_code_modified: result.product_code_modified,
});
check("Task manifest current", manifest.file_count === actualContent.file_count
  && manifest.manifest_sha256 === actualContent.manifest_sha256
  && JSON.stringify(manifest.entries) === JSON.stringify(actualContent.entries), {
  expected_file_count: manifest.file_count,
  actual_file_count: actualContent.file_count,
  expected_manifest_sha256: manifest.manifest_sha256,
  actual_manifest_sha256: actualContent.manifest_sha256,
});

const failed = checks.filter((entry) => entry.status === "FAIL");
console.log(JSON.stringify({
  task_id: TASK_ID,
  validator: "INDEPENDENT_STAGE_1_HARD_STOP_VALIDATOR",
  result: failed.length === 0 ? "PASS" : "FAIL",
  check_count: checks.length,
  pass_count: checks.length - failed.length,
  fail_count: failed.length,
  confirmed_blocker: failed.length === 0 ? "WORKTREE_BASELINE_NOT_REPRODUCIBLE" : "VALIDATION_FAILURE",
  checks,
}, null, 2));
process.exitCode = failed.length === 0 ? 0 : 1;
