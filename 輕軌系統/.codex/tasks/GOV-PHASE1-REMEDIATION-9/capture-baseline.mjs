import { createHash } from "node:crypto";
import { lstat, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const taskDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(taskDir, "../../..");
const taskId = "GOV-PHASE1-REMEDIATION-9";
const output = path.join(taskDir, process.argv[2] ?? "baseline-before.json");
const sourceRoots = ["AGENTS.md", ".agents", ".codex/agents", ".codex/blueprints", ".codex/checklists", ".codex/domain", ".codex/environment", ".codex/governance", ".codex/meta-rules", ".codex/scripts", ".codex/templates", ".codex/tests", ".codex/workflows", ".codex/config.toml"];
const frozenTaskIds = [
  "GOV-PHASE1-L3-REVIEW-A", "GOV-PHASE1-L3-REVIEW-A2", "GOV-PHASE1-L3-REVIEW-A3", "GOV-PHASE1-L3-REVIEW-A4", "GOV-PHASE1-L3-REVIEW-A5", "GOV-PHASE1-L3-REVIEW-A6", "GOV-PHASE1-L3-REVIEW-A7",
  "GOV-PHASE1-REMEDIATION-2", "GOV-PHASE1-REMEDIATION-3", "GOV-PHASE1-REMEDIATION-4", "GOV-PHASE1-REMEDIATION-5", "GOV-PHASE1-REMEDIATION-6", "GOV-PHASE1-REMEDIATION-7",
  "GOV-PHASE1-A4-FINDING-CONSOLIDATION", "GOV-PHASE1-A5-BOOTSTRAP-TRUST-ANALYSIS"
];

async function collect(relativePath, artifactType, out) {
  const absolute = path.join(root, ...relativePath.split("/"));
  const stat = await lstat(absolute);
  if (stat.isSymbolicLink()) throw new Error(`SYMLINK_NOT_ALLOWED:${relativePath}`);
  if (stat.isDirectory()) {
    for (const entry of (await readdir(absolute)).sort((a, b) => a.localeCompare(b))) await collect(path.posix.join(relativePath, entry), artifactType, out);
    return;
  }
  if (!stat.isFile()) throw new Error(`UNSUPPORTED_FILE_TYPE:${relativePath}`);
  const bytes = await readFile(absolute);
  out.push({relative_path: relativePath, byte_size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex").toUpperCase(), artifact_type: artifactType});
}

const files = [];
for (const item of sourceRoots) await collect(item, "governance-source", files);
for (const frozenTaskId of frozenTaskIds) await collect(`.codex/tasks/${frozenTaskId}`, "frozen-history", files);
await collect(".codex/tasks/GOV-PHASE1-REMEDIATION-8", "remediation-8", files);
await collect(".codex/tasks/GOV-PHASE1-L3-REVIEW-A8", "review-a8", files);
await collect(".codex/tasks/GOV-M320-DRYRUN", "migration-320-task", files);
const m320Manifest = JSON.parse(await readFile(path.join(root, ".codex/tasks/GOV-M320-DRYRUN/artifact-manifest.yaml"), "utf8"));
for (const artifact of m320Manifest.artifacts.filter((item) => item.evidence_scope === "external_reference")) await collect(artifact.path, "migration-320-external-evidence", files);
files.sort((a, b) => a.relative_path.localeCompare(b.relative_path));
const baselineRole = process.argv[2]?.includes("after") ? "after" : "before";
const types = ["governance-source", "frozen-history", "remediation-8", "review-a8", "migration-320-task", "migration-320-external-evidence"];
const payload = {
  schema_version: 1,
  task_id: taskId,
  baseline_role: baselineRole,
  root_token: "${PRODUCT_ROOT}",
  task_excluded: `.codex/tasks/${taskId}/**`,
  git_diff_used: false,
  exclusions: [".env*", "product code", "database and migration source", "sibling directories"],
  frozen_task_ids: frozenTaskIds,
  separately_frozen_task_ids: ["GOV-PHASE1-REMEDIATION-8", "GOV-PHASE1-L3-REVIEW-A8"],
  counts: Object.fromEntries([...types.map((type) => [type.replaceAll("-", "_"), files.filter((item) => item.artifact_type === type).length]), ["total", files.length]]),
  files
};
await writeFile(output, `${JSON.stringify(payload, null, 2)}\n`, {encoding: "utf8", flag: "wx"});
console.log(JSON.stringify({output: path.relative(root, output).replaceAll("\\", "/"), ...payload.counts}));
