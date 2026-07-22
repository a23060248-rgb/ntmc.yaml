import { readdir, readFile, lstat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const taskDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(taskDir, "..", "..", "..");
const taskPrefix = ".codex/tasks/GOV-PHASE1-L3-REVIEW-A/";
const outputName = process.argv[2];

if (!["review-baseline.json", "review-baseline-after.json"].includes(outputName)) {
  throw new Error("Output must be review-baseline.json or review-baseline-after.json");
}

async function walk(relativeDir) {
  const absoluteDir = path.join(root, relativeDir);
  const entries = await readdir(absoluteDir, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const relativePath = path.posix.join(relativeDir.replaceAll("\\", "/"), entry.name);
    if (relativePath.startsWith(taskPrefix) || entry.name.toLowerCase().startsWith(".env")) continue;
    const absolutePath = path.join(root, ...relativePath.split("/"));
    const info = await lstat(absolutePath);
    if (info.isSymbolicLink()) throw new Error(`Refusing symbolic link in baseline: ${relativePath}`);
    if (info.isDirectory()) files.push(...await walk(relativePath));
    else if (info.isFile()) files.push(relativePath);
    else throw new Error(`Unsupported filesystem object: ${relativePath}`);
  }
  return files;
}

const sources = ["AGENTS.md", ...await walk(".codex"), ...await walk(".agents")];
const artifacts = [];
for (const relativePath of sources.sort()) {
  const bytes = await readFile(path.join(root, ...relativePath.split("/")));
  const extension = path.extname(relativePath).slice(1).toLowerCase() || "text";
  artifacts.push({
    relative_path: relativePath,
    byte_size: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex").toUpperCase(),
    artifact_type: relativePath === "AGENTS.md" ? "governance-policy" : `governance-${extension}`
  });
}

const output = {
  schema_version: 1,
  task_id: "GOV-PHASE1-L3-REVIEW-A",
  exclusion: ".codex/tasks/GOV-PHASE1-L3-REVIEW-A/**",
  source_count: artifacts.length,
  artifacts
};
await writeFile(path.join(taskDir, outputName), `${JSON.stringify(output, null, 2)}\n`, { flag: "wx" });
