import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const TASK_ID =
  "GOV-MAGP-PHASE-0-1-EXISTING-HEAD-TRUST-ANCHOR-ATTESTATION-REMEDIATION-02";
const taskRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const validator = path.join(taskRoot, "scripts", "validate-production.mjs");
const fixtureRoot = path.join(taskRoot, "test-fixtures");

function parseOutput(result) {
  const stdout = String(result.stdout ?? "").trim();
  let parsed = null;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    parsed = null;
  }
  return { stdout, stderr: String(result.stderr ?? "").trim(), parsed };
}

function spawnValidator(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [validator, ...args], {
      cwd: taskRoot,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => {
      resolve({
        status: null,
        stdout: "",
        stderr: error.message,
        parsed: null,
      });
    });
    child.on("close", (status) => {
      resolve({
        status,
        ...parseOutput({
          stdout: Buffer.concat(stdout).toString("utf8"),
          stderr: Buffer.concat(stderr).toString("utf8"),
        }),
      });
    });
  });
}

async function cliCase(caseId, args) {
  const result = await spawnValidator(args);
  const forbiddenVerdictText = /"candidate_verdict"\s*:\s*"READY|"\s*PASS\s*"/u
    .test(result.stdout);
  return {
    case_id: caseId,
    test_type: "PRODUCTION_ENTRY_CLI_REJECTION",
    args,
    observed_exit_code: result.status,
    observed_error_code: result.parsed?.error_code ?? null,
    forbidden_verdict_text_observed: forbiddenVerdictText,
    result:
      result.status === 2 &&
      result.parsed?.execution_mode === "USAGE_ERROR" &&
      result.parsed?.error_code === "CLI_USAGE_ERROR" &&
      !forbiddenVerdictText
        ? "REJECTED_AS_EXPECTED"
        : "NOT_VERIFIED",
    stderr: result.stderr || null,
  };
}

async function fixtureCase(absolute) {
  const fixture = JSON.parse(fs.readFileSync(absolute, "utf8"));
  const result = await spawnValidator(["--self-test-fixture", absolute]);
  const forbiddenVerdictText = /"candidate_verdict"\s*:\s*"READY|"\s*PASS\s*"/u
    .test(result.stdout);
  return {
    case_id: fixture.fixture_id,
    test_type: "PRODUCTION_ENTRY_FIXTURE_REJECTION",
    mutation: fixture.mutation.kind,
    expected_error_code: fixture.expected_error_code,
    observed_exit_code: result.status,
    observed_error_code: result.parsed?.error_code ?? null,
    forbidden_verdict_text_observed: forbiddenVerdictText,
    result:
      result.status === 2 &&
      result.parsed?.execution_mode === "SELF_TEST_REJECTION" &&
      result.parsed?.result === "REJECTED" &&
      result.parsed?.error_code === fixture.expected_error_code &&
      !forbiddenVerdictText
        ? "REJECTED_AS_EXPECTED"
        : "NOT_VERIFIED",
    stderr: result.stderr || null,
  };
}

async function reparseCase() {
  const targetDir = path.join(taskRoot, ".temporary-reparse-target");
  const targetFile = path.join(targetDir, "fixture.json");
  const linkDir = path.join(fixtureRoot, ".temporary-reparse-link");
  const linkedFile = path.join(linkDir, "fixture.json");
  const expected = "FIXTURE_REPARSE_POINT_NOT_ALLOWED";
  let result = null;
  let limitation = null;
  try {
    fs.mkdirSync(targetDir);
    fs.writeFileSync(
      targetFile,
      `${JSON.stringify({
        fixture_id: "fixture-reparse-scope-escape",
        mutation: { kind: "wrong_head" },
        expected_error_code: expected,
      }, null, 2)}\n`,
      "utf8",
    );
    fs.symlinkSync(targetDir, linkDir, "junction");
    result = await spawnValidator(["--self-test-fixture", linkedFile]);
  } catch (error) {
    limitation = {
      code: error.code ?? "REPARSE_PROBE_CREATION_FAILED",
      message: error.message,
    };
  } finally {
    try {
      if (fs.existsSync(linkDir)) fs.unlinkSync(linkDir);
    } catch {
      // The environment limitation is reported below.
    }
    try {
      if (fs.existsSync(targetFile)) fs.unlinkSync(targetFile);
      if (fs.existsSync(targetDir)) fs.rmdirSync(targetDir);
    } catch {
      // The finalizer checks that no temporary entry remains.
    }
  }
  if (!result) {
    return {
      case_id: "fixture-reparse-scope-escape",
      test_type: "PRODUCTION_ENTRY_REPARSE_REJECTION",
      environment_limitation: limitation,
      result: "NOT_VERIFIED",
    };
  }
  return {
    case_id: "fixture-reparse-scope-escape",
    test_type: "PRODUCTION_ENTRY_REPARSE_REJECTION",
    expected_error_code: expected,
    observed_exit_code: result.status,
    observed_error_code: result.parsed?.error_code ?? null,
    result:
      result.status === 2 &&
      result.parsed?.error_code === expected &&
      result.parsed?.result === "REJECTED"
        ? "REJECTED_AS_EXPECTED"
        : "NOT_VERIFIED",
    stderr: result.stderr || null,
  };
}

async function mapLimit(items, limit, mapper) {
  const output = new Array(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      output[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
  return output;
}

const cliSpecs = [
  ["skip-task-manifest-flag-rejected", ["--skip-task-manifest"]],
  ["discovery-cannot-return-verdict", ["--discovery"]],
  ["bare-fixture-usage-error", ["--fixture"]],
  ["bare-self-test-fixture-usage-error", ["--self-test-fixture"]],
  ["unknown-flag-rejected", ["--unknown-flag"]],
  ["duplicate-mutually-exclusive-flags-rejected", [
    "--self-test-fixture",
    path.join(fixtureRoot, "wrong-head.json"),
    "--self-test-fixture",
    path.join(fixtureRoot, "wrong-branch.json"),
  ]],
];
const cases = await mapLimit(
  cliSpecs,
  4,
  ([caseId, args]) => cliCase(caseId, args),
);

const fixtureFiles = fs.readdirSync(fixtureRoot)
  .filter((name) => name.endsWith(".json") && !name.startsWith("."))
  .map((name) => path.join(fixtureRoot, name));
cases.push(...await mapLimit(fixtureFiles, 4, fixtureCase));
cases.push(await reparseCase());

const incomplete = cases.filter((entry) => entry.result !== "REJECTED_AS_EXPECTED");
const output = {
  schema_version: 1,
  task_id: TASK_ID,
  evidence_authority: "NON_AUTHORITATIVE_CANDIDATE_EVIDENCE",
  entry_under_test:
    "scripts/validate-production.mjs",
  production_entry_spawned_directly: true,
  copied_simplified_validator_used: false,
  case_count: cases.length,
  rejected_as_expected_count: cases.length - incomplete.length,
  not_verified_count: incomplete.length,
  coverage_status: incomplete.length === 0 ? "COMPLETE" : "NOT_VERIFIED",
  cases,
  environment_limitations: incomplete
    .filter((entry) => entry.environment_limitation)
    .map((entry) => entry.environment_limitation),
  formal_candidate_verdict_issued: false,
  git_mutation: "NO",
};
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
process.exitCode = incomplete.length === 0 ? 0 : 1;
