import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateFixtureReport } from "../../scripts/lib/governance-controls.mjs";

const a4Dir = path.dirname(fileURLToPath(import.meta.url));
const productRoot = path.resolve(a4Dir, "..", "..", "..");
const adapter = path.join(a4Dir, "run-fixture-adapter.mjs");
const trustedSuite = JSON.parse(await readFile(path.join(productRoot, ".codex", "tests", "fixture-suite-manifest.json"), "utf8"));
const run = (requestedRunId) => new Promise((resolve) => {
  const child = spawn(process.execPath, [adapter], { cwd: productRoot, env: { ...process.env, GOV_FIXTURE_RUN_ID: requestedRunId }, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  child.on("close", (exitCode) => {
    const line = output.split(/\r?\n/).find((item) => item.startsWith("FIXTURE_REPORT "));
    let report = null;
    try { report = JSON.parse(line?.slice("FIXTURE_REPORT ".length)); } catch {}
    resolve({ requested_run_id: requestedRunId, exit_code: exitCode, report, output_tail: output.slice(-1200) });
  });
});
const children = await Promise.all([run(`A4-CONC-A-${randomUUID()}`), run(`A4-CONC-B-${randomUUID()}`)]);
const reportErrors = children.map((child) => child.report ? validateFixtureReport(child.report, trustedSuite) : ["missing report"]);
const roots = children.map((child) => child.report?.run_root_realpath).filter(Boolean);
const uniqueRoots = roots.length === 2 && new Set(roots).size === 2;
const pass = children.every((child) => child.exit_code === 0) && reportErrors.every((errors) => errors.length === 0) && uniqueRoots;
console.log(`A4_CONCURRENCY_REPORT ${JSON.stringify({ pass, trusted_suite: trustedSuite, children, report_errors: reportErrors, unique_run_roots: uniqueRoots })}`);
process.exitCode = pass ? 0 : 1;
