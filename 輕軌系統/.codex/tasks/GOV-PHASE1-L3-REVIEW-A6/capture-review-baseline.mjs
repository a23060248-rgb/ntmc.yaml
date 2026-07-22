import { createHash } from "node:crypto";
import { lstat, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const taskDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(taskDir, "../../..");
const outputName = process.argv[2];
if (!/^review-baseline-(before|after)\.json$/.test(outputName ?? "")) throw new Error("A review baseline output name is required.");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex").toUpperCase();

async function captureFile(ref, artifactType) {
  const absolute = path.join(root, ...ref.split("/"));
  const stat = await lstat(absolute);
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`UNSAFE_BASELINE_ARTIFACT:${ref}`);
  const bytes = await readFile(absolute);
  return { relative_path: ref, byte_size: bytes.length, sha256: sha256(bytes), artifact_type: artifactType };
}

async function collectTree(ref, artifactType, out) {
  const absolute = path.join(root, ...ref.split("/"));
  const stat = await lstat(absolute);
  if (stat.isSymbolicLink()) throw new Error(`SYMLINK_NOT_ALLOWED:${ref}`);
  if (stat.isDirectory()) {
    const entries = (await readdir(absolute)).sort((a, b) => a.localeCompare(b));
    for (const entry of entries) await collectTree(`${ref}/${entry}`, artifactType, out);
  } else if (stat.isFile()) out.push(await captureFile(ref, artifactType));
  else throw new Error(`UNSUPPORTED_BASELINE_ARTIFACT:${ref}`);
}

const manifestRef = ".codex/governance/governance-commit-manifest.yaml";
const manifestBytes = await readFile(path.join(root, ...manifestRef.split("/")));
const manifest = JSON.parse(manifestBytes.toString("utf8"));
if (manifest.artifacts.length !== 81) throw new Error(`CANDIDATE_COUNT:${manifest.artifacts.length}`);
const candidate = [];
for (const item of manifest.artifacts) {
  const captured = await captureFile(item.path, "bootstrap-candidate");
  captured.manifest_sha256 = item.sha256;
  captured.manifest_hash_match = captured.sha256 === item.sha256;
  candidate.push(captured);
}
candidate.sort((a, b) => a.relative_path.localeCompare(b.relative_path));

const r6Before = JSON.parse(await readFile(path.join(root, ".codex", "tasks", "GOV-PHASE1-REMEDIATION-6", "baseline-before.json"), "utf8"));
const frozenRefs = r6Before.files.filter((item) => item.artifact_type === "frozen-history").map((item) => item.relative_path).sort((a, b) => a.localeCompare(b));
if (frozenRefs.length !== 256) throw new Error(`FROZEN_HISTORY_EXPECTED_256:${frozenRefs.length}`);
const frozenHistory = [];
for (const ref of frozenRefs) frozenHistory.push(await captureFile(ref, "frozen-history"));

const migrationRefs = r6Before.files.filter((item) => item.artifact_type === "migration-320-governance-and-evidence").map((item) => item.relative_path).sort((a, b) => a.localeCompare(b));
if (migrationRefs.length !== 13) throw new Error(`M320_EXPECTED_13:${migrationRefs.length}`);
const migration320 = [];
for (const ref of migrationRefs) migration320.push(await captureFile(ref, "migration-320-task"));

const remediation6 = [];
await collectTree(".codex/tasks/GOV-PHASE1-REMEDIATION-6", "remediation-6", remediation6);
remediation6.sort((a, b) => a.relative_path.localeCompare(b.relative_path));

const m320Manifest = JSON.parse(await readFile(path.join(root, ".codex", "tasks", "GOV-M320-DRYRUN", "artifact-manifest.yaml"), "utf8"));
const externalRefs = m320Manifest.artifacts.filter((item) => item.evidence_scope === "external_reference");
if (externalRefs.length !== 5) throw new Error(`EXTERNAL_EXPECTED_5:${externalRefs.length}`);
const externalEvidence = [];
for (const item of externalRefs) {
  const captured = await captureFile(item.path, "migration-320-external-evidence");
  captured.artifact_id = item.artifact_id;
  captured.expected_sha256 = item.sha256;
  captured.expected_hash_match = captured.sha256 === item.sha256;
  externalEvidence.push(captured);
}
externalEvidence.sort((a, b) => a.relative_path.localeCompare(b.relative_path));

const payload = {
  schema_version: 1,
  task_id: "GOV-PHASE1-L3-REVIEW-A6",
  baseline_role: outputName.includes("before") ? "before" : "after",
  root_token: "${PRODUCT_ROOT}",
  a6_self_excluded: true,
  git_diff_used: false,
  manifest: { relative_path: manifestRef, byte_size: manifestBytes.length, sha256: sha256(manifestBytes), artifact_count: candidate.length },
  counts: { candidate: candidate.length, frozen_history: frozenHistory.length, remediation_6: remediation6.length, migration_320_task: migration320.length, migration_320_external: externalEvidence.length },
  candidate,
  frozen_history: frozenHistory,
  remediation_6: remediation6,
  migration_320_task: migration320,
  migration_320_external: externalEvidence
};
await writeFile(path.join(taskDir, outputName), `${JSON.stringify(payload, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
console.log(`A6_BASELINE role=${payload.baseline_role} candidate=${candidate.length} frozen=${frozenHistory.length} r6=${remediation6.length} m320=${migration320.length} external=${externalEvidence.length}`);
