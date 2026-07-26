import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const TASK_ID = "GOV-MAGP-PHASE-0-1-IMPLEMENTATION-01";
const SOURCE_TASK_ID = "GOV-MAGP-INTEGRATED-DESIGN-ADOPTION-AND-PHASE-01-AUTHORIZATION-01";
const EXPECTED_SOURCE = {
  file_count: 106,
  manifest_sha256: "CB760B18A41C67EF2978506FE3BE409E7003B28186F2ACFBB56B77D6ED7F68D8",
};
const EXPECTED_BASELINES = {
  architecture: "32A064D90A2051DFC7B28962F9757F7947E6A4863615628C1E99169FE91C128C",
  "object-library": "907F7D7F58739182FEC731AD562D6142C522E5958144F0A34AAE240465E2B8CE",
  "logical-contract": "A5DC37FFBDFE5857EBD0B0995C28325A83887B59833DBA7260B46F2851305E6B",
  persistence: "1ACD3D57DA8CD65A29EC07BF1AA8407A1DBF01E558F2972DD7346550A1FFF994",
  "api-event": "BA3D1C621567ADB4106C83BDB3DDFA20E5C5FCE357BD87B7025FC5F8D3E8D7FE",
  "security-deployment": "C56097732C23F53884205294463C559DA2E7CCFDC97B5C85FA6D8C0D191393B1",
  "implementation-blueprint": "388F2CDBA212A6A3ACFDE7985B3E47AB8F33049914EB7E82BCA89D9EC76337BB",
};

const here = path.dirname(fileURLToPath(import.meta.url));
const taskRoot = path.resolve(here, "..");
const tasksRoot = path.resolve(taskRoot, "..");
const sourceRoot = path.join(tasksRoot, SOURCE_TASK_ID);
const launchRoot = path.join(sourceRoot, "phase-0-1-implementation-launch-package");
const exclusions = new Set(["task-artifact-manifest.json", "deterministic-stage-0-result.json"]);

const sha = (value) => crypto.createHash("sha256").update(value).digest("hex").toUpperCase();
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
function listFiles(root) {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(root, entry.name);
    return entry.isDirectory() ? listFiles(file) : [file];
  });
}
function digest(root, base = root, ignored = new Set()) {
  const entries = listFiles(root)
    .map((file) => ({
      relative_path: path.relative(base, file).split(path.sep).join("/"),
      sha256: sha(fs.readFileSync(file)),
      bytes: fs.statSync(file).size,
    }))
    .filter((entry) => !ignored.has(entry.relative_path))
    .sort((a, b) => (
      a.relative_path < b.relative_path ? -1 : a.relative_path > b.relative_path ? 1 : 0
    ));
  return {
    file_count: entries.length,
    manifest_sha256: sha(
      Buffer.from(entries.map((entry) => `${entry.relative_path}|${entry.sha256}|${entry.bytes}`).join("\n"), "utf8"),
    ),
    entries,
  };
}

const checks = [];
function check(name, condition, evidence) {
  checks.push({ name, status: condition ? "PASS" : "FAIL", evidence });
}

const sourceDigest = digest(sourceRoot);
check(
  "7A-2 source task binding",
  sourceDigest.file_count === EXPECTED_SOURCE.file_count
    && sourceDigest.manifest_sha256 === EXPECTED_SOURCE.manifest_sha256,
  sourceDigest,
);
check("Launch Package file count", listFiles(launchRoot).length === 16, {
  expected: 16,
  actual: listFiles(launchRoot).length,
});

const writeBoundary = readJson(path.join(launchRoot, "repository-write-boundary.json"));
const exactAllowedPaths = Array.isArray(writeBoundary.allowed_paths)
  ? writeBoundary.allowed_paths.filter((value) => typeof value === "string" && value.trim().length > 0)
  : [];
check("Exact implementation write scope is absent", exactAllowedPaths.length === 0, {
  next_task_boundary_status: writeBoundary.next_task_boundary_status,
  exact_allowed_path_count: exactAllowedPaths.length,
});
check(
  "Write boundary requires Human prelaunch confirmation",
  writeBoundary.next_task_boundary_status === "MUST_BE_DISCOVERED_AND_HUMAN_CONFIRMED_AT_PRELAUNCH",
  writeBoundary.next_task_boundary_status,
);

for (const [key, expectedHash] of Object.entries(EXPECTED_BASELINES)) {
  const binding = readJson(path.join(taskRoot, "input-binding", `${key}-baseline-binding.json`));
  const actualHash = binding.actual_hash ?? binding.baseline_content_sha256;
  check(`${key} Baseline binding`, binding.match === true && actualHash === expectedHash, {
    expected_hash: expectedHash,
    actual_hash: actualHash,
    status: binding.status,
  });
  const integrityName = key === "object-library"
    ? "object-library-baseline-integrity.json"
    : key === "logical-contract"
      ? "logical-contract-baseline-integrity.json"
      : `${key}-baseline-integrity.json`;
  const integrity = readJson(path.join(taskRoot, integrityName));
  check(`${key} root integrity record`, integrity.match === true
    && integrity.expected_hash === expectedHash
    && integrity.actual_hash === expectedHash
    && integrity.status === "BOUND_AND_VALID", integrity);
}

