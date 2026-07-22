import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const taskDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(taskDir, "../../..");
const required = [
  "task-intent.yaml", "classification.yaml", "blueprint.yaml", "review-baseline-before.json", "bootstrap-candidate-verification.json",
  "candidate-manifest-verification.json", "code-review.json", "security-review.json", "railway-domain-review.json", "a5-finding-closure-matrix.yaml",
  "fixture-rerun.json", "production-integration-rerun.json", "mutation-test-rerun.json", "concurrency-regression.json", "forged-report-rejection.json",
  "scanner-v4-verification.json", "rule-class-verification.json", "lifecycle-informational-verification.json", "historical-artifact-integrity.json",
  "migration-320-integrity.json", "review-baseline-after.json", "baseline-comparison.json", "review-findings.yaml", "traceability.yaml", "task-graph.json",
  "human-approval.yaml", "session-a6-summary.json", "HANDOFF.md", "artifact-manifest.yaml", "test-evidence.yaml", "security-evidence.yaml", "final-summary.md"
];
const missing = [];
for (const name of required) await access(path.join(taskDir, name)).catch(() => missing.push(name));
const run = (taskId) => spawnSync(process.execPath, [".codex/scripts/validate-task.mjs", "--task-id", taskId], { cwd: root, encoding: "utf8", windowsHide: true });
const a6 = run("GOV-PHASE1-L3-REVIEW-A6"), m320 = run("GOV-M320-DRYRUN");
const load = async (name) => JSON.parse(await readFile(path.join(taskDir, name), "utf8"));
const baseline = await load("baseline-comparison.json"), independence = await load("reviewer-independence-verification.json"), rerun = await load("authoritative-rerun-summary.json"), summary = await load("session-a6-summary.json");
const reviewNames = ["code-review.json", "security-review.json", "railway-domain-review.json"];
const reviews = [];
for (const name of reviewNames) {
  const bytes = await readFile(path.join(taskDir, name)), review = JSON.parse(bytes.toString("utf8"));
  const meta = review.metadata ?? review;
  reviews.push({ file: name, sha256: createHash("sha256").update(bytes).digest("hex").toUpperCase(), reviewer: meta.reviewer, formal: meta.formal, reviewer_run_id: meta.reviewer_run_id, session_id: meta.session_id, outcome: review.outcome });
}
const payload = {
  schema_version: 1, task_id: "GOV-PHASE1-L3-REVIEW-A6",
  required_output_count: required.length, missing_required_outputs: missing,
  reviewers: reviews, reviewer_independence: independence.independence_result,
  baseline_all_reviewed_sources_identical: baseline.all_reviewed_sources_identical,
  authoritative_rerun_pass: rerun.overall_pass,
  a6_validator_exit_code: a6.status,
  a6_validator_result_line: `${a6.stdout}\n${a6.stderr}`.split(/\r?\n/).find((item) => item.startsWith("VALIDATE_TASK_RESULT ")),
  migration_320_validator_exit_code: m320.status,
  migration_320_result_line: `${m320.stdout}\n${m320.stderr}`.split(/\r?\n/).find((item) => item.startsWith("VALIDATE_TASK_RESULT ")),
  reviewer_set_outcome: summary.reviewer_set_outcome,
  bootstrap_candidate_review_gate: summary.bootstrap_candidate_review_gate,
  session_b_eligible: summary.eligible_to_start_session_b,
  later_gates: { bootstrap_human_commit: summary.bootstrap_human_commit_gate, steady_state_preparation: summary.steady_state_preparation_gate, steady_state_execution: summary.steady_state_execution_gate, migration_320_execution: summary.migration_320_execution_gate },
  git_commands_run: false, git_mutations_performed: false, session_b_started: false,
  audit_pass: missing.length === 0 && reviews.length === 3 && reviews.every((item) => item.formal) && independence.independence_result === "PASS" && baseline.all_reviewed_sources_identical && rerun.overall_pass && a6.status === 2 && m320.status === 2 && summary.bootstrap_candidate_review_gate === "NO-GO" && summary.eligible_to_start_session_b === false
};
await writeFile(path.join(taskDir, "final-a6-audit.json"), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(`A6_FINAL_AUDIT pass=${payload.audit_pass} required=${required.length - missing.length}/${required.length} outcomes=${reviews.map((item) => item.outcome).join(",")} a6_exit=${a6.status} m320_exit=${m320.status}`);
process.exit(payload.audit_pass ? 0 : 1);
