import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeManifest } from "./generate-task-manifest.mjs";

const TASK_ID =
  "GOV-MAGP-PHASE-0-1-EXISTING-HEAD-TRUST-ANCHOR-ATTESTATION-REMEDIATION-02";
const taskRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const validator = path.join(taskRoot, "scripts", "validate-production.mjs");
const runner = path.join(
  taskRoot,
  "scripts",
  "run-production-rejection-matrix.mjs",
);

function spawnNode(script, args = []) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: taskRoot,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 512 * 1024 * 1024,
  });
  let parsed = null;
  try {
    parsed = JSON.parse(String(result.stdout ?? "").trim());
  } catch {
    parsed = null;
  }
  return {
    exit_code: result.status,
    stdout: String(result.stdout ?? "").trim(),
    stderr: String(result.stderr ?? "").trim(),
    parsed,
  };
}

function writeJson(relative, value) {
  fs.writeFileSync(
    path.join(taskRoot, relative),
    `${JSON.stringify(value, null, 2)}\n`,
    "utf8",
  );
}

for (const required of ["HANDOFF.md", "final-summary.md"]) {
  if (!fs.existsSync(path.join(taskRoot, required))) {
    throw new Error(`FROZEN_HANDOFF_PREREQUISITE_MISSING:${required}`);
  }
}

writeManifest();

const initialProduction = spawnNode(validator);
writeJson("production-entry-observation.json", {
  schema_version: 1,
  task_id: TASK_ID,
  evidence_authority: "NON_AUTHORITATIVE_CANDIDATE_EVIDENCE",
  command: "node scripts/validate-production.mjs",
  observed_exit_code: initialProduction.exit_code,
  observed_stdout: initialProduction.parsed ?? initialProduction.stdout,
  observed_stderr: initialProduction.stderr || null,
  observation_boundary:
    "This capture is not Work acceptance or Human adoption.",
});

const rejectionMatrix = spawnNode(runner);
writeJson("production-rejection-matrix-results.json", {
  schema_version: 1,
  task_id: TASK_ID,
  evidence_authority: "NON_AUTHORITATIVE_CANDIDATE_EVIDENCE",
  observed_exit_code: rejectionMatrix.exit_code,
  observed_stdout: rejectionMatrix.parsed ?? rejectionMatrix.stdout,
  observed_stderr: rejectionMatrix.stderr || null,
  formal_candidate_verdict_issued: false,
});

for (const temporary of [
  ".temporary-reparse-target",
  path.join("test-fixtures", ".temporary-reparse-link"),
]) {
  if (fs.existsSync(path.join(taskRoot, temporary))) {
    throw new Error(`TEMPORARY_REPARSE_PROBE_NOT_REMOVED:${temporary}`);
  }
}

const finalManifest = writeManifest();
const frozenManifestBytes = fs.readFileSync(
  path.join(taskRoot, "task-artifact-manifest.json"),
);
const finalProduction = spawnNode(validator);
const readBackBytes = fs.readFileSync(
  path.join(taskRoot, "task-artifact-manifest.json"),
);
if (!frozenManifestBytes.equals(readBackBytes)) {
  throw new Error("FINAL_MANIFEST_CHANGED_AFTER_FREEZE");
}

const candidateVerdict =
  finalProduction.parsed?.candidate_verdict ??
  (finalProduction.parsed?.production_contract_status === "BLOCKER"
    ? "BLOCKER"
    : "INVALID");
process.stdout.write(
  `${JSON.stringify({
    task_id: TASK_ID,
    finalization_status: "FROZEN",
    candidate_verdict: candidateVerdict,
    production_contract_status:
      finalProduction.parsed?.production_contract_status ?? "INVALID",
    production_exit_code: finalProduction.exit_code,
    production_error_code: finalProduction.parsed?.error_code ?? null,
    blockers: finalProduction.parsed?.blockers ?? [],
    rejection_matrix_status:
      rejectionMatrix.parsed?.coverage_status ?? "NOT_VERIFIED",
    task_artifact_entry_count: finalManifest.entry_count,
    task_artifact_physical_file_count: finalManifest.physical_file_count,
    task_manifest_sha256: finalManifest.manifest_sha256,
    handoff_path: path.join(taskRoot, "HANDOFF.md"),
    files_modified_outside_task: 0,
    git_mutation: "NO",
    human_gate:
      "WORK_READ_ONLY_REVIEW_THEN_HUMAN_EXACT_TRUST_ANCHOR_ADOPTION_DECISION",
  }, null, 2)}\n`,
);
