import { createHash } from "node:crypto";
import { lstat, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const taskDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(taskDir, "../../..");
const outputName = process.argv[2] ?? "review-baseline-before.json";
const output = path.join(taskDir, outputName);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex").toUpperCase();
const manifestRef = ".codex/governance/governance-commit-manifest.yaml";
const snapshotRef = ".codex/tasks/GOV-PHASE1-REMEDIATION-5/candidate-snapshot.json";
const frozenRoots = [
  ".codex/tasks/GOV-PHASE1-L3-REVIEW-A",
  ".codex/tasks/GOV-PHASE1-REMEDIATION-2",
  ".codex/tasks/GOV-PHASE1-L3-REVIEW-A2",
  ".codex/tasks/GOV-PHASE1-REMEDIATION-3",
  ".codex/tasks/GOV-PHASE1-L3-REVIEW-A3",
  ".codex/tasks/GOV-PHASE1-REMEDIATION-4",
  ".codex/tasks/GOV-PHASE1-L3-REVIEW-A4",
  ".codex/tasks/GOV-PHASE1-A4-FINDING-CONSOLIDATION"
];

async function collectTree(relativePath, artifactType, outputFiles) {
  const absolute = path.join(root, relativePath);
  const stat = await lstat(absolute);
  if (stat.isSymbolicLink()) throw new Error(`LINK_NOT_ALLOWED:${relativePath}`);
  if (stat.isDirectory()) {
    for (const entry of (await readdir(absolute)).sort()) await collectTree(`${relativePath}/${entry}`, artifactType, outputFiles);
    return;
  }
  if (!stat.isFile()) throw new Error(`UNSUPPORTED_OBJECT:${relativePath}`);
  const bytes = await readFile(absolute);
  outputFiles.push({ relative_path: relativePath, artifact_type: artifactType, byte_size: bytes.length, sha256: sha256(bytes), commit_inclusion: false, scan_required: false });
}

const manifestBytes = await readFile(path.join(root, manifestRef));
const manifest = JSON.parse(manifestBytes.toString("utf8"));
const candidate_files = [];
for (const artifact of manifest.artifacts) {
  const bytes = await readFile(path.join(root, artifact.path));
  candidate_files.push({ relative_path: artifact.path, artifact_type: artifact.artifact_type, byte_size: bytes.length, sha256: sha256(bytes), commit_inclusion: artifact.commit_inclusion, scan_required: artifact.scan_required });
}
const snapshotBytes = await readFile(path.join(root, snapshotRef));
const snapshot = JSON.parse(snapshotBytes.toString("utf8"));
const candidate_proof = { relative_path: snapshotRef, artifact_type: "workspace-candidate-proof", byte_size: snapshotBytes.length, sha256: sha256(snapshotBytes), commit_inclusion: false, scan_required: true, execution_id: snapshot.execution_id, proof_payload_sha256: snapshot.proof_payload_sha256 };
const frozen_history = [];
for (const frozenRoot of frozenRoots) await collectTree(frozenRoot, "frozen-history", frozen_history);
const migration_320_task = [];
await collectTree(".codex/tasks/GOV-M320-DRYRUN", "migration-320-task", migration_320_task);
const m320Manifest = JSON.parse(await readFile(path.join(root, ".codex/tasks/GOV-M320-DRYRUN/artifact-manifest.yaml"), "utf8"));
const migration_320_external = [];
for (const artifact of m320Manifest.artifacts) {
  const bytes = await readFile(path.join(root, artifact.path));
  migration_320_external.push({ relative_path: artifact.path, artifact_type: "migration-320-external-evidence", byte_size: bytes.length, sha256: sha256(bytes), expected_sha256: artifact.sha256, commit_inclusion: false, scan_required: false });
}
candidate_files.sort((a, b) => a.relative_path.localeCompare(b.relative_path));
frozen_history.sort((a, b) => a.relative_path.localeCompare(b.relative_path));
migration_320_task.sort((a, b) => a.relative_path.localeCompare(b.relative_path));
migration_320_external.sort((a, b) => a.relative_path.localeCompare(b.relative_path));
const payload = {
  schema_version: 1,
  task_id: "GOV-PHASE1-L3-REVIEW-A5",
  baseline_role: outputName.includes("after") ? "after" : "before",
  candidate_baseline: "phase-1.5",
  manifest_ref: manifestRef,
  manifest_sha256: sha256(manifestBytes),
  expected_candidate_file_count: 97,
  candidate_files,
  candidate_proof,
  frozen_history,
  migration_320_task,
  migration_320_external,
  counts: { candidate: candidate_files.length, frozen_history: frozen_history.length, migration_320_task: migration_320_task.length, migration_320_external: migration_320_external.length },
  a5_task_excluded: true
};
await writeFile(output, `${JSON.stringify(payload, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
console.log(`A5_BASELINE role=${payload.baseline_role} candidate=${payload.counts.candidate} frozen=${payload.counts.frozen_history} m320_task=${payload.counts.migration_320_task} m320_external=${payload.counts.migration_320_external}`);
