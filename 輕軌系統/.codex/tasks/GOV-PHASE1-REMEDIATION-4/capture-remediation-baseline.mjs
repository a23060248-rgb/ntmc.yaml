import { createHash } from "node:crypto";
import { lstat, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { safeExistingPath, safeNewPath, verifyCreatedPath } from "../../scripts/lib/path-safety.mjs";

const taskDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(taskDir, "..", "..", "..");
const outputName = process.argv[2];
if (!/^[a-z0-9-]+\.json$/i.test(outputName ?? "")) throw new Error("Output filename is required.");

const frozenRoots = [
  ".codex/tasks/GOV-PHASE1-L3-REVIEW-A",
  ".codex/tasks/GOV-PHASE1-REMEDIATION-2",
  ".codex/tasks/GOV-PHASE1-L3-REVIEW-A2",
  ".codex/tasks/GOV-PHASE1-REMEDIATION-3",
  ".codex/tasks/GOV-PHASE1-L3-REVIEW-A3"
];
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex").toUpperCase();

async function collect(rootRef) {
  const root = await safeExistingPath(projectRoot, rootRef);
  const result = [];
  async function walk(current, relative) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const child = path.join(current, entry.name);
      const ref = `${rootRef}/${relative ? `${relative}/` : ""}${entry.name}`.replaceAll("\\", "/");
      const stat = await lstat(child);
      if (stat.isSymbolicLink()) throw new Error(`Frozen history contains a link: ${ref}`);
      if (stat.isDirectory()) await walk(child, relative ? `${relative}/${entry.name}` : entry.name);
      else if (stat.isFile()) {
        const bytes = await readFile(child);
        result.push({ relative_path: ref, byte_size: bytes.length, sha256: sha256(bytes) });
      }
    }
  }
  await walk(root, "");
  return result.sort((a, b) => a.relative_path.localeCompare(b.relative_path));
}

const frozen = [];
for (const root of frozenRoots) frozen.push(...await collect(root));
const manifestRef = ".codex/governance/governance-commit-manifest.yaml";
const manifestBytes = await readFile(await safeExistingPath(projectRoot, manifestRef));
const manifest = JSON.parse(manifestBytes.toString("utf8"));
const candidate = [];
for (const artifact of manifest.artifacts.filter((item) => item.commit_inclusion)) {
  const bytes = await readFile(await safeExistingPath(projectRoot, artifact.path));
  candidate.push({ relative_path: artifact.path, byte_size: bytes.length, sha256: sha256(bytes), recorded_sha256: artifact.sha256, artifact_type: artifact.artifact_type });
}
const output = {
  schema_version: 1,
  task_id: "GOV-PHASE1-REMEDIATION-4",
  captured_at: "2026-07-17T16:00:00+08:00",
  frozen_roots: frozenRoots,
  frozen_artifact_count: frozen.length,
  frozen_artifacts: frozen,
  candidate_manifest: { relative_path: manifestRef, byte_size: manifestBytes.length, sha256: sha256(manifestBytes), included_artifact_count: candidate.length },
  candidate_artifacts: candidate,
  result: candidate.every((item) => item.sha256 === item.recorded_sha256) ? "PASS" : "FAIL"
};
const outputRef = `.codex/tasks/GOV-PHASE1-REMEDIATION-4/${outputName}`;
await writeFile(await safeNewPath(projectRoot, outputRef), `${JSON.stringify(output, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
await verifyCreatedPath(projectRoot, outputRef);
console.log(`REMEDIATION_BASELINE result=${output.result} frozen=${frozen.length} candidate=${candidate.length}`);
