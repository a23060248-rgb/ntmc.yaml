import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const taskRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const validatorPath = path.join(taskRoot, "scripts", "validate-attestation.mjs");
const fixtureRoot = path.join(taskRoot, "test-fixtures");

const cases = [
  ["wrong-head.json", "HEAD_BINDING_MISMATCH"],
  ["wrong-branch.json", "BRANCH_BINDING_MISMATCH"],
  ["missing-path.json", "EXACT_PATH_COUNT_MISMATCH"],
  ["extra-path.json", "EXACT_PATH_COUNT_MISMATCH"],
  ["duplicate-path.json", "DUPLICATE_PATH"],
  ["nfc-invalid-path.json", "PATH_NOT_NFC"],
  ["wrong-file-sha256.json", "CANDIDATE_SHA256_MISMATCH"],
  ["wrong-blob-oid.json", "CANDIDATE_SOURCE_BLOB_OID_MISMATCH"],
  ["wrong-path-count.json", "BOUND_PATH_COUNT_MISMATCH"],
  ["wrong-manifest-sha256.json", "SOURCE_MANIFEST_SHA256_MISMATCH"],
  ["producer-pass-underlying-mismatch.json", "CANDIDATE_SHA256_MISMATCH"],
];

const results = [];
for (const [fixtureName, expectedCode] of cases) {
  const fixturePath = path.join(fixtureRoot, fixtureName);
  if (!fs.existsSync(fixturePath)) {
    throw new Error(`MISSING_SAFETY_FIXTURE: ${fixtureName}`);
  }
  const result = spawnSync(
    process.execPath,
    [
      validatorPath,
      "--fixture",
      fixturePath,
      "--skip-task-manifest",
    ],
    {
      cwd: taskRoot,
      encoding: "utf8",
      windowsHide: true,
      maxBuffer: 256 * 1024 * 1024,
    },
  );
  let payload = null;
  try {
    payload = JSON.parse(result.stdout);
  } catch {
    throw new Error(`NON_JSON_VALIDATOR_REJECTION: ${fixtureName}`);
  }
  const pass =
    result.status === 2 &&
    payload.validator_status === "BLOCKER" &&
    payload.error_code === expectedCode;
  if (!pass) {
    throw new Error(
      `SAFETY_REJECTION_FAILED: ${fixtureName}; expected ${expectedCode}; ` +
      `status=${result.status}; payload=${result.stdout}; stderr=${result.stderr}`,
    );
  }
  results.push({
    fixture: fixtureName,
    production_validator_entry: "scripts/validate-attestation.mjs",
    expected_error_code: expectedCode,
    actual_error_code: payload.error_code,
    validator_exit_code: result.status,
    result: "PASS",
  });
}

process.stdout.write(`${JSON.stringify({
  schema_version: 1,
  test_type: "PRODUCTION_VALIDATOR_DIRECT_ENTRY_SAFETY_REJECTIONS",
  simplified_duplicate_binding_function_used: false,
  case_count: results.length,
  pass_count: results.length,
  status: `PASS_${results.length}_OF_${results.length}`,
  cases: results,
  files_modified: 0,
  git_mutation_executed: false,
}, null, 2)}\n`);
