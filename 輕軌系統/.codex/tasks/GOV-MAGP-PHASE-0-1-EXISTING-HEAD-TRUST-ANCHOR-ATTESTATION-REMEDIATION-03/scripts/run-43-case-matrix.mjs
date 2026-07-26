import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import {
  TASK_ID,
  taskRoot,
  gitRoot,
  taskRepoPrefix,
  ensureRoots,
  secureJson,
  gitText,
  verifySubjectManifest,
} from "./lib.mjs";

const validator = path.join(taskRoot, "scripts", "validate-production.mjs");

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
        exit_code: null,
        stdout: "",
        stderr: error.message,
        parsed: null,
      });
    });
    child.on("close", (code) => {
      const stdoutText = Buffer.concat(stdout).toString("utf8").trim();
      const stderrText = Buffer.concat(stderr).toString("utf8").trim();
      let parsed = null;
      try {
        parsed = JSON.parse(stdoutText);
      } catch {
        parsed = null;
      }
      resolve({
        exit_code: code,
        stdout: stdoutText,
        stderr: stderrText,
        parsed,
      });
    });
  });
}

function parseIgnoreMatch(stdout) {
  if (!stdout) {
    return {
      matched_source: null,
      matched_line: null,
      matched_pattern: null,
      tested_path: null,
    };
  }
  const first = stdout.split(/\r?\n/u)[0];
  const match = first.match(/^(.*):(\d+):(.*)\t(.*)$/u);
  if (!match) {
    return {
      matched_source: null,
      matched_line: null,
      matched_pattern: null,
      tested_path: null,
    };
  }
  return {
    matched_source: match[1],
    matched_line: Number(match[2]),
    matched_pattern: match[3],
    tested_path: match[4],
  };
}

function inputState(definition) {
  if (!definition.input_path) {
    return {
      input_path: `${taskRepoPrefix}scripts/validate-production.mjs`,
      input_path_existence_state: "PRESENT_VALIDATOR_INPUT",
    };
  }
  const absolute = path.join(gitRoot, ...definition.input_path.split("/"));
  return {
    input_path: definition.input_path,
    input_path_existence_state: fs.existsSync(absolute)
      ? definition.input_path_existence_state
      : "MISSING",
  };
}

function cliArgs(definition, subjectHash, reparseProbe = null) {
  switch (definition.case_id) {
    case "skip-task-manifest-flag-rejected":
      return ["--skip-task-manifest"];
    case "discovery-cannot-return-verdict":
      return ["--discovery"];
    case "bare-fixture-usage-error":
      return ["--fixture"];
    case "bare-self-test-fixture-usage-error":
      return ["--self-test-fixture"];
    case "unknown-flag-rejected":
      return ["--unknown-flag"];
    case "duplicate-mutually-exclusive-flags-rejected":
      return ["--case", "wrong-head", "--case", "wrong-branch"];
    case "fixture-reparse-scope-escape":
      return ["--reparse-probe", reparseProbe, "--subject-hash", subjectHash];
    default:
      return ["--case", definition.case_id, "--subject-hash", subjectHash];
  }
}

function expectedError(definition) {
  return definition.predecessor_expected_error_code ?? "CLI_USAGE_ERROR";
}

function checkIgnore(repositoryRelativeInput) {
  const result = gitText(
    ["check-ignore", "-v", "--no-index", "--", repositoryRelativeInput],
    { allowedExitCodes: [0, 1] },
  );
  return {
    command: "git check-ignore -v --no-index -- <exact-input-path>",
    exact_arguments: [
      "-c",
      "safe.directory=C:/Users/a2306/Desktop/code/ntmc.yaml",
      "-C",
      "C:/Users/a2306/Desktop/code/ntmc.yaml",
      "check-ignore",
      "-v",
      "--no-index",
      "--",
      repositoryRelativeInput,
    ],
    exit_code: result.exit_code,
    stdout: result.stdout,
    stderr: result.stderr,
    ...parseIgnoreMatch(result.stdout),
  };
}