const validation = readJson(path.join(taskRoot, "validation-results.json"));
check("Stage 0 deterministic count", validation.required_test_count === 11
  && validation.pass_count === 10
  && validation.fail_count === 1
  && validation.tests[6]?.status === "FAIL", {
  required: validation.required_test_count,
  pass: validation.pass_count,
  fail: validation.fail_count,
  failed_test: validation.tests[6],
});
check(
  "Stage 0 blocker codes",
  validation.hard_stop_codes_triggered.includes("IMPLEMENTATION_WRITE_SCOPE_MISSING")
    && validation.hard_stop_codes_triggered.includes("IMPLEMENTATION_SCOPE_CONFLICT"),
  validation.hard_stop_codes_triggered,
);
check(
  "Prohibited-action attestation",
  Object.values(validation.prohibited_action_attestation).every((value) => value === false || value === 0),
  validation.prohibited_action_attestation,
);

const stage0 = readJson(path.join(taskRoot, "stage-0-result.json"));
check(
  "Stage 0 hard-stop result",
  stage0.result === "HARD_STOP"
    && stage0.primary_blocker === "IMPLEMENTATION_WRITE_SCOPE_MISSING"
    && stage0.related_finding === "IMPLEMENTATION_SCOPE_CONFLICT"
    && stage0.next_stage === "NOT_STARTED"
    && stage0.git_used === false
    && stage0.implementation_started === false,
  stage0,
);

const preflight = readJson(path.join(taskRoot, "preflight", "preflight-not-started.json"));
const git = readJson(path.join(taskRoot, "git-control", "git-not-started.json"));
const implementation = readJson(path.join(taskRoot, "implementation-plan", "implementation-not-started.json"));
check("Stages 1-7 did not start", preflight.status === "NOT_STARTED_DUE_TO_STAGE_0_HARD_STOP"
  && git.controlled_local_git_started === false
  && implementation.phase_0 === "NOT_STARTED"
  && implementation.phase_1 === "NOT_STARTED"
  && implementation.product_code_modified === false, {
  preflight: preflight.status,
  git_started: git.controlled_local_git_started,
  phase_0: implementation.phase_0,
  phase_1: implementation.phase_1,
  product_code_modified: implementation.product_code_modified,
});
const notStartedEvidence = [
  ["implementation-evidence/implementation-not-started.json", "reason", "STAGE_0_HARD_STOP"],
  ["review/review-not-started.json", "reason", "STAGE_0_HARD_STOP"],
  ["human-phase-0-1-acceptance-package/package-not-prepared.json", "package_status", "NOT_PREPARED"],
  ["phase-2-readiness-package/package-not-prepared.json", "phase_2_started", false],
  ["findings/implementation-write-scope-missing.json", "status", "OPEN"],
  ["findings/implementation-scope-conflict.json", "status", "OPEN"],
  ["product-governance-integrity.json", "status", "BOUND_AND_UNCHANGED"],
  ["historical-artifact-integrity.json", "status", "BOUND_AND_UNCHANGED"],
];
check("Required hard-stop evidence structure", notStartedEvidence.every(([relative, field, expected]) => {
  const record = readJson(path.join(taskRoot, ...relative.split("/")));
  return record[field] === expected;
}), notStartedEvidence.map(([relative, field, expected]) => ({ relative, field, expected })));

const manifest = readJson(path.join(taskRoot, "task-artifact-manifest.json"));
const actualTaskContent = digest(taskRoot, taskRoot, exclusions);
check(
  "Task-local content manifest",
  manifest.file_count === actualTaskContent.file_count
    && manifest.manifest_sha256 === actualTaskContent.manifest_sha256
    && JSON.stringify(manifest.entries) === JSON.stringify(actualTaskContent.entries),
  {
    expected_file_count: manifest.file_count,
    actual_file_count: actualTaskContent.file_count,
    expected_manifest_sha256: manifest.manifest_sha256,
    actual_manifest_sha256: actualTaskContent.manifest_sha256,
  },
);

const failures = checks.filter((entry) => entry.status === "FAIL");
console.log(JSON.stringify({
  task_id: TASK_ID,
  validator: "INDEPENDENT_STAGE_0_HARD_STOP_VALIDATOR",
  result: failures.length === 0 ? "PASS" : "FAIL",
  check_count: checks.length,
  pass_count: checks.length - failures.length,
  fail_count: failures.length,
  confirmed_result: failures.length === 0 ? "IMPLEMENTATION_WRITE_SCOPE_MISSING" : "VALIDATION_FAILURE",
  checks,
}, null, 2));
process.exitCode = failures.length === 0 ? 0 : 1;
