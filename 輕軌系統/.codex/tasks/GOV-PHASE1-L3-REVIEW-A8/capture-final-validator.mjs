import { spawnSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const taskDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(taskDir, "../../..");
const args = [".codex/scripts/validate-task.mjs", "--task-id", "GOV-PHASE1-L3-REVIEW-A8", "--target-gate", "bootstrap-candidate-review"];
const child = spawnSync(process.execPath, args, {cwd: root, encoding: "utf8", windowsHide: true, maxBuffer: 32 * 1024 * 1024});
const stdout = child.stdout ?? "", stderr = child.stderr ?? "";
const resultLine = `${stdout}\n${stderr}`.split(/\r?\n/).find((item) => item.startsWith("VALIDATE_TASK_RESULT ")) ?? null;
const gateLine = `${stdout}\n${stderr}`.split(/\r?\n/).find((item) => item.startsWith("GATE_RESULTS ")) ?? null;
const pass = child.status === 2 && /structural=VALID/.test(resultLine ?? "") && /bootstrap_candidate_review:NO-GO/.test(resultLine ?? "");
const payload = {
  schema_version: 1,
  task_id: "GOV-PHASE1-L3-REVIEW-A8",
  command: `node ${args.join(" ")}`,
  expected: {structural: "VALID", target_gate: "bootstrap_candidate_review", status: "NO-GO", exit: 2},
  actual_exit: child.status,
  result_line: resultLine,
  gate_results_line: gateLine,
  stdout,
  stderr,
  pass
};
await writeFile(path.join(taskDir, "authoritative-validator-rerun.json"), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(`A8_FINAL_VALIDATOR pass=${pass} exit=${child.status}`);
process.exit(pass ? 0 : 1);
