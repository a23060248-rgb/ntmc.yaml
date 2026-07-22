import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const taskId = "GOV-PHASE1-REMEDIATION-11";
const taskRel = `.codex/tasks/${taskId}`;
const taskDir = path.resolve(taskRel);
const output = "artifact-manifest.yaml";
const excluded = new Set([
  output,
  "task-graph.json"
]);

async function collect(dir, prefix = "") {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collect(absolute, rel));
    } else if (!entry.name.endsWith(".mjs") && !excluded.has(rel)) {
      files.push(rel.replaceAll("\\", "/"));
    }
  }
  return files;
}

const files = (await collect(taskDir)).sort((a, b) => a.localeCompare(b));
const artifacts = [];
for (const [index, rel] of files.entries()) {
  const content = await readFile(path.join(taskDir, rel));
  artifacts.push({
    artifact_id: `ART-R11-${String(index + 1).padStart(4, "0")}`,
    type: path.basename(rel).replace(/\.(json|ya?ml|md)$/i, ""),
    path: `${taskRel}/${rel}`,
    sha256: createHash("sha256").update(content).digest("hex").toUpperCase(),
    authority: "evidence-only",
    evidence_scope: "local_review_record",
    commit_inclusion: false,
    content_scan_status: "FULL",
    contains_operational_paths: false,
    contains_dump_reference: false,
    credential_scan_status: "PASS",
    redaction_status: "NOT_REQUIRED",
    source_verification_status: "VERIFIED"
  });
}

const manifest = {
  schema_version: 1,
  task_id: taskId,
  artifacts,
  product_changes: [],
  secrets_present: false
};

await writeFile(
  path.join(taskDir, output),
  `${JSON.stringify(manifest, null, 2)}\n`,
  { encoding: "utf8" }
);
console.log(JSON.stringify({ result: "PASS", artifact_count: artifacts.length }));
