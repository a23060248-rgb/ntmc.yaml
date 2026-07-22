import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const taskDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(taskDir, "../../..");
const taskId = "GOV-PHASE1-CANDIDATE-REMEDIATION-13";
const suites = [
  ["governance_fixtures", ".codex/tests/run-governance-fixtures.mjs"],
  ["bootstrap_scanner_production", ".codex/tests/run-bootstrap-scanner-production.mjs"],
  ["bootstrap_production_integration", ".codex/tests/run-bootstrap-production-integration.mjs"],
  ["official_schema_loader_integration", ".codex/tests/run-official-schema-loader-integration.mjs"],
  ["reviewer_binding_regressions", ".codex/tests/run-reviewer-binding-regressions.mjs"],
  ["official_schema_loader_mutations", ".codex/tests/run-official-schema-loader-mutations.mjs"],
  ["governance_fixtures_concurrency", ".codex/tests/run-governance-fixtures-concurrency.mjs"],
  ["binary_magic_registry_mutations", ".codex/tests/run-binary-magic-registry-mutations.mjs"],
  ["bootstrap_mutations", ".codex/tests/run-bootstrap-mutation-tests.mjs"],
  ["referenced_evidence_production", ".codex/tests/run-referenced-evidence-production.mjs"],
  ["referenced_evidence_mutations", ".codex/tests/run-referenced-evidence-mutations.mjs"]
];

function run(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { cwd: root, windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (exitCode) => resolve({ exit_code: exitCode, stdout, stderr }));
  });
}

function parseOutput(stdout) {
  const lines = stdout.trim().split(/\r?\n/).filter(Boolean);
  for (const line of [...lines].reverse()) {
    try { return JSON.parse(line); } catch {}
  }
  const fields = {};
  for (const match of stdout.matchAll(/([A-Za-z_]+)=(\d+)/g)) fields[match[1]] = Number(match[2]);
  return Object.keys(fields).length ? fields : { tail: lines.slice(-5) };
}

const results = [];
for (const [suite, script] of suites) {
  const result = await run([script]);
  results.push({
    suite,
    script,
    exit_code: result.exit_code,
    result: result.exit_code === 0 ? "PASS" : "FAIL",
    parsed_output: parseOutput(result.stdout),
    stderr_tail: result.stderr.trim().split(/\r?\n/).slice(-10)
  });
}

const manifest = JSON.parse(await readFile(path.join(taskDir, "implementation-change-manifest.json"), "utf8"));
const scripts = manifest.candidate_changes
  .map((entry) => entry.path)
  .filter((entry) => entry.endsWith(".mjs"));
const syntax = [];
for (const script of scripts) {
  const result = await run(["--check", script]);
  syntax.push({ path: script, exit_code: result.exit_code, result: result.exit_code === 0 ? "PASS" : "FAIL", stderr: result.stderr.trim() });
}

const payload = {
  schema_version: 1,
  task_id: taskId,
  generated_at: "2026-07-21T14:30:00+08:00",
  git_used: false,
  suite_count: results.length,
  suite_passed: results.filter((entry) => entry.result === "PASS").length,
  syntax_check_count: syntax.length,
  syntax_check_passed: syntax.filter((entry) => entry.result === "PASS").length,
  suites: results,
  syntax_checks: syntax,
  result: results.every((entry) => entry.result === "PASS") && syntax.every((entry) => entry.result === "PASS") ? "PASS" : "FAIL"
};
await writeFile(path.join(taskDir, "regression-test-ledger.json"), `${JSON.stringify(payload, null, 2)}\n`);
console.log(JSON.stringify({ result: payload.result, suites: `${payload.suite_passed}/${payload.suite_count}`, syntax: `${payload.syntax_check_passed}/${payload.syntax_check_count}` }));
if (payload.result !== "PASS") process.exitCode = 1;
