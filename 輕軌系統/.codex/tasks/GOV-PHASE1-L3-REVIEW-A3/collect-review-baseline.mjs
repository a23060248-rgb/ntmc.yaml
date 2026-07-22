import { lstat, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const taskDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(taskDir, "..", "..", "..");
const outputName = process.argv[2];
if (!["review-baseline-before.json", "review-baseline-after.json"].includes(outputName)) throw new Error("Unsupported baseline output name.");

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex").toUpperCase();
const manifestRef = ".codex/governance/governance-commit-manifest.yaml";
const manifestBytes = await readFile(path.join(root, ...manifestRef.split("/")));
const manifest = JSON.parse(manifestBytes.toString("utf8"));
const artifacts = [];

for (const item of manifest.artifacts ?? []) {
  if (item.commit_inclusion !== true) throw new Error(`Manifest included record is not commit_inclusion=true: ${item.path}`);
  const absolute = path.join(root, ...item.path.split("/"));
  const info = await lstat(absolute);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error(`Refusing non-regular candidate artifact: ${item.path}`);
  const bytes = await readFile(absolute);
  const actualHash = hash(bytes);
  if (actualHash !== item.sha256.toUpperCase()) throw new Error(`Manifest hash mismatch before baseline: ${item.path}`);
  artifacts.push({ relative_path: item.path, byte_size: bytes.byteLength, sha256: actualHash, artifact_type: item.artifact_type, commit_inclusion: true });
}

artifacts.sort((a, b) => a.relative_path.localeCompare(b.relative_path));
if (artifacts.length !== 87 || new Set(artifacts.map((item) => item.relative_path)).size !== 87) throw new Error(`Expected exactly 87 unique included artifacts; found ${artifacts.length}.`);

const output = {
  schema_version: 1,
  task_id: "GOV-PHASE1-L3-REVIEW-A3",
  baseline_scope: "exact-governance-commit-manifest-included-set",
  manifest: { relative_path: manifestRef, byte_size: manifestBytes.byteLength, sha256: hash(manifestBytes), included_artifact_count: artifacts.length },
  excluded: [".codex/tasks/GOV-PHASE1-L3-REVIEW-A3/**", "manifest excluded_records", ".codex/tests/.tmp/**"],
  artifacts
};

await writeFile(path.join(taskDir, outputName), `${JSON.stringify(output, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
console.log(`A3_BASELINE_OK output=${outputName} artifacts=${artifacts.length} manifest_sha256=${output.manifest.sha256}`);
