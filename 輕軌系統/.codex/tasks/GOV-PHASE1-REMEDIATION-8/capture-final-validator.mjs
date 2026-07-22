import { spawnSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const taskDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(taskDir, "..", "..", "..");
const cases = [
  {case_id: "R8-TASK-CANDIDATE", args: [".codex/scripts/validate-task.mjs", "--task-id", "GOV-PHASE1-REMEDIATION-8", "--target-gate", "bootstrap-candidate-review"], expected_exit: 2, expected: ["structural=VALID", "bootstrap_candidate_review=NO-GO", "bootstrap_human_commit=NO-GO", "steady_state_preparation=DISABLED", "steady_state_execution=DISABLED", "migration_320_execution=NO-GO"]},
  {case_id: "R8-MIGRATION-320", args: [".codex/scripts/validate-task.mjs", "--task-id", "GOV-M320-DRYRUN", "--target-gate", "migration-320-execution"], expected_exit: 2, expected: ["structural=VALID", "migration_320_execution=NO-GO"]},
  {case_id: "R8-PHASE-STATUS", args: [".codex/scripts/validate-phase-status.mjs"], expected_exit: 0, expected: ["result=PASS", "authority=informational"]}
];
const results = [];
for (const item of cases) {
  const child = spawnSync(process.execPath, item.args, {cwd: root, encoding: "utf8", windowsHide: true, maxBuffer: 32 * 1024 * 1024});
  const stdout = child.stdout ?? "", stderr = child.stderr ?? "";
  const pass = child.status === item.expected_exit && item.expected.every((fragment) => stdout.includes(fragment));
  results.push({...item, actual_exit: child.status, expected_fragments_present: item.expected.map((fragment) => ({fragment, present: stdout.includes(fragment)})), stdout, stderr, pass});
}
const passed = results.every((item) => item.pass);
await writeFile(path.join(taskDir, "authoritative-validator-rerun.json"), `${JSON.stringify({schema_version: 1, task_id: "GOV-PHASE1-REMEDIATION-8", cases: results, passed}, null, 2)}\n`, "utf8");
console.log(`R8_FINAL_VALIDATOR total=${results.length} passed=${results.filter((item) => item.pass).length} failed=${results.filter((item) => !item.pass).length}`);
process.exit(passed ? 0 : 1);
