import { lstat, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { safeExistingPath } from "../../scripts/lib/path-safety.mjs";
import { canonicalSha256, sha256 } from "../../scripts/lib/governance/typed-proof.mjs";

const taskDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(taskDir, "../../..");
const taskId = "GOV-PHASE1-L3-REVIEW-A10";
const outputName = process.argv[2] ?? "review-baseline-before.json";
const output = path.join(taskDir, outputName);
const frozenTaskIds = [
  "GOV-PHASE1-L3-REVIEW-A", "GOV-PHASE1-L3-REVIEW-A2", "GOV-PHASE1-L3-REVIEW-A3", "GOV-PHASE1-L3-REVIEW-A4", "GOV-PHASE1-L3-REVIEW-A5", "GOV-PHASE1-L3-REVIEW-A6", "GOV-PHASE1-L3-REVIEW-A7",
  "GOV-PHASE1-REMEDIATION-2", "GOV-PHASE1-REMEDIATION-3", "GOV-PHASE1-REMEDIATION-4", "GOV-PHASE1-REMEDIATION-5", "GOV-PHASE1-REMEDIATION-6", "GOV-PHASE1-REMEDIATION-7",
  "GOV-PHASE1-A4-FINDING-CONSOLIDATION", "GOV-PHASE1-A5-BOOTSTRAP-TRUST-ANALYSIS"
];

async function collect(relativePath, artifactType, out) {
  const absolute = await safeExistingPath(root, relativePath);
  const stat = await lstat(absolute);
  if (stat.isDirectory()) {
    for (const entry of (await readdir(absolute)).sort((a, b) => a.localeCompare(b))) await collect(path.posix.join(relativePath, entry), artifactType, out);
    return;
  }
  if (!stat.isFile()) throw new Error(`UNSUPPORTED_FILE_TYPE:${relativePath}`);
  const bytes = await readFile(absolute);
  out.push({relative_path: relativePath, byte_size: bytes.length, sha256: sha256(bytes), artifact_type: artifactType});
}

const manifestRef = ".codex/governance/governance-commit-manifest.yaml";
const candidateRef = ".codex/tasks/GOV-PHASE1-REMEDIATION-9/bootstrap-candidate-record.json";
const scannerRef = ".codex/tasks/GOV-PHASE1-REMEDIATION-9/bootstrap-scanner-report.json";
const manifestBytes = await readFile(await safeExistingPath(root, manifestRef));
const manifest = JSON.parse(manifestBytes.toString("utf8"));
const candidateBytes = await readFile(await safeExistingPath(root, candidateRef));
const candidate = JSON.parse(candidateBytes.toString("utf8"));
const scannerBytes = await readFile(await safeExistingPath(root, scannerRef));
const scanner = JSON.parse(scannerBytes.toString("utf8"));
const included = (manifest.artifacts ?? []).filter((item) => item.commit_inclusion === true);
if (included.length !== 103) throw new Error(`CANDIDATE_COUNT_EXPECTED_103_ACTUAL_${included.length}`);
if (new Set(included.map((item) => item.path)).size !== included.length) throw new Error("DUPLICATE_CANDIDATE_PATH");

const files = [];
const candidateFileSet = [];
for (const item of included.sort((a, b) => a.path.localeCompare(b.path))) {
  await collect(item.path, "candidate-artifact", files);
  const actual = files.at(-1);
  if (actual.relative_path !== item.path || actual.sha256 !== item.sha256.toUpperCase()) throw new Error(`CANDIDATE_MANIFEST_MISMATCH:${item.path}`);
  candidateFileSet.push({path: item.path, sha256: actual.sha256});
}
const manifestSha256 = sha256(manifestBytes);
const fileSetSha256 = canonicalSha256(candidateFileSet);
if (candidate.manifest_sha256 !== manifestSha256 || candidate.included_file_set_sha256 !== fileSetSha256 || candidate.file_count !== included.length) throw new Error("CANDIDATE_RECORD_BINDING_MISMATCH");
if (candidate.scanner_report_sha256 !== sha256(scannerBytes)) throw new Error("CANDIDATE_SCANNER_HASH_MISMATCH");
if (scanner.candidate_binding?.manifest_sha256 !== manifestSha256 || scanner.candidate_binding?.included_file_set_sha256 !== fileSetSha256 || scanner.candidate_binding?.scanned_file_set_sha256 !== fileSetSha256 || scanner.candidate_binding?.expected_file_count !== included.length || scanner.candidate_binding?.scanned_file_count !== included.length) throw new Error("SCANNER_CANDIDATE_BINDING_MISMATCH");

for (const frozenTaskId of frozenTaskIds) await collect(`.codex/tasks/${frozenTaskId}`, "frozen-history", files);
await collect(".codex/tasks/GOV-PHASE1-REMEDIATION-8", "remediation-8", files);
await collect(".codex/tasks/GOV-PHASE1-L3-REVIEW-A8", "review-a8", files);
await collect(".codex/tasks/GOV-PHASE1-REMEDIATION-9", "remediation-9", files);
await collect(".codex/tasks/GOV-PHASE1-L3-REVIEW-A9", "review-a9", files);
await collect(".codex/tasks/GOV-M320-DRYRUN", "migration-320-task", files);
const m320Manifest = JSON.parse(await readFile(await safeExistingPath(root, ".codex/tasks/GOV-M320-DRYRUN/artifact-manifest.yaml"), "utf8"));
for (const artifact of m320Manifest.artifacts.filter((item) => item.evidence_scope === "external_reference")) await collect(artifact.path, "migration-320-external-evidence", files);
files.sort((a, b) => `${a.artifact_type}|${a.relative_path}`.localeCompare(`${b.artifact_type}|${b.relative_path}`));

const expectedCounts = {"candidate-artifact":103, "frozen-history":425, "remediation-8":46, "review-a8":51, "remediation-9":51, "review-a9":47, "migration-320-task":13, "migration-320-external-evidence":5};
for (const [type, expected] of Object.entries(expectedCounts)) {
  const actual = files.filter((item) => item.artifact_type === type).length;
  if (actual !== expected) throw new Error(`BASELINE_COUNT_MISMATCH:${type}:expected=${expected}:actual=${actual}`);
}
const manifestMap = new Map(included.map((item) => [item.path, item.sha256.toUpperCase()]));
const payload = {
  schema_version: 1,
  task_id: taskId,
  baseline_role: outputName.includes("after") ? "after" : "before",
  root_token: "${PRODUCT_ROOT}",
  review_task_excluded: `.codex/tasks/${taskId}/**`,
  git_diff_used: false,
  exclusions: [".env*", "product code", "collab", "parent and sibling directories", "database and migration source"],
  candidate: {
    manifest_ref: manifestRef,
    manifest_sha256: manifestSha256,
    included_file_set_sha256: fileSetSha256,
    file_count: included.length,
    candidate_record_ref: candidateRef,
    candidate_record_sha256: sha256(candidateBytes),
    scanner_report_ref: scannerRef,
    scanner_report_sha256: sha256(scannerBytes),
    schema_set_sha256: candidate.schema_set_sha256,
    railway_review_schema_sha256: manifestMap.get(".codex/blueprints/schemas/railway-domain-review.schema.json"),
    railway_reviewer_profile_sha256: manifestMap.get(".codex/agents/railway-domain-reviewer.toml")
  },
  frozen_task_ids: frozenTaskIds,
  separately_frozen_task_ids: ["GOV-PHASE1-REMEDIATION-8", "GOV-PHASE1-L3-REVIEW-A8", "GOV-PHASE1-REMEDIATION-9", "GOV-PHASE1-L3-REVIEW-A9"],
  counts: Object.fromEntries([...Object.keys(expectedCounts).map((type) => [type.replaceAll("-", "_"), files.filter((item) => item.artifact_type === type).length]), ["total", files.length]]),
  files
};
await writeFile(output, `${JSON.stringify(payload, null, 2)}\n`, {encoding: "utf8", flag: "wx"});
console.log(JSON.stringify({output: path.relative(root, output).replaceAll("\\", "/"), ...payload.counts, manifest_sha256: manifestSha256, file_set_sha256: fileSetSha256}));
