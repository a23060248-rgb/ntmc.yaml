import { createHash } from "node:crypto";
import { lstat, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadAndCompileGovernanceSchemas } from "../../scripts/lib/governance/governance-schema-loader.mjs";

const taskDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(taskDir, "../../..");
const taskId = "GOV-PHASE1-L3-REVIEW-A8";
const outputName = process.argv[2];
if (!/^review-baseline-(before|after)\.json$/.test(outputName ?? "")) throw new Error("A review baseline output name is required.");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex").toUpperCase();
const rel = (value) => value.split("/");

async function captureFile(ref, artifactType) {
  const absolute = path.join(root, ...rel(ref));
  const stat = await lstat(absolute);
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`UNSAFE_BASELINE_ARTIFACT:${ref}`);
  const bytes = await readFile(absolute);
  return {relative_path: ref, byte_size: bytes.length, sha256: sha256(bytes), artifact_type: artifactType};
}

async function collectTree(ref, artifactType, out) {
  const absolute = path.join(root, ...rel(ref));
  const stat = await lstat(absolute);
  if (stat.isSymbolicLink()) throw new Error(`SYMLINK_NOT_ALLOWED:${ref}`);
  if (stat.isDirectory()) {
    for (const entry of (await readdir(absolute)).sort((a, b) => a.localeCompare(b))) await collectTree(path.posix.join(ref, entry), artifactType, out);
  } else if (stat.isFile()) out.push(await captureFile(ref, artifactType));
  else throw new Error(`UNSUPPORTED_BASELINE_ARTIFACT:${ref}`);
}

const expected = {
  manifest_sha256: "12073691E85308C8E47A36555EBA07B3F4F12FF416E7DF651A5CFD9B2A0A40A9",
  manifest_count: 97,
  registry_sha256: "816AA777D48B4DB5EFC2F3A2C4634DE42BE62144AF6BDDAD1EA127716135967D",
  schema_set_sha256: "B026F777F024B08D6D35811D91F3E99561790271E7E2E381F568C3A73072E836"
};
const manifestRef = ".codex/governance/governance-commit-manifest.yaml";
const manifestBytes = await readFile(path.join(root, ...rel(manifestRef)));
const manifest = JSON.parse(manifestBytes.toString("utf8"));
if (sha256(manifestBytes) !== expected.manifest_sha256) throw new Error("CANDIDATE_MANIFEST_SHA256_MISMATCH");
if (manifest.artifacts.length !== expected.manifest_count) throw new Error(`CANDIDATE_COUNT:${manifest.artifacts.length}`);
const candidate = [];
for (const item of manifest.artifacts) {
  const captured = await captureFile(item.path, "bootstrap-candidate");
  captured.manifest_sha256 = item.sha256;
  captured.manifest_hash_match = captured.sha256 === item.sha256;
  candidate.push(captured);
}
candidate.sort((a, b) => a.relative_path.localeCompare(b.relative_path));
if (!candidate.every((item) => item.manifest_hash_match)) throw new Error("CANDIDATE_ARTIFACT_HASH_MISMATCH");
if (candidate.some((item) => item.relative_path.startsWith(`.codex/tasks/${taskId}/`))) throw new Error("A8_PRESENT_IN_CANDIDATE");

const r8Baseline = JSON.parse(await readFile(path.join(root, ".codex", "tasks", "GOV-PHASE1-REMEDIATION-8", "baseline-after.json"), "utf8"));
async function captureRefs(type, expectedCount, artifactType) {
  const refs = r8Baseline.files.filter((item) => item.artifact_type === type).map((item) => item.relative_path).sort((a, b) => a.localeCompare(b));
  if (refs.length !== expectedCount) throw new Error(`${type.toUpperCase()}_EXPECTED_${expectedCount}:${refs.length}`);
  const out = [];
  for (const ref of refs) out.push(await captureFile(ref, artifactType));
  return out;
}
const frozenHistory = await captureRefs("frozen-history", 425, "frozen-history");
const migration320Task = await captureRefs("migration-320-task", 13, "migration-320-task");
const migration320External = await captureRefs("migration-320-external-evidence", 5, "migration-320-external-evidence");
const remediation8 = [];
await collectTree(".codex/tasks/GOV-PHASE1-REMEDIATION-8", "remediation-8", remediation8);
remediation8.sort((a, b) => a.relative_path.localeCompare(b.relative_path));

