import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const outputName = process.argv[2];
const capturedAt = process.argv[3];
if (!new Set(["review-baseline-before.json", "review-baseline-after.json"]).has(outputName) || Number.isNaN(Date.parse(capturedAt))) throw new Error("baseline output name and ISO timestamp are required");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex").toUpperCase();
const canonical = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
};
const manifestPath = ".codex/governance/governance-commit-manifest.yaml";
const snapshotPath = ".codex/tasks/GOV-PHASE1-REMEDIATION-4/candidate-snapshot.json";
const manifestBytes = await readFile(path.join(root, manifestPath));
const manifest = JSON.parse(manifestBytes.toString("utf8"));
const snapshot = JSON.parse(await readFile(path.join(root, snapshotPath), "utf8"));
const artifacts = [];
for (const entry of manifest.artifacts.filter((item) => item.commit_inclusion === true)) {
  if (entry.path.startsWith(".codex/tasks/GOV-PHASE1-L3-REVIEW-A4/")) throw new Error("A4 artifact entered candidate baseline");
  const bytes = await readFile(path.join(root, entry.path));
  const actual = sha256(bytes);
  if (actual !== entry.sha256) throw new Error(`manifest hash mismatch: ${entry.path}`);
  artifacts.push({ relative_path: entry.path, artifact_type: entry.artifact_type, byte_size: bytes.length, sha256: actual, commit_inclusion: true, scan_required: entry.scan_required === true });
}
const fileSet = artifacts.map(({ relative_path, sha256: hash }) => ({ path: relative_path, sha256: hash }));
const fileSetSha256 = sha256(Buffer.from(canonical(fileSet), "utf8"));
const manifestSha256 = sha256(manifestBytes);
if (artifacts.length !== 103 || snapshot.file_count !== artifacts.length || snapshot.manifest_sha256 !== manifestSha256 || snapshot.included_file_set_sha256 !== fileSetSha256 || snapshot.validation_type !== "WORKSPACE_CANDIDATE") throw new Error("candidate snapshot binding mismatch");
const output = { schema_version: 1, task_id: "GOV-PHASE1-L3-REVIEW-A4", captured_at: capturedAt, candidate_baseline: "phase-1.4", manifest_path: manifestPath, manifest_sha256: manifestSha256, candidate_snapshot_path: snapshotPath, candidate_snapshot_id: snapshot.snapshot_id, candidate_snapshot_validation_type: snapshot.validation_type, included_file_count: artifacts.length, included_file_set_sha256: fileSetSha256, artifacts };
await writeFile(path.join(path.dirname(fileURLToPath(import.meta.url)), outputName), `${JSON.stringify(output, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
console.log(`A4_BASELINE_CAPTURED output=${outputName} files=${artifacts.length} manifest_sha256=${manifestSha256}`);
