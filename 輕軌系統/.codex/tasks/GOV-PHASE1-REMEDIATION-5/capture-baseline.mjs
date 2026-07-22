import { createHash } from "node:crypto";
import { lstat, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const taskDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(taskDir, "../../..");
const output = path.join(taskDir, process.argv[2] ?? "baseline-before.json");

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

const sourceRoots = [
  "AGENTS.md",
  ".agents",
  ".codex/agents",
  ".codex/blueprints",
  ".codex/checklists",
  ".codex/domain",
  ".codex/environment",
  ".codex/governance",
  ".codex/meta-rules",
  ".codex/scripts",
  ".codex/templates",
  ".codex/tests",
  ".codex/workflows",
  ".codex/config.toml"
];

const m320Root = ".codex/tasks/GOV-M320-DRYRUN";

async function collect(relativePath, artifactType, out) {
  const absolute = path.join(root, relativePath);
  const stat = await lstat(absolute);
  if (stat.isSymbolicLink()) throw new Error(`SYMLINK_NOT_ALLOWED:${relativePath}`);
  if (stat.isDirectory()) {
    const entries = await readdir(absolute);
    entries.sort((a, b) => a.localeCompare(b));
    for (const entry of entries) await collect(path.posix.join(relativePath.replaceAll("\\", "/"), entry), artifactType, out);
    return;
  }
  if (!stat.isFile()) throw new Error(`UNSUPPORTED_FILE_TYPE:${relativePath}`);
  const bytes = await readFile(absolute);
  out.push({
    relative_path: relativePath.replaceAll("\\", "/"),
    byte_size: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex").toUpperCase(),
    artifact_type: artifactType
  });
}

const files = [];
for (const item of sourceRoots) await collect(item, "governance-source-before", files);
for (const item of frozenRoots) await collect(item, "frozen-history", files);
await collect(m320Root, "migration-320-governance-and-evidence", files);
files.sort((a, b) => a.relative_path.localeCompare(b.relative_path));

const payload = {
  schema_version: 1,
  task_id: "GOV-PHASE1-REMEDIATION-5",
  baseline_role: process.argv[2]?.includes("after") ? "after" : "before",
  root_token: "${PRODUCT_ROOT}",
  exclusions: [
    ".env*",
    "product code",
    "database and migration source",
    "sibling directories",
    ".codex/tasks/GOV-PHASE1-REMEDIATION-5/**"
  ],
  counts: {
    governance_sources: files.filter((x) => x.artifact_type === "governance-source-before").length,
    frozen_history: files.filter((x) => x.artifact_type === "frozen-history").length,
    migration_320: files.filter((x) => x.artifact_type === "migration-320-governance-and-evidence").length,
    total: files.length
  },
  files
};

await writeFile(output, `${JSON.stringify(payload, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
console.log(JSON.stringify({ output: path.relative(root, output).replaceAll("\\", "/"), ...payload.counts }));