const recordRef = ".codex/tasks/GOV-PHASE1-REMEDIATION-8/bootstrap-candidate-record.json";
const reportRef = ".codex/tasks/GOV-PHASE1-REMEDIATION-8/bootstrap-scanner-report.json";
const registryRef = ".codex/governance/bootstrap-binary-magic-registry.yaml";
const schemaSetRef = ".codex/governance/governance-schema-set.yaml";
const record = await captureFile(recordRef, "bootstrap-candidate-record");
const report = await captureFile(reportRef, "bootstrap-scanner-report");
const registry = await captureFile(registryRef, "binary-magic-registry");
const schemaSet = await captureFile(schemaSetRef, "governance-schema-set");
if (registry.sha256 !== expected.registry_sha256) throw new Error("BINARY_MAGIC_REGISTRY_SHA256_MISMATCH");
const compiledSchemaSet = await loadAndCompileGovernanceSchemas(root);
if (compiledSchemaSet.schema_set_sha256 !== expected.schema_set_sha256) throw new Error("COMPILED_SCHEMA_SET_SHA256_MISMATCH");
const recordJson = JSON.parse(await readFile(path.join(root, ...rel(recordRef)), "utf8"));
const reportJson = JSON.parse(await readFile(path.join(root, ...rel(reportRef)), "utf8"));
const bindingChecks = {
  record_manifest: recordJson.manifest_sha256 === expected.manifest_sha256,
  report_manifest: reportJson.candidate_binding?.manifest_sha256 === expected.manifest_sha256,
  record_registry: recordJson.binary_magic_registry_sha256 === expected.registry_sha256,
  report_registry: reportJson.scan_contract?.binary_magic_registry_sha256 === expected.registry_sha256,
  loader_schema_set: compiledSchemaSet.schema_set_sha256 === expected.schema_set_sha256,
  record_schema_set: recordJson.schema_set_sha256 === compiledSchemaSet.schema_set_sha256,
  report_schema_set: reportJson.scan_contract?.schema_set_sha256 === compiledSchemaSet.schema_set_sha256,
  record_report: recordJson.scanner_report_sha256 === report.sha256,
  candidate_count_record: recordJson.file_count === expected.manifest_count,
  candidate_count_report: reportJson.candidate_binding?.expected_file_count === expected.manifest_count && reportJson.candidate_binding?.scanned_file_count === expected.manifest_count
};
if (!Object.values(bindingChecks).every(Boolean)) throw new Error(`CANDIDATE_BINDING_MISMATCH:${JSON.stringify(bindingChecks)}`);

const payload = {
  schema_version: 1,
  task_id: taskId,
  baseline_role: outputName.includes("before") ? "before" : "after",
  root_token: "${PRODUCT_ROOT}",
  a8_self_excluded: true,
  git_diff_used: false,
  exclusions: [".env*", "product code", "database and migration source", "sibling directories"],
  expected,
  compiled_schema_set: {schema_count: compiledSchemaSet.schemas.length, schema_set_sha256: compiledSchemaSet.schema_set_sha256, registry_sha256: compiledSchemaSet.registry_sha256},
  bindings: bindingChecks,
  manifest: {relative_path: manifestRef, byte_size: manifestBytes.length, sha256: sha256(manifestBytes), artifact_count: candidate.length},
  counts: {candidate: candidate.length, frozen_history: frozenHistory.length, remediation_8: remediation8.length, migration_320_task: migration320Task.length, migration_320_external: migration320External.length},
  candidate,
  bootstrap_candidate_record: record,
  bootstrap_scanner_report: report,
  binary_magic_registry: registry,
  governance_schema_set: schemaSet,
  frozen_history: frozenHistory,
  remediation_8: remediation8,
  migration_320_task: migration320Task,
  migration_320_external: migration320External
};
await writeFile(path.join(taskDir, outputName), `${JSON.stringify(payload, null, 2)}\n`, {encoding: "utf8", flag: "wx"});
console.log(`A8_BASELINE role=${payload.baseline_role} candidate=${candidate.length} frozen=${frozenHistory.length} r8=${remediation8.length} m320=${migration320Task.length} external=${migration320External.length}`);