async function executeOnce(definition, subjectHash, runLabel) {
  let linkDir = null;
  let probePath = null;
  let reparseError = null;
  if (definition.case_id === "fixture-reparse-scope-escape") {
    const targetDir = path.join(taskRoot, "fixtures", "reparse-target");
    linkDir = path.join(taskRoot, "fixtures", ".runtime-reparse-link");
    try {
      fs.symlinkSync(targetDir, linkDir, "junction");
      probePath = path.join(linkDir, "fixture.json");
    } catch (error) {
      reparseError = {
        code: error.code ?? "REPARSE_PROBE_CREATION_FAILED",
        message: error.message,
      };
    }
  }
  const input = inputState(definition);
  const args = cliArgs(definition, subjectHash, probePath);
  let execution;
  try {
    execution = reparseError
      ? {
          exit_code: null,
          stdout: "",
          stderr: reparseError.message,
          parsed: null,
        }
      : await spawnValidator(args);
  } finally {
    if (linkDir) {
      try {
        if (fs.existsSync(linkDir)) fs.unlinkSync(linkDir);
      } catch (error) {
        reparseError = reparseError ?? {
          code: error.code ?? "REPARSE_PROBE_CLEANUP_FAILED",
          message: error.message,
        };
      }
    }
  }
  const expected = expectedError(definition);
  const observedError = execution.parsed?.error_code ??
    execution.parsed?.actual_error_code ??
    null;
  const forbiddenVerdict =
    /(?:TRUST_ANCHOR|PRODUCT_IMPLEMENTATION|GIT_WRITE).*(?:ADOPTED|AUTHORIZED)|HUMAN_.*APPROVED|READY_FOR_.*8A-0GC/u
    .test(execution.stdout);
  const confirmed =
    !reparseError &&
    execution.exit_code === 2 &&
    observedError === expected &&
    !forbiddenVerdict;
  const ignore = checkIgnore(input.input_path);
  return {
    run_label: runLabel,
    command: process.execPath,
    exact_arguments: [validator, ...args],
    working_directory: taskRoot,
    environment_boundary: {
      platform: process.platform,
      node_version: process.version,
      network_used: false,
      environment_files_read: false,
      persistent_git_config_written: false,
      git_mutation: "NO",
    },
    exit_code: execution.exit_code,
    stdout: execution.stdout,
    stderr: execution.stderr,
    expected_error_code: expected,
    observed_error_code: observedError,
    matched_ignore_source: ignore.matched_source,
    matched_ignore_line: ignore.matched_line,
    matched_ignore_pattern: ignore.matched_pattern,
    check_ignore_evidence: ignore,
    actual_result: confirmed
      ? "EXPECTED_REJECTION_CONFIRMED"
      : reparseError || execution.exit_code === null
        ? "EXECUTION_ERROR"
        : execution.exit_code === 0
          ? "UNEXPECTED_ACCEPTANCE"
          : "NOT_VERIFIED",
    verdict: confirmed ? "EXPECTED_REJECTION_CONFIRMED" : "NOT_VERIFIED",
    reparse_environment_error: reparseError,
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

ensureRoots();
const subject = verifySubjectManifest();
const definitionDocument = secureJson(
  path.join(taskRoot, "rejection-case-definitions.json"),
  taskRoot,
  "CASE_DEFINITIONS",
).value;
const definitions = definitionDocument.definitions;

const firstRuns = await mapLimit(
  definitions,
  4,
  (definition) =>
    executeOnce(definition, subject.internal_hash, "INITIAL_EXECUTION"),
);
const reruns = await mapLimit(
  definitions,
  4,
  (definition) =>
    executeOnce(definition, subject.internal_hash, "REPRODUCIBILITY_RERUN"),
);

const cases = definitions.map((definition, index) => {
  const initial = firstRuns[index];
  const rerun = reruns[index];
  const confirmed =
    initial.actual_result === "EXPECTED_REJECTION_CONFIRMED" &&
    rerun.actual_result === "EXPECTED_REJECTION_CONFIRMED";
  let actualResult = "NOT_VERIFIED";
  if (confirmed) actualResult = "EXPECTED_REJECTION_CONFIRMED";
  else if (
    initial.actual_result === "UNEXPECTED_ACCEPTANCE" ||
    rerun.actual_result === "UNEXPECTED_ACCEPTANCE"
  ) actualResult = "UNEXPECTED_ACCEPTANCE";
  else if (
    initial.actual_result === "EXECUTION_ERROR" ||
    rerun.actual_result === "EXECUTION_ERROR"
  ) actualResult = "EXECUTION_ERROR";
  return {
    ordinal: definition.ordinal,
    case_id: definition.case_id,
    purpose: definition.purpose,
    input_path: inputState(definition).input_path,
    input_path_existence_state: inputState(definition).input_path_existence_state,
    expected_result: definition.expected_result,
    command: initial.command,
    exact_arguments: initial.exact_arguments,
    working_directory: initial.working_directory,
    environment_boundary: initial.environment_boundary,
    exit_code: initial.exit_code,
    stdout: initial.stdout,
    stderr: initial.stderr,
    matched_ignore_source: initial.matched_ignore_source,
    matched_ignore_line: initial.matched_ignore_line,
    matched_ignore_pattern: initial.matched_ignore_pattern,
    actual_result: actualResult,
    verdict: confirmed
      ? "EXPECTED_REJECTION_CONFIRMED"
      : "NOT_VERIFIED",
    rerun_result: rerun,
  };
});

const confirmedCount = cases.filter(
  (item) => item.actual_result === "EXPECTED_REJECTION_CONFIRMED",
).length;
const unexpectedCount = cases.filter(
  (item) => item.actual_result === "UNEXPECTED_ACCEPTANCE",
).length;
const executionErrorCount = cases.filter(
  (item) => item.actual_result === "EXECUTION_ERROR",
).length;
const notVerifiedCount = cases.length -
  confirmedCount -
  unexpectedCount -
  executionErrorCount;

const output = {
  schema_version: 1,
  task_id: TASK_ID,
  verification_subject_manifest_hash: subject.internal_hash,
  authoritative_order_preserved: true,
  total_cases: cases.length,
  expected_rejection_confirmed: confirmedCount,
  unexpected_acceptance: unexpectedCount,
  execution_error: executionErrorCount,
  not_verified: notVerifiedCount,
  cases,
  matrix_verdict:
    cases.length === 43 &&
    confirmedCount === 43 &&
    unexpectedCount === 0 &&
    executionErrorCount === 0 &&
    notVerifiedCount === 0
      ? "FORTY_THREE_OF_FORTY_THREE_CONFIRMED"
      : "BLOCKER",
  formal_candidate_verdict_issued: false,
  git_mutation: "NO",
};

process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
process.exitCode = output.matrix_verdict ===
  "FORTY_THREE_OF_FORTY_THREE_CONFIRMED"
  ? 0
  : 1;
