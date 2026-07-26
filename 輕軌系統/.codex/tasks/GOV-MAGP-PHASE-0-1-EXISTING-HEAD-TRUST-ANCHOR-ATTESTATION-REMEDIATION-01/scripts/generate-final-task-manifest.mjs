import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const TASK_ID =
  "GOV-MAGP-PHASE-0-1-EXISTING-HEAD-TRUST-ANCHOR-ATTESTATION-REMEDIATION-01";
const taskRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(taskRoot, "task-artifact-manifest.json");
const validatorPath = path.join(taskRoot, "scripts", "validate-attestation.mjs");

function ordinalCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sha256(data) {
  return crypto.createHash("sha256").update(data).digest("hex").toUpperCase();
}

function listFiles(root) {
  const files = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isSymbolicLink()) {
        throw new Error(`TASK_ARTIFACT_SYMLINK_NOT_ALLOWED: ${absolute}`);
      }
      if (entry.isDirectory()) stack.push(absolute);
      else if (entry.isFile()) files.push(absolute);
      else throw new Error(`TASK_ARTIFACT_NON_FILE_ENTRY: ${absolute}`);
    }
  }
  return files;
}

if (!fs.existsSync(path.join(taskRoot, "HANDOFF.md"))) {
  throw new Error("HANDOFF_MUST_EXIST_BEFORE_FINAL_MANIFEST");
}
if (!fs.existsSync(path.join(taskRoot, "final-summary.md"))) {
  throw new Error("FINAL_SUMMARY_MUST_EXIST_BEFORE_FINAL_MANIFEST");
}
if (fs.existsSync(manifestPath)) {
  throw new Error("FINAL_MANIFEST_ALREADY_EXISTS_AND_IS_FROZEN");
}

const entries = listFiles(taskRoot)
  .map((absolute) => {
    const bytes = fs.readFileSync(absolute);
    return {
      relative_path: path.relative(taskRoot, absolute).split(path.sep).join("/"),
      sha256: sha256(bytes),
      bytes: bytes.length,
    };
  })
  .filter((entry) => entry.relative_path !== "task-artifact-manifest.json")
  .sort((left, right) => ordinalCompare(left.relative_path, right.relative_path));
const canonical = entries
  .map((entry) => `${entry.relative_path}|${entry.sha256}|${entry.bytes}`)
  .join("\n");
const manifest = {
  schema_version: 1,
  task_id: TASK_ID,
  generation_order: "LAST_AFTER_HANDOFF_FREEZE",
  canonicalization_method:
    "ORDINAL_SORT_RELATIVE_PATH_PIPE_SHA256_PIPE_BYTES_NEWLINE_SHA256",
  rfc_8785_jcs_used: false,
  exclusions: ["task-artifact-manifest.json"],
  file_count: entries.length,
  physical_file_count: entries.length + 1,
  manifest_sha256: sha256(Buffer.from(canonical, "utf8")),
  entries,
};
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

const validation = spawnSync(process.execPath, [validatorPath], {
  cwd: taskRoot,
  encoding: "utf8",
  windowsHide: true,
  maxBuffer: 256 * 1024 * 1024,
});
if (validation.status !== 0) {
  throw new Error(
    `POST_FREEZE_PRODUCTION_VALIDATION_FAILED: status=${validation.status}; ` +
    `stdout=${validation.stdout}; stderr=${validation.stderr}`,
  );
}
const payload = JSON.parse(validation.stdout);
if (
  payload.validator_status !== "PASS" ||
  payload.task_artifact_manifest.manifest_sha256 !== manifest.manifest_sha256 ||
  payload.task_artifact_manifest.file_count !== manifest.file_count
) {
  throw new Error("POST_FREEZE_TASK_MANIFEST_BINDING_MISMATCH");
}

process.stdout.write(`${JSON.stringify({
  task_id: TASK_ID,
  final_manifest_generation: "PASS",
  post_freeze_production_validation: "PASS",
  file_count: manifest.file_count,
  physical_file_count: manifest.physical_file_count,
  manifest_sha256: manifest.manifest_sha256,
  self_exclusion_contract: "VALID",
  handoff_modified_after_manifest: false,
  git_mutation_executed: false,
}, null, 2)}\n`);
