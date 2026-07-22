import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateFixtureReport } from "../scripts/lib/governance/fixture-report.mjs";

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(testsDir, "run-governance-fixtures.mjs");
const trustedSuite = JSON.parse(await readFile(path.join(testsDir, "fixture-suite-manifest.json"), "utf8"));
function run(runId) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script], { cwd: path.resolve(testsDir, "..", ".."), env: { ...process.env, GOV_FIXTURE_RUN_ID: runId }, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { output += chunk; });
    child.on("close", (exitCode) => {
      const reportLine = output.split(/\r?\n/).find((line) => line.startsWith("FIXTURE_REPORT "));
      let report = null;
      try { report = JSON.parse(reportLine.slice("FIXTURE_REPORT ".length)); } catch {}
      resolve({ requested_run_id: runId, exit_code: exitCode, report, output_tail: output.slice(-1000) });
    });
  });
}
const runIds = [`CONC-A-${randomUUID()}`, `CONC-B-${randomUUID()}`];
const results = await Promise.all(runIds.map(run));
const reportErrors = results.map((item) => item.report ? validateFixtureReport(item.report, trustedSuite) : ["missing report"]);
const reportsValid = results.every((item, index) => item.exit_code === 0 && item.report?.cleanup_result === "PASS" && item.report?.fatal_error === null && reportErrors[index].length === 0);
const runRoots = results.map((item) => item.report?.run_root_realpath).filter(Boolean);
const uniqueRunRoots = runRoots.length === results.length && new Set(runRoots).size === results.length;
const callerIdsIgnored = results.every((item) => item.report?.caller_run_id_ignored === item.requested_run_id && item.report?.fixture_run_id !== item.requested_run_id);
const allCaseRoots = results.flatMap((item) => item.report?.cases.map((fixtureCase) => fixtureCase.case_workspace).filter((value) => value && value !== "isolated-run-control") ?? []);
const uniqueCaseRoots = allCaseRoots.length > 0 && new Set(allCaseRoots).size === allCaseRoots.length;
const caseRootsOwned = results.every((item) => item.report?.cases.filter((fixtureCase) => fixtureCase.case_workspace !== "isolated-run-control").every((fixtureCase) => fixtureCase.case_workspace.startsWith(`${item.report.run_root_realpath}${path.sep}`)));
const trustedReport = results[0]?.report;
const adversarialReports = trustedReport ? [
  { adversary: "TRUNCATED_CHILD_REPORT", report: { ...structuredClone(trustedReport), cases: structuredClone(trustedReport.cases.slice(0, -1)) } },
  { adversary: "DUPLICATE_CASE_ID", report: { ...structuredClone(trustedReport), cases: trustedReport.cases.map((item, index) => index === 1 ? structuredClone(trustedReport.cases[0]) : structuredClone(item)) } },
  { adversary: "FORGED_PASS_WITHOUT_PROVENANCE", report: { ...structuredClone(trustedReport), cases: trustedReport.cases.map((item, index) => index === 0 ? { ...structuredClone(item), asserted_invariant: "", production_entrypoint: "" } : structuredClone(item)) } },
  { adversary: "TAMPERED_SUITE_HASH", report: { ...structuredClone(trustedReport), case_manifest_sha256: "0".repeat(64) } }
] : [];
const adversarialResults = adversarialReports.map(({ adversary, report }) => ({ adversary, violations: validateFixtureReport(report, trustedSuite) }));
const adversarialReportsRejected = adversarialResults.length === 4 && adversarialResults.every((item) => item.violations.length > 0);
const passed = reportsValid && uniqueRunRoots && callerIdsIgnored && uniqueCaseRoots && caseRootsOwned && adversarialReportsRejected;
console.log(`CONCURRENCY_ISOLATION ${JSON.stringify({ reports_valid: reportsValid, report_errors: reportErrors, unique_run_roots: uniqueRunRoots, caller_ids_ignored: callerIdsIgnored, unique_case_roots: uniqueCaseRoots, case_roots_owned: caseRootsOwned, adversarial_reports_rejected: adversarialReportsRejected, adversarial_results: adversarialResults, suite_id: trustedSuite.suite_id, suite_version: trustedSuite.suite_version, case_manifest_sha256: trustedSuite.case_manifest_sha256, results: results.map(({ requested_run_id, exit_code, report }) => ({ requested_run_id, exit_code, fixture_run_id: report?.fixture_run_id, run_root_realpath: report?.run_root_realpath, case_count: report?.cases.length, cleanup_result: report?.cleanup_result })), passed })}`);
process.exit(passed ? 0 : 1);
