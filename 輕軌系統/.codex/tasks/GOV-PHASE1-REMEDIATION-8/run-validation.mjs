import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const taskDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(taskDir, "..", "..", "..");
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const suites = [
  {id: "governance-fixtures", command: [".codex/tests/run-governance-fixtures.mjs"], marker: "FIXTURE_REPORT ", output: "fixture-rerun.json", expected_exit: 0},
  {id: "fixture-concurrency", command: [".codex/tests/run-governance-fixtures-concurrency.mjs"], marker: "CONCURRENCY_ISOLATION ", output: "concurrency-regression.json", expected_exit: 0},
  {id: "production-scanner", command: [".codex/tests/run-bootstrap-scanner-production.mjs"], marker: "BOOTSTRAP_SCANNER_PRODUCTION ", output: "production-scanner-rerun.json", expected_exit: 0},
  {id: "production-integration", command: [".codex/tests/run-bootstrap-production-integration.mjs"], marker: "BOOTSTRAP_PRODUCTION_INTEGRATION ", output: "production-integration-rerun.json", expected_exit: 0},
  {id: "production-mutations", command: [".codex/tests/run-bootstrap-mutation-tests.mjs"], marker: "BOOTSTRAP_MUTATION_TESTS ", output: "mutation-test-rerun.json", expected_exit: 0},
  {id: "binary-magic-mutations", command: [".codex/tests/run-binary-magic-registry-mutations.mjs"], marker: "BINARY_MAGIC_MUTATIONS ", output: "binary-magic-mutation-rerun.json", expected_exit: 0}
];

const m320Only = process.argv.includes("--m320-only");
const previousSummary = m320Only ? JSON.parse(await readFile(path.join(taskDir, "validation-run-summary.json"), "utf8")) : null;
const runSummary = m320Only ? previousSummary.suites.filter((item) => item.suite_id !== "migration-320-validator") : [];
for (const suite of m320Only ? [] : suites) {
  const child = spawnSync(process.execPath, suite.command, {cwd: root, encoding: "utf8", windowsHide: true, maxBuffer: 128 * 1024 * 1024});
  const line = (child.stdout ?? "").split(/\r?\n/).find((item) => item.startsWith(suite.marker));
  let parsed = null;
  let parse_error = null;
  try { parsed = line ? JSON.parse(line.slice(suite.marker.length)) : null; }
  catch (error) { parse_error = error.message; }
  const pass = child.status === suite.expected_exit && parsed !== null && parse_error === null;
  const record = {schema_version: 1, task_id: "GOV-PHASE1-REMEDIATION-8", suite_id: suite.id, command: `node ${suite.command.join(" ")}`, production_path: true, expected_exit: suite.expected_exit, actual_exit: child.status, summary_marker: suite.marker.trim(), parsed_summary: parsed, parse_error, stderr_tail: (child.stderr ?? "").slice(-2000), pass};
  await writeFile(path.join(taskDir, suite.output), json(record));
  runSummary.push({suite_id: suite.id, output_ref: `.codex/tasks/GOV-PHASE1-REMEDIATION-8/${suite.output}`, expected_exit: suite.expected_exit, actual_exit: child.status, pass});
  if (!pass) break;
}

const m320 = spawnSync(process.execPath, [".codex/scripts/validate-task.mjs", "--task-id", "GOV-M320-DRYRUN", "--target-gate", "migration-320-execution"], {cwd: root, encoding: "utf8", windowsHide: true, maxBuffer: 32 * 1024 * 1024});
const m320Pass = m320.status === 2 && (m320.stdout ?? "").includes("structural=VALID") && (m320.stdout ?? "").includes("migration_320_execution=NO-GO");
await writeFile(path.join(taskDir, "migration-320-validator-rerun.json"), json({schema_version: 1, task_id: "GOV-PHASE1-REMEDIATION-8", command: "node .codex/scripts/validate-task.mjs --task-id GOV-M320-DRYRUN --target-gate migration-320-execution", expected: {structural: "VALID", target_gate: "migration_320_execution", status: "NO-GO", exit: 2}, actual_exit: m320.status, stdout: m320.stdout ?? "", stderr: m320.stderr ?? "", pass: m320Pass}));
runSummary.push({suite_id: "migration-320-validator", output_ref: ".codex/tasks/GOV-PHASE1-REMEDIATION-8/migration-320-validator-rerun.json", expected_exit: 2, actual_exit: m320.status, pass: m320Pass});

const passed = runSummary.every((item) => item.pass);
await writeFile(path.join(taskDir, "validation-run-summary.json"), json({schema_version: 1, task_id: "GOV-PHASE1-REMEDIATION-8", assurance: "INTERNAL_CONSISTENCY_ONLY", product_tests_run: false, database_operations_run: false, git_operations_run: false, a8_started: false, session_b_started: false, suites: runSummary, passed}));
console.log(`R8_VALIDATION_RUN ${JSON.stringify({total: runSummary.length, passed: runSummary.filter((item) => item.pass).length, failed: runSummary.filter((item) => !item.pass).length})}`);
process.exit(passed ? 0 : 1);
